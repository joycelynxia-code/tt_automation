import path from "node:path";
import type { AprilTurboTaxEntry, AprilTurboTaxMapping } from "../types/index.js";
import { readJson, writeJson } from "../utils/fs.js";
import { normalizeText } from "../utils/text.js";
import {
  bindingsMatch,
  entryTurboTaxBinding,
} from "./turboTaxBinding.js";

export const DEFAULT_MAPPING_PATH = "data/mappings/april-turbotax.master.json";

export function loadAprilTurboTaxMapping(
  projectRoot = process.cwd(),
  mappingPath = DEFAULT_MAPPING_PATH,
): AprilTurboTaxMapping {
  const file = path.isAbsolute(mappingPath)
    ? mappingPath
    : path.join(projectRoot, mappingPath);
  return readJson<AprilTurboTaxMapping>(file);
}

export function loadOrSeedMasterMapping(
  projectRoot = process.cwd(),
  mappingPath = DEFAULT_MAPPING_PATH,
): AprilTurboTaxMapping {
  const file = path.isAbsolute(mappingPath)
    ? mappingPath
    : path.join(projectRoot, mappingPath);
  try {
    return readJson<AprilTurboTaxMapping>(file);
  } catch {
    const seedFile = path.join(projectRoot, "data/mappings/april-turbotax.v1.json");
    const seed = readJson<AprilTurboTaxMapping>(seedFile);
    const master: AprilTurboTaxMapping = {
      ...seed,
      mappingId: "april-turbotax.master",
    };
    writeJson(file, master);
    return master;
  }
}

export function saveAprilTurboTaxMapping(
  mapping: AprilTurboTaxMapping,
  projectRoot = process.cwd(),
  mappingPath = DEFAULT_MAPPING_PATH,
): string {
  const file = path.isAbsolute(mappingPath)
    ? mappingPath
    : path.join(projectRoot, mappingPath);
  writeJson(file, mapping);
  return file;
}

export function uniqueSourceRoots(mapping: AprilTurboTaxMapping): string[] {
  const roots = new Set<string>();
  for (const entry of mapping.entries) {
    if (entry.aprilSourceRoot) roots.add(entry.aprilSourceRoot);
  }
  return Array.from(roots);
}

export function appendPendingEntries(
  mapping: AprilTurboTaxMapping,
  entries: AprilTurboTaxEntry[],
): AprilTurboTaxMapping {
  const existingIds = new Set(mapping.entries.map((e) => e.id));
  const merged = [...mapping.entries];

  for (const entry of entries) {
    const entryBinding = entryTurboTaxBinding(entry);
    const duplicate = merged.find((e) => {
      const existingBinding = entryTurboTaxBinding(e);
      if (entryBinding && existingBinding && bindingsMatch(entryBinding, existingBinding)) {
        return true;
      }
      return (
        e.aprilPath === entry.aprilPath &&
        e.aprilSourceRoot === entry.aprilSourceRoot
      );
    });
    if (duplicate) {
      if (entry.domHints?.turboTaxBinding) {
        duplicate.domHints = { ...duplicate.domHints, ...entry.domHints };
      }
      for (const key of entry.pageFieldKeys ?? []) {
        const normalized = normalizeText(key);
        const keys = duplicate.pageFieldKeys ?? [];
        if (!keys.some((k) => normalizeText(k) === normalized)) {
          duplicate.pageFieldKeys = [...keys, key];
        }
      }
      continue;
    }

    let id = entry.id;
    let suffix = 1;
    while (existingIds.has(id)) {
      id = `${entry.id}.${suffix++}`;
    }
    existingIds.add(id);
    merged.push({ ...entry, id });
  }

  return { ...mapping, entries: merged };
}
