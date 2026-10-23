import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Offer } from "./data";
import { isRunpodCatalogOffer } from "./runpod-catalog.ts";
import { getOfferCountryCodes, matchesCountryRegionSelection } from "./region-matching.ts";
import { isLowestPriceCandidate, offerAudience } from "./offer-comparison.ts";
const recorded = JSON.parse(readFileSync(new URL("./fixtures/runpod-regional-2026-10-23.json", import.meta.url), "utf8"));
const row = recorded.prices[0];
function regional(): Offer {
  return { id: "recorded-region", providerSlug: "runpod", gpuSlug: "nvidia-h100", rawSku: row.raw_sku,
    gpuCount: row.gpu_count, gpuVariant: row.gpu_variant, vramGb: row.vram_gb,
    sourceAmount: row.amount, pricePerGpuUnit: Number(row.amount), pricePerGpuHour: Number(row.amount), priceUsdPerGpuUnit: Number(row.amount),
    sourceCurrency: row.currency, billingMode: row.billing_mode, billingUnit: "GPU-hour", rentalType: "On-demand",
    quoteStatus: row.quote_status, priceBasis: row.price_basis, quoteConditions: row.conditions, conditions: row.notes,
    regions: row.regions, zones: row.zones, region: row.regions[0], countryCode: row.compute_countries[0], computeCountries: row.compute_countries,
    geographicScope: row.geographic_scope, priceScope: row.price_scope, locationSource: row.location_source,
    sourceUrl: row.source_url, apiSourceUrl: row.api_source_url, sourceType: row.source_type, accountScope: row.account_scope,
    observedAt: row.observed_at, cloudTier: row.cloud_tier, availability: row.availability, dataStatus: "official-page", egress: "Not published" };
}
test("recorded requested datacenter starting price keeps country/region together and never receives a full-price minimum", () => {
  const offer = regional();
  assert.equal(isRunpodCatalogOffer(offer), true);
  assert.deepEqual(getOfferCountryCodes(offer), ["IN"]);
  assert.equal(matchesCountryRegionSelection(offer, "IN", "AP-IN-1"), true);
  assert.equal(matchesCountryRegionSelection(offer, "US", "AP-IN-1"), false);
  assert.equal(offerAudience(offer), "regular"); // Secure Cloud is not membership.
  assert.equal(isLowestPriceCandidate(offer, true), false); // Explicit starting price.
});
test("missing, inconsistent or continent-only datacenter evidence is rejected", () => {
  for (const update of [
    { countryCode: "US" }, { regions: ["US-CA-1"] }, { zones: ["US-CA-1"] }, { gpuCount: 8 },
    { quoteStatus: "quoted" }, { priceBasis: "advertised_per_gpu" },
    { quoteConditions: { ...row.conditions, quote_request: { ...row.conditions.quote_request, secureCloud: false } } },
    { locationSource: { ...row.location_source, location: "Europe", country_code: "DE" } },
    { locationSource: { ...row.location_source, documentation_url: "https://unverified.example" } },
  ]) assert.equal(isRunpodCatalogOffer({ ...regional(), ...update } as Offer), false, JSON.stringify(update));
});
