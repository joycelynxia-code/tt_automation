import path from "node:path";
import type { SourceMapping } from "../types/index.js";
import { listJsonFiles, readJson } from "../utils/fs.js";

export function loadApprovedSourceMappings(projectRoot = process.cwd()): SourceMapping[] {
  const dir = path.join(projectRoot, "data/mappings/source/approved");

  return listJsonFiles(dir)
    .map((file) => readJson<SourceMapping>(file))
    .filter((mapping) => mapping.status === "approved");
}
