import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { recordHeartbeat, recordHeartbeatFromResponse } from "@/lib/heartbeat";
import { buildPulseDigestEmail, PHYSICAL_ADDRESS } from "@/lib/emails";
import {
  getLatestPulseSnapshot,
  fmtMonth,
  PULSE_UNSUB_TOKEN_PURPOSE,
  type PulseSnapshot,
} from "@/lib/pulse";
import { PULSE_METROS } from "@/data/pulse-metros";
import { signPayload } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// P-A Builder Market Pulse — weekly digest cron (Fridays 13:00 UTC, the day
// after pulse-refresh writes Thursday's snapshot).
//
// SENDING IS OFF BY DEFAULT (human gate): unless PULSE_DIGEST_ENABLED === 'true'
// this route builds every digest end-to-end (subscribers × latest snapshot ×
// per-email signed unsubscribe link) and then STOPS — it logs "would send N"
// and returns without calling Resend. The env var is intentionally unset in
// all environments today (unset ≠ 'true' → OFF). Flipping it on is a human
// decision (double opt-in / CAN-SPAM review — see buildPulseDigestEmail notes).
//
// FAIL-LOUD (same contract as pulse-refresh; silent-zero ban):
//   - No snapshot / unsourced rate / stale snapshot → 500 (fabrication-zero:
//     a digest without a sourced headline rate must not exist, even as a dry run).
//   - When enabled: missing RESEND_API_KEY, placeholder PHYSICAL_ADDRESS
//     (CAN-SPAM §7(a)(5)) or any per-recipient send failure → 500.
//   - Zero subscribers is a legitimate 200 (nothing to send is not an error).

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://splanai.com";
/** Digest runs Friday over Thursday's snapshot; >9 days means refresh skipped ≥1 week. */
const MAX_SNAPSHOT_AGE_DAYS = 9;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Mask an email for logs/responses: "dean@homestead.com" → "de…@homestead.com" */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${(local ?? "").slice(0, 2)}…@${domain ?? "?"}`;
}

/**
 * Pre-formatted permit line for a metro subscriber; null (renders nothing) for
 * all-metros subscribers or when the snapshot has no sourced permits for the
 * metro (fabrication-zero — never estimate).
 */
function buildPermitsLine(metroSlug: string | null, snapshot: PulseSnapshot): string | null {
  if (!metroSlug) return null;
  const meta = PULSE_METROS.find((m) => m.slug === metroSlug);
  const permits = snapshot.metros[metroSlug]?.permits ?? null;
  if (!meta || !permits) return null;
  return (
    `${meta.name}, ${meta.stateCode} single-family permits: ` +
    `${permits.latestMonthUnits.toLocaleString("en-US")} units authorized in ${fmtMonth(permits.latestMonth)} ` +
    `(${permits.trailing12moUnits.toLocaleString("en-US")} over the trailing 12 months). ` +
    `Source: U.S. Census BPS via FRED (${permits.seriesId}).`
  );
}

async function pulseDigestHandler(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { ok: false, error: "missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" },
      { status: 500 },
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  // 1) Subscribers (pulse_subscribers is service_role-only; this is the read path).
  const { data: subscribers, error: subsError } = await supabase
    .from("pulse_subscribers")
    .select("email, metro")
    .order("created_at", { ascending: true });
  if (subsError) {
    return NextResponse.json(
      { ok: false, error: `pulse_subscribers read failed: ${subsError.message}` },
      { status: 500 },
    );
  }
  const enabled = process.env.PULSE_DIGEST_ENABLED === "true";
  if (!subscribers || subscribers.length === 0) {
    return NextResponse.json({ ok: true, enabled, subscribers: 0, sent: 0, note: "no subscribers" });
  }

  // 2) Latest snapshot — the digest's only data source (never live-fetch).
  const snapshot = await getLatestPulseSnapshot();
  if (!snapshot) {
    return NextResponse.json(
      { ok: false, error: "no pulse_snapshots row — /api/cron/pulse-refresh has not produced data yet" },
      { status: 500 },
    );
  }
  if (!snapshot.rate) {
    return NextResponse.json(
      {
        ok: false,
        error: `latest snapshot ${snapshot.snapshotDate} (status=${snapshot.status}) has no sourced rate — refusing to build a digest (fabrication-zero)`,
      },
      { status: 500 },
    );
  }
  const ageDays = (Date.now() - Date.parse(`${snapshot.snapshotDate}T00:00:00Z`)) / 86_400_000;
  if (!Number.isFinite(ageDays) || ageDays > MAX_SNAPSHOT_AGE_DAYS) {
    return NextResponse.json(
      {
        ok: false,
        error: `latest snapshot ${snapshot.snapshotDate} is stale (${ageDays.toFixed(1)}d > ${MAX_SNAPSHOT_AGE_DAYS}d) — check /api/cron/pulse-refresh before digesting`,
      },
      { status: 500 },
    );
  }

  // 3) Build every digest completely (subject/html/per-email unsubscribe link).
  //    signPayload throws if AES_ENCRYPTION_KEY is missing → caught by the
  //    heartbeat wrapper as a loud failure, in dry-run mode too (by design:
  //    a dry run that can't mint unsubscribe tokens must not report "ok").
  const rate = snapshot.rate;
  const prepared = subscribers.map((s) => {
    const metroSlug = (s.metro as string | null) ?? null;
    const meta = metroSlug ? PULSE_METROS.find((m) => m.slug === metroSlug) ?? null : null;
    const token = signPayload({ email: s.email as string, purpose: PULSE_UNSUB_TOKEN_PURPOSE });
    const unsubscribeUrl = `${APP_URL}/api/pulse/unsubscribe?token=${encodeURIComponent(token)}`;
    const { subject, html } = buildPulseDigestEmail({
      metroName: meta ? `${meta.name}, ${meta.stateCode}` : null,
      ratePct: rate.pct,
      rateAsOf: rate.asOf,
      permitsLine: buildPermitsLine(metroSlug, snapshot),
      unsubscribeUrl,
    });
    return { to: s.email as string, subject, html, unsubscribeUrl };
  });

  // 4) HUMAN GATE — default OFF. Everything above ran for real; only the
  //    external send is skipped. ("would send N" is the audit trail.)
  if (!enabled) {
    console.log(
      `[pulse-digest] PULSE_DIGEST_ENABLED !== 'true' → would send ${prepared.length} digest(s) ` +
        `(snapshot ${snapshot.snapshotDate}, rate ${rate.pct.toFixed(2)}% as of ${rate.asOf}) — send skipped, flag default OFF`,
    );
    return NextResponse.json({
      ok: true,
      enabled: false,
      wouldSend: prepared.length,
      snapshotDate: snapshot.snapshotDate,
      note: "PULSE_DIGEST_ENABLED !== 'true' — built everything, sent nothing",
    });
  }

  // ── Flag ON from here: real external sends ──────────────────────────────────
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { ok: false, error: "PULSE_DIGEST_ENABLED=true but RESEND_API_KEY is missing" },
      { status: 500 },
    );
  }
  if (PHYSICAL_ADDRESS.startsWith("<<FILL")) {
    // CAN-SPAM §7(a)(5): no commercial email without a physical postal address.
    return NextResponse.json(
      { ok: false, error: "PHYSICAL_ADDRESS is the placeholder — refusing commercial send (CAN-SPAM)" },
      { status: 500 },
    );
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  let sent = 0;
  const failures: string[] = [];
  for (const p of prepared) {
    try {
      const { error } = await resend.emails.send({
        from: "SplanAI <noreply@splanai.com>",
        to: p.to,
        replyTo: "hello@splanai.com",
        subject: p.subject,
        html: p.html,
        headers: { "List-Unsubscribe": `<${p.unsubscribeUrl}>` },
      });
      if (error) throw new Error(error.message);
      sent += 1;
    } catch (err) {
      failures.push(`${maskEmail(p.to)}: ${toErrorMessage(err)}`);
    }
  }

  if (failures.length > 0) {
    console.error(`[pulse-digest] ${failures.length}/${prepared.length} sends failed:`, failures.join(" | "));
    return NextResponse.json(
      { ok: false, enabled: true, sent, failed: failures.length, error: failures.join(" | ") },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, enabled: true, sent, snapshotDate: snapshot.snapshotDate });
}

// R5 cron heartbeat — thin wrapper only (same pattern as pulse-refresh).
export async function GET(req: NextRequest) {
  try {
    const res = await pulseDigestHandler(req);
    await recordHeartbeatFromResponse("pulse-digest", res);
    return res;
  } catch (err) {
    await recordHeartbeat("pulse-digest", {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
