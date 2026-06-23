import crypto from "node:crypto";

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasPhrase(text: string, phrase: string): boolean {
  const normalized = normalizeText(text);
  const normalizedPhrase = normalizeText(phrase);
  if (!normalizedPhrase) return false;
  return new RegExp(`(^| )${escapeRegex(normalizedPhrase)}( |$)`).test(normalized);
}

export function hasAnyPhrase(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => hasPhrase(text, phrase));
}

export function countPhrases(text: string, phrases: string[]): number {
  return phrases.filter((phrase) => hasPhrase(text, phrase)).length;
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function simpleHash(value: string, length = 7): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, length);
}

export function humanizePathSegment(segment: string): string {
  return segment
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
