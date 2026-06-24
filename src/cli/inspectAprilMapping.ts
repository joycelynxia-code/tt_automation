import path from "node:path";
import { loadAprilTurboTaxMapping } from "../mappings/aprilTurboTaxRegistry.js";

function main(): void {
  const [, , mappingPath, pageGroupFilter] = process.argv;
  const mapping = loadAprilTurboTaxMapping(
    process.cwd(),
    mappingPath ?? "data/mappings/april-turbotax.master.json",
  );

  const entries = pageGroupFilter
    ? mapping.entries.filter((e) => e.pageGroup === pageGroupFilter)
    : mapping.entries;

  console.log(`Mapping: ${mapping.mappingId} (${entries.length} entries)\n`);
  console.table(
    entries.map((e) => ({
      id: e.id,
      binding: e.domHints?.turboTaxBinding ?? "",
      keys: (e.pageFieldKeys ?? []).slice(0, 1).join(" | "),
      aprilPath: e.aprilSourceRoot
        ? `${e.aprilSourceRoot}.${e.aprilPath}`
        : e.aprilPath,
    })),
  );
}

main();
