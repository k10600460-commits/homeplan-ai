import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ADMIN_EMAIL = process.env.ADMIN_ALERT_EMAIL ?? "k10600460@gmail.com";
const FROM_EMAIL = "SplanAI <noreply@splanai.com>";

const WATCH_URLS = [
  "https://stripe.com/legal/ssa",
  "https://stripe.com/legal/restricted-businesses",
  "https://resend.com/legal/terms-of-service",
  "https://resend.com/legal/acceptable-use-policy",
  "https://www.anthropic.com/legal/aup",
  "https://www.anthropic.com/legal/commercial-terms",
  "https://cloud.google.com/maps-platform/terms",
  "https://supabase.com/terms",
] as const;

// Cap text to keep storage and diff computation bounded
const SNAPSHOT_MAX_CHARS = 8000;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SNAPSHOT_MAX_CHARS);
}

function diffSize(a: string, b: string): number {
  const shorter = Math.min(a.length, b.length);
  let changed = Math.abs(a.length - b.length);
  for (let i = 0; i < shorter; i++) {
    if (a[i] !== b[i]) changed++;
  }
  return changed;
}

function buildDiffSnippet(oldText: string, newText: string): string {
  let firstDiff = Math.min(oldText.length, newText.length);
  for (let i = 0; i < firstDiff; i++) {
    if (oldText[i] !== newText[i]) { firstDiff = i; break; }
  }
  const start = Math.max(0, firstDiff - 100);
  const oldSnip = oldText.slice(start, firstDiff + 300);
  const newSnip = newText.slice(start, firstDiff + 300);
  return `First change at char ${firstDiff}:\n--- OLD ---\n${oldSnip}\n\n+++ NEW +++\n${newSnip}`;
}

type UrlResult = {
  url: string;
  status: "no_change" | "diff_found" | "first_run" | "error" | "skipped";
  impact?: string;
  chars_changed?: number;
};

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const resend = new Resend(process.env.RESEND_API_KEY);
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const results: UrlResult[] = [];

  for (const url of WATCH_URLS) {
    // Fetch current page content
    let html: string;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "SplanAI-LegalWatch/1.0 (internal monitoring)" },
        signal: AbortSignal.timeout(15000),
      });
      if (res.status === 404) {
        console.warn(`[legal-watch] 404 skipped: ${url}`);
        results.push({ url, status: "skipped" });
        continue;
      }
      if (!res.ok) {
        console.warn(`[legal-watch] HTTP ${res.status} skipped: ${url}`);
        results.push({ url, status: "error" });
        continue;
      }
      html = await res.text();
    } catch (err) {
      console.error(`[legal-watch] Fetch error for ${url}:`, err instanceof Error ? err.message : err);
      results.push({ url, status: "error" });
      continue;
    }

    const newText = stripHtml(html);

    // Get last snapshot for this URL
    const { data: lastRow } = await supabase
      .from("legal_watch_diffs")
      .select("snapshot_text")
      .eq("url", url)
      .order("snapshot_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // First run — save snapshot, no diff needed
    if (!lastRow?.snapshot_text) {
      await supabase.from("legal_watch_diffs").insert({
        url,
        diff_text: null,
        impact_level: null,
        ai_assessment: null,
        snapshot_text: newText,
      });
      console.log(`[legal-watch] First snapshot saved: ${url}`);
      results.push({ url, status: "first_run" });
      continue;
    }

    const oldText: string = lastRow.snapshot_text;
    const changed = diffSize(oldText, newText);

    if (changed < 100) {
      results.push({ url, status: "no_change", chars_changed: changed });
      continue;
    }

    // Significant diff — assess with Claude Haiku
    const diffSnippet = buildDiffSnippet(oldText, newText);
    let impact = "Low";
    let assessment = "Minor textual change detected.";

    try {
      const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        messages: [{
          role: "user",
          content: `You are a legal analyst for SplanAI, a US SaaS for home builders. Evaluate this policy document change and rate its impact on SplanAI's operations.

URL: ${url}
Characters changed: ${changed}
Diff snippet:
${diffSnippet}

Respond in JSON only (no code blocks): {"impact":"Low|Med|High","assessment":"1-2 sentence explanation for the founder"}`,
        }],
      });
      const raw = msg.content[0].type === "text" ? msg.content[0].text : "";
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]) as { impact?: string; assessment?: string };
        impact = parsed.impact ?? "Low";
        assessment = parsed.assessment ?? assessment;
      }
    } catch (err) {
      console.error(`[legal-watch] Claude error for ${url}:`, err instanceof Error ? err.message : err);
    }

    // Persist diff row with new snapshot
    await supabase.from("legal_watch_diffs").insert({
      url,
      diff_text: diffSnippet,
      impact_level: impact,
      ai_assessment: assessment,
      snapshot_text: newText,
    });

    results.push({ url, status: "diff_found", impact, chars_changed: changed });
    console.log(`[legal-watch] Diff found [${impact}] ${url} — ${changed} chars changed`);

    // Alert for Med or High
    if (impact === "Med" || impact === "High") {
      const alertColor = impact === "High" ? "#dc2626" : "#d97706";
      await resend.emails.send({
        from: FROM_EMAIL,
        to: ADMIN_EMAIL,
        subject: `🚨 Legal Watch [${impact}] — ${new URL(url).hostname}`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
          <h2 style="color:${alertColor};">Legal Document Change Detected</h2>
          <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
            <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">Impact</td><td style="padding:6px 0;font-weight:700;color:${alertColor};">${impact}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">URL</td><td style="padding:6px 0;"><a href="${url}" style="color:#3b82f6;">${url}</a></td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;font-size:13px;">Chars changed</td><td style="padding:6px 0;">${changed}</td></tr>
          </table>
          <p style="font-size:14px;color:#374151;"><strong>Assessment:</strong> ${assessment}</p>
          <details style="margin-top:16px;"><summary style="cursor:pointer;color:#3b82f6;font-size:13px;">View diff snippet</summary>
            <pre style="background:#f3f4f6;padding:12px;border-radius:4px;font-size:12px;overflow-x:auto;white-space:pre-wrap;">${diffSnippet.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>
          </details>
          <p style="margin-top:24px;color:#9ca3af;font-size:11px;">SplanAI Legal Watch · auto-generated alert · do not auto-fix</p>
        </div>`,
      });
    }
  }

  const summary = {
    ok: true,
    urls_checked: WATCH_URLS.length,
    diffs_found: results.filter(r => r.status === "diff_found").length,
    first_runs: results.filter(r => r.status === "first_run").length,
    alerts_sent: results.filter(r => r.status === "diff_found" && (r.impact === "Med" || r.impact === "High")).length,
    results,
  };

  console.log("[legal-watch]", JSON.stringify(summary));
  return NextResponse.json(summary);
}
