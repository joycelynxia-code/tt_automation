import type {
  AprilLeafEntry,
  AprilTurboTaxEntry,
  AprilTurboTaxMapping,
  DiscoveredField,
  FieldResolution,
  Primitive,
} from "../types/index.js";
import type { UsedPathTracker } from "../april/usedPathTracker.js";
import { findBestAprilLeaf } from "../april/scoreAprilLeaf.js";
import { inferTransformForPath } from "../april/buildAprilLeafIndex.js";
import {
  bindingArrayIndex,
  bindingsMatch,
  canonicalizeTurboTaxBinding,
  entryTurboTaxBinding,
  fieldTurboTaxBinding,
} from "../mappings/turboTaxBinding.js";
import { getByPath } from "../utils/jsonPath.js";
import { hasAnyPhrase, normalizeText } from "../utils/text.js";

export function mappingLabel(field: DiscoveredField): string {
  return (
    field.mappingLabel ||
    field.ariaLabel ||
    field.explicitLabel ||
    field.placeholder ||
    field.name ||
    field.id ||
    ""
  );
}

export function fieldKey(field: DiscoveredField): string {
  return normalizeText(mappingLabel(field) || "unknown");
}

export function fieldContextLabel(field: DiscoveredField): string {
  return [mappingLabel(field), field.nearbyText].filter(Boolean).join(" ");
}

export function displayLabel(field: DiscoveredField): string {
  return mappingLabel(field) || field.labelText || "Unknown field";
}

function coercePrimitive(value: unknown): Primitive | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return undefined;
}

function applyTransform(value: Primitive, transform?: AprilTurboTaxEntry["transform"]): Primitive {
  if (value === null || value === undefined || !transform) return value;
  if (transform === "boolean") {
    if (typeof value === "boolean") return value;
    const s = String(value).toLowerCase();
    if (["true", "yes", "1"].includes(s)) return true;
    if (["false", "no", "0"].includes(s)) return false;
  }
  return value;
}

export function resolveEntryPath(
  entry: AprilTurboTaxEntry,
  pathTracker: UsedPathTracker,
  field?: DiscoveredField,
): string {
  if (!entry.aprilSourceRoot) return entry.aprilPath;

  const binding = field ? fieldTurboTaxBinding(field) : undefined;
  const bindingIndex = binding ? bindingArrayIndex(binding) : undefined;
  const index =
    bindingIndex ?? pathTracker.getIndexForRoot(entry.aprilSourceRoot);

  const rootPath = entry.aprilSourceRoot.replace("[*]", `[${index}]`);
  return entry.aprilPath ? `${rootPath}.${entry.aprilPath}` : rootPath;
}

export function resolveAprilValueAtPath(
  aprilJson: unknown,
  fullPath: string,
  transform?: AprilTurboTaxEntry["transform"],
): Primitive | undefined {
  const value = coercePrimitive(getByPath(aprilJson, fullPath));
  if (value === undefined) return undefined;
  return applyTransform(value, transform ?? inferTransformForPath(fullPath));
}

export function resolveAprilValue(
  aprilJson: unknown,
  entry: AprilTurboTaxEntry,
  pathTracker: UsedPathTracker,
  field?: DiscoveredField,
): { value: Primitive; fullPath: string } | null {
  const fullPath = resolveEntryPath(entry, pathTracker, field);
  const value = resolveAprilValueAtPath(aprilJson, fullPath, entry.transform);
  if (value === undefined) return null;
  return { value, fullPath };
}

function findByTurboTaxBinding(
  field: DiscoveredField,
  entries: AprilTurboTaxEntry[],
): AprilTurboTaxEntry | null {
  const binding = fieldTurboTaxBinding(field);
  if (!binding) return null;

  for (const entry of entries) {
    const entryBinding = entryTurboTaxBinding(entry);
    if (entryBinding && bindingsMatch(binding, entryBinding)) {
      return entry;
    }
  }
  return null;
}

function scoreFieldToEntry(field: DiscoveredField, entry: AprilTurboTaxEntry): number {
  const keys = entry.pageFieldKeys ?? [];
  if (!keys.length) return 0;

  const f = normalizeText(fieldContextLabel(field) || fieldKey(field));
  let best = 0;

  for (const key of keys) {
    const a = normalizeText(key);
    if (!a) continue;
    if (f === a) best = Math.max(best, 0.98);
    else if (f.includes(a)) best = Math.max(best, 0.86);
    else {
      const tokens = a.split(" ").filter((t) => t.length > 1);
      const hits = tokens.filter((t) => f.includes(t)).length;
      if (tokens.length) best = Math.max(best, (hits / tokens.length) * 0.68);
    }
  }

  const path = `${entry.aprilSourceRoot ?? ""}.${entry.aprilPath}`.toLowerCase();
  if (entry.semanticType === "address") {
    if (hasAnyPhrase(f, ["employer", "payer", "w 2", "w2", "1099"]) && path.includes("residency")) {
      best -= 0.5;
    }
    if (hasAnyPhrase(f, ["home", "mailing", "taxpayer", "your address"]) && path.includes("issuer")) {
      best -= 0.5;
    }
  }

  return Math.max(0, Math.min(0.99, best));
}

function findBestLabelMappingEntry(
  field: DiscoveredField,
  entries: AprilTurboTaxEntry[],
  minimumConfidence = 0.55,
): { entry: AprilTurboTaxEntry; confidence: number; exact: boolean } | null {
  const key = fieldKey(field);

  for (const entry of entries) {
    const keys = entry.pageFieldKeys ?? [];
    if (keys.some((k) => normalizeText(k) === key)) {
      return { entry, confidence: 0.99, exact: true };
    }
  }

  let best: AprilTurboTaxEntry | null = null;
  let bestScore = 0;
  for (const entry of entries) {
    const score = scoreFieldToEntry(field, entry);
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  if (!best || bestScore < minimumConfidence) return null;
  return { entry: best, confidence: Number(bestScore.toFixed(2)), exact: false };
}

function findBestMappingEntry(
  field: DiscoveredField,
  entries: AprilTurboTaxEntry[],
  minimumConfidence = 0.55,
): { entry: AprilTurboTaxEntry; confidence: number; source: FieldResolution["source"] } | null {
  const bindingEntry = findByTurboTaxBinding(field, entries);
  if (bindingEntry) {
    return { entry: bindingEntry, confidence: 0.99, source: "binding" };
  }

  const labelMatch = findBestLabelMappingEntry(field, entries, minimumConfidence);
  if (labelMatch) {
    return {
      entry: labelMatch.entry,
      confidence: labelMatch.confidence,
      source: labelMatch.exact ? "mapping" : "heuristic",
    };
  }

  return null;
}

export function resolveAprilField(
  field: DiscoveredField,
  aprilJson: unknown,
  mapping: AprilTurboTaxMapping,
  leafIndex: AprilLeafEntry[],
  pathTracker: UsedPathTracker,
  minimumConfidence = 0.55,
): FieldResolution | null {
  if (field.isDisabled || !field.isVisible) return null;

  const mappingMatch = findBestMappingEntry(field, mapping.entries, minimumConfidence);
  const phraseMatch = findBestAprilLeaf(field, leafIndex, pathTracker, minimumConfidence);

  const useMapping =
    mappingMatch &&
    (!phraseMatch || mappingMatch.confidence >= phraseMatch.confidence);

  if (useMapping && mappingMatch) {
    const resolved = resolveAprilValue(aprilJson, mappingMatch.entry, pathTracker, field);
    if (!resolved) return null;

    const binding = fieldTurboTaxBinding(field);
    const reason = mappingMatch.source === "binding" && binding
      ? `Matched TurboTax binding ${canonicalizeTurboTaxBinding(binding)}`
      : `Matched master mapping ${mappingMatch.entry.id}`;

    return {
      pageFieldId: field.fieldId,
      pageLabel: displayLabel(field),
      mappingId: mappingMatch.entry.id,
      aprilPath: resolved.fullPath,
      value: resolved.value,
      confidence: mappingMatch.confidence,
      source: mappingMatch.source,
      reason,
      transform: mappingMatch.entry.transform,
    };
  }

  if (!phraseMatch) return null;

  const value = resolveAprilValueAtPath(
    aprilJson,
    phraseMatch.leaf.path,
    inferTransformForPath(phraseMatch.leaf.path),
  );
  if (value === undefined) return null;

  return {
    pageFieldId: field.fieldId,
    pageLabel: displayLabel(field),
    mappingId: `phrase:${phraseMatch.leaf.path}`,
    aprilPath: phraseMatch.leaf.path,
    value,
    confidence: phraseMatch.confidence,
    source: "april_phrase",
    reason: "Matched April path by phrase similarity",
    transform: inferTransformForPath(phraseMatch.leaf.path),
  };
}

export function resolveAprilFields(
  fields: DiscoveredField[],
  aprilJson: unknown,
  mapping: AprilTurboTaxMapping,
  leafIndex: AprilLeafEntry[],
  pathTracker: UsedPathTracker,
): FieldResolution[] {
  pathTracker.clearPagePrefix();
  const used = new Set<string>();
  const resolutions: FieldResolution[] = [];

  for (const field of fields) {
    const resolution = resolveAprilField(field, aprilJson, mapping, leafIndex, pathTracker);
    if (!resolution) continue;

    const dedupeKey = `${resolution.pageFieldId}:${resolution.aprilPath}`;
    if (used.has(dedupeKey)) continue;
    used.add(dedupeKey);
    pathTracker.registerResolvedPath(resolution.aprilPath);
    resolutions.push(resolution);
  }

  return resolutions.sort((a, b) => b.confidence - a.confidence);
}
