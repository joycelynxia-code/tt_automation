import type { DiscoveredField, PageContext } from "../types/index.js";
import { countPhrases, normalizeText, simpleHash } from "../utils/text.js";

function allText(fields: DiscoveredField[]): string {
  return fields.map((f) => [f.labelText, f.ariaLabel, f.placeholder, f.nearbyText, f.name, f.id].filter(Boolean).join(" ")).join(" ");
}

export function detectPageContext(fields: DiscoveredField[]): PageContext {
  const text = allText(fields);
  const scores = [
    { group: "TAXPAYER" as const, score: countPhrases(text, ["first name", "last name", "social security number", "ssn", "date of birth", "occupation", "home address", "mailing address", "personal info", "tell us about you"]) },
    { group: "W2" as const, score: countPhrases(text, ["w 2", "w2", "employer", "employer identification number", "ein", "box 1", "box 2", "social security wages", "medicare wages"]) },
    { group: "1099_INT" as const, score: countPhrases(text, ["1099 int", "1099int", "interest income", "payer name", "payer tin", "tax exempt interest", "early withdrawal penalty"]) },
    { group: "1099_R" as const, score: countPhrases(text, ["1099 r", "1099r", "gross distribution", "taxable amount", "distribution code", "ira sep simple"]) },
    { group: "1099_DIV" as const, score: countPhrases(text, ["1099 div", "1099div", "ordinary dividends", "qualified dividends", "capital gain distributions"]) },
    { group: "DEDUCTIONS" as const, score: countPhrases(text, ["student loan interest", "roth ira", "traditional ira", "ira contribution"]) },
    { group: "STATE" as const, score: countPhrases(text, ["state return", "california", "renters credit", "resident", "state taxes"]) },
  ].sort((a, b) => b.score - a.score);

  const best = scores[0];
  if (!best || best.score === 0) return { group: "UNKNOWN", confidence: 0.3, reason: "No strong context markers found" };
  return { group: best.group, confidence: Math.min(0.95, 0.65 + best.score * 0.1), reason: `Detected ${best.group} markers; score=${best.score}` };
}

export function pageSignature(url: string, title: string, fields: DiscoveredField[], context: PageContext): string {
  const labels = fields
    .filter((f) => f.isVisible && !f.isDisabled)
    .map((f) => normalizeText(f.labelText || f.ariaLabel || f.placeholder || f.name || f.id || ""))
    .filter(Boolean)
    .sort()
    .join("|");
  const normalizedUrl = url.split("?")[0].replace(/\d+/g, "#");
  return `${context.group}:${simpleHash(`${normalizedUrl}|${title}|${labels}`)}`;
}
