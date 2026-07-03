/**
 * Unit tests for suspectStat() / validate() fabrication gating and the W1
 * link-integrity gate (checkLinkIntegrity).
 * Run with: npx tsx src/lib/content-quality.test.ts
 * (Same convention as concept-style-image.test.ts — add vitest/jest when a
 * test runner is configured.)
 */
import {
  checkLinkIntegrity,
  extractSplanaiPaths,
  suspectStat,
  validate,
  type LinkIntegrityDb,
} from "./content-quality";
import assert from "node:assert/strict";

let passed = 0;

function expectBlocked(text: string, why: string, allowlist?: Array<string | RegExp>) {
  const issues = suspectStat(text, allowlist ? { allowlist } : undefined);
  assert.ok(issues.length > 0, `expected BLOCK (${why}): "${text}" — got no issues`);
  passed++;
}

function expectClean(text: string, why: string, allowlist?: Array<string | RegExp>) {
  const issues = suspectStat(text, allowlist ? { allowlist } : undefined);
  assert.deepEqual(issues, [], `expected CLEAN (${why}): "${text}" — got ${JSON.stringify(issues)}`);
  passed++;
}

// ── Blocked: fabricated customer outcomes actually posted to X (audit 2026-07-02) ──
expectBlocked(
  "One builder went from 3 to 12 concepts per week with SplanAI.",
  "from X to Y customer outcome",
);
expectBlocked(
  "A builder spent 40 hours/month on proposals. SplanAI cut that to 4 hours.",
  "cut-that-to customer outcome",
);
expectBlocked("Proposal time: 40h→4h with SplanAI.", "arrow metric");
expectBlocked("Builders close deals 35% faster with SplanAI.", "% faster");
expectBlocked("Our customers see 3x more leads every month.", "Nx more");
expectBlocked("Just shipped: AI floor plan generation that learns your builder's style.", "just shipped");
expectBlocked("Just launched instant cost estimation overlay.", "just launched");
expectBlocked("Instant cost estimation is now live for every builder.", "now live");
expectBlocked("32% of buyers choose competitors when proposals take too long.", "buyer % stat");
expectBlocked("A recent NAHB study found builders are 34% more likely to close.", "fabricated study");
expectBlocked("Builders using SplanAI generated $1.4 million in additional profit.", "profit claim");

// ── "Just shipped" is NEVER excused, even inside a sourced/allowlisted sentence ──
{
  const text = "Just shipped a new dashboard (NAHB, June 2026).";
  const issues = suspectStat(text, { allowlist: [text] });
  assert.ok(
    issues.some(i => i.startsWith("unverified_claim:")),
    `launch claims must not be excusable — got ${JSON.stringify(issues)}`,
  );
  passed++;
}

// ── Allowed: approved citable stats with an explicit source marker ──
expectClean(
  "NAHB builder confidence (HMI) was 35 in June 2026, below the break-even 50 line (NAHB, June 2026).",
  "sourced macro stat",
);
expectClean(
  "About 62% of builders used sales incentives and ~35% cut prices (NAHB/NAR, June 2026).",
  "sourced macro stat 2",
);
expectClean(
  "US housing starts fell 15.4% month-over-month in May 2026 (U.S. Census Bureau).",
  "sourced census stat",
);

// ── Allowed: caller allowlist (citable_stats-style entries) ──
expectClean(
  "30-year fixed mortgage sits around 6.47% right now.",
  "allowlisted stat",
  ["30-year fixed mortgage"],
);
expectClean(
  "Roughly 79% of builder firms have fewer than 10 employees.",
  "allowlisted regex",
  [/79%\s+of\s+builder\s+firms/i],
);

// ── Allowed: normal copy, hypothetical examples, product description ──
expectClean(
  "From a lot address, SplanAI creates 3 buyer-ready home concepts in about 30 seconds.",
  "product description",
);
expectClean("Say a buyer walks in with a $350k budget. What do you show them?", "hypothetical example");
expectClean("I spent this week rebuilding the proposal flow. Slow, unglamorous work.", "founder build-in-public");
expectClean("Most builders I talk to hate how long proposals take.", "qualitative claim");
// sentence-scoped: a sourced stat in one sentence must not excuse a fabrication in another
{
  const text =
    "Housing starts fell 15.4% in May 2026 (U.S. Census Bureau). One builder went from 3 to 12 concepts per week.";
  const issues = suspectStat(text);
  assert.ok(issues.length > 0, "sentence-scoped exemption failed — fabrication slipped through");
  passed++;
}

// ── validate() integration: fabrications reach blog gate; clean sourced body passes it ──
{
  const dirtyBody = [
    "## Why proposals are slow",
    "One builder went from 3 to 12 concepts per week.",
    "## What changes",
    "Speed matters.",
    "## Wrap up",
    "Try SplanAI.",
  ].join("\n\n").padEnd(700, " word");
  const issues = validate("Title", "d".repeat(120), dirtyBody);
  assert.ok(
    issues.some(i => i.startsWith("suspect_stat:")),
    `validate() must surface suspect_stat — got ${JSON.stringify(issues)}`,
  );
  passed++;
}
{
  const cleanBody = [
    "## Market context",
    "NAHB builder confidence (HMI) was 35 in June 2026 (NAHB, June 2026).",
    "## What builders do",
    "Most builders quote from experience and a spreadsheet.",
    "## Where SplanAI fits",
    "From a lot address, SplanAI creates 3 buyer-ready concepts in about 30 seconds.",
  ].join("\n\n").padEnd(700, " word");
  const issues = validate("Title", "d".repeat(120), cleanBody);
  assert.deepEqual(
    issues.filter(i => i.startsWith("suspect_stat:") || i.startsWith("unverified_claim:")),
    [],
    `clean sourced body must pass — got ${JSON.stringify(issues)}`,
  );
  passed++;
}

// ── Edge cases ──
expectClean("", "empty text");
expectClean("   \n  ", "whitespace only");

console.log(`content-quality.test.ts: all ${passed} assertions passed ✅ (sync)`);

// ═══ W1 link-integrity gate (checkLinkIntegrity) ═════════════════════════════
// Fake of the LinkIntegrityDb slice — no network. Records query count so we
// can also assert the gate does NOT hit the DB when no blog link is present.
function fakeDb(
  rows: Array<{ slug: string; status: string | null }>,
  opts?: { errorMessage?: string },
): LinkIntegrityDb & { queries: number } {
  const db = {
    queries: 0,
    from(table: string) {
      assert.equal(table, "seo_articles", "gate must only read seo_articles");
      return {
        select(_columns: string) {
          return {
            in(_column: string, values: string[]) {
              db.queries++;
              if (opts?.errorMessage) {
                return Promise.resolve({ data: null, error: { message: opts.errorMessage } });
              }
              return Promise.resolve({
                data: rows.filter(r => values.includes(r.slug)),
                error: null,
              });
            },
          };
        },
      };
    },
  };
  return db;
}

const ARTICLES = [
  { slug: "live-post", status: "published" },
  { slug: "pending-post", status: "draft" },
  { slug: "old-post", status: "archived" },
];

async function linkIntegrityTests() {
  const expectIssues = async (
    text: string | null,
    linkUrl: string | null,
    contains: string,
    why: string,
  ) => {
    const issues = await checkLinkIntegrity(text, linkUrl, fakeDb(ARTICLES));
    assert.ok(
      issues.some(i => i.includes(contains)),
      `expected issue containing "${contains}" (${why}) — got ${JSON.stringify(issues)}`,
    );
    passed++;
  };
  const expectPass = async (text: string | null, linkUrl: string | null, why: string) => {
    const issues = await checkLinkIntegrity(text, linkUrl, fakeDb(ARTICLES));
    assert.deepEqual(issues, [], `expected PASS (${why}) — got ${JSON.stringify(issues)}`);
    passed++;
  };

  // ── the 2026-07-02 incident: unpublished slug must NOT be postable ──
  await expectIssues(
    "Why small builders can look national.",
    "https://splanai.com/blog/pending-post",
    "link_integrity:blog_unpublished:pending-post",
    "draft article referenced from link_url",
  );
  await expectIssues(
    "Full story: https://splanai.com/blog/pending-post",
    null,
    "link_integrity:blog_unpublished:pending-post",
    "draft article referenced from post body",
  );
  await expectIssues(
    null,
    "https://splanai.com/blog/old-post",
    "link_integrity:blog_unpublished:old-post",
    "archived article is not live either",
  );

  // ── published slug passes (link_url, body, bare domain, ?utm, trailing junk) ──
  await expectPass(null, "https://splanai.com/blog/live-post", "published slug via link_url");
  await expectPass("Read it: https://splanai.com/blog/live-post", null, "published slug in body");
  await expectPass("Read it: splanai.com/blog/live-post.", null, "bare domain + trailing period");
  await expectPass(null, "https://www.splanai.com/blog/live-post/", "www + trailing slash");
  await expectPass(null, "https://splanai.com/blog/live-post?utm_source=x#top", "query/hash stripped");

  // ── static routes pass (and never hit the DB) ──
  {
    const db = fakeDb(ARTICLES);
    const issues = await checkLinkIntegrity(
      "Try splanai.com/tools and https://splanai.com/pulse — or https://splanai.com/",
      "https://splanai.com/tools/payment-calculator",
      db,
    );
    assert.deepEqual(issues, [], `static routes must pass — got ${JSON.stringify(issues)}`);
    assert.equal(db.queries, 0, "static-only check must not query the DB");
    passed += 2;
  }
  await expectPass(null, "https://splanai.com/pulse/raleigh", "known pulse metro");

  // ── unknown / non-postable paths are rejected ──
  await expectIssues(null, "https://splanai.com/blgo/live-post", "link_integrity:unknown_path:/blgo/live-post", "typo route");
  await expectIssues("Check splanai.com/pricing today", null, "link_integrity:unknown_path:/pricing", "nonexistent route");
  await expectIssues(null, "https://splanai.com/pulse/nowhere", "link_integrity:unknown_path:/pulse/nowhere", "unknown pulse metro");
  await expectIssues(null, "https://splanai.com/blog/live-post/extra", "link_integrity:unknown_path", "deep blog path");
  // robots.ts PRIVATE routes are real but not postable
  await expectIssues(null, "https://splanai.com/s/nfhkewvz", "link_integrity:unknown_path:/s/nfhkewvz", "private share link");
  await expectIssues(null, "https://splanai.com/try", "link_integrity:unknown_path:/try", "private demo route");
  await expectIssues(null, "https://splanai.com/dashboard", "link_integrity:unknown_path:/dashboard", "private dashboard");
  // real pages excluded from the hand-curated marketing allowlist (codex review)
  await expectIssues(null, "https://splanai.com/login", "link_integrity:unknown_path:/login", "auth utility page is not postable");
  await expectIssues(null, "https://splanai.com/upgrade", "link_integrity:unknown_path:/upgrade", "app-internal page is not postable");
  await expectPass(null, "https://splanai.com/terms", "legal pages stay postable");

  // ── missing slug (no seo_articles row) ──
  await expectIssues(null, "https://splanai.com/blog/never-written", "link_integrity:blog_missing:never-written", "no row at all");

  // ── DB failure → fail closed, never post blind ──
  {
    const db = fakeDb([], { errorMessage: "boom" });
    const issues = await checkLinkIntegrity(null, "https://splanai.com/blog/live-post", db);
    assert.ok(
      issues.some(i => i.startsWith("link_integrity:check_failed:")),
      `DB error must block the post — got ${JSON.stringify(issues)}`,
    );
    passed++;
  }

  // ── out-of-scope URLs are ignored; no URLs → no queries ──
  {
    const db = fakeDb(ARTICLES);
    const issues = await checkLinkIntegrity(
      "Great thread: https://x.com/some/status and https://example.com/blog/whatever",
      null,
      db,
    );
    assert.deepEqual(issues, [], "non-splanai URLs are out of scope");
    assert.equal(db.queries, 0, "no splanai URL → no DB query");
    passed += 2;
  }
  await expectPass("No links at all in this post.", null, "no URLs");

  // ── one clean + one dirty URL in the same draft → still blocked ──
  await expectIssues(
    "Read https://splanai.com/blog/live-post and https://splanai.com/blog/pending-post",
    null,
    "link_integrity:blog_unpublished:pending-post",
    "a single dead link blocks the whole draft",
  );

  // ── extractSplanaiPaths normalization ──
  assert.deepEqual(
    extractSplanaiPaths("splanai.com/blog/a. Also https://www.splanai.com/blog/a/ and https://splanai.com"),
    ["/blog/a", "/"],
    "dedup + trailing punctuation/slash normalization",
  );
  passed++;
}

linkIntegrityTests()
  .then(() => {
    console.log(`content-quality.test.ts: all ${passed} assertions passed ✅ (incl. link-integrity)`);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
