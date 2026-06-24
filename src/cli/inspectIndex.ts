import path from "node:path";
import { readJson } from "../utils/fs.js";
import type { CanonicalIndexEntry } from "../types/index.js";

function main(): void {
  const [indexPath] = process.argv.slice(2);
  if (!indexPath) {
    console.error("Usage: npm run inspect-index -- <index.json>");
    process.exit(1);
  }
  const index = readJson<CanonicalIndexEntry[]>(path.resolve(indexPath));
  console.table(index.slice(0, 100).map((entry, i) => ({
    "#": i + 1,
    group: entry.group,
    type: entry.docType ?? "",
    path: entry.canonicalPath,
    value: String(entry.value).slice(0, 40),
    label: entry.label.slice(0, 60)
  })));
  console.log(`Total index entries: ${index.length}`);
}
main();
