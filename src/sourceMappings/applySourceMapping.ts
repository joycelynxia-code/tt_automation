import type { CanonicalDocument, SourceMapping } from "../types/index.js";
import { getByPath, getRecordsAtSourceRoot, setByPath } from "../utils/jsonPath.js";

function primitiveOrKeep(value: unknown): unknown {
  return value;
}

export function applySourceMapping(raw: unknown, mapping: SourceMapping): CanonicalDocument[] {
  const records = getRecordsAtSourceRoot(raw, mapping.sourceRoot);

  return records.map((record, index) => {
    const doc: CanonicalDocument = {
      type: mapping.canonicalDocument.type,
      id: `${mapping.canonicalDocument.idPrefix}_${index + 1}`,
      label:
        (mapping.canonicalDocument.label
          ? String(getByPath(record, mapping.canonicalDocument.label) ?? "")
          : "") || `${mapping.documentType} ${index + 1}`,
      fields: {},
    };

    for (const [targetPath, sourcePath] of Object.entries(mapping.fields)) {
      const value = primitiveOrKeep(getByPath(record, sourcePath));
      if (value === undefined) continue;
      setByPath(doc as unknown as Record<string, unknown>, targetPath, value);
    }

    return doc;
  });
}
