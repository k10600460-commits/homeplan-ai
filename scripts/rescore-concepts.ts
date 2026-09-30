/** Offline-only rescoring: preserve original logs, apply one documented scorer
 * to every model. Never turn a provider/schema failure into a passing result. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { conceptIssues, prepareConceptsForDisplay, CONCEPT_EVALUATOR_VERSION, type CalculatedPlan, type ConceptBrief } from "../src/lib/concept-contract";
const path = process.argv[2];
if (!path) throw new Error("Usage: tsx scripts/rescore-concepts.ts /absolute/build-log.txt");
const source = readFileSync(path, "utf8");
function entries<T>(kind: string, text = source): T[] {
  const marker = `SPLANAI_BENCH_${kind}=`;
  return text.split("\n").filter(line => line.includes(marker)).map(line => JSON.parse(line.slice(line.indexOf(marker) + marker.length)) as T);
}
type Spec = { cases: (ConceptBrief & { id: string })[]; count: number; repeats: number; specHash: string };
// Early builds had a truncated START log. An original dry-run spec can be
// supplied, but ONLY when its hash matches the completed build's summary.
const [spec] = process.argv[3] ? entries<Spec>("DRY_RUN", readFileSync(process.argv[3], "utf8")) : entries<Spec>("START");
if (!spec) throw new Error("Missing benchmark spec");
const [originalSummary] = entries<{ specHash: string }>("SUMMARY");
if (originalSummary?.specHash !== spec.specHash) throw new Error("Spec hash mismatch");
const plans = entries<{ model: string; caseId: string; repeat: number; plan: CalculatedPlan }>("PLAN");
const rows = entries<{ model: string; caseId: string; repeat: number; issues: string[]; costUsd: number; durationMs: number; error?: string }>("ROW");
const rescored = rows.map(row => {
  const group = plans.filter(p => p.model === row.model && p.caseId === row.caseId && p.repeat === row.repeat).map(p => p.plan);
  const brief = spec.cases.find(c => c.id === row.caseId);
  if (!brief) throw new Error("Unknown case");
  const issues = !row.error && group.length === spec.count ? conceptIssues(group, brief) : row.issues;
  const display = prepareConceptsForDisplay(group);
  const deliveryIssues = !row.error && group.length === spec.count ? conceptIssues(display, brief) : row.issues;
  return { ...row, originalIssues: row.issues, issues, deliveryIssues, omittedProseClaims: display.reduce((n, p) => n + (p.omittedProseClaims ?? 0), 0) };
});
const summary = [...new Set(rows.map(r => r.model))].map(model => {
  const group = rescored.filter(r => r.model === model);
  const complete = group.filter(r => !r.error);
  return { model, completed: complete.length, expected: spec.cases.length * spec.repeats,
    originalPassed: group.filter(r => !r.originalIssues.length).length, passed: group.filter(r => !r.issues.length).length,
    deliveryPassed: group.filter(r => !r.deliveryIssues.length).length, omittedProseClaims: group.reduce((n, r) => n + r.omittedProseClaims, 0),
    costUsd: group.reduce((n, r) => n + r.costUsd, 0), meanMs: complete.length ? complete.reduce((n, r) => n + r.durationMs, 0) / complete.length : null,
    issues: group.flatMap(r => r.issues) };
});
console.log(JSON.stringify({ sourceSha256: createHash("sha256").update(source).digest("hex"), originalSpecHash: spec.specHash,
  evaluatorVersion: CONCEPT_EVALUATOR_VERSION, inferenceCalls: 0, reason: "Offline replay under the current shared evaluator and disclosure/filter policy. Raw scores remain separate from deliverable scores. NOT a new paid test; original logs retained.",
  summary, rows: rescored }, null, 2));
