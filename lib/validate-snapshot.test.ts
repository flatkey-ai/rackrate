import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { validatePricingDataset } = await import(new URL("./validate-snapshot.ts", import.meta.url).href);
const original = JSON.parse(readFileSync(new URL("../data/offers.json", import.meta.url), "utf8"));
const observed = Date.parse(original.generatedAt);
const fresh = () => structuredClone(original);
const tracked = ["nebius", "crusoe", "lambda", "ucloud", "autodl"];
const expanded = [...tracked, "runpod", "digitalocean", "verda", "azure"];

function fiveProviderSnapshot() {
  const data = fresh();
  data.collector.providers = [...tracked];
  data.collector.version = "0.7.0";
  data.offers = data.offers.filter((offer: { providerSlug: string; dataStatus: string }) => tracked.includes(offer.providerSlug) && offer.dataStatus === "official-page");
  data.sources = data.sources.filter((source: { provider: string }) => tracked.includes(source.provider));
  const indices = new Map<number, number>();
  data.offers.forEach((offer: { sourceQuoteIndex: number }, index: number) => {
    indices.set(offer.sourceQuoteIndex, index);
    offer.sourceQuoteIndex = index;
  });
  for (const model of [...data.coverage.models, ...data.coverage.extra_models]) {
    model.quote_indices = model.quote_indices.filter((index: number) => indices.has(index)).map((index: number) => indices.get(index));
    model.quote_count = model.quote_indices.length;
  }
  data.coverage.totals.returned_quotes = data.coverage.totals.considered_quotes = data.offers.length;
  data.coverage.source_summary.requested_count = data.coverage.source_summary.success_count = tracked.length;
  const gpuSlugs = new Set(data.offers.map((offer: { gpuSlug: string }) => offer.gpuSlug));
  data.generatedCatalog.gpus = data.generatedCatalog.gpus.filter((gpu: { slug: string }) => gpuSlugs.has(gpu.slug));
  data.generatedCatalog.providers = data.generatedCatalog.providers.filter((provider: { slug: string }) => tracked.includes(provider.slug));
  return data;
}

function nineProviderSnapshot() {
  const data = fiveProviderSnapshot();
  data.collector.version = "0.8.0";
  data.collector.providers = [...expanded];
  const template = data.offers[0];
  const model = [...data.coverage.models, ...data.coverage.extra_models]
    .find((entry) => entry.gpu_model === template.gpuModel);
  for (const provider of expanded.slice(tracked.length)) {
    const offer = { ...structuredClone(template), id: `test-${provider}`, providerSlug: provider,
      sourceQuoteIndex: data.offers.length, sourceUrl: `https://example.com/${provider}` };
    data.offers.push(offer);
    model.quote_indices.push(offer.sourceQuoteIndex);
    model.quote_count++;
    data.sources.push({ provider, status: "ok", offerCount: 1, fetchedAt: data.generatedAt, url: offer.sourceUrl });
    data.generatedCatalog.providers.push({ slug: provider, name: provider, website: offer.sourceUrl });
  }
  data.coverage.totals.returned_quotes = data.coverage.totals.considered_quotes = data.offers.length;
  data.coverage.source_summary.requested_count = data.coverage.source_summary.success_count = expanded.length;
  return data;
}

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
    (data) => { data.sources = data.sources.filter((entry: { provider: string }) => entry.provider !== "lambda"); },
  ];
  for (const mutate of mutations) {
    const input = fresh(); mutate(input);
    assert.throws(() => validatePricingDataset(input, observed), /source/);
  }
});

test("an explicit five-provider snapshot validates and excludes every discontinued source", () => {
  const data = fiveProviderSnapshot();
  const before = JSON.stringify(data);
  assert.equal(validatePricingDataset(data, observed), data);
  assert.equal(JSON.stringify(data), before);
  for (const mutate of [
    (value: typeof original) => { value.collector.providers.push("runpod"); },
    (value: typeof original) => { value.collector.providers[0] = "runpod"; },
    (value: typeof original) => { value.collector.providers[0] = value.collector.providers[1]; },
    (value: typeof original) => { value.generatedCatalog.providers.push({ slug: "hyperstack", name: "Hyperstack", website: "https://example.com" }); },
    (value: typeof original) => { value.offers[0].dataStatus = "seed"; },
    (value: typeof original) => { value.sources.push({ provider: "reference", status: "reference", url: "https://example.com", offerCount: 0 }); },
  ]) {
    const invalid = fiveProviderSnapshot(); mutate(invalid);
    assert.throws(() => validatePricingDataset(invalid, observed));
  }
});

test("a complete nine-provider snapshot validates while partial or downgraded scopes fail", () => {
  const data = nineProviderSnapshot();
  const before = JSON.stringify(data);
  assert.equal(validatePricingDataset(data, observed), data);
  assert.equal(JSON.stringify(data), before);
  for (const mutate of [
    (value: typeof original) => { value.collector.providers.pop(); },
    (value: typeof original) => { value.collector.providers[5] = "hyperstack"; },
    (value: typeof original) => { value.sources = value.sources.filter((source: { provider: string }) => source.provider !== "azure"); },
    (value: typeof original) => { value.sources.find((source: { provider: string }) => source.provider === "runpod").status = "failed"; },
    (value: typeof original) => { value.coverage.source_summary.success_count = tracked.length; },
    (value: typeof original) => { value.offers = value.offers.filter((offer: { providerSlug: string }) => offer.providerSlug !== "verda"); },
  ]) {
    const invalid = nineProviderSnapshot(); mutate(invalid);
    assert.throws(() => validatePricingDataset(invalid, observed));
  }
  const downgraded = fiveProviderSnapshot();
  downgraded.collector.version = "0.8.0";
  assert.throws(() => validatePricingDataset(downgraded, observed), /compatibility collector version/);
});

test("location provenance cannot turn platform coverage into a verified country price", () => {
  const data = fiveProviderSnapshot();
  const offer = data.offers.find((entry: { providerSlug: string }) => entry.providerSlug === "nebius");
  offer.priceScope = "platform_coverage";
  offer.computeCountries = [];
  offer.countryCode = "";
  offer.locationSource = { api_url: "https://api.ucloud.cn/" };
  assert.equal(validatePricingDataset(data, observed), data);
  offer.computeCountries = ["FI"];
  assert.throws(() => validatePricingDataset(data, observed), /country price/);
  offer.computeCountries = [];
  offer.locationSource.api_url = "javascript:alert(1)";
  assert.throws(() => validatePricingDataset(data, observed), /location source URL/);
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
  // Build a monthly audit record explicitly; current snapshots may be hourly-only.
  const monthly = input.offers.find((entry: { quoteStatus: string }) => entry.quoteStatus === "quoted");
  assert.ok(monthly);
  Object.assign(monthly, { billingUnit: "GPU-month", billingMode: "monthly", rentalType: "Monthly", pricePerGpuHour: null });
  if (monthly.instancePrice != null) monthly.instanceBillingUnit = "instance-month";
  assert.equal(validatePricingDataset(input, observed), input);
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
    (data) => { data.offers[0].fx.converted = !data.offers[0].fx.converted; },
    (data) => { data.offers.find((entry: { instancePrice?: number }) => entry.instancePrice != null).instancePriceUsd += 1; },
  ];
  for (const mutate of mutations) {
    const input = fresh(); mutate(input);
    assert.throws(() => validatePricingDataset(input, observed));
  }
});

test("arrays, source links, offline status and coverage references are validated", () => {
  // Offline audit rows are valid only when their presentation status agrees.
  const offline = fresh();
  Object.assign(offline.offers[0], { sourceAvailability: "offline", availability: "unavailable" });
  assert.equal(validatePricingDataset(offline, observed), offline);
  offline.offers[0].availability = "unknown";
  assert.throws(() => validatePricingDataset(offline, observed), /offline availability/);
  const mutations: Array<(data: typeof original) => void> = [
    (data) => { data.offers[0].conditions = "member only"; },
    (data) => { data.offers.find((entry: { dataStatus: string }) => entry.dataStatus === "official-page").regions = [42]; },
    (data) => { data.offers[0].sourceUrl = "file:///tmp/prices"; },
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
