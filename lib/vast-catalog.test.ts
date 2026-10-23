import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Offer } from "./data";
import { isVastCatalogOffer } from "./vast-catalog.ts";
import { isFormalComparisonOffer } from "./comparison-scope.ts";
import { getOfferCountryCodes, matchesCountryRegionSelection } from "./region-matching.ts";

const captured = JSON.parse(readFileSync(new URL("./fixtures/vast-catalog-2026-10-23.json", import.meta.url), "utf8"));
// Mirror the library's field mapping without reinterpreting any captured price,
// GPU count, resource allocation, location or original condition.
function recorded(index = 0): Offer {
  const row = structuredClone(captured.prices[index]);
  const amount = Number(row.amount), total = Number(row.instance_price.amount);
  return {
    id: `captured-vast-${row.raw_sku}`, providerSlug: row.provider, gpuSlug: row.gpu_model.toLowerCase().replaceAll(" ", "-"),
    gpuModel: row.gpu_model, rawGpuModel: row.gpu_model, rawName: row.raw_name, rawSku: row.raw_sku,
    gpuCount: row.gpu_count, gpuVariant: row.gpu_variant, vramGb: row.vram_gb, resources: row.resources,
    sourceAmount: row.amount, usdSourceAmount: row.amount, pricePerGpuUnit: amount, priceUsdPerGpuUnit: amount, pricePerGpuHour: amount,
    instancePrice: total, instancePriceUsd: total, instanceSourceAmount: row.instance_price.amount,
    instanceUsdSourceAmount: row.instance_price.amount, instanceCurrency: row.instance_price.currency, instanceBillingUnit: "instance-hour",
    sourceCurrency: row.currency, billingMode: row.billing_mode, billingUnit: "GPU-hour", rentalType: "On-demand",
    quoteStatus: row.quote_status, priceBasis: row.price_basis, quoteConditions: row.conditions, sourceConditions: row.conditions, conditions: row.notes,
    regions: row.regions, zones: row.zones, region: row.regions.length ? row.regions.join(", ") : "Not published",
    countryCode: row.compute_countries[0], computeCountries: row.compute_countries, geographicScope: row.geographic_scope,
    regionScope: row.geographic_scope, priceScope: row.price_scope, locationSource: row.location_source,
    sourceUrl: row.source_url, sourceType: row.source_type, accountScope: row.account_scope, productType: row.product_type,
    observedAt: row.observed_at, availability: row.availability, dataStatus: "official-page", egress: "Not published",
  };
}

test("captured US state and CA province prices enter formal comparison with matched countries", () => {
  for (const index of [0, 1]) {
    const offer = recorded(index);
    assert.equal(isVastCatalogOffer(offer), true);
    assert.equal(isFormalComparisonOffer(offer), true);
    assert.deepEqual(getOfferCountryCodes(offer), [offer.countryCode]);
    assert.equal(matchesCountryRegionSelection(offer, offer.countryCode, offer.regions[0]), true);
    assert.equal(matchesCountryRegionSelection(offer, "IE", offer.regions[0]), false);
    const terms = offer.quoteConditions as Record<string, unknown>;
    assert.equal(terms.allocated_storage, 8);
    assert.equal(terms.bandwidth_included, false);
    assert.equal(terms.catalog_coverage, "partial");
  }
});

test("captured country-only price remains source evidence without inventing a region or uniform rate", () => {
  const offer = recorded(2);
  assert.equal(isVastCatalogOffer(offer), true);
  assert.equal(offer.countryCode, "IE");
  assert.equal(offer.locationSource!.raw_location, "Ireland, IE");
  assert.deepEqual(offer.regions, []);
  assert.equal(isFormalComparisonOffer(offer), false);
  assert.equal(offer.locationSource!.uniform_country_price, false);
  assert.equal(offer.pricePerGpuUnit, offer.instancePrice! / offer.gpuCount!);
});

test("country and subdivision conflicts, fabricated regions and nationwide rates are rejected", () => {
  const regional = recorded();
  for (const change of [
    { countryCode: "CA" }, { computeCountries: ["CA"] }, { regions: ["Quebec, CA"] }, { zones: ["Virginia-1"] },
    { priceScope: "country_quote" }, { geographicScope: "global" }, { region: "US" },
    { locationSource: { ...regional.locationSource, country_code: "CA" } },
    { locationSource: { ...regional.locationSource, uniform_country_price: true } },
    { locationSource: { ...regional.locationSource, raw_location: "Virginia, CA" } },
    { locationSource: { ...regional.locationSource, location_granularity: "country" } },
    { locationSource: { ...regional.locationSource, documentation_url: "https://unverified.example/regions" } },
    { applicableRegions: ["Virginia, US", "Quebec, CA"] },
  ]) assert.equal(isVastCatalogOffer({ ...regional, ...change } as Offer), false, JSON.stringify(change));
  const countryOnly = recorded(2);
  for (const raw of ["Ireland, IE", "Dublin, IE", "New York City, US", "Paris, FR"]) {
    const country = raw.split(", ")[1];
    const fabricated = { ...countryOnly, countryCode: country, computeCountries: [country], regions: [raw], region: raw,
      geographicScope: "offer_location", regionScope: "offer_location", priceScope: "regional_quote",
      locationSource: { ...countryOnly.locationSource, raw_location: raw, country_code: country, location_granularity: "subdivision" } };
    assert.equal(isVastCatalogOffer(fabricated), false, raw);
  }
});

test("only concrete anonymous on-demand bundles with exact hourly allocation are accepted", () => {
  const offer = recorded(2);
  for (const change of [
    { sourceUrl: "https://vast.ai/pricing" }, { sourceType: "public_page" }, { accountScope: "account" },
    { quoteStatus: "starting_at" }, { priceBasis: "starting_price" }, { billingUnit: "GPU-month" }, { billingMode: "spot" },
    { productType: "gpu_instance" }, { rawSku: "1" }, { gpuCount: 1 }, { gpuCount: 1.5 },
    { pricePerGpuUnit: NaN }, { priceUsdPerGpuUnit: Infinity }, { pricePerGpuHour: -1 },
    { sourceAmount: "Infinity" }, { instancePriceUsd: 1 }, { instanceCurrency: "CNY" }, { instanceBillingUnit: "instance-month" },
    { resources: { ...offer.resources, storage_gb: 9 } }, { resources: { ...offer.resources, memory_gb: 999 } },
    { quoteConditions: { ...offer.quoteConditions, allocated_storage: 9 } },
    { quoteConditions: { ...offer.quoteConditions, bandwidth_included: true } },
    { quoteConditions: { ...offer.quoteConditions, catalog_coverage: "complete" } },
    { quoteConditions: { ...offer.quoteConditions, rate_type: "lowest_available" } },
    { quoteConditions: { ...offer.quoteConditions, verification: "unverified" } },
  ]) {
    const changed = { ...offer, ...change } as Offer;
    // Change both stored copies so these cases exercise the billing contract,
    // independently of the check that the two copies agree.
    if ("quoteConditions" in change) changed.sourceConditions = change.quoteConditions;
    assert.equal(isVastCatalogOffer(changed), false, JSON.stringify(change));
  }
  assert.equal(isVastCatalogOffer({ ...offer, sourceConditions: { ...offer.sourceConditions, allocated_storage: 9 } }), false);
  const mismatched = { ...offer, sourceAmount: "0.01", usdSourceAmount: "0.01", pricePerGpuUnit: 0.01, priceUsdPerGpuUnit: 0.01, pricePerGpuHour: 0.01 };
  assert.equal(isVastCatalogOffer(mismatched), false);
  const wrongBreakdown = { ...offer.quoteConditions, compute_per_instance_hour_usd: "0.01" };
  assert.equal(isVastCatalogOffer({ ...offer, quoteConditions: wrongBreakdown, sourceConditions: wrongBreakdown }), false);
});


test("tiny concrete three-GPU prices retain the collector's full 80-significant-digit allocation", () => {
  const offer = recorded();
  const total = "0." + "0".repeat(49) + "1";
  const perGpu = "0." + "0".repeat(50) + "3".repeat(80);
  Object.assign(offer, { gpuCount: 3, sourceAmount: perGpu, usdSourceAmount: perGpu,
    pricePerGpuUnit: Number(perGpu), priceUsdPerGpuUnit: Number(perGpu), pricePerGpuHour: Number(perGpu),
    instanceSourceAmount: total, instanceUsdSourceAmount: total, instancePrice: Number(total), instancePriceUsd: Number(total) });
  const terms = { ...offer.quoteConditions, compute_per_instance_hour_usd: total, storage_per_instance_hour_usd: "0" };
  offer.quoteConditions = terms; offer.sourceConditions = terms;
  assert.equal(isVastCatalogOffer(offer), true);
  assert.equal(isVastCatalogOffer({ ...offer, sourceAmount: "0." + "3".repeat(161) }), false);
});
