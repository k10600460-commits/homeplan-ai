import { AI_MODELS } from "./ai-models";

export const MODEL_SOURCES = {
  overview: "https://platform.claude.com/docs/en/models/overview.md",
  lifecycle: "https://platform.claude.com/docs/en/about-claude/model-deprecations.md",
} as const;

function version(model: string): number[] {
  return model.replace(/^claude-(sonnet|haiku)-/, "").split("-").filter(s => s.length < 8).map(Number);
}
function newer(a: string, b: string) {
  const av = version(a), bv = version(b);
  for (let i = 0; i < Math.max(av.length, bv.length); i++) {
    if ((av[i] ?? 0) !== (bv[i] ?? 0)) return (av[i] ?? 0) > (bv[i] ?? 0);
  }
  return false;
}

export function inspectModelDocs(overview: string, lifecycle: string, models: Record<string, { model: string }> = AI_MODELS) {
  const apiLine = overview.split("\n").find(line => /^\|\s*Claude API ID\s*\|/.test(line));
  if (!apiLine) throw new Error("Official model table format unavailable; do not infer compatibility");
  const advertised = [...new Set(apiLine.match(/claude-(?:sonnet|haiku)-\d+(?:-\d+)*/g) ?? [])];
  if (!advertised.length) throw new Error("No relevant model IDs in official API-ID row");
  const statuses = new Map<string, { status: string; retirement: string }>();
  const section = lifecycle.split(/^## Model status\s*$/m)[1]?.split(/^## /m)[0];
  if (!section) throw new Error("Official lifecycle status section missing");
  for (const line of section.split("\n")) {
    const cells = line.split("|").map(v => v.replace(/`/g, "").trim());
    if (/^claude-[a-z0-9-]+$/.test(cells[1] ?? "") && /^(Active|Legacy|Deprecated|Retired)$/i.test(cells[2] ?? "")) {
      statuses.set(cells[1], { status: cells[2], retirement: cells[4] ?? "unknown" });
    }
  }
  if (!statuses.size) throw new Error("Official lifecycle rows missing");
  const roles = Object.entries(models).filter(([, config]) => config.model.startsWith("claude-")).map(([role, config]) => {
    const lookup = config.model === "claude-haiku-4-5" ? "claude-haiku-4-5-20251001" : config.model;
    const lifecycleStatus = statuses.get(lookup);
    const family = config.model.includes("-sonnet-") ? "-sonnet-" : "-haiku-";
    const candidates = advertised.filter(id => id.includes(family) && newer(id, config.model));
    return { role, current: config.model, status: lifecycleStatus?.status ?? "unconfirmed",
      retirement: lifecycleStatus?.retirement ?? "unconfirmed", candidates };
  });
  return { roles, needsReview: roles.some(r => r.status !== "Active" || r.candidates.length > 0),
    automaticModelChange: false, inferenceCalls: 0,
    warning: "Public catalog is not account availability. 'Not sooner than' is a support floor, NOT a scheduled retirement date. A newer model is only a review candidate." };
}
