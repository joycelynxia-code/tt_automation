import "dotenv/config";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chromium } from "@playwright/test";
import type { AprilTurboTaxEntry, DiscoveredField } from "../types/index.js";
import { readJson } from "../utils/fs.js";
import { discoverFields } from "../browser/contentBridge.js";
import { domHintsFromField } from "../browser/domHints.js";
import { buildAprilLeafIndex } from "../april/buildAprilLeafIndex.js";
import { rankAprilLeavesForField } from "../april/scoreAprilLeaf.js";
import { UsedPathTracker } from "../april/usedPathTracker.js";
import {
  DEFAULT_MAPPING_PATH,
  appendPendingEntries,
  loadOrSeedMasterMapping,
  saveAprilTurboTaxMapping,
} from "../mappings/aprilTurboTaxRegistry.js";
import {
  bindingsMatch,
  canonicalizeTurboTaxBinding,
  entryTurboTaxBinding,
  fieldTurboTaxBinding,
} from "../mappings/turboTaxBinding.js";
import {
  displayLabel,
  fieldKey,
} from "../resolve/resolveAprilField.js";
import { assertNotFilingPage } from "../safety/guards.js";
import { canonicalizeArrayPath } from "../utils/jsonPath.js";

function entryExistsForBinding(
  mapping: ReturnType<typeof loadOrSeedMasterMapping>,
  binding: string,
): AprilTurboTaxEntry | undefined {
  return mapping.entries.find((entry) => {
    const entryBinding = entryTurboTaxBinding(entry);
    return entryBinding ? bindingsMatch(binding, entryBinding) : false;
  });
}

function pathFromInput(
  inputPath: string,
  tracker: UsedPathTracker,
): { aprilPath: string; aprilSourceRoot?: string } {
  const trimmed = inputPath.trim();
  const canonical = canonicalizeArrayPath(trimmed);
  const wildcardIndex = canonical.indexOf("[*]");
  if (wildcardIndex === -1) return { aprilPath: trimmed };

  const root = canonical.slice(0, wildcardIndex + 3);
  const relative = canonical.slice(wildcardIndex + 4).replace(/^\./, "");
  tracker.getIndexForRoot(root);
  return {
    aprilSourceRoot: root,
    aprilPath: relative,
  };
}

function idFromBinding(binding: string): string {
  const parts = binding.split(".");
  const fieldName = parts.at(-1) ?? "field";
  const formPart = parts.find((p) => /IRSW2|1099|1040/i.test(p)) ?? "field";
  return `${formPart}.${fieldName}`.replace(/[^a-zA-Z0-9_.]/g, "_");
}

async function promptForFieldMapping(
  field: DiscoveredField,
  aprilJson: unknown,
  tracker: UsedPathTracker,
  rl: readline.Interface,
): Promise<AprilTurboTaxEntry | null> {
  const binding = fieldTurboTaxBinding(field);
  if (!binding) {
    console.log(`\nSkipping field without TurboTax binding: ${displayLabel(field)}`);
    return null;
  }

  const canonicalBinding = canonicalizeTurboTaxBinding(binding);
  const leaves = buildAprilLeafIndex(aprilJson);
  const suggestions = rankAprilLeavesForField(field, leaves, tracker, 5);

  console.log(`\nField: ${displayLabel(field)}`);
  console.log(`TurboTax binding: ${binding}`);
  console.log(`Canonical binding: ${canonicalBinding}`);
  if (!suggestions.length) {
    console.log("No April phrase suggestions found.");
  } else {
    console.log("Suggestions:");
    suggestions.forEach((item, index) => {
      console.log(
        `  ${index + 1}. [${Math.round(item.score * 100)}%] ${item.leaf.path} = ${String(item.leaf.value).slice(0, 40)}`,
      );
    });
  }

  const answer = await rl.question(
    "Pick suggestion #, enter custom April path, or press Enter to skip: ",
  );
  const trimmed = answer.trim();
  if (!trimmed) return null;

  let fullPath = trimmed;
  if (/^\d+$/.test(trimmed)) {
    const picked = suggestions[Number(trimmed) - 1];
    if (!picked) {
      console.log("Invalid suggestion number.");
      return null;
    }
    fullPath = picked.leaf.path;
  }

  const parsed = pathFromInput(fullPath, tracker);
  return {
    id: idFromBinding(canonicalBinding),
    pageFieldKeys: [fieldKey(field)],
    aprilPath: parsed.aprilPath,
    aprilSourceRoot: parsed.aprilSourceRoot,
    label: displayLabel(field).slice(0, 80),
    domHints: domHintsFromField(field),
  };
}

async function main(): Promise<void> {
  const [aprilPath, mappingPath = DEFAULT_MAPPING_PATH] = process.argv.slice(2);
  if (!aprilPath) {
    console.error("Usage: npm run build-master-mapping -- <sample-april.json> [mapping.json]");
    process.exit(1);
  }

  const aprilJson = readJson<Record<string, unknown>>(path.resolve(aprilPath));
  let mapping = loadOrSeedMasterMapping(process.cwd(), mappingPath);
  const tracker = new UsedPathTracker();

  const browser = await chromium.launch({ headless: false, slowMo: 75 });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 1000 },
  });
  const page = await context.newPage();
  await page.goto("https://turbotax.intuit.com/");

  const rl = readline.createInterface({ input, output });
  let pagesVisited = 0;
  let fieldsAdded = 0;

  console.log(`Master mapping: ${mapping.entries.length} entries loaded.`);
  console.log("Primary key: domHints.turboTaxBinding (from data-binding on each input).");
  console.log("Walk through TurboTax once. On each page, press Enter to map fields.");

  while (true) {
    const answer = await rl.question(
      "\nNavigate to a TurboTax page, then press Enter to map fields. Type q to quit: ",
    );
    if (answer.trim().toLowerCase() === "q") break;

    try {
      await assertNotFilingPage(page);
      const fields = await discoverFields(page);
      pagesVisited += 1;
      tracker.clearPagePrefix();

      console.log(`Detected ${fields.length} fields on ${page.url()}`);
      const pending: AprilTurboTaxEntry[] = [];

      for (const field of fields) {
        if (!field.isVisible || field.isDisabled) continue;

        const binding = fieldTurboTaxBinding(field);
        if (!binding) {
          console.log(`  - no binding, skipped: ${displayLabel(field)}`);
          continue;
        }

        const existing = entryExistsForBinding(mapping, binding);
        if (existing) {
          console.log(
            `  ✓ already mapped: ${canonicalizeTurboTaxBinding(binding)} -> ${existing.aprilPath}`,
          );
          continue;
        }

        const entry = await promptForFieldMapping(field, aprilJson, tracker, rl);
        if (!entry) continue;
        pending.push(entry);
        fieldsAdded += 1;
      }

      if (pending.length) {
        mapping = appendPendingEntries(mapping, pending);
        const file = saveAprilTurboTaxMapping(mapping, process.cwd(), mappingPath);
        console.log(`Saved ${pending.length} new entries to ${file}`);
      } else {
        console.log("No new entries added for this page.");
      }
    } catch (error) {
      console.error(error);
    }
  }

  console.log(
    `\nDone. Pages visited: ${pagesVisited}. New fields mapped this session: ${fieldsAdded}. Total entries: ${mapping.entries.length}.`,
  );

  await rl.close();
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
