import type { AprilLeafEntry, Primitive } from "../types/index.js";
import { flattenJson } from "../utils/jsonPath.js";
import { humanizePathSegment } from "../utils/text.js";

function isPrimitive(value: unknown): value is Primitive {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function tokensForPath(path: string): string[] {
  const segments = path.split(/\.|\[|\]/).filter(Boolean);
  const tokens = segments.map((segment) => humanizePathSegment(segment));
  const last = segments.at(-1);
  if (last) tokens.push(humanizePathSegment(last));
  return Array.from(new Set(tokens.filter(Boolean)));
}

export function buildAprilLeafIndex(aprilJson: unknown): AprilLeafEntry[] {
  const flat = flattenJson(aprilJson);
  const entries: AprilLeafEntry[] = [];

  for (const [path, value] of Object.entries(flat)) {
    if (!isPrimitive(value)) continue;
    if (value === "") continue;
    entries.push({
      path,
      value,
      searchTokens: tokensForPath(path),
    });
  }

  return entries;
}

export function inferTransformForPath(path: string): "date_mmddyyyy" | "boolean" | undefined {
  const lower = path.toLowerCase();
  if (lower.includes("birth_date") || lower.includes("birthdate")) return "date_mmddyyyy";
  if (lower.startsWith("is_") || lower.includes(".is_")) return "boolean";
  return undefined;
}
