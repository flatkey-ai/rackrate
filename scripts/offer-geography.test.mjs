import test from "node:test";
import assert from "node:assert/strict";
import { comparableCountryCodes, isComparableRegionalOffer } from "../lib/offer-geography.mjs";

const quote = (extra = {}) => ({
  id: "regional", dataStatus: "official-page", billingUnit: "GPU-hour", billingMode: "on_demand", quoteStatus: "quoted",
  priceScope: "regional_quote", regions: ["eu-north1"], computeCountries: ["FI"], countryCode: "", regionPriceVerified: true,
  pricePerGpuUnit: 1.23, priceUsdPerGpuUnit: 1.23, sourceAmount: "1.23", sourceCurrency: "USD", priceBasis: "advertised_per_gpu", ...extra,
});

test("one rule admits only complete source-bound numeric GPU-hour quotes", () => {
  assert.equal(isComparableRegionalOffer(quote()), true);
  for (const priceScope of ["zone_quote", "requested_region_quote", "requested_zone_quote"]) assert.equal(isComparableRegionalOffer(quote({ priceScope })), true);
  for (const countryCode of ["US", "CN", "SG", "GL"]) assert.deepEqual(comparableCountryCodes(quote({ computeCountries: [], countryCode })), [countryCode]);
  for (const countryCode of ["EU", "UK", "ZZ", "AA", "USA", "us"]) assert.equal(isComparableRegionalOffer(quote({ computeCountries: [], countryCode })), false);
});

test("unlocated, platform or capacity coverage, unknown country and unverified regional quotes are excluded", () => {
  for (const extra of [
    { priceScope: "platform_coverage", coverageRegions: ["eu-north1"], coverageCountries: ["FI"] },
    { priceScope: "unlocated_catalog" }, { priceScope: undefined }, { regionPriceVerified: false }, { regionPriceVerified: 1 }, { regionPriceVerified: null },
    { computeCountries: [], countryCode: "", capacityRegions: ["eu-north1"] },
    { regions: [] }, ...["Global", "All regions", "Not published", "unknown", "unspecified", "N/A", " "].map((region) => ({ regions: [region] })),
  ]) assert.equal(isComparableRegionalOffer(quote(extra)), false, JSON.stringify(extra));
});

test("monthly, starting, contact-sales, component and inconsistent native units never become hourly quotes", () => {
  for (const extra of [
    { billingUnit: "GPU-month" }, { billingMode: "monthly" }, { quoteStatus: "starting_at" }, { quoteStatus: "contact_sales" },
    { priceBasis: "gpu_component" }, { priceBasis: "starting_price" }, { instanceBillingUnit: "instance-month" },
    { priceBasis: "instance_total_allocated", instanceBillingUnit: "instance-hour", gpuCount: null, instancePrice: 9 },
    { sourceAmount: "5" }, { sourceAmount: "1e-2" }, { sourceAmount: null }, { sourceCurrency: "" }, { pricePerGpuUnit: null },
    { priceUsdPerGpuUnit: Infinity }, { priceUsdPerGpuUnit: NaN }, { priceUsdPerGpuUnit: -1 },
  ]) assert.equal(isComparableRegionalOffer(quote(extra)), false, JSON.stringify(extra));
  assert.equal(isComparableRegionalOffer(quote({ sourceAmount: "0", pricePerGpuUnit: 0, priceUsdPerGpuUnit: 0 })), true);
  assert.equal(isComparableRegionalOffer(quote({ priceBasis: "instance_total_allocated", instanceBillingUnit: "instance-hour", gpuCount: 8, instancePrice: 9.84, instanceSourceAmount: "9.84" })), true);
});

test("member and Spot quotes remain eligible with their explicit purchase conditions", () => {
  for (const extra of [{ membershipRequired: true }, { billingMode: "spot", rentalType: "Spot" }]) {
    const input = quote(extra), before = JSON.stringify(input);
    assert.equal(isComparableRegionalOffer(input), true);
    assert.equal(JSON.stringify(input), before);
  }
});

test("explicit unavailable, offline, ended and upcoming states cannot become current comparison rates", () => {
  for (const state of ["offline", "ended", "upcoming", "unavailable"]) {
    assert.equal(isComparableRegionalOffer(quote({ sourceAvailability: state, availability: "unknown" })), false);
    assert.equal(isComparableRegionalOffer(quote({ sourceAvailability: "unknown", availability: state })), false);
  }
  assert.equal(isComparableRegionalOffer(quote({ sourceAvailability: "unknown", availability: "unknown", regionPriceVerified: undefined })), true);
});
