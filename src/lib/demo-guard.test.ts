/**
 * Unit tests for checkAndClaimDemo (signup-free demo guard).
 * Run with: npx tsx src/lib/demo-guard.test.ts
 * (Same plain-assert style as concept-style-image.test.ts.)
 */
import assert from "node:assert/strict";
import { checkAndClaimDemo, DemoStore, STALE_CLAIM_MS } from "./demo-guard";

interface MemRow {
  id: string;
  result: unknown | null;
  createdAt: string;
  ipHash: string;
  cookieId: string;
}

// In-memory store mirroring the demo_usage unique-index semantics.
function memoryStore(): DemoStore & { rows: MemRow[] } {
  const rows: MemRow[] = [];
  let seq = 0;
  return {
    rows,
    async findExisting(ipHash, cookieId) {
      const hit = rows.find((r) => r.ipHash === ipHash || r.cookieId === cookieId);
      return hit ? { id: hit.id, result: hit.result, createdAt: hit.createdAt } : null;
    },
    async countCreatedSince() {
      return rows.length;
    },
    async insertClaim(ipHash, cookieId) {
      if (rows.some((r) => r.ipHash === ipHash || r.cookieId === cookieId)) {
        return { outcome: "duplicate" as const };
      }
      const id = `claim-${++seq}`;
      rows.push({ id, result: null, createdAt: new Date().toISOString(), ipHash, cookieId });
      return { outcome: "inserted" as const, id };
    },
    async deleteClaim(id) {
      const i = rows.findIndex((r) => r.id === id);
      if (i >= 0) rows.splice(i, 1);
    },
  };
}

function brokenStore(): DemoStore {
  const boom = async (): Promise<never> => { throw new Error("connect ECONNREFUSED"); };
  return { findExisting: boom, countCreatedSince: boom, insertClaim: boom, deleteClaim: boom };
}

async function main() {
  let passed = 0;

  // 1. First visit → allowed, claim created before generation
  {
    const store = memoryStore();
    const r = await checkAndClaimDemo(store, "ip-a", "ck-a");
    assert.equal(r.ok, true, "first visit should be allowed");
    assert.equal(store.rows.length, 1, "claim row should be inserted before generation");
    passed += 2;
  }

  // 2. Second attempt (same cookie+IP, result stored) → rejected, result echoed
  {
    const store = memoryStore();
    await checkAndClaimDemo(store, "ip-a", "ck-a");
    store.rows[0].result = { name: "The Sample" };
    const r = await checkAndClaimDemo(store, "ip-a", "ck-a");
    assert.equal(r.ok, false, "second attempt must be rejected");
    assert.equal(!r.ok && r.reason, "already_used");
    assert.deepEqual(!r.ok && r.reason === "already_used" && r.existingResult, { name: "The Sample" });
    passed += 3;
  }

  // 3. New cookie but same IP → still rejected (both keys enforced)
  {
    const store = memoryStore();
    await checkAndClaimDemo(store, "ip-a", "ck-a");
    store.rows[0].result = { name: "X" };
    const r = await checkAndClaimDemo(store, "ip-a", "ck-FRESH");
    assert.equal(r.ok, false, "same IP with fresh cookie must be rejected");
    passed += 1;
  }

  // 4. Same cookie but new IP → still rejected
  {
    const store = memoryStore();
    await checkAndClaimDemo(store, "ip-a", "ck-a");
    store.rows[0].result = { name: "X" };
    const r = await checkAndClaimDemo(store, "ip-NEW", "ck-a");
    assert.equal(r.ok, false, "same cookie with fresh IP must be rejected");
    passed += 1;
  }

  // 5. Fresh in-flight claim (no result yet) → blocked, no double generation
  {
    const store = memoryStore();
    await checkAndClaimDemo(store, "ip-a", "ck-a");
    const r = await checkAndClaimDemo(store, "ip-a", "ck-a");
    assert.equal(!r.ok && r.reason, "already_used", "in-flight claim must block");
    assert.equal(store.rows.length, 1, "no second claim row");
    passed += 2;
  }

  // 6. Stale claim (crashed generation) → recovered, retry allowed (codex High #1)
  {
    const store = memoryStore();
    await checkAndClaimDemo(store, "ip-a", "ck-a");
    const later = Date.now() + STALE_CLAIM_MS + 1000;
    const r = await checkAndClaimDemo(store, "ip-a", "ck-a", 50, () => later);
    assert.equal(r.ok, true, "stale claim must be freed for retry");
    assert.equal(store.rows.length, 1, "stale row replaced by new claim");
    passed += 2;
  }

  // 7. Race: findExisting missed but insert hits the unique index → already_used
  {
    const store = memoryStore();
    const racy: DemoStore = { ...store, async findExisting() { return null; } };
    await checkAndClaimDemo(store, "ip-a", "ck-a");
    const r = await checkAndClaimDemo(racy, "ip-a", "ck-a");
    assert.equal(!r.ok && r.reason, "already_used", "duplicate insert must resolve to already_used");
    passed += 1;
  }

  // 8. Daily cap reached before insert → rejected, nothing inserted
  {
    const store = memoryStore();
    await checkAndClaimDemo(store, "ip-1", "ck-1", 2);
    await checkAndClaimDemo(store, "ip-2", "ck-2", 2);
    const r = await checkAndClaimDemo(store, "ip-3", "ck-3", 2);
    assert.equal(!r.ok && r.reason, "daily_cap");
    assert.equal(store.rows.length, 2, "cap must prevent a third claim");
    passed += 2;
  }

  // 9. Cap race: pre-insert count was stale → own claim rolled back (codex High #2)
  {
    const store = memoryStore();
    await checkAndClaimDemo(store, "ip-1", "ck-1", 2);
    await checkAndClaimDemo(store, "ip-2", "ck-2", 2);
    let calls = 0;
    const racy: DemoStore = {
      ...store,
      // First count (pre-insert) reports a stale low value; second (post-insert) is real.
      async countCreatedSince(since) {
        calls += 1;
        return calls === 1 ? 1 : store.countCreatedSince(since);
      },
    };
    const r = await checkAndClaimDemo(racy, "ip-3", "ck-3", 2);
    assert.equal(!r.ok && r.reason, "daily_cap", "post-insert verify must catch the race");
    assert.equal(store.rows.length, 2, "over-cap claim must be rolled back");
    passed += 2;
  }

  // 10. DB unreachable → FAIL-CLOSED (never allow generation)
  {
    const r = await checkAndClaimDemo(brokenStore(), "ip-a", "ck-a");
    assert.equal(r.ok, false, "DB outage must not allow generation");
    assert.equal(!r.ok && r.reason, "db_unavailable");
    passed += 2;
  }

  // 11. Insert-stage failure (after read succeeded) → also fail-closed
  {
    const store = memoryStore();
    const halfBroken: DemoStore = { ...store, async insertClaim() { throw new Error("timeout"); } };
    const r = await checkAndClaimDemo(halfBroken, "ip-a", "ck-a");
    assert.equal(!r.ok && r.reason, "db_unavailable");
    passed += 1;
  }

  console.log(`✓ ${passed} assertions passed (demo-guard)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
