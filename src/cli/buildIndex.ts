import path from "node:path";
import { buildCanonicalIndex } from "../canonical/buildCanonicalIndex.js";
import { readJson, writeJson } from "../utils/fs.js";
import type { CanonicalTaxModel } from "../types/index.js";

function main(): void {
  const [canonicalPath, outputPath] = process.argv.slice(2);
  if (!canonicalPath || !outputPath) {
    console.error("Usage: npm run build-index -- <canonical.json> <index-output.json>");
    process.exit(1);
  }
  const model = readJson<CanonicalTaxModel>(path.resolve(canonicalPath));
  const index = buildCanonicalIndex(model);
  writeJson(path.resolve(outputPath), index);
  console.log(`Canonical index written to: ${outputPath}`);
  console.log(`Index entries: ${index.length}`);
}
main();
