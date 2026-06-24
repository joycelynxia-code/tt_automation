import path from "node:path";
import type { CanonicalTaxModel } from "../types/index.js";
import { readJson, writeJson } from "../utils/fs.js";
import { buildCanonicalModel } from "../canonical/buildCanonicalModel.js";

function main(): void {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath) {
    console.error("Usage: npm run build-canonical -- <raw-client.json> <canonical-output.json>");
    process.exit(1);
  }
  const raw = readJson<Record<string, unknown>>(path.resolve(inputPath));
  const canonical: CanonicalTaxModel = buildCanonicalModel(raw, process.cwd());
  writeJson(path.resolve(outputPath), canonical);
  writeJson(path.resolve("data/reports/latest-canonical-build-report.json"), {
    createdAt: new Date().toISOString(),
    outputPath,
    documentCount: canonical.documents.length,
    documents: canonical.documents.map((d) => ({ type: d.type, id: d.id, label: d.label })),
    unmappedSourceSections: canonical.unmappedSourceSections ?? []
  });
  console.log(`Canonical model written to: ${outputPath}`);
  console.log(`Documents: ${canonical.documents.length}`);
  for (const doc of canonical.documents) console.log(`- ${doc.type}: ${doc.label}`);
  if (canonical.unmappedSourceSections?.length) {
    console.log(`Unknown source sections detected: ${canonical.unmappedSourceSections.length}`);
    for (const section of canonical.unmappedSourceSections) {
      console.log(`- ${section.suggestedType}: ${section.sourceRoot}`);
      if (section.candidateMappingFile) console.log(`  pending: ${section.candidateMappingFile}`);
    }
  }
}
main();
