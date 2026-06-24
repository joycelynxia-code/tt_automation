import type { AprilLeafEntry, DiscoveredField } from "../types/index.js";
import type { UsedPathTracker } from "./usedPathTracker.js";
import { fieldContextLabel, fieldKey } from "../resolve/resolveAprilField.js";
import { hasAnyPhrase, normalizeText } from "../utils/text.js";
import { canonicalizeArrayPath } from "../utils/jsonPath.js";

function scoreTokens(fieldText: string, tokens: string[]): number {
  const f = normalizeText(fieldText);
  let best = 0;

  for (const token of tokens) {
    const a = normalizeText(token);
    if (!a) continue;
    if (f === a) best = Math.max(best, 0.98);
    else if (f.includes(a) || a.includes(f)) best = Math.max(best, 0.86);
    else {
      const parts = a.split(" ").filter((t) => t.length > 1);
      const hits = parts.filter((t) => f.includes(t)).length;
      if (parts.length) best = Math.max(best, (hits / parts.length) * 0.68);
    }
  }

  return best;
}

function pathContextAdjustments(fieldText: string, leafPath: string, score: number): number {
  let adjusted = score;
  const f = normalizeText(fieldText);
  const p = leafPath.toLowerCase();

  if (hasAnyPhrase(f, ["employer", "payer", "ein", "w 2", "w2", "1099"])) {
    if (p.includes("issuer") || p.includes("w2_info") || p.includes("f1099")) adjusted += 0.12;
    if (p.includes("residency_address") || p.includes("primary.address")) adjusted -= 0.5;
  }

  if (hasAnyPhrase(f, ["home", "mailing", "taxpayer", "your address", "residency"])) {
    if (p.includes("residency_address") || p.includes("primary.address")) adjusted += 0.12;
    if (p.includes("issuer") || p.includes("w2_info") || p.includes("f1099")) adjusted -= 0.5;
  }

  if (hasAnyPhrase(f, ["box 1", "box 2", "box 3", "wages", "withheld", "medicare", "social security"])) {
    if (p.includes("w2_info")) adjusted += 0.1;
  }

  if (hasAnyPhrase(f, ["interest income", "1099 int", "payer"])) {
    if (p.includes("f1099int") || p.includes("interest_income")) adjusted += 0.1;
  }

  return Math.max(0, Math.min(0.99, adjusted));
}

function trackerBonus(leafPath: string, tracker?: UsedPathTracker): number {
  if (!tracker) return 0;
  let bonus = 0;

  const activePrefix = tracker.getActiveArrayPrefix();
  if (activePrefix && leafPath.startsWith(activePrefix)) bonus += 0.15;
  if (tracker.isUsed(leafPath)) bonus -= 0.4;

  const canonical = canonicalizeArrayPath(leafPath);
  const index = tracker.getIndexForCanonical(canonical);
  const currentIndex = leafPath.match(/\[(\d+)\]/)?.[1];
  if (currentIndex !== undefined && Number(currentIndex) === index) bonus += 0.08;

  return bonus;
}

export function scoreFieldToLeaf(
  field: DiscoveredField,
  leaf: AprilLeafEntry,
  tracker?: UsedPathTracker,
): number {
  const key = fieldKey(field);
  const context = fieldContextLabel(field);
  const lastToken = leaf.searchTokens.at(-1) ?? "";

  let score = scoreTokens(key, [lastToken, ...leaf.searchTokens]);
  if (key !== normalizeText(context)) {
    score = Math.max(score, scoreTokens(context, leaf.searchTokens) * 0.95);
  }

  score = pathContextAdjustments(context || key, leaf.path, score);
  score += trackerBonus(leaf.path, tracker);
  return Math.max(0, Math.min(0.99, Number(score.toFixed(2))));
}

export function rankAprilLeavesForField(
  field: DiscoveredField,
  leaves: AprilLeafEntry[],
  tracker?: UsedPathTracker,
  limit = 5,
): Array<{ leaf: AprilLeafEntry; score: number }> {
  const ranked = leaves
    .map((leaf) => ({ leaf, score: scoreFieldToLeaf(field, leaf, tracker) }))
    .filter((item) => item.score >= 0.55)
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, limit);
}

export function findBestAprilLeaf(
  field: DiscoveredField,
  leaves: AprilLeafEntry[],
  tracker?: UsedPathTracker,
  minimumConfidence = 0.55,
): { leaf: AprilLeafEntry; confidence: number } | null {
  const ranked = rankAprilLeavesForField(field, leaves, tracker, 1);
  const best = ranked[0];
  if (!best || best.score < minimumConfidence) return null;
  return { leaf: best.leaf, confidence: best.score };
}
