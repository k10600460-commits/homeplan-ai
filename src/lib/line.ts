// LINE Messaging API helpers — push delivery + Flex carousel for the daily
// research digest. The channel token and target user id live ONLY in Vercel env
// (LINE_CHANNEL_ACCESS_TOKEN / LINE_USER_ID); they are never hardcoded here or
// carried in the routine prompt. Consumed by src/app/api/line/*.

const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";

export interface DigestProposal {
  token: string;
  title: string;
  url?: string | null;
  why_it_matters?: string | null;
  action_tag?: string | null;
  score?: number | null;
}

export interface LinePushResult {
  ok: boolean;
  status: number;
  body: string;
}

// Push one or more LINE message objects to the configured user. Best-effort:
// never throws — returns the HTTP status so callers can log a failure without
// breaking the surrounding request (email stays the source of truth).
export async function pushMessages(messages: object[]): Promise<LinePushResult> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const to = process.env.LINE_USER_ID;
  if (!token || !to) {
    return { ok: false, status: 0, body: "LINE_CHANNEL_ACCESS_TOKEN or LINE_USER_ID not set" };
  }
  try {
    const res = await fetch(LINE_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ to, messages }),
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: err instanceof Error ? err.message : String(err) };
  }
}

type Flex = Record<string, unknown>;

function decisionUri(baseUrl: string, token: string, action: "approve" | "reject" | "hold"): string {
  return `${baseUrl}/api/line/decision?token=${encodeURIComponent(token)}&action=${action}`;
}

function uriButton(
  style: "primary" | "secondary" | "link",
  label: string,
  uri: string,
  color?: string,
): Flex {
  const b: Flex = { type: "button", style, height: "sm", action: { type: "uri", label, uri } };
  if (color) b.color = color;
  return b;
}

function proposalBubble(
  p: DigestProposal,
  baseUrl: string,
  header: { runDate: string; count: number; summary: string | null } | null,
): Flex {
  const meta: string[] = [];
  if (p.action_tag) meta.push(p.action_tag);
  if (p.score != null) meta.push(`スコア ${p.score}`);

  const body: Flex[] = [
    { type: "text", text: p.title || "(untitled)", weight: "bold", size: "md", wrap: true, maxLines: 5 },
  ];
  if (meta.length) {
    body.push({ type: "text", text: meta.join(" ・ "), size: "xs", color: "#6b7280", wrap: true, margin: "sm" });
  }
  if (p.why_it_matters) {
    body.push({ type: "text", text: p.why_it_matters, size: "sm", color: "#374151", wrap: true, margin: "sm" });
  }
  // Article link is a URI button (not body text) so it sits with the content but
  // keeps the footer reserved for the three decision buttons.
  if (p.url) {
    body.push(uriButton("link", "🔗 記事を開く", p.url));
  }

  const bubble: Flex = {
    type: "bubble",
    body: { type: "box", layout: "vertical", spacing: "sm", contents: body },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        uriButton("primary", "承認", decisionUri(baseUrl, p.token, "approve"), "#16a34a"),
        uriButton("secondary", "却下", decisionUri(baseUrl, p.token, "reject")),
        uriButton("link", "保留", decisionUri(baseUrl, p.token, "hold")),
      ],
    },
  };

  if (header) {
    const sub = `採用${header.count}件${header.summary ? ` ・ ${header.summary.slice(0, 120)}` : ""}`;
    bubble.header = {
      type: "box",
      layout: "vertical",
      paddingBottom: "sm",
      contents: [
        { type: "text", text: `📊 SplanAI Research ${header.runDate}`, weight: "bold", size: "sm", color: "#1d4ed8", wrap: true },
        { type: "text", text: sub, size: "xs", color: "#6b7280", wrap: true },
      ],
    };
  }

  return bubble;
}

function overflowBubble(n: number): Flex {
  return {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        { type: "text", text: `ほか ${n} 件`, weight: "bold", size: "md", wrap: true },
        { type: "text", text: "残りの提案はメール（hello@splanai.com）を確認してください。", size: "sm", color: "#6b7280", wrap: true },
      ],
    },
  };
}

// Build a single Flex carousel message: 1 proposal = 1 bubble (max 12). When
// there are more than 12 proposals, the first 11 are shown and the 12th bubble
// points to the email for the remainder. Decision URLs live ONLY on URI buttons
// (never as body text) so LINE never link-previews / prefetches them — one-tap
// approve/reject/hold is safe.
export function buildDigestCarousel(
  proposals: DigestProposal[],
  baseUrl: string,
  runDate: string,
  summary: string | null = null,
): Flex {
  const count = proposals.length;
  const LIMIT = 12;
  let shown = proposals;
  let overflow = 0;
  if (proposals.length > LIMIT) {
    shown = proposals.slice(0, LIMIT - 1);
    overflow = proposals.length - (LIMIT - 1);
  }
  const bubbles: Flex[] = shown.map((p, i) =>
    proposalBubble(p, baseUrl, i === 0 ? { runDate, count, summary } : null),
  );
  if (overflow > 0) bubbles.push(overflowBubble(overflow));

  const altText = `📊 SplanAI Research ${runDate} — 採用${count}件（LINEで承認/却下/保留）`.slice(0, 390);
  return { type: "flex", altText, contents: { type: "carousel", contents: bubbles } };
}
