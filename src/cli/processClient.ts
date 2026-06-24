import path from "node:path";
import { readJson, writeJson } from "../utils/fs.js";
import { buildCanonicalModel } from "../canonical/buildCanonicalModel.js";
import { buildCanonicalIndex } from "../canonical/buildCanonicalIndex.js";

function main(): void {
  const [rawInputPath, outputBase = "data/client"] = process.argv.slice(2);
  if (!rawInputPath) {
    console.error("Usage: npm run process-client -- <raw-client.json> [output-base]");
    process.exit(1);
  }
  const raw = readJson<Record<string, unknown>>(path.resolve(rawInputPath));
  const canonical = buildCanonicalModel(raw, process.cwd());
  const index = buildCanonicalIndex(canonical);
  const canonicalPath = `${outputBase}.canonical.json`;
  const indexPath = `${outputBase}.index.json`;
  writeJson(path.resolve(canonicalPath), canonical);
  writeJson(path.resolve(indexPath), index);
  console.log(`Canonical model: ${canonicalPath}`);
  console.log(`Canonical index: ${indexPath}`);
}
main();
