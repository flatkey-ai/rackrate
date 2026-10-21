import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validatePricingDataset } from "./validate-snapshot.ts";

// Read the original bytes instead of importing JSON through the compiler.
// Turbopack can round JSON numeric literals before emitting the module, which
// changes FX provenance and causes a valid snapshot to fail strict validation.
export function loadBundledPricingDataset(path = join(process.cwd(), "data", "offers.json")) {
  return validatePricingDataset(JSON.parse(readFileSync(path, "utf8")));
}
