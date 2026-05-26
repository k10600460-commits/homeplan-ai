/**
 * X Analytics Sync
 *
 * Pulls own posts' metrics from X API Free tier and appends to
 * ~/obsidian-vault/x-knowledge/post-performance-log.md
 *
 * --- Free tier limits (2026) ---
 * - 100 reads / 24h per app
 * - Only own user data accessible reliably
 * - Limited to public_metrics on own tweets
 *
 * --- Usage ---
 *   ts-node scripts/x-analytics-sync.ts
 *   # or via npm script
 *   npm run x:sync
 *
 * --- Required env vars (.env.local) ---
 *   X_API_BEARER_TOKEN       # from developer.x.com app credentials
 *   X_USER_ID                # numeric, get via GET /2/users/me first
 *   OBSIDIAN_VAULT_PATH      # default: ~/obsidian-vault
 *
 * --- TODO when upgrading to Basic ($200/mo) ---
 * - [ ] Add search endpoint for mention monitoring (GET /2/tweets/search/recent)
 * - [ ] Add competitor account fetch (GET /2/users/by/username/:username/tweets)
 * - [ ] Increase sync frequency from daily to hourly
 * - [ ] Add DM monitoring (GET /2/dm_conversations)
 * - [ ] Add follower growth tracking
 */

import fs from "fs";
import path from "path";
import os from "os";

// ============================================================================
// Config
// ============================================================================

const BEARER = process.env.X_API_BEARER_TOKEN;
const USER_ID = process.env.X_USER_ID;
const VAULT =
  process.env.OBSIDIAN_VAULT_PATH || path.join(os.homedir(), "obsidian-vault");
const LOG_PATH = path.join(VAULT, "x-knowledge", "post-performance-log.md");

// ============================================================================
// Types
// ============================================================================

interface TweetMetrics {
  id: string;
  text: string;
  created_at: string;
  public_metrics: {
    impression_count?: number;
    like_count: number;
    reply_count: number;
    retweet_count: number;
    bookmark_count?: number;
    quote_count?: number;
  };
  non_public_metrics?: {
    user_profile_clicks?: number;
    url_link_clicks?: number;
  };
}

interface TwitterApiResponse {
  data?: TweetMetrics[];
  meta?: {
    result_count: number;
    next_token?: string;
  };
  errors?: Array<{ message: string; code: number }>;
}

// ============================================================================
// Validation
// ============================================================================

function validateEnv(): void {
  const missing: string[] = [];
  if (!BEARER) missing.push("X_API_BEARER_TOKEN");
  if (!USER_ID) missing.push("X_USER_ID");

  if (missing.length > 0) {
    console.error(
      `❌ Missing env vars: ${missing.join(", ")}\n` +
        `   Add them to .env.local or your shell environment.\n` +
        `   See script header for setup instructions.`
    );
    process.exit(1);
  }

  if (!fs.existsSync(path.dirname(LOG_PATH))) {
    console.error(
      `❌ Log directory not found: ${path.dirname(LOG_PATH)}\n` +
        `   Set OBSIDIAN_VAULT_PATH or create the x-knowledge/ folder.`
    );
    process.exit(1);
  }
}

// ============================================================================
// API
// ============================================================================

async function fetchRecentTweets(maxResults = 10): Promise<TweetMetrics[]> {
  const url = new URL(`https://api.twitter.com/2/users/${USER_ID}/tweets`);
  url.searchParams.set("max_results", String(Math.min(maxResults, 100)));
  url.searchParams.set(
    "tweet.fields",
    "created_at,public_metrics,non_public_metrics"
  );

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${BEARER}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`X API error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as TwitterApiResponse;

  if (json.errors && json.errors.length > 0) {
    throw new Error(`X API returned errors: ${JSON.stringify(json.errors)}`);
  }

  return json.data || [];
}

// ============================================================================
// Formatting
// ============================================================================

function formatLogEntry(tweet: TweetMetrics): string {
  const m = tweet.public_metrics;
  const nm = tweet.non_public_metrics || {};
  const hookShort = tweet.text.slice(0, 50).replace(/\n/g, " ");
  const quotedBody = tweet.text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");

  return `
### ${tweet.created_at} [auto-sync] "${hookShort}..."

**Tweet ID**: ${tweet.id}

**Post**:
${quotedBody}

**Metrics (auto, latest sync)**:
- impressions: ${m.impression_count ?? "?"}
- likes: ${m.like_count}
- replies: ${m.reply_count}
- retweets: ${m.retweet_count}
- quotes: ${m.quote_count ?? "?"}
- bookmarks: ${m.bookmark_count ?? "?"}
- profile clicks: ${nm.user_profile_clicks ?? "?"}
- link clicks: ${nm.url_link_clicks ?? "?"}

**Qualitative** _(Shuraemonが手動で追記)_:
- TODO: 何がうまくいったか / 予想外だったか / 学び

**Tags**: TODO

---
`;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  validateEnv();

  console.log(`📊 Fetching recent tweets for user ${USER_ID}...`);
  const tweets = await fetchRecentTweets(10);
  console.log(`   Got ${tweets.length} tweets`);

  // Read existing log to skip already-logged tweets
  let existing = "";
  if (fs.existsSync(LOG_PATH)) {
    existing = fs.readFileSync(LOG_PATH, "utf-8");
  } else {
    console.warn(`⚠️  ${LOG_PATH} not found, will create.`);
    existing = "# Post Performance Log\n\n";
    fs.writeFileSync(LOG_PATH, existing);
  }

  const newEntries: string[] = [];
  const updated: string[] = [];

  for (const tweet of tweets) {
    // Skip if tweet ID already in log
    if (existing.includes(`**Tweet ID**: ${tweet.id}`)) {
      // TODO: future enhancement = update existing entry's metrics in place
      updated.push(tweet.id);
      continue;
    }
    newEntries.push(formatLogEntry(tweet));
  }

  if (newEntries.length === 0) {
    console.log(
      `✅ No new tweets to log. (${updated.length} already tracked)\n` +
        `   (TODO: implement metrics-update for existing entries)`
    );
    return;
  }

  fs.appendFileSync(LOG_PATH, "\n" + newEntries.join("\n"));
  console.log(
    `✅ Appended ${newEntries.length} new entries to ${LOG_PATH}\n` +
      `   Remember to add qualitative notes (30 seconds each).`
  );
}

main().catch((err) => {
  console.error("❌ Sync failed:", err.message);
  process.exit(1);
});
