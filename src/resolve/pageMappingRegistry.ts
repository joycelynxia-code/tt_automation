import path from "node:path";
import type { PageMapping } from "../types/index.js";
import { listJsonFiles, readJson, writeJson } from "../utils/fs.js";
import { normalizeText, simpleHash } from "../utils/text.js";
import type { DiscoveredField, FieldResolution, PageContext } from "../types/index.js";

export function loadApprovedPageMappings(projectRoot = process.cwd()): PageMapping[] {
  console.log("in loadApprovedPageMappings")
  const dir = path.join(projectRoot, "data/mappings/page/approved");
  listJsonFiles(dir).map((f) => readJson<PageMapping>(f)).forEach((m) => {
    console.log(m.pageSignature)
  })
  return listJsonFiles(dir).map((f) => readJson<PageMapping>(f)).filter((m) => m.status === "approved");
}

export function savePendingPageMapping(projectRoot: string, pageSignature: string, context: PageContext, fields: DiscoveredField[], matches: FieldResolution[]): string {
  const id = `page.${pageSignature}.${simpleHash(JSON.stringify(matches.map((m) => m.canonicalPath)))}`;
  const file = path.join(projectRoot, "data/mappings/page/pending", `${id}.json`);
  const mapping: PageMapping = {
    mappingId: id,
    status: "pending",
    pageSignature,
    pageContext: context,
    createdAt: new Date().toISOString(),
    matches: matches.map((m) => ({
      pageLabel: m.pageLabel,
      pageFieldKey: normalizeText(fields.find((f) => f.fieldId === m.pageFieldId)?.labelText || m.pageLabel),
      canonicalPath: m.canonicalPath,
    })),
  };
  writeJson(file, mapping);
  return file;
}
