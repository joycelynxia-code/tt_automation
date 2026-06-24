export type Primitive = string | number | boolean | null;
export type JsonValue = Primitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type SourceMappingStatus = "approved" | "pending" | "rejected";

export type SourceMapping = {
  mappingId: string;
  sourceSystem: "april" | string;
  documentType: string;
  status: SourceMappingStatus;
  recordType: "array" | "single";
  sourceRoot: string;
  canonicalDocument: {
    type: string;
    idPrefix: string;
    label?: string;
  };
  fields: Record<string, string>;
  transforms?: Record<string, string>;
  requiresReview?: boolean;
  warnings?: string[];
};

// export type CanonicalDocument = {
//   type: string;
//   id: string;
//   label: string;
//   fields: Record<string, unknown>;
//   [key: string]: unknown;
// };

export type CanonicalDocument = {
  type: string;
  id: string;
  label: string;
  fields: Record<string, unknown>;

  status?: {
    filled?: boolean;
    filledAt?: string;
  };

  [key: string]: unknown;
};

export type CanonicalTaxModel = {
  source: {
    system: string;
    convertedAt: string;
    anonymized?: boolean;
    safeForFiling: false;
  };
  taxpayer?: Record<string, unknown>;
  federal?: Record<string, unknown>;
  documents: CanonicalDocument[];
  deductionsCredits?: Record<string, unknown>;
  state?: Record<string, unknown>;
  flags?: Record<string, unknown>;
  unmappedSourceSections?: UnknownSourceSection[];
  legacy?: Record<string, unknown>;
};

export type UnknownSourceSection = {
  sourceRoot: string;
  suggestedType: string;
  status: "needs_mapping_review";
  sourcePaths: string[];
  sampleKeys: string[];
  candidateMappingFile?: string;
};

export type CanonicalIndexEntry = {
  canonicalPath: string;
  label: string;
  value: Primitive;
  group: PageGroup;
  semanticType: SemanticType;
  docType?: string;
  docId?: string;
  docLabel?: string;
  aliases: string[];
  isTaxJudgment?: boolean;
};

export type PageGroup =
  | "TAXPAYER"
  | "W2"
  | "1099_INT"
  | "1099_R"
  | "1099_DIV"
  | "1099_B"
  | "1098_T"
  | "DEDUCTIONS"
  | "STATE"
  | "UNKNOWN";

export type SemanticType =
  | "name"
  | "address"
  | "id"
  | "amount"
  | "date"
  | "boolean"
  | "code"
  | "other";

export type DiscoveredField = {
  fieldId: string;
  tagName: string;
  inputType: string;
  labelText: string;
  ariaLabel?: string;
  placeholder?: string;
  name?: string;
  id?: string;
  nearbyText?: string;
  value?: string;
  isDisabled: boolean;
  isVisible: boolean;
};

export type PageContext = {
  group: PageGroup;
  confidence: number;
  reason: string;
};

export type FieldResolution = {
  pageFieldId: string;
  pageLabel: string;
  canonicalPath: string;
  canonicalLabel: string;
  value: Primitive;
  confidence: number;
  source: "saved" | "heuristic" | "ai";
  reason: string;
};

export type PageMapping = {
  mappingId: string;
  status: SourceMappingStatus;
  pageSignature: string;
  pageContext: PageContext;
  createdAt: string;
  matches: Array<{
    pageLabel: string;
    pageFieldKey: string;
    canonicalPath: string;
  }>;
};
