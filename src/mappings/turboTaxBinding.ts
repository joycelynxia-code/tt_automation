import type { AprilTurboTaxEntry, DiscoveredField } from "../types/index.js";

/** Normalize array indices in TurboTax binding paths, e.g. IRSW2.0 → IRSW2.[*] */
export function canonicalizeTurboTaxBinding(binding: string): string {
  return binding
    .split(".")
    .map((part) => (/^\d+$/.test(part) ? "[*]" : part))
    .join(".");
}

/** Extract numeric document index from a concrete binding, e.g. ...IRSW2.0.EmployerEIN → 0 */
export function bindingArrayIndex(binding: string): number | undefined {
  for (const part of binding.split(".")) {
    if (/^\d+$/.test(part)) return Number(part);
  }
  return undefined;
}

export function fieldTurboTaxBinding(field: DiscoveredField): string | undefined {
  return field.turboTaxBinding?.trim() || undefined;
}

export function entryTurboTaxBinding(entry: AprilTurboTaxEntry): string | undefined {
  return entry.domHints?.turboTaxBinding?.trim() || undefined;
}

export function bindingsMatch(fieldBinding: string, entryBinding: string): boolean {
  return canonicalizeTurboTaxBinding(fieldBinding) === canonicalizeTurboTaxBinding(entryBinding);
}
