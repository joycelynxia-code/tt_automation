import type { CanonicalIndexEntry, DiscoveredField, FieldResolution, PageContext, PageMapping } from "../types/index.js";
import { hasAnyPhrase, normalizeText } from "../utils/text.js";

function fieldLabel(field: DiscoveredField): string {
  return [field.labelText, field.ariaLabel, field.placeholder, field.nearbyText, field.name, field.id].filter(Boolean).join(" ");
}
function fieldKey(field: DiscoveredField): string {
  return normalizeText(field.labelText || field.ariaLabel || field.placeholder || field.name || field.id || "unknown");
}
function score(field: DiscoveredField, entry: CanonicalIndexEntry, context: PageContext): number {
  const f = normalizeText(fieldLabel(field));
  let best = 0;
  for (const alias of entry.aliases) {
    const a = normalizeText(alias);
    if (!a) continue;
    if (f === a) best = Math.max(best, 0.98);
    else if (f.includes(a)) best = Math.max(best, 0.86);
    else {
      const tokens = a.split(" ").filter((t) => t.length > 1);
      const hits = tokens.filter((t) => f.includes(t)).length;
      if (tokens.length) best = Math.max(best, (hits / tokens.length) * 0.68);
    }
  }
  if (context.group === entry.group) best += 0.14;
  if (entry.docLabel && hasAnyPhrase(f, [entry.docLabel])) best += 0.1;

  // Address guardrails.
  if (entry.semanticType === "address") {
    if (entry.group === "TAXPAYER" && hasAnyPhrase(f, ["employer", "payer", "w 2", "w2", "1099"])) best -= 0.5;
    if (["W2", "1099_INT", "1099_R", "1099_DIV"].includes(entry.group) && hasAnyPhrase(f, ["home", "mailing", "taxpayer", "your address"])) best -= 0.5;
  }

  return Math.max(0, Math.min(0.99, best));
}

export function resolveField(
  field: DiscoveredField,
  index: CanonicalIndexEntry[],
  context: PageContext,
  savedMappings: PageMapping[] = [],
  minimumConfidence = 0.55
): FieldResolution | null {
  if (field.isDisabled || !field.isVisible) return null;
  const key = fieldKey(field);

  for (const mapping of savedMappings) {
    const row = mapping.matches.find((m) => m.pageFieldKey === key);
    if (!row) continue;
    const entry = index.find((e) => e.canonicalPath === row.canonicalPath);
    if (!entry) continue;
    return {
      pageFieldId: field.fieldId,
      pageLabel: field.labelText || field.ariaLabel || field.placeholder || field.name || field.id || "Unknown field",
      canonicalPath: entry.canonicalPath,
      canonicalLabel: entry.label,
      value: entry.value,
      confidence: 0.99,
      source: "saved",
      reason: `Saved page mapping ${mapping.mappingId}`,
    };
  }

  let best: CanonicalIndexEntry | null = null;
  let bestScore = 0;
  for (const entry of index) {
    if (context.group !== "UNKNOWN" && entry.group !== context.group) continue;
    const s = score(field, entry, context);
    if (s > bestScore) {
      bestScore = s;
      best = entry;
    }
  }
  if (!best || bestScore < minimumConfidence) return null;
  return {
    pageFieldId: field.fieldId,
    pageLabel: field.labelText || field.ariaLabel || field.placeholder || field.name || field.id || "Unknown field",
    canonicalPath: best.canonicalPath,
    canonicalLabel: best.label,
    value: best.value,
    confidence: Number(bestScore.toFixed(2)),
    source: "heuristic",
    reason: `Resolved by heuristic in ${context.group} context`,
  };
}

export function resolveFields(fields: DiscoveredField[], index: CanonicalIndexEntry[], context: PageContext, savedMappings: PageMapping[] = []): FieldResolution[] {
  const used = new Set<string>();
  const resolutions: FieldResolution[] = [];
  for (const f of fields) {
    const r = resolveField(f, index, context, savedMappings);
    if (!r) continue;
    if (used.has(r.canonicalPath)) continue;
    used.add(r.canonicalPath);
    resolutions.push(r);
  }
  return resolutions.sort((a, b) => b.confidence - a.confidence);
}
