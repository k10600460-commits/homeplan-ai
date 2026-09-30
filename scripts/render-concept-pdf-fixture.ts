/** Offline QA of the ACTUAL results-page PDF builder, not a replacement template.
 * Input must be a synthetic benchmark log; no app auth, DB or inference calls. */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { jsPDF } from "jspdf";
import { formatArea, formatCurrency, areaValue, areaUnitLabel, getMarketPack } from "../src/lib/market";
import { conceptAreaNote } from "../src/lib/concept-disclosure";
async function main() {
  const [logPath, outputPath, model = "claude-sonnet-5-5", caseId = "typical-lot"] = process.argv.slice(2);
  if (!logPath || !outputPath || !isAbsolute(logPath) || !isAbsolute(outputPath)) throw new Error("Absolute benchmark-log and PDF paths required");
  const source = readFileSync(fileURLToPath(new URL("../src/app/results/page.tsx", import.meta.url)), "utf8");
  const tree = ts.createSourceFile("results.tsx", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const selected = tree.statements.filter(node =>
    (ts.isFunctionDeclaration(node) && ["buildPDF", "calcMortgage"].includes(node.name?.text ?? "")) ||
    (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => ts.isIdentifier(d.name) && d.name.text === "PLAN_COLORS")));
  if (selected.length !== 3) throw new Error("PDF source changed; review QA extraction");
  const code = ts.transpileModule(selected.map(n => n.getText(tree)).join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const build = runInNewContext(code + "\nbuildPDF", { jsPDF, formatArea, formatCurrency, areaValue, areaUnitLabel, getMarketPack, conceptAreaNote });
  const rows = readFileSync(logPath, "utf8").split("\n").filter(l => l.includes("SPLANAI_BENCH_PLAN=")).map(l => JSON.parse(l.split("SPLANAI_BENCH_PLAN=")[1]));
  const plans = rows.filter(r => r.model === model && r.caseId === caseId && r.repeat === 0).map(r => r.plan);
  if (plans.length !== 3) throw new Error("Need exactly three saved synthetic plans");
  const doc = await build(plans, { lotSize: "8500", budget: "350000", familySize: "3" }, undefined, undefined, "us");
  writeFileSync(outputPath, Buffer.from(doc.output("arraybuffer")));
  console.log(JSON.stringify({ sourceSha256: createHash("sha256").update(source).digest("hex"), model, caseId, pages: doc.getNumberOfPages(), inferenceCalls: 0, outputPath }));
}
main().catch(error => { console.error(String(error)); process.exitCode = 1; });
