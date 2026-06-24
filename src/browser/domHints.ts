import type { AprilTurboTaxDomHints, DiscoveredField } from "../types/index.js";
import { canonicalizeTurboTaxBinding } from "../mappings/turboTaxBinding.js";

export function domHintsFromField(field: DiscoveredField): AprilTurboTaxDomHints {
  const binding = field.turboTaxBinding
    ? canonicalizeTurboTaxBinding(field.turboTaxBinding)
    : undefined;

  return {
    turboTaxBinding: binding,
    ariaLabel: field.ariaLabel,
    explicitLabel: field.explicitLabel,
    inputType: field.inputType,
    tagName: field.tagName,
  };
}
