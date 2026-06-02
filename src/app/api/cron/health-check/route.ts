import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import * as tls from "tls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ADMIN_EMAIL = process.env.ADMIN_ALERT_EMAIL ?? "k10600460@gmail.com";
const FROM_EMAIL = "SplanAI <noreply@splanai.com>";
const TLS_ALERT_DAYS = 21;

// External URLs subject to Vercel Bot Protection.
// 429 with x-vercel-mitigated:challenge or x-vercel-id present = edge is up (ok=true).
// Alert only on connection failure / timeout / 5xx.
const EXTERNAL_URLS = [
  "https://splanai.com",
  "https://splanai.com/s/nfhkewvz",
] as const;

function checkSSLDays(hostname: string): Promise<number | null> {
  return new Promise((resolve) => {
    let resolved = false;
    const done = (val: number | null) => {
      if (resolved) return;
      resolved = true;
      resolve(val);
      try { socket.destroy(); } catch { /* already closed */ }
    };

    const socket = tls.connect({ host: hostname, port: 443, servername: hostname }, () => {
      const cert = socket.getPeerCertificate();
      if (!cert?.valid_to) { done(null); return; }
      const daysLeft = Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / 86_400_000);
      done(daysLeft);
    });
    socket.on("error", () => done(null));
    setTimeout(() => done(null), 8000);
  });
}

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const resend = new Resend(process.env.RESEND_API_KEY);

  const checkedAt = new Date().toISOString();
  type CheckRow = {
    checked_at: string;
    endpoint: string;
    status_code: number | null;
    ssl_days_remaining: number | null;
    ok: boolean;
    detail: string | null;
  };
  const rows: CheckRow[] = [];
  const alerts: string[] = [];

  // External URL checks (Bot Protection aware)
  for (const url of EXTERNAL_URLS) {
    let statusCode: number | null = null;
    let ok = false;
    let detail: string | null = null;

    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "SplanAI-HealthCheck/1.0" },
        signal: AbortSignal.timeout(10000),
      });
      statusCode = res.status;

      if (res.status === 200) {
        ok = true;
      } else if (
        res.status === 429 &&
        (res.headers.get("x-vercel-mitigated") === "challenge" ||
          res.headers.has("x-vercel-id"))
      ) {
        // Vercel Bot Protection challenge — edge is reachable, not a real failure
        ok = true;
        detail = "edge reachable (challenged)";
      } else if (res.status >= 500) {
        ok = false;
        detail = `Server error: HTTP ${res.status}`;
        alerts.push(`${url} → HTTP ${res.status} (server error)`);
      } else {
        // 3xx, 4xx other than Bot Protection 429 — unexpected but not critical; log only
        ok = false;
        detail = `Unexpected status: HTTP ${res.status}`;
        alerts.push(`${url} → HTTP ${res.status}`);
      }
    } catch (err) {
      detail = err instanceof Error ? err.message : String(err);
      alerts.push(`${url} → fetch error: ${detail}`);
    }

    rows.push({ checked_at: checkedAt, endpoint: url, status_code: statusCode, ssl_days_remaining: null, ok, detail });
  }

  // DB check — direct Supabase service-role query, bypasses Bot Protection entirely
  {
    const { error: dbError } = await supabase.from("profiles").select("id").limit(1);
    const ok = !dbError;
    const detail = dbError ? dbError.message : "ok";
    rows.push({ checked_at: checkedAt, endpoint: "supabase:db", status_code: null, ssl_days_remaining: null, ok, detail });
    if (!ok) {
      alerts.push(`Supabase DB unreachable: ${detail}`);
    }
  }

  // TLS certificate check
  const sslDays = await checkSSLDays("splanai.com");
  const sslOk = sslDays !== null && sslDays >= TLS_ALERT_DAYS;
  rows.push({
    checked_at: checkedAt,
    endpoint: "splanai.com:443",
    status_code: null,
    ssl_days_remaining: sslDays,
    ok: sslOk,
    detail: sslDays === null ? "TLS check failed" : `${sslDays} days remaining`,
  });
  if (!sslOk) {
    alerts.push(
      sslDays === null
        ? "TLS cert check failed — could not connect"
        : `TLS cert expires in ${sslDays} days (alert threshold: ${TLS_ALERT_DAYS})`,
    );
  }

  // Persist all rows
  const { error: insertError } = await supabase.from("health_checks").insert(rows);
  if (insertError) {
    console.error("[health-check] DB insert error:", insertError.message);
  }

  // Alert only if issues found
  if (alerts.length > 0) {
    const jstTime = new Date(checkedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
    await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `🔴 SplanAI Health Alert — ${alerts.length} issue${alerts.length > 1 ? "s" : ""} detected`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="color:#dc2626;">Health Check Alert</h2>
        <p style="color:#6b7280;font-size:13px;">${jstTime} JST</p>
        <ul style="padding-left:20px;">
          ${alerts.map(a => `<li style="margin-bottom:6px;font-size:14px;color:#374151;">${a.replace(/</g, "&lt;")}</li>`).join("")}
        </ul>
        <p style="margin-top:24px;color:#9ca3af;font-size:11px;">SplanAI Health Check · auto-generated alert · do not auto-fix — investigate manually</p>
      </div>`,
    });
  }

  const allOk = rows.every(r => r.ok);
  console.log(`[health-check] ok=${allOk} | alerts=${alerts.length} | ssl=${sslDays}d`);
  return NextResponse.json({ ok: allOk, checked: rows.length, alerts, ssl_days: sslDays });
}
