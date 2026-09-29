import { createHash } from "node:crypto";
import { MODEL_SOURCES, inspectModelDocs } from "../src/lib/ai-model-watch";

async function read(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: "error" });
  if (!response.ok) throw new Error(`source HTTP ${response.status}`);
  const body = await response.text();
  if (body.length > 2_000_000) throw new Error("source too large");
  return body;
}
async function main() {
  const [overview, lifecycle] = await Promise.all([read(MODEL_SOURCES.overview), read(MODEL_SOURCES.lifecycle)]);
  const report = inspectModelDocs(overview, lifecycle);
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), sources: MODEL_SOURCES,
    sourceSha256: [overview, lifecycle].map(s => createHash("sha256").update(s).digest("hex")), ...report }, null, 2));
  if (report.needsReview) process.exitCode = 2;
}
main().catch(() => {
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), status: "source_unavailable", needsReview: true, automaticModelChange: false, inferenceCalls: 0 }));
  process.exitCode = 1;
});
