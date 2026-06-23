import fs from "node:fs";
import { normalizeState } from "./usStates.js";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonObject
  | JsonValue[];

interface JsonObject {
  [key: string]: JsonValue;
}

const REMOVE_KEYS = new Set([
  "drivers_license_or_state_id",
  "application_household_metadata",
  "uploaded_document",
]);

function addDays(dateString: string, days = 2): string {
  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  date.setDate(date.getDate() + days);

  return date.toISOString().split("T")[0];
}

function anonymizeAddress(address: string): string {
  return address.replace(/^(\d+)/, (_, num: string) => {
    return String(Number(num) + 2);
  });
}

function anonymizeValue(key: string, value: JsonValue): JsonValue {
  const lowerKey = key.toLowerCase();

  if (typeof value !== "string") {
    return value;
  }

  // Birth dates
  if (
    lowerKey.includes("birth") ||
    lowerKey.includes("dob") ||
    lowerKey === "date_of_birth"
  ) {
    return addDays(value, 2);
  }

  if (lowerKey == "state") {
    return normalizeState(value);
  }

  // Street addresses
  if (lowerKey.includes("address") || lowerKey.includes("street")) {
    return anonymizeAddress(value);
  }

  // SSN
  if (lowerKey.includes("ssn")) {
    return "123-12-1234";
  }

  // Last name
  if (lowerKey.includes("last_name")) {
    return "Appleseed";
  }

  // TIN
  if (lowerKey.includes("tin_")) {
    return "123456789";
  }

  // Phone
  if (lowerKey.includes("phone")) {
    return "(555) 555-5555";
  }

  // Email
  if (lowerKey.includes("email")) {
    return "example@example.com";
  }

  // Account number
  if (lowerKey.includes("account_number")) {
    return "98765432";
  }

  // Routing number
  if (lowerKey.includes("routing_number")) {
    return "123456789";
  }

  return value;
}

function walk(obj: JsonValue): JsonValue {
  if (Array.isArray(obj)) {
    return obj
      .map(walk)
      .filter((item) => item !== undefined) as JsonValue[];
  }

  if (obj && typeof obj === "object") {
    const result: JsonObject = {};

    for (const [key, value] of Object.entries(obj)) {
      // Remove entire object
      if (REMOVE_KEYS.has(key)) {
        continue;
      }

      result[key] =
        value && typeof value === "object"
          ? walk(value)
          : anonymizeValue(key, value);
    }

    return result;
  }

  return obj;
}

const inputPath = "./test.json";
const outputPath = "./anon_test.json";

const input = JSON.parse(
  fs.readFileSync(inputPath, "utf8")
) as JsonValue;

const output = walk(input);

fs.writeFileSync(
  outputPath,
  JSON.stringify(output, null, 2),
  "utf8"
);

console.log(`Anonymized file written to: ${outputPath}`);

