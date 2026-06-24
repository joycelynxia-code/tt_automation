import path from "node:path";
import type {
  AprilTurboTaxEntry,
  AprilTurboTaxMapping,
  PageGroup,
  PageMapping,
  SemanticType,
  SourceMapping,
} from "../types/index.js";
import { listJsonFiles, readJson, writeJson } from "../utils/fs.js";
import { humanizePathSegment, normalizeText } from "../utils/text.js";

type CanonicalAprilSpec = {
  aprilPath: string;
  aprilSourceRoot?: string;
  pageGroup: PageGroup;
  transform?: AprilTurboTaxEntry["transform"];
  semanticType?: SemanticType;
};

const SCALAR_CANONICAL_TO_APRIL: Record<string, CanonicalAprilSpec> = {
  "taxpayer.firstName": {
    aprilPath: "profile.primary.basic_info.name.first_name",
    pageGroup: "TAXPAYER",
    semanticType: "name",
  },
  "taxpayer.lastName": {
    aprilPath: "profile.primary.basic_info.name.last_name",
    pageGroup: "TAXPAYER",
    semanticType: "name",
  },
  "taxpayer.middleName": {
    aprilPath: "profile.primary.basic_info.name.middle_name",
    pageGroup: "TAXPAYER",
    semanticType: "name",
  },
  "taxpayer.suffix": {
    aprilPath: "profile.primary.basic_info.name.suffix",
    pageGroup: "TAXPAYER",
  },
  "taxpayer.filingStatus": {
    aprilPath: "profile.household.filing_status.federal",
    pageGroup: "TAXPAYER",
  },
  "taxpayer.birthDate": {
    aprilPath: "profile.primary.basic_info.age.birth_date",
    pageGroup: "TAXPAYER",
    transform: "date_mmddyyyy",
    semanticType: "date",
  },
  "taxpayer.ssn": {
    aprilPath: "profile.primary.identification.ssn_social_security_number",
    pageGroup: "TAXPAYER",
    semanticType: "id",
  },
  "taxpayer.occupation": {
    aprilPath: "profile.primary.basic_info.occupation",
    pageGroup: "TAXPAYER",
  },
  "taxpayer.email": {
    aprilPath: "profile.primary.basic_info.contact_info.email_address",
    pageGroup: "TAXPAYER",
  },
  "taxpayer.address.line1": {
    aprilPath: "profile.primary.address.residency_address.address_line_1",
    pageGroup: "TAXPAYER",
    semanticType: "address",
  },
  "taxpayer.address.apt": {
    aprilPath: "profile.primary.address.residency_address.apt_number",
    pageGroup: "TAXPAYER",
    semanticType: "address",
  },
  "taxpayer.address.city": {
    aprilPath: "profile.primary.address.residency_address.city",
    pageGroup: "TAXPAYER",
    semanticType: "address",
  },
  "taxpayer.address.state": {
    aprilPath: "profile.primary.address.residency_address.state",
    pageGroup: "TAXPAYER",
    semanticType: "address",
  },
  "taxpayer.address.zip": {
    aprilPath: "profile.primary.address.residency_address.zip_code",
    pageGroup: "TAXPAYER",
    semanticType: "address",
  },
  "taxpayer.address.county": {
    aprilPath: "profile.primary.address.residency_address.county",
    pageGroup: "TAXPAYER",
    semanticType: "address",
  },
  "taxpayer.address.country": {
    aprilPath: "profile.primary.address.residency_address.country",
    pageGroup: "TAXPAYER",
    semanticType: "address",
  },
  "taxpayer.canBeClaimedAsDependent": {
    aprilPath:
      "profile.primary.basic_info.person_claimed_as_dependent_check.is_possible_to_be_claimed_as_dependent_of_another",
    pageGroup: "TAXPAYER",
    transform: "boolean",
    semanticType: "boolean",
  },
  "taxpayer.isBlind": {
    aprilPath: "profile.primary.basic_info.tax_situation_indicators.is_blind",
    pageGroup: "TAXPAYER",
    transform: "boolean",
    semanticType: "boolean",
  },
  "taxpayer.isMilitary": {
    aprilPath: "profile.primary.basic_info.tax_situation_indicators.is_military",
    pageGroup: "TAXPAYER",
    transform: "boolean",
    semanticType: "boolean",
  },
  "federal.priorYearAgi": {
    aprilPath: "profile.primary.basic_info.pin.prior_year_agi.federal.prior_year_agi",
    pageGroup: "TAXPAYER",
    semanticType: "amount",
  },
  "federal.identityProtectionPin": {
    aprilPath: "profile.primary.basic_info.pin.identity_protection_pin.ip_pin",
    pageGroup: "TAXPAYER",
    semanticType: "id",
  },
  "deductionsCredits.studentLoanInterestPaid": {
    aprilPath: "profile.primary.student_loans.f1098e_form.student_loan_interest_paid",
    pageGroup: "DEDUCTIONS",
    semanticType: "amount",
  },
};

const GROUP_FOR_DOC_TYPE: Record<string, PageGroup> = {
  W2: "W2",
  "1099_INT": "1099_INT",
  "1099_R": "1099_R",
  "1099_DIV": "1099_DIV",
  "1099_B": "1099_B",
  "1098_T": "1098_T",
};

function normalizeCanonicalPath(canonicalPath: string): string {
  return canonicalPath.replace(/documents\[\d+\]/g, "documents[*]");
}

function loadPageMappings(projectRoot: string): PageMapping[] {
  const dir = path.join(projectRoot, "data/mappings/page/approved");
  return listJsonFiles(dir).map((f) => readJson<PageMapping>(f));
}

function loadSourceMappings(projectRoot: string): SourceMapping[] {
  const dir = path.join(projectRoot, "data/mappings/source/approved");
  return listJsonFiles(dir).map((f) => readJson<SourceMapping>(f));
}

function buildDocumentFieldLookup(
  sourceMappings: SourceMapping[],
): Map<string, CanonicalAprilSpec & { idSuffix: string }> {
  const lookup = new Map<string, CanonicalAprilSpec & { idSuffix: string }>();

  for (const mapping of sourceMappings) {
    const pageGroup = GROUP_FOR_DOC_TYPE[mapping.documentType] ?? "UNKNOWN";
    const aprilSourceRoot = mapping.sourceRoot;

    for (const [canonicalTarget, aprilRelative] of Object.entries(mapping.fields)) {
      if (!canonicalTarget.startsWith("fields.")) continue;
      const canonicalPath = `documents[*].${canonicalTarget}`;
      const fieldName = canonicalTarget.replace(/^fields\./, "");
      lookup.set(canonicalPath, {
        aprilPath: aprilRelative,
        aprilSourceRoot,
        pageGroup,
        idSuffix: `${pageGroup.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.${fieldName}`,
        semanticType: inferSemanticType(fieldName, aprilRelative),
      });
    }
  }

  return lookup;
}

function inferSemanticType(fieldName: string, aprilPath: string): SemanticType {
  const p = `${fieldName}.${aprilPath}`.toLowerCase();
  if (p.includes("address") || p.includes("city") || p.includes("zip")) return "address";
  if (p.includes("name")) return "name";
  if (p.includes("ein") || p.includes("tin") || p.includes("ssn")) return "id";
  if (p.includes("date") || p.includes("birth")) return "date";
  if (p.includes("is_") || p.startsWith("is")) return "boolean";
  if (p.includes("wages") || p.includes("withheld") || p.includes("amount") || p.includes("amt")) {
    return "amount";
  }
  return "other";
}

function resolveCanonicalSpec(
  canonicalPath: string,
  docLookup: Map<string, CanonicalAprilSpec & { idSuffix: string }>,
): (CanonicalAprilSpec & { id: string }) | null {
  const normalized = normalizeCanonicalPath(canonicalPath);
  const scalar = SCALAR_CANONICAL_TO_APRIL[normalized.replace(/^documents\[\*\]\./, "")];
  if (scalar) {
    const id = normalized.replace(/\[\*\]/g, "").replace(/\./g, "_");
    return { ...scalar, id };
  }

  const directScalar = SCALAR_CANONICAL_TO_APRIL[normalized];
  if (directScalar) {
    return { ...directScalar, id: normalized.replace(/\./g, "_") };
  }

  const docField = docLookup.get(normalized);
  if (docField) {
    return { ...docField, id: docField.idSuffix };
  }

  const nestedMatch = normalized.match(/^documents\[\*\]\.fields\.(.+)$/);
  if (nestedMatch) {
    const alt = docLookup.get(`documents[*].fields.${nestedMatch[1].split("[")[0]}`);
    if (alt && normalized.includes("[")) {
      const suffix = normalized.slice(`documents[*].fields.${nestedMatch[1].split("[")[0]}`.length);
      return {
        ...alt,
        aprilPath: `${alt.aprilPath}${suffix}`,
        id: `${alt.idSuffix}${suffix.replace(/[\[\].]/g, "_")}`,
      };
    }
  }

  return null;
}

function entryKey(spec: CanonicalAprilSpec): string {
  return `${spec.pageGroup}|${spec.aprilSourceRoot ?? ""}|${spec.aprilPath}`;
}

export function buildAprilTurboTaxMapping(projectRoot = process.cwd()): AprilTurboTaxMapping {
  const pageMappings = loadPageMappings(projectRoot);
  const sourceMappings = loadSourceMappings(projectRoot);
  const docLookup = buildDocumentFieldLookup(sourceMappings);

  const entryMap = new Map<
    string,
    AprilTurboTaxEntry & { pageFieldKeySet: Set<string> }
  >();

  for (const pageMapping of pageMappings) {
    const pageGroup = pageMapping.pageContext.group;

    for (const match of pageMapping.matches) {
      const spec = resolveCanonicalSpec(match.canonicalPath, docLookup);
      if (!spec) {
        console.warn(`Skipping unmapped canonical path: ${match.canonicalPath}`);
        continue;
      }

      const key = entryKey(spec);
      const pageFieldKey = normalizeText(match.pageFieldKey);
      let entry = entryMap.get(key);

      if (!entry) {
        entry = {
          id: spec.id,
          pageGroup: spec.pageGroup ?? pageGroup,
          pageFieldKeys: [],
          aprilPath: spec.aprilPath,
          aprilSourceRoot: spec.aprilSourceRoot,
          transform: spec.transform,
          semanticType: spec.semanticType,
          label: humanizePathSegment(spec.aprilPath.split(".").at(-1) ?? spec.id),
          pageFieldKeySet: new Set(),
        };
        entryMap.set(key, entry);
      }

      if (!entry.pageFieldKeySet.has(pageFieldKey)) {
        entry.pageFieldKeySet.add(pageFieldKey);
        (entry.pageFieldKeys ??= []).push(match.pageFieldKey);
      }
    }
  }

  const entries = Array.from(entryMap.values()).map(({ pageFieldKeySet: _, ...entry }) => entry);
  entries.sort((a, b) => a.id.localeCompare(b.id));

  return {
    mappingId: "april-turbotax.v1",
    version: "1",
    entries,
  };
}

function main(): void {
  const [, , outputPath = "data/mappings/april-turbotax.v1.json"] = process.argv;
  const mapping = buildAprilTurboTaxMapping(process.cwd());
  const file = path.resolve(outputPath);
  writeJson(file, mapping);
  console.log(`Wrote ${mapping.entries.length} entries to ${file}`);
}

const isDirectRun = process.argv[1]?.includes("buildAprilTurboTaxMapping");
if (isDirectRun) {
  main();
}
