// Demo / synthetic portals — never counted as real leads, never alerted on.
// Source of truth: project-outreach memory (cedaridg = Tanaka-MTG demo,
// harpethn = second demo; only founder self-views). Keep in sync with the
// local DEMO_SLUGS copy in src/app/api/cron/daily-brief/route.ts (left
// untouched by Phase R per "no changes to existing logic"). client_email is
// NOT a usable demo signal in this app — the slug denylist is the reliable
// discriminator; add new demo slugs here AND in daily-brief.
//
// nfhkewvz (codex review): the sample portal fetched daily by
// /api/cron/health-check with UA "SplanAI-HealthCheck/1.0" — that UA passes
// the BOT_UA filter in /s/[slug], so it logs a REAL link_events 'view' every
// day. Without this entry the hot-lead alert would fire on the health check.

export const DEMO_SLUGS = new Set(["cedaridg", "harpethn", "nfhkewvz"]);

export function isDemoSlug(slug: string | null | undefined): boolean {
  return slug != null && DEMO_SLUGS.has(slug);
}
