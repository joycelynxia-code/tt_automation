import type { CanonicalIndexEntry, CanonicalTaxModel, PageGroup, Primitive, SemanticType } from "../types/index.js";
import { humanizePathSegment } from "../utils/text.js";

function isPrimitive(v: unknown): v is Primitive {
  return v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}
function semanticFor(path: string, value: Primitive): SemanticType {
  const p = path.toLowerCase();
  if (typeof value === "boolean") return "boolean";
  if (p.includes("address") || p.includes("city") || p.includes("state") || p.includes("zip")) return "address";
  if (p.includes("name")) return "name";
  if (p.includes("ein") || p.includes("tin") || p.includes("ssn") || p.includes("id")) return "id";
  if (p.includes("date") || p.includes("birth")) return "date";
  if (p.includes("code")) return "code";
  if (typeof value === "number" || p.includes("amount") || p.includes("wages") || p.includes("withholding")) return "amount";
  return "other";
}
function groupForDoc(type: string): PageGroup {
  const t = type.toUpperCase().replace(/-/g, "_");
  if (t === "W2") return "W2";
  if (t === "1099_INT") return "1099_INT";
  if (t === "1099_R") return "1099_R";
  if (t === "1099_DIV") return "1099_DIV";
  if (t === "1099_B") return "1099_B";
  if (t === "1098_T") return "1098_T";
  return "UNKNOWN";
}
function labelFromPath(path: string, prefix = ""): string {
  const last = path.split(".").at(-1) ?? path;
  return `${prefix}${humanizePathSegment(last)}`.trim();
}
function aliasesFor(path: string, label: string): string[] {
  const aliases = [label, path.split(".").at(-1) ?? path, path];
  const p = path.toLowerCase();
  if (p.includes("box1")) aliases.push("box 1");
  if (p.includes("box2")) aliases.push("box 2");
  if (p.includes("box3")) aliases.push("box 3");
  if (p.includes("box4")) aliases.push("box 4");
  if (p.includes("box5")) aliases.push("box 5");
  if (p.includes("box6")) aliases.push("box 6");
  if (p.includes("employerein")) aliases.push("employer identification number", "ein");
  if (p.includes("employername")) aliases.push("employer name");
  if (p.includes("payername")) aliases.push("payer name");
  if (p.includes("payertin")) aliases.push("payer tin", "federal identification number");
  if (p.includes("firstname")) aliases.push("first name");
  if (p.includes("lastname")) aliases.push("last name");
  if (p.includes("birthdate")) aliases.push("date of birth", "dob");
  if (p.includes("zipcode") || p.endsWith("zip")) aliases.push("zip code", "postal code");
  return Array.from(new Set(aliases));
}

function walk(obj: unknown, basePath: string, add: (path: string, value: Primitive) => void): void {
  if (isPrimitive(obj)) {
    if (obj !== null && obj !== "") add(basePath, obj);
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => walk(item, `${basePath}[${i}]`, add));
    return;
  }
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      walk(v, basePath ? `${basePath}.${k}` : k, add);
    }
  }
}

export function buildCanonicalIndex(model: CanonicalTaxModel): CanonicalIndexEntry[] {
  const entries: CanonicalIndexEntry[] = [];
  const addEntry = (canonicalPath: string, value: Primitive, group: PageGroup, doc?: { type: string; id: string; label: string }) => {
    const label = labelFromPath(canonicalPath, doc ? `${doc.label} ` : "");
    entries.push({
      canonicalPath,
      label,
      value,
      group,
      semanticType: semanticFor(canonicalPath, value),
      docType: doc?.type,
      docId: doc?.id,
      docLabel: doc?.label,
      aliases: aliasesFor(canonicalPath, label),
    });
  };

  walk(model.taxpayer, "taxpayer", (p, v) => addEntry(p, v, "TAXPAYER"));
  walk(model.federal, "federal", (p, v) => addEntry(p, v, "TAXPAYER"));
  walk(model.deductionsCredits, "deductionsCredits", (p, v) => addEntry(p, v, "DEDUCTIONS"));
  walk(model.state, "state", (p, v) => addEntry(p, v, "STATE"));

  model.documents.forEach((doc, i) => {
    const group = groupForDoc(doc.type);
    walk(doc.fields, `documents[${i}].fields`, (p, v) => addEntry(p, v, group, { type: doc.type, id: doc.id, label: doc.label }));
  });

  return entries;
}
