import { createHash } from "node:crypto";
import { MODEL_SOURCES, inspectModelDocs } from "../src/lib/ai-model-watch";
import { CONCEPT_CATALOG_URL, inspectConceptCatalog } from "../src/lib/concept-model-watch";

async function read(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: "error" });
  if (!response.ok) throw new Error(`source HTTP ${response.status}`);
  const body = await response.text();
  if (body.length > 2_000_000) throw new Error("source too large");
  return body;
}
async function main() {
  const [overview, lifecycle, catalog] = await Promise.all([read(MODEL_SOURCES.overview), read(MODEL_SOURCES.lifecycle), read(CONCEPT_CATALOG_URL)]);
  const report = inspectModelDocs(overview, lifecycle);
  const crossProvider = inspectConceptCatalog(JSON.parse(catalog));
  const needsReview = report.needsReview || crossProvider.needsReview;
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), sources: { ...MODEL_SOURCES, catalog: CONCEPT_CATALOG_URL },
    sourceSha256: [overview, lifecycle, catalog].map(s => createHash("sha256").update(s).digest("hex")), ...report, crossProvider, needsReview }, null, 2));
  if (needsReview) process.exitCode = 2;
}
main().catch(() => {
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), status: "source_unavailable", needsReview: true, automaticModelChange: false, inferenceCalls: 0 }));
  process.exitCode = 1;
});
