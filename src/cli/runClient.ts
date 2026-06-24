import "dotenv/config";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chromium } from "@playwright/test";
import type { FieldResolution } from "../types/index.js";
import { readJson, writeJson } from "../utils/fs.js";
import { discoverFields, fillFields } from "../browser/contentBridge.js";
import { detectPageContext } from "../resolve/pageContext.js";
import { resolveAprilFields } from "../resolve/resolveAprilField.js";
import { buildAprilLeafIndex } from "../april/buildAprilLeafIndex.js";
import { UsedPathTracker } from "../april/usedPathTracker.js";
import {
  DEFAULT_MAPPING_PATH,
  loadOrSeedMasterMapping,
  uniqueSourceRoots,
} from "../mappings/aprilTurboTaxRegistry.js";
import { savePendingAprilMapping } from "../mappings/savePendingAprilMapping.js";
import { assertNotFilingPage } from "../safety/guards.js";
import { canonicalizeArrayPath } from "../utils/jsonPath.js";

function highConfidence(matches: FieldResolution[]): FieldResolution[] {
  const threshold = Number(process.env.AUTOFILL_MIN_CONFIDENCE ?? "0.75");
  return matches.filter((m) => m.confidence >= threshold);
}

function displayMatches(matches: FieldResolution[]): void {
  console.table(
    matches.map((m, i) => ({
      "#": i + 1,
      confidence: `${Math.round(m.confidence * 100)}%`,
      source: m.source,
      page: m.pageLabel.slice(0, 36),
      april: m.aprilPath.slice(0, 50),
      value: String(m.value).slice(0, 40),
    })),
  );
}

function advanceRootsAfterFill(
  fillable: FieldResolution[],
  mapping: ReturnType<typeof loadOrSeedMasterMapping>,
  pathTracker: UsedPathTracker,
): void {
  const roots = new Set<string>();
  for (const match of fillable) {
    pathTracker.markUsed(match.aprilPath);
    const entry = mapping.entries.find((e) => e.id === match.mappingId);
    if (entry?.aprilSourceRoot) roots.add(entry.aprilSourceRoot);
    else {
      const canonical = canonicalizeArrayPath(match.aprilPath);
      const wildcard = canonical.indexOf("[*]");
      if (wildcard !== -1) roots.add(canonical.slice(0, wildcard + 3));
    }
  }
  for (const root of roots) pathTracker.advanceRoot(root);
}

async function main(): Promise<void> {
  const [aprilPath, mappingPath = DEFAULT_MAPPING_PATH] = process.argv.slice(2);
  if (!aprilPath) {
    console.error("Usage: npm run run-client -- <april-client.json> [mapping.json]");
    process.exit(1);
  }

  const aprilJson = readJson<Record<string, unknown>>(path.resolve(aprilPath));
  const mapping = loadOrSeedMasterMapping(process.cwd(), mappingPath);
  const leafIndex = buildAprilLeafIndex(aprilJson);
  const pathTracker = new UsedPathTracker();
  const sourceRoots = uniqueSourceRoots(mapping);

  const browser = await chromium.launch({ headless: false, slowMo: 75 });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 1000 },
  });
  const page = await context.newPage();
  await page.goto("https://turbotax.intuit.com/");

  const rl = readline.createInterface({ input, output });

  console.log(`Loaded master mapping with ${mapping.entries.length} entries.`);
  console.log(`April leaf index: ${leafIndex.length} searchable paths.`);
  if (sourceRoots.length) {
    console.log(`Array document roots: ${sourceRoots.join(", ")}`);
  }
  console.log("Browser opened. Log in and navigate manually.");

  while (true) {
    const answer = await rl.question(
      "\nNavigate to a TurboTax page, then press Enter to detect/fill. Type q to quit: ",
    );
    if (answer.trim().toLowerCase() === "q") break;

    try {
      await assertNotFilingPage(page);
      const fields = await discoverFields(page);
      const pageContext = detectPageContext(fields);

      const matches = resolveAprilFields(
        fields,
        aprilJson,
        mapping,
        leafIndex,
        pathTracker,
      );
      const fillable = highConfidence(matches);
      const threshold = Number(process.env.AUTOFILL_MIN_CONFIDENCE ?? "0.75");

      console.log(
        `Detected ${fields.length} fields. Page hint: ${pageContext.group} (${Math.round(pageContext.confidence * 100)}%)`,
      );
      console.log(
        `${fillable.length}/${matches.length} matches are above fill threshold (${Math.round(threshold * 100)}%).`,
      );
      if (matches.length) displayMatches(matches);
      else console.log("No matches found.");

      if (!fillable.length) continue;

      const doFill = await rl.question(`Fill ${fillable.length} fields? y/N: `);
      if (doFill.trim().toLowerCase() === "y") {
        const result = await fillFields(page, fillable);
        console.log(`Filled ${result.filled}; skipped ${result.skipped}`);
        console.log(result.details.slice(0, 12).join("\n"));
        advanceRootsAfterFill(fillable, mapping, pathTracker);
      }

      const save = await rl.question(
        "Save these matches as a pending master mapping update? y/N: ",
      );
      if (save.trim().toLowerCase() === "y") {
        const file = savePendingAprilMapping(
          process.cwd(),
          mapping,
          fields,
          fillable,
        );
        console.log(`Pending mapping saved: ${file}`);
        console.log(
          "Review it, then merge entries into data/mappings/april-turbotax.master.json if correct.",
        );
      }

      writeJson("data/reports/latest-run-report.json", {
        createdAt: new Date().toISOString(),
        url: page.url(),
        pageHint: pageContext,
        fieldCount: fields.length,
        matches,
        fillable,
      });
    } catch (error) {
      console.error(error);
    }
  }

  await rl.close();
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
