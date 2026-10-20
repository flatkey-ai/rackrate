import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { validatePricingDataset } = await import(new URL("./validate-snapshot.ts", import.meta.url).href);
const original = JSON.parse(readFileSync(new URL("../data/offers.json", import.meta.url), "utf8"));
const observed = Date.parse(original.generatedAt);
const fresh = () => structuredClone(original);

test("real published snapshot validates without changing any price or object identity", () => {
  const input = fresh();
  const before = JSON.stringify(input);
  assert.equal(validatePricingDataset(input, observed), input);
  assert.equal(JSON.stringify(input), before);
  assert.equal(input.offers.length, original.offers.length);
});

test("an old fallback remains valid against the FX date at its own collection time", () => {
  assert.equal(validatePricingDataset(original, observed + 30 * 86_400_000), original);
  const input = fresh();
  input.fx.rateDate = "2026-10-01";
  assert.throws(() => validatePricingDataset(input, observed), /FX age at collection/);
});

test("missing, failed, duplicated and miscounted public sources cannot replace a snapshot", () => {
  const mutations: Array<(data: typeof original) => void> = [
    (data) => { data.sources = data.sources.filter((entry: { provider: string }) => entry.provider !== "ucloud"); },
    (data) => { data.sources.find((entry: { provider: string }) => entry.provider === "autodl").status = "failed"; },
    (data) => { data.sources.push(structuredClone(data.sources[1])); },
    (data) => { data.sources[1].offerCount += 1; },
    (data) => { data.sources = data.sources.filter((entry: { provider: string }) => entry.provider !== "hyperstack"); },
  ];
  for (const mutate of mutations) {
    const input = fresh(); mutate(input);
    assert.throws(() => validatePricingDataset(input, observed), /source/);
  }
});

test("bad collector identities, schema versions and future or invalid timestamps fail", () => {
  const mutations: Array<(data: typeof original) => void> = [
    (data) => { data.schemaVersion = 1; },
    (data) => { data.collector.mode = "authenticated"; },
    (data) => { data.collector.commit = "latest"; },
    (data) => { data.generatedAt = new Date(observed + 360_000).toISOString(); },
    (data) => { data.generatedAt = "2026-02-30T08:00:00Z"; },
    (data) => { data.offers[0].observedAt = "not-a-time"; },
  ];
  for (const mutate of mutations) {
    const input = fresh(); mutate(input);
    assert.throws(() => validatePricingDataset(input, observed));
  }
});

test("unknown references, duplicate IDs and invalid catalog URLs are rejected", () => {
  const mutations: Array<(data: typeof original) => void> = [
    (data) => { data.offers[0].gpuSlug = "nvidia-made-up"; },
    (data) => { data.offers[0].providerSlug = "unknown-cloud"; },
    (data) => { data.offers[0].id = data.offers[1].id; },
    (data) => { data.generatedCatalog.gpus[0].slug = "../unsafe"; },
    (data) => { data.generatedCatalog.gpus[0].name = ""; },
    (data) => { data.generatedCatalog.providers[0].website = "javascript:alert(1)"; },
    (data) => { data.generatedCatalog.gpus.push(structuredClone(data.generatedCatalog.gpus[0])); },
  ];
  for (const mutate of mutations) {
    const input = fresh(); mutate(input);
    assert.throws(() => validatePricingDataset(input, observed));
  }
});

test("monthly original and USD amounts cannot be misrepresented as hourly", () => {
  const input = fresh();
  const monthly = input.offers.find((entry: { billingUnit: string }) => entry.billingUnit === "GPU-month");
  assert.ok(monthly);
  monthly.pricePerGpuHour = monthly.priceUsdPerGpuUnit;
  assert.throws(() => validatePricingDataset(input, observed), /hourly period mismatch/);
  monthly.pricePerGpuHour = null;
  monthly.billingUnit = "GPU-hour";
  assert.throws(() => validatePricingDataset(input, observed), /billing mode/);
});

test("source decimals, dollar amounts, nulls and exchange-rate provenance must agree", () => {
  const mutations: Array<(data: typeof original) => void> = [
    (data) => { data.offers[0].pricePerGpuUnit = Infinity; },
    (data) => { data.offers[0].sourceAmount = "999"; },
    (data) => { data.offers[0].priceUsdPerGpuUnit += .01; },
    (data) => { data.offers.find((entry: { quoteStatus: string }) => entry.quoteStatus === "contact_sales").priceUsdPerGpuUnit = 0; },
    (data) => { data.fx.sourceUrl = "https://unverified.example/rates"; },
    (data) => { data.fx.ratesToUsd.CNY = "1"; },
    (data) => { data.offers[0].fx.rateDate = "2026-10-18"; },
    (data) => { data.offers[0].fx.converted = true; },
    (data) => { data.offers.find((entry: { instancePrice?: number }) => entry.instancePrice != null).instancePriceUsd += 1; },
  ];
  for (const mutate of mutations) {
    const input = fresh(); mutate(input);
    assert.throws(() => validatePricingDataset(input, observed));
  }
});

test("arrays, source links, offline status and coverage references are validated", () => {
  const mutations: Array<(data: typeof original) => void> = [
    (data) => { data.offers[0].conditions = "member only"; },
    (data) => { data.offers.find((entry: { dataStatus: string }) => entry.dataStatus === "official-page").regions = [42]; },
    (data) => { data.offers[0].sourceUrl = "file:///tmp/prices"; },
    (data) => { data.offers.find((entry: { sourceAvailability?: string }) => entry.sourceAvailability === "offline").availability = "unknown"; },
    (data) => { data.coverage.collection_status = "partial"; },
    (data) => { data.coverage.source_summary.success_count = 10; },
    (data) => { data.coverage.models[0].quote_indices[0] = 999999; },
    (data) => { data.coverage.totals.returned_quotes += 1; },
  ];
  for (const mutate of mutations) {
    const input = fresh(); mutate(input);
    assert.throws(() => validatePricingDataset(input, observed));
  }
});
