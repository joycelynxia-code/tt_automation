import { chromium, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

type DomField = {
  index: number;
  frameUrl: string;
  tagName: string;
  type: string | null;
  label: string;
  nearbyText: string;
  id: string | null;
  name: string | null;
  binding: string | null;
  dataBinding: string | null;
  formControlName: string | null;
  ariaLabel: string | null;
  placeholder: string | null;
  autocomplete: string | null;
  dataTestId: string | null;
  selector: string;
  isVisible: boolean;
  isDisabled: boolean;
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(filePath: string, data: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

async function collectFieldsFromPage(page: Page): Promise<DomField[]> {
  const allFields: DomField[] = [];

  for (const frame of page.frames()) {
    try {
      const frameFields = await frame.evaluate<DomField[]>(`
        (() => {
          function clean(text) {
            return (text ?? "").replace(/\\s+/g, " ").trim();
          }

          function isVisible(el) {
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();

            return (
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              rect.width > 0 &&
              rect.height > 0
            );
          }

          function getLabel(el) {
            const id = el.getAttribute("id");

            if (id) {
              const explicit = document.querySelector(\`label[for="\${CSS.escape(id)}"]\`);
              if (explicit && explicit.textContent) return clean(explicit.textContent);
            }

            const parentLabel = el.closest("label");
            if (parentLabel && parentLabel.textContent) {
              return clean(parentLabel.textContent);
            }

            const ariaLabelledBy = el.getAttribute("aria-labelledby");
            if (ariaLabelledBy) {
              const parts = ariaLabelledBy
                .split(/\\s+/)
                .map((id) => document.getElementById(id)?.textContent)
                .filter(Boolean);

              if (parts.length) return clean(parts.join(" "));
            }

            return "";
          }

          function getNearbyText(el) {
            const parts = [];

            const fieldset = el.closest("fieldset");
            const legend = fieldset ? fieldset.querySelector("legend") : null;
            if (legend && legend.textContent) parts.push(clean(legend.textContent));

            const container = el.closest("div, section, li, tr, form");
            if (container && container.textContent) {
              parts.push(clean(container.textContent).slice(0, 500));
            }

            return clean(parts.join(" | "));
          }

          function cssPath(el) {
            if (el.id) return \`#\${CSS.escape(el.id)}\`;

            const parts = [];
            let current = el;

            while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
              let selector = current.nodeName.toLowerCase();

              const name = current.getAttribute("name");
              const binding =
                current.getAttribute("binding") ||
                current.getAttribute("data-binding") ||
                current.getAttribute("formcontrolname");

              if (binding) {
                selector += \`[binding="\${CSS.escape(binding)}"]\`;
                parts.unshift(selector);
                break;
              }

              if (name) {
                selector += \`[name="\${CSS.escape(name)}"]\`;
                parts.unshift(selector);
                break;
              }

              const parent = current.parentElement;
              if (!parent) break;

              const siblings = Array.from(parent.children).filter(
                (child) => child.nodeName === current.nodeName
              );

              if (siblings.length > 1) {
                selector += \`:nth-of-type(\${siblings.indexOf(current) + 1})\`;
              }

              parts.unshift(selector);
              current = parent;
            }

            return parts.join(" > ");
          }

          const elements = Array.from(document.querySelectorAll("input, select, textarea"));

          return elements
            .filter((el) => {
              if (el instanceof HTMLInputElement) {
                const type = (el.type || "text").toLowerCase();

                if (["hidden", "submit", "button", "image", "file"].includes(type)) {
                  return false;
                }
              }

              return true;
            })
            .map((el, index) => {
              return {
                index,
                frameUrl: window.location.href,
                tagName: el.tagName.toLowerCase(),
                type: el instanceof HTMLInputElement ? el.type : el.tagName.toLowerCase(),
                label: getLabel(el),
                nearbyText: getNearbyText(el),
                id: el.getAttribute("id"),
                name: el.getAttribute("name"),
                binding: el.getAttribute("binding"),
                dataBinding: el.getAttribute("data-binding"),
                formControlName: el.getAttribute("formcontrolname"),
                ariaLabel: el.getAttribute("aria-label"),
                placeholder:
                  el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
                    ? el.placeholder
                    : null,
                autocomplete: el.getAttribute("autocomplete"),
                dataTestId: el.getAttribute("data-testid"),
                selector: cssPath(el),
                isVisible: isVisible(el),
                isDisabled: Boolean(el.disabled)
              };
            });
        })()
      `);

      allFields.push(...frameFields);
    } catch {
      // Some frames may be inaccessible. Skip them.
    }
  }

  return allFields;
}

async function main(): Promise<void> {
  const outputDir = process.argv[2] ?? "data/dom-snapshots";

  ensureDir(outputDir);

  const context = await chromium.launchPersistentContext("data/playwright-profile", {
    headless: false,
    slowMo: 50,
    viewport: { width: 1400, height: 900 }
  });

  const page = context.pages()[0] ?? (await context.newPage());

  await page.goto("https://turbotax.intuit.com/");

  const rl = readline.createInterface({ input, output });

  console.log("");
  console.log("Browser opened.");
  console.log("Log into TurboTax and navigate manually.");
  console.log("When you reach a page to collect, return here.");
  console.log("");

  while (true) {
    const pageName = await rl.question(
      "Enter page name to snapshot, or q to quit: "
    );

    if (pageName.trim().toLowerCase() === "q") {
      break;
    }

    const fields = await collectFieldsFromPage(page);

    const currentUrl = page.url();
    const title = await page.title();

    const snapshot = {
      collectedAt: new Date().toISOString(),
      pageName,
      url: currentUrl,
      title,
      fieldCount: fields.length,
      fields
    };

    const fileName = `${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}-${slugify(pageName)}.json`;

    const filePath = path.join(outputDir, fileName);

    writeJson(filePath, snapshot);

    console.log(`Saved ${fields.length} fields to ${filePath}`);
    console.log(
      fields
        .slice(0, 8)
        .map((field) => {
          return `- ${field.label || field.ariaLabel || field.name || field.id || "(unlabeled)"} | binding=${field.binding ?? field.dataBinding ?? field.formControlName ?? ""}`;
        })
        .join("\n")
    );
    console.log("");
  }

  rl.close();
  await context.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});