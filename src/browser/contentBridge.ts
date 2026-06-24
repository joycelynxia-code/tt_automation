import type { Page } from "@playwright/test";
import type { DiscoveredField, FieldResolution } from "../types/index.js";

function serialize(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

export async function discoverFields(page: Page): Promise<DiscoveredField[]> {
  return page.evaluate<DiscoveredField[]>(`
    (() => {
      const FIELD_ATTR = "data-tax-autofill-id";
      function cleanText(text) { return (text ?? "").replace(/\\s+/g, " ").trim(); }
      function isVisible(el) {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      }
      function explicitLabel(el) {
        if (el.id) {
          const label = document.querySelector(\`label[for="\${CSS.escape(el.id)}"]\`);
          if (label && label.textContent) return cleanText(label.textContent);
        }
        const parentLabel = el.closest("label");
        if (parentLabel && parentLabel.textContent) return cleanText(parentLabel.textContent);
        return "";
      }
      function nearbyText(el) {
        const parts = [];
        const fieldset = el.closest("fieldset");
        const legend = fieldset ? fieldset.querySelector("legend") : null;
        if (legend && legend.textContent) parts.push(cleanText(legend.textContent));
        const container = el.closest("div, section, li, tr, form");
        if (container && container.textContent) parts.push(cleanText(container.textContent).slice(0, 600));
        return cleanText(parts.join(" | "));
      }
      function ensureId(el, i) {
        const existing = el.getAttribute(FIELD_ATTR);
        if (existing) return existing;
        const id = \`tax_autofill_\${Date.now()}_\${i}_\${Math.random().toString(16).slice(2)}\`;
        el.setAttribute(FIELD_ATTR, id);
        return id;
      }
      return Array.from(document.querySelectorAll("input, textarea, select"))
        .filter((el) => {
          if (el instanceof HTMLInputElement) {
            const type = (el.type || "text").toLowerCase();
            if (["hidden", "submit", "button", "image", "file"].includes(type)) return false;
          }
          return true;
        })
        .map((el, index) => {
          const label = explicitLabel(el);
          const ariaLabel = cleanText(el.getAttribute("aria-label"));
          const placeholder = "placeholder" in el ? cleanText(el.placeholder) : "";
          const near = nearbyText(el);
          return {
            fieldId: ensureId(el, index),
            tagName: el.tagName.toLowerCase(),
            inputType: el instanceof HTMLInputElement ? el.type || "text" : el.tagName.toLowerCase(),
            labelText: cleanText([label, ariaLabel, placeholder, near].filter(Boolean).join(" | ")),
            ariaLabel,
            placeholder,
            name: el.getAttribute("name") ?? undefined,
            id: el.id || undefined,
            nearbyText: near,
            value: "value" in el ? String(el.value ?? "") : undefined,
            isDisabled: Boolean(el.disabled),
            isVisible: isVisible(el)
          };
        });
    })()
  `);
}

export async function fillFields(page: Page, matches: FieldResolution[]): Promise<{ filled: number; skipped: number; details: string[] }> {
  return page.evaluate<{ filled: number; skipped: number; details: string[] }>(`
    (() => {
      const matches = ${serialize(matches)};
      const FIELD_ATTR = "data-tax-autofill-id";
      let filled = 0;
      let skipped = 0;
      const details = [];
      function setNativeValue(el, value) {
        const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
        if (descriptor && descriptor.set) descriptor.set.call(el, value);
        else el.value = value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
      function fillSelect(el, value) {
        const normalized = value.trim().toLowerCase();
        const option = Array.from(el.options).find((opt) => opt.value.trim().toLowerCase() === normalized || (opt.textContent ?? "").trim().toLowerCase() === normalized);
        if (!option) return false;
        el.value = option.value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
      for (const match of matches) {
        const el = document.querySelector(\`[\${FIELD_ATTR}="\${CSS.escape(match.pageFieldId)}"]\`);
        if (!el) { skipped++; details.push(\`Skipped \${match.canonicalPath}: field not found\`); continue; }
        if (el.disabled) { skipped++; details.push(\`Skipped \${match.canonicalPath}: field disabled\`); continue; }
        if (match.value === null || match.value === undefined) { skipped++; details.push(\`Skipped \${match.canonicalPath}: empty value\`); continue; }
        let value = String(match.value);
        if (match.canonicalPath.toLowerCase().includes("birthdate") && /^\\d{4}-\\d{2}-\\d{2}$/.test(value)) {
          const parts = value.split("-"); value = parts[1] + "/" + parts[2] + "/" + parts[0];
        }
        if (el instanceof HTMLSelectElement) {
          if (fillSelect(el, value)) { filled++; details.push(\`Filled \${match.pageLabel} <- \${match.canonicalPath}\`); }
          else { skipped++; details.push(\`Skipped \${match.canonicalPath}: no select option for \${value}\`); }
          continue;
        }
        if (el instanceof HTMLInputElement && ["checkbox", "radio"].includes(el.type)) {
          el.checked = typeof match.value === "boolean" ? match.value : value.toLowerCase() === "true";
          el.dispatchEvent(new Event("change", { bubbles: true }));
          filled++; details.push(\`Filled \${match.pageLabel} <- \${match.canonicalPath}\`); continue;
        }
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          setNativeValue(el, value);
          filled++; details.push(\`Filled \${match.pageLabel} <- \${match.canonicalPath}\`); continue;
        }
        skipped++; details.push(\`Skipped \${match.canonicalPath}: unsupported field element\`);
      }
      return { filled, skipped, details };
    })()
  `);
}
