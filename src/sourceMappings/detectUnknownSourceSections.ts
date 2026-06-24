import path from "node:path";
import type { SourceMapping, UnknownSourceSection } from "../types/index.js";
import { canonicalizeArrayPath, flattenJson } from "../utils/jsonPath.js";
import { simpleHash } from "../utils/text.js";
import { writeJson } from "../utils/fs.js";

const FORM_HINTS: Array<{ hints: string[]; type: string }> = [
  { type: "1099_R", hints: ["1099r", "f1099r", "retirement_distribution", "gross_distribution", "distribution_code"] },
  { type: "1099_DIV", hints: ["1099div", "f1099div", "dividend", "ordinary_dividends", "qualified_dividends"] },
  { type: "1099_B", hints: ["1099b", "f1099b", "proceeds", "cost_basis", "capital_gain"] },
  { type: "1098_T", hints: ["1098t", "f1098t", "tuition", "qualified_tuition"] },
  { type: "1099_G", hints: ["1099g", "f1099g", "unemployment", "state_refund"] },
  { type: "1095_A", hints: ["1095a", "f1095a", "marketplace", "premium_tax_credit"] },
  { type: "1099_SA", hints: ["1099sa", "f1099sa", "hsa", "health_savings"] },
  { type: "SCHEDULE_C", hints: ["schedule_c", "self_employment", "business_income", "business_expenses"] },
];

function guessType(pathOrKeys: string): string {
  const lower = pathOrKeys.toLowerCase();
  for (const candidate of FORM_HINTS) {
    if (candidate.hints.some((hint) => lower.includes(hint))) return candidate.type;
  }
  return "UNKNOWN";
}

function guessRoot(flatPath: string): string {
  const canonical = canonicalizeArrayPath(flatPath);
  const arrayRoot = canonical.match(/^(.*?\[\*\])/);
  if (arrayRoot) return arrayRoot[1];

  const parts = canonical.split(".");
  const formIndex = parts.findIndex((part) => /f?109\d|schedule|forms|income|retirement|dividend/i.test(part));
  if (formIndex >= 0) return parts.slice(0, Math.min(parts.length, formIndex + 2)).join(".");
  return parts.slice(0, Math.min(parts.length, 4)).join(".");
}

export function detectUnknownSourceSections(
  raw: unknown,
  approvedMappings: SourceMapping[],
  options: { pendingDir?: string; writePending?: boolean } = {}
): UnknownSourceSection[] {
  const flat = flattenJson(raw);
  const paths = Object.keys(flat);
  const approvedRoots = new Set(approvedMappings.map((mapping) => mapping.sourceRoot));

  const candidatePaths = paths.filter((p) => {
    const lower = p.toLowerCase();
    const looksLikeForm = FORM_HINTS.some((f) => f.hints.some((hint) => lower.includes(hint)));
    if (!looksLikeForm) return false;
    return !Array.from(approvedRoots).some((root) => canonicalizeArrayPath(p).startsWith(root.replace("[*]", "")));
  });

  const grouped = new Map<string, string[]>();
  for (const p of candidatePaths) {
    const root = guessRoot(p);
    if (!grouped.has(root)) grouped.set(root, []);
    grouped.get(root)!.push(p);
  }

  const sections: UnknownSourceSection[] = [];

  for (const [sourceRoot, sourcePaths] of grouped.entries()) {
    const sampleKeys = Array.from(
      new Set(
        sourcePaths.map((p) => p.replace(sourceRoot.replace("[*]", "[0]"), "").replace(/^\.?/, "").split(/[.\[]/)[0]).filter(Boolean)
      )
    ).slice(0, 30);

    const suggestedType = guessType(`${sourceRoot} ${sampleKeys.join(" ")}`);
    const candidateId = `april.${suggestedType.toLowerCase().replace(/_/g, "-")}.candidate.${simpleHash(sourceRoot)}`;
    const candidateFile = options.pendingDir
      ? path.join(options.pendingDir, `${candidateId}.json`)
      : undefined;

    const section: UnknownSourceSection = {
      sourceRoot,
      suggestedType,
      status: "needs_mapping_review",
      sourcePaths: sourcePaths.slice(0, 50),
      sampleKeys,
      candidateMappingFile: candidateFile,
    };

    sections.push(section);

    if (options.writePending && candidateFile) {
      writeJson(candidateFile, {
        mappingId: candidateId,
        sourceSystem: "april",
        documentType: suggestedType,
        status: "pending",
        recordType: sourceRoot.includes("[*]") ? "array" : "single",
        sourceRoot,
        canonicalDocument: {
          type: suggestedType,
          idPrefix: suggestedType.toLowerCase(),
          label: "TODO_REVIEW_LABEL_PATH"
        },
        fields: Object.fromEntries(sampleKeys.map((key) => [`fields.TODO_${key}`, key])),
        requiresReview: true,
        warnings: [
          "Auto-generated candidate. Review and correct all fields before moving to approved.",
          "AI can be added here to improve target canonical field names."
        ],
        sourcePathSamples: sourcePaths.slice(0, 50)
      });
    }
  }

  return sections;
}
