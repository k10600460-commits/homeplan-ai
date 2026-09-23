/**
 * Anti-slop guards for the marketing surface (LP, /try, /partners): the
 * "LLM default" patterns that must never (re)appear, made executable.
 * Ban list: PPP-080, extracted from Leonxlnx/taste-skill section 9 "AI Tells"
 * (MIT, upstream commit a6153b3, 2026-09-22) and filtered through DESIGN.md,
 * which always wins. Run with: npx tsx src/app/lp-anti-slop.test.ts
 *
 * Guarded:
 *  1. Em-dash ratchet: visible copy never GAINS em-dashes (the LLM's number-one
 *     stylistic tell). Baseline = the 2026-09-23 count per surface. The copy is
 *     customer-facing, so removing the existing ones is a Shoji decision
 *     (target 0); when that happens, lower the number here. Never raise it.
 *  2. En-dash only inside numeric ranges ($623–$685K, 2,650–2,900).
 *  3. Zero tolerance in copy: "Step 1"-style labels, scroll cues, fake social
 *     proof, placeholder names/brands, fake-perfect numbers, version labels,
 *     filler verbs (HUMANIZE extension), em-dash inside the hero headline.
 *  4. Section eyebrows <= ceil(sections / 3): a small uppercase label above at
 *     most every third <h2>. Plan labels, PRO and "Live sample" badges are not
 *     eyebrows and are not counted.
 *  5. Motion and perf: no window scroll listeners, no onScroll, no
 *     requestAnimationFrame loops, no standalone h-screen (min-h-screen on the
 *     page root is fine). Motion is the CSS scroll-driven `.reveal` only.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { T } from "./lp-copy";
import { formatCostRange, sampleSqftRange } from "./lp-sample";

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel: string) => readFileSync(join(here, rel), "utf8");

// ── Detectors (pure) ──────────────────────────────────────────────────
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const withoutClassNames = (jsx: string) => jsx.replace(/className=(\{`[^`]*`\}|"[^"]*"|'[^']*')/g, "");
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
const emDashes = (s: string) => count(s, /—/g);
/** En-dashes that are not sandwiched between numeric tokens ("$623–$685K" is fine, "fast – simple" is not). */
const strayEnDashes = (s: string) => count(s, /(?<![\d$K%])–(?![\d$])/g);
const h2Count = (jsx: string) => count(jsx, /<h2\b/g);
/** Uppercase-tracking micro-labels rendered directly (within 2 lines) above a section <h2>. */
function sectionEyebrows(jsx: string): number {
  const lines = jsx.split("\n");
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/\buppercase\b/.test(line) && /\btracking-/.test(line) && lines.slice(i + 1, i + 3).some((l) => /<h2\b/.test(l))) n++;
  }
  return n;
}

const ZERO_TOLERANCE: { name: string; re: RegExp; fixture: string }[] = [
  { name: "Step/Phase/Stage label (the step content is the label)", re: /\b(Step|Phase|Stage|Paso|Fase|Etapa) ?\d/i, fixture: "Step 1: enter the lot" },
  { name: "scroll cue", re: /scroll to (explore|discover|see)|↓ ?scroll|despl[aá]zate para/i, fixture: "Scroll to explore" },
  { name: "fake social proof", re: /trusted by \d|used by \d|\d[\d,]*\+ (teams|companies|builders|users)|quietly (trusted|in use)/i, fixture: "Trusted by 10,000+ teams" },
  { name: "placeholder name or brand", re: /john doe|jane doe|\bacme\b|lorem ipsum/i, fixture: "Jane Doe, Acme Homes" },
  { name: "fake-perfect number", re: /99\.9+ ?%|1234567/, fixture: "99.99% uptime" },
  { name: "version label on a marketing page", re: /\bv\d+\.\d+\b|\bbeta\b|\balpha\b|early access|invite-only/i, fixture: "v0.6 · invite-only preview" },
  { name: "filler verb (HUMANIZE extension)", re: /\b(elevate|unleash|next-gen|revolutioni[sz]e|supercharge|turbocharge)/i, fixture: "Elevate your sales" },
];

// ── Detector self-checks: every guard trips on its fixture and stays quiet on clean copy ──
const CLEAN = "Three concepts from one lot. Est. range $623–$685K, 2,650–2,900 sq ft. 01 Enter the lot.";
assert.equal(emDashes("a — b — c"), 2);
assert.equal(emDashes(CLEAN), 0);
assert.equal(strayEnDashes(CLEAN), 0, "numeric ranges are allowed en-dashes");
assert.equal(strayEnDashes("fast – simple – honest"), 2);
assert.equal(sectionEyebrows('<p className="text-xs font-bold uppercase tracking-widest">WHY</p>\n<h2 className="text-3xl">Heading</h2>'), 1);
assert.equal(sectionEyebrows('<span className="text-[10px] uppercase tracking-wider">PRO</span>\n<h3>MLS</h3>'), 0, "a badge above an <h3> is not a section eyebrow");
for (const z of ZERO_TOLERANCE) {
  assert.match(z.fixture, z.re, `detector "${z.name}" must trip on its fixture`);
  assert.doesNotMatch(CLEAN, z.re, `detector "${z.name}" must stay quiet on clean copy`);
}

// ── Surfaces under guard ──────────────────────────────────────────────
const surfaces: [string, string][] = [
  ["T.en", JSON.stringify(T.en)],
  ["T.es", JSON.stringify(T.es)],
  ["HomePageClient.tsx", withoutClassNames(stripComments(src("HomePageClient.tsx")))],
  ["page.tsx", withoutClassNames(stripComments(src("page.tsx")))],
  ["try/page.tsx", withoutClassNames(stripComments(src("try/page.tsx")))],
  ["try/TryClient.tsx", withoutClassNames(stripComments(src("try/TryClient.tsx")))],
  ["partners/page.tsx", withoutClassNames(stripComments(src("partners/page.tsx")))],
];

// 1. Em-dash ratchet (equality: lower the baseline when copy improves, never raise it)
const EM_DASH_BASELINE: Record<string, number> = {
  // 2026-09-23 · PPP-080 · target 0 · removing the existing ones = customer-facing copy change (Shoji decides)
  "T.en": 15,
  "T.es": 14,
  "HomePageClient.tsx": 2,
  "page.tsx": 1,
  "try/page.tsx": 2,
  "try/TryClient.tsx": 6,
  "partners/page.tsx": 7,
};
for (const [name, text] of surfaces) {
  const n = emDashes(text);
  const base = EM_DASH_BASELINE[name];
  assert.ok(base !== undefined, `${name}: add an em-dash baseline entry`);
  assert.equal(
    n,
    base,
    `${name}: em-dash count is ${n}, ratchet baseline is ${base}. Never add em-dashes to copy (LLM default: use a period, comma or colon; PPP-080). If you removed some, lower the baseline to ${n}.`,
  );
}

// 2. En-dash only inside numeric ranges
for (const [name, text] of surfaces) {
  assert.equal(strayEnDashes(text), 0, `${name}: en-dash used as a separator (only numeric ranges like $623–$685K may use it)`);
}
assert.equal(strayEnDashes(formatCostRange(622500)), 0, "rendered cost range is a numeric range");
assert.equal(strayEnDashes(sampleSqftRange()), 0, "rendered sqft range is a numeric range");

// 3. Zero tolerance in copy (both languages and the JSX text of every marketing surface)
for (const [name, text] of surfaces) {
  for (const z of ZERO_TOLERANCE) {
    assert.doesNotMatch(text, z.re, `${name}: ${z.name}`);
  }
}
for (const lang of ["en", "es"] as const) {
  assert.doesNotMatch(`${T[lang].hero.headline1} ${T[lang].hero.headline2}`, /—/, `${lang}: em-dash inside the hero headline`);
}

// 4. Section eyebrows: at most one per three sections (badges are not counted)
const lp = src("HomePageClient.tsx");
const sections = h2Count(lp);
const eyebrows = sectionEyebrows(lp);
assert.ok(sections >= 4, "sanity: the LP renders several <h2> sections");
assert.ok(
  eyebrows <= Math.ceil(sections / 3),
  `${eyebrows} section eyebrows over ${sections} sections; the cap is ceil(sections/3) = ${Math.ceil(sections / 3)}. Drop the label: the headline is enough.`,
);

// 5. Motion and perf: CSS scroll-driven reveal only, stable viewport units
for (const f of ["HomePageClient.tsx", "try/TryClient.tsx", "partners/page.tsx"]) {
  const s = stripComments(src(f));
  assert.doesNotMatch(s, /addEventListener\(\s*["']scroll["']/, `${f}: window scroll listener (use the CSS scroll-driven .reveal)`);
  assert.doesNotMatch(s, /\bonScroll=/, `${f}: onScroll handler`);
  assert.doesNotMatch(s, /requestAnimationFrame/, `${f}: requestAnimationFrame loop`);
  assert.doesNotMatch(s, /(?<!min-)\bh-screen\b/, `${f}: standalone h-screen (mobile viewport instability; size the box by content or min-h-[100dvh])`);
}

console.log(`lp-anti-slop.test.ts: all assertions passed ✅ (em-dash ratchet ${Object.values(EM_DASH_BASELINE).reduce((a, b) => a + b, 0)}, eyebrows ${eyebrows}/${sections})`);
