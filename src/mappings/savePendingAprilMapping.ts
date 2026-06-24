import path from "node:path";
import type { AprilTurboTaxMapping, DiscoveredField, FieldResolution } from "../types/index.js";
import { writeJson } from "../utils/fs.js";
import { domHintsFromField } from "../browser/domHints.js";
import { fieldKey } from "../resolve/resolveAprilField.js";
import { appendPendingEntries } from "./aprilTurboTaxRegistry.js";
import { canonicalizeArrayPath } from "../utils/jsonPath.js";

export function savePendingAprilMapping(
  projectRoot: string,
  mapping: AprilTurboTaxMapping,
  fields: DiscoveredField[],
  matches: FieldResolution[],
): string {
  const additions = matches.map((match) => {
    const existing = mapping.entries.find((e) => e.id === match.mappingId);
    const field = fields.find((f) => f.fieldId === match.pageFieldId);
    const pageFieldKey = field ? fieldKey(field) : match.pageLabel;

    if (existing) {
      return {
        ...existing,
        pageFieldKeys: [...(existing.pageFieldKeys ?? []), pageFieldKey],
        domHints: field ? domHintsFromField(field) : existing.domHints,
      };
    }

    const domHints = field ? domHintsFromField(field) : undefined;
    const id =
      domHints?.turboTaxBinding?.replace(/[^a-zA-Z0-9_.]/g, "_") ??
      match.mappingId.replace(/^phrase:/, "");

    const canonical = canonicalizeArrayPath(match.aprilPath);
    const wildcardIndex = canonical.indexOf("[*]");
    if (wildcardIndex !== -1) {
      return {
        id,
        pageFieldKeys: [pageFieldKey],
        aprilSourceRoot: canonical.slice(0, wildcardIndex + 3),
        aprilPath: canonical.slice(wildcardIndex + 4).replace(/^\./, ""),
        label: match.pageLabel.slice(0, 80),
        domHints,
      };
    }

    return {
      id,
      pageFieldKeys: [pageFieldKey],
      aprilPath: match.aprilPath,
      label: match.pageLabel.slice(0, 80),
      domHints,
    };
  });

  const updated = appendPendingEntries(mapping, additions);
  const file = path.join(
    projectRoot,
    "data/mappings/pending",
    `april-turbotax.${Date.now()}.json`,
  );
  writeJson(file, {
    ...updated,
    savedFrom: {
      createdAt: new Date().toISOString(),
      matchCount: matches.length,
    },
  });
  return file;
}
