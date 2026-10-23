import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { validatePricingDataset } = await import(new URL("./validate-snapshot.ts", import.meta.url).href);
const original = JSON.parse(readFileSync(new URL("../data/offers.json", import.meta.url), "utf8"));
const observed = Date.parse(original.generatedAt);
const fresh = () => structuredClone(original);
const tracked = ["nebius", "crusoe", "lambda", "ucloud", "autodl"];

function fiveProviderSnapshot() {
  const data = fresh();
  data.collector.providers = [...tracked];
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

test("new releases require nine providers and verified RunPod API scope, while old five-source fallback remains readable", () => {
  const data = fiveProviderSnapshot();
  data.collector.version = "0.23.0";
  assert.throws(() => validatePricingDataset(data, observed), /tracked-provider/);
  data.collector.providers.push("runpod");
  const row = { ...structuredClone(data.offers.find((entry: { sourceCurrency: string; quoteStatus: string }) => entry.sourceCurrency === "USD" && entry.quoteStatus === "quoted")),
    id: "new-runpod-api", providerSlug: "runpod", sourceQuoteIndex: data.offers.length,
    sourceUrl: "https://www.runpod.io/pricing", apiSourceUrl: "https://api.runpod.io/graphql",
    sourceType: "official_public_api", accountScope: "public_catalog", cloudTier: "secure", membershipRequired: false,
    billingMode: "on_demand", billingUnit: "GPU-hour", rentalType: "On-demand", gpuCount: null,
    countryCode: "", regions: [], zones: [], computeCountries: [], applicableRegions: [],
    priceScope: "unlocated_catalog", geographicScope: "unspecified", region: "Not published" };
  data.offers.push(row);
  data.generatedCatalog.providers.push({ slug: "runpod", name: "RunPod", website: "https://www.runpod.io" });
  data.sources.push({ provider: "runpod", status: "ok", offerCount: 1, url: row.sourceUrl, fetchedAt: row.observedAt });
  const model = [...data.coverage.models, ...data.coverage.extra_models].find(entry => entry.gpu_model === row.gpuModel);
  model.quote_indices.push(row.sourceQuoteIndex); model.quote_count++;
  data.coverage.totals.returned_quotes++; data.coverage.totals.considered_quotes++;
  data.coverage.source_summary.requested_count++; data.coverage.source_summary.success_count++;
  for (const provider of ["azure", "digitalocean", "verda"]) {
    const extra = { ...row, providerSlug: provider, id: `new-${provider}`, sourceQuoteIndex: data.offers.length };
    data.offers.push(extra); data.collector.providers.push(provider);
    data.generatedCatalog.providers.push({ slug: provider, name: provider, website: `https://${provider}.example` });
    data.sources.push({ provider, status: "ok", offerCount: 1, url: row.sourceUrl, fetchedAt: row.observedAt });
    model.quote_indices.push(extra.sourceQuoteIndex); model.quote_count++;
    data.coverage.totals.returned_quotes++; data.coverage.totals.considered_quotes++;
    data.coverage.source_summary.requested_count++; data.coverage.source_summary.success_count++;
  }
  assert.equal(validatePricingDataset(data, observed), data);
  for (const change of [{ sourceType: "public_page" }, { apiSourceUrl: null }, { countryCode: "US" }, { cloudTier: "member" }]) {
    const changed = structuredClone(data); Object.assign(changed.offers.find((item: { providerSlug: string }) => item.providerSlug === "runpod"), change);
    assert.throws(() => validatePricingDataset(changed, observed), /RunPod catalog source/);
  }
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
    (data) => { data.offers[0].fx.converted = !data.offers[0].fx.converted; },
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


test("authorized snapshots preserve partial visibility while requiring the exact successful sub-source plan", () => {
  const data = fiveProviderSnapshot();
  data.collector.mode = "authorized";
  data.collector.validationPolicy = "visible-catalog-v1";
  for (const source of data.sources) {
    const selections = source.provider === "nebius" ? ["nebius_public", "nebius_account"] : [source.provider];
    source.collectionStatus = source.provider === "nebius" ? "partial" : "success";
    source.sourceObservations = selections.map((selection: string, index: number) => ({
      selection, status: selection === "nebius_account" ? "partial" : "success",
      returned_count: selections.length === 1 ? source.offerCount : index === 0 ? 1 : source.offerCount - 1,
      observed_at: source.fetchedAt, source_url: source.url,
      limitations: selection === "nebius_account" ? [{ scope: "documented_public_region", status: "no_accessible_project" }] : [],
    }));
  }
  data.coverage.collection_status = "partial";
  data.coverage.source_summary.success_count = 4;
  data.coverage.source_summary.unknown_count = 1;
  assert.equal(validatePricingDataset(data, observed), data);
  for (const mutate of [
    (value: typeof data) => { value.collector.validationPolicy = "unknown"; },
    (value: typeof data) => { value.coverage.collection_status = "success"; },
    (value: typeof data) => { value.sources.find((source: { provider: string }) => source.provider === "nebius").sourceObservations[1].status = "failed"; },
    (value: typeof data) => { value.sources.find((source: { provider: string }) => source.provider === "nebius").sourceObservations[1].limitations[0].status = "authentication_error"; },
  ]) {
    const changed = structuredClone(data); mutate(changed);
    assert.throws(() => validatePricingDataset(changed, observed));
  }
});


test("explicit Nebius public-only profile records its account exclusion and keeps overall partial status", () => {
  const data = fiveProviderSnapshot();
  data.collector.mode = "authorized"; data.collector.validationPolicy = "visible-catalog-v1";
  for (const source of data.sources) {
    source.collectionStatus = source.provider === "nebius" ? "partial" : "success";
    source.sourceObservations = [{ selection: source.provider === "nebius" ? "nebius_public" : source.provider,
      status: "success", returned_count: source.offerCount, observed_at: source.fetchedAt, source_url: source.url, limitations: [] }];
    source.sourceExclusions = source.provider === "nebius" ? [{ selection: "nebius_account", reason: "billing_setup_required", status: "excluded_by_configuration" }] : [];
  }
  data.coverage.collection_status = "partial";
  data.coverage.source_summary.success_count = 4; data.coverage.source_summary.unknown_count = 1;
  assert.equal(validatePricingDataset(data, observed), data);
  for (const mutate of [
    (value: typeof data) => { value.sources[0].sourceExclusions = []; },
    (value: typeof data) => { value.sources[0].sourceExclusions[0].reason = "authentication_failed"; },
    (value: typeof data) => { value.sources[0].collectionStatus = "success"; },
  ]) {
    const changed = structuredClone(data); mutate(changed);
    assert.throws(() => validatePricingDataset(changed, observed));
  }
});


test("optional expansion failure is validated as zero current quotes and never as a fresh successful source", () => {
  const data = fiveProviderSnapshot();
  data.collector.version = "0.23.0"; data.collector.mode = "authorized"; data.collector.validationPolicy = "visible-catalog-v1";
  const base = data.offers.find((entry: { sourceCurrency: string; quoteStatus: string }) => entry.sourceCurrency === "USD" && entry.quoteStatus === "quoted");
  const runpod = { ...structuredClone(base), id: "current-runpod", providerSlug: "runpod", sourceQuoteIndex: data.offers.length,
    sourceUrl: "https://www.runpod.io/pricing", apiSourceUrl: "https://api.runpod.io/graphql", sourceType: "official_public_api",
    accountScope: "public_catalog", cloudTier: "secure", membershipRequired: false, billingMode: "on_demand", billingUnit: "GPU-hour",
    gpuCount: null, countryCode: "", regions: [], zones: [], computeCountries: [], applicableRegions: [], priceScope: "unlocated_catalog", geographicScope: "unspecified" };
  data.offers.push(runpod); data.collector.providers.push("runpod", "azure", "digitalocean", "verda");
  data.sources.push({ provider: "runpod", status: "ok", offerCount: 1, url: runpod.sourceUrl, fetchedAt: runpod.observedAt });
  const model = [...data.coverage.models, ...data.coverage.extra_models].find(entry => entry.gpu_model === runpod.gpuModel);
  model.quote_indices.push(runpod.sourceQuoteIndex); model.quote_count++;
  data.coverage.totals.returned_quotes++; data.coverage.totals.considered_quotes++;
  for (const source of data.sources) {
    source.collectionStatus = "success"; source.sourceExclusions = [];
    const selections = source.provider === "nebius" ? ["nebius_public", "nebius_account"] : [source.provider];
    source.sourceObservations = selections.map((selection: string, i: number) => ({ selection, status: "success", limitations: [],
      returned_count: selections.length === 1 ? source.offerCount : i ? source.offerCount - 1 : 1,
      observed_at: source.fetchedAt, source_url: source.url }));
  }
  for (const provider of ["runpod", "azure", "digitalocean", "verda"]) {
    data.generatedCatalog.providers.push({ slug: provider, name: provider, website: `https://${provider}.example` });
    if (provider !== "runpod") data.sources.push({ provider, status: "failed", collectionStatus: "failed", failureCode: "extension_source_failed",
      offerCount: 0, url: `https://${provider}.example`, fetchedAt: data.generatedAt, sourceObservations: [], sourceExclusions: [] });
  }
  data.coverage.collection_status = "partial";
  Object.assign(data.coverage.source_summary, { requested_count: 9, success_count: 6, failed_count: 3, unknown_count: 0 });
  assert.equal(validatePricingDataset(data, observed), data);
  for (const change of [{ status: "ok" }, { offerCount: 1 }, { failureCode: "anything" }]) {
    const changed = structuredClone(data); Object.assign(changed.sources.find((source: { provider: string }) => source.provider === "azure"), change);
    assert.throws(() => validatePricingDataset(changed, observed));
  }
});
