import "dotenv/config";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chromium } from "@playwright/test";
import type {
  CanonicalIndexEntry,
  CanonicalTaxModel,
  FieldResolution,
} from "../types/index.js";
import { readJson, writeJson } from "../utils/fs.js";
import { buildCanonicalIndex } from "../canonical/buildCanonicalIndex.js";
import { discoverFields, fillFields } from "../browser/contentBridge.js";
import { detectPageContext, pageSignature } from "../resolve/pageContext.js";
import { resolveFields } from "../resolve/resolveField.js";
import {
  loadApprovedPageMappings,
  savePendingPageMapping,
} from "../resolve/pageMappingRegistry.js";
import { assertNotFilingPage } from "../safety/guards.js";

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
      canonical: m.canonicalPath.slice(0, 50),
      value: String(m.value).slice(0, 40),
    })),
  );
}

async function main(): Promise<void> {
  const [canonicalPath] = process.argv.slice(2);
  if (!canonicalPath) {
    console.error("Usage: npm run run-client -- <canonical.json>");
    process.exit(1);
  }

  const model = readJson<CanonicalTaxModel>(path.resolve(canonicalPath));
  const index: CanonicalIndexEntry[] = buildCanonicalIndex(model);
  writeJson("data/index/latest.index.json", index);

  const browser = await chromium.launch({ headless: false, slowMo: 75 });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 1000 },
  });
  const page = await context.newPage();
  await page.goto("https://turbotax.intuit.com/");

  const rl = readline.createInterface({ input, output });

  console.log("Browser opened. Log in and navigate manually.");
  console.log(
    "When you are on a TurboTax page to fill, return here and press Enter.",
  );

  while (true) {
    const answer = await rl.question(
      "\nNavigate to a TurboTax page, then press Enter to detect/fill. Type q to quit: ",
    );
    if (answer.trim().toLowerCase() === "q") break;

    try {
      await assertNotFilingPage(page);
      const fields = await discoverFields(page);
      const pageContext = detectPageContext(fields);
      const signature = pageSignature(
        page.url(),
        await page.title(),
        fields,
        pageContext,
      );
      console.log("looking at approved mappings:")
      const allMappings = loadApprovedPageMappings(process.cwd());
      console.log(allMappings)
      for (const m of allMappings) {
        console.log(
          "saved pageSignature:",
          m.pageSignature,
          "| current signature:",
          signature,
        );
      }

      
      const savedMappings = loadApprovedPageMappings(process.cwd()).filter((m) => m.pageSignature === signature);
      console.log(savedMappings)

      const matches = resolveFields(fields, index, pageContext, savedMappings);
      console.log("matches", matches);
      const fillable = highConfidence(matches);
      const threshold = Number(process.env.AUTOFILL_MIN_CONFIDENCE ?? "0.75");

      console.log(
        `Detected ${fields.length} fields. Context: ${pageContext.group} (${Math.round(pageContext.confidence * 100)}%)`,
      );
      console.log(`Page signature: ${signature}`);
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
      }

      const save = await rl.question(
        "Save these matches as a pending reusable page mapping? y/N: ",
      );
      if (save.trim().toLowerCase() === "y") {
        const file = savePendingPageMapping(
          process.cwd(),
          signature,
          pageContext,
          fields,
          fillable,
        );
        console.log(`Pending page mapping saved: ${file}`);
        console.log(
          "Review it, then move it to data/mappings/page/approved/ if correct.",
        );
      }

      writeJson("data/reports/latest-run-report.json", {
        createdAt: new Date().toISOString(),
        url: page.url(),
        context: pageContext,
        pageSignature: signature,
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
