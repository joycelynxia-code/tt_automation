import type { Page } from "@playwright/test";

const FORBIDDEN = [
  "transmit my return",
  "file my return",
  "e-file now",
  "submit return",
  "sign and file",
  "pay and file",
  "finish filing"
];

export async function assertNotFilingPage(page: Page): Promise<void> {
  const text = (await page.locator("body").innerText({ timeout: 3000 }).catch(() => "")).toLowerCase();
  const hit = FORBIDDEN.find((phrase) => text.includes(phrase));
  if (hit) throw new Error(`Safety stop: filing-related page detected (${hit}).`);
}
