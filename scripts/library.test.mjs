import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRackRateDataset, collectPublicLibrary, collectionPython, LIBRARY_VERSION, normalizeLibraryResult,
  PYTHON_COLLECTION_CODE, REQUIRED_PROVIDERS, validatePublicResult,
  validateOffers,
} from "./lib/library.mjs";
import { refreshPrices } from "./refresh-prices.mjs";
import { convertDatasetToUsd, parseEcbRates } from "./lib/fx.mjs";

const observedAt = "2026-10-20T08:00:00Z";
const rates = parseEcbRates(`<gesmes:Envelope xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref"><gesmes:name>European Central Bank</gesmes:name><Cube><Cube time='2026-10-19'><Cube currency='USD' rate='1.2'/><Cube currency='CNY' rate='8'/><Cube currency='ILS' rate='4'/></Cube></Cube></gesmes:Envelope>`, { observedAt });
function quote(provider, overrides = {}) {
  return {
    provider, product_type: "gpu_instance", gpu_model: "H100", raw_name: "H100 SXM",
    raw_sku: `${provider}-h100`, gpu_variant: "SXM", vram_gb: 80, gpu_count: null,
    amount: "1.25", currency: "USD", unit: "gpu_hour", billing_mode: "on_demand",
    price_basis: "advertised_per_gpu", quote_status: "quoted", regions: [], zones: [],
    geographic_scope: "unspecified", account_scope: "public_catalog", tax_scope: "unspecified",
    observed_at: observedAt, source_url: `https://example.com/${provider}`, source_type: "public_page",
    availability: "unknown", notes: [], ...overrides,
  };
}
function fixture(additional = []) {
  const prices = [...REQUIRED_PROVIDERS.map((provider) => quote(provider)), ...additional];
  return {
    schema_version: 1, collected_at: observedAt, status: "success", prices,
    provider_results: REQUIRED_PROVIDERS.map((provider) => ({
      provider, source_url: `https://example.com/${provider}`, source_type: "public_page",
      status: "success", observed_at: observedAt, returned_count: prices.filter((item) => item.provider === provider).length,
      error: null,
    })),
    coverage: {
      collection_status: "success", scope: "returned_quotes", excluded_quote_indices: [], extra_models: [],
      models: [{ gpu_model: "H100", quote_indices: prices.map((_, index) => index) }],
    },
  };
}
const additional = {
  observedAt, url: "https://www.hyperstack.cloud/gpu-pricing",
  offers: [{
    id: "hyper-h100", gpuSlug: "nvidia-h100", providerSlug: "hyperstack", gpuCount: 1,
    pricePerGpuHour: 2.5, sourceCurrency: "USD", billingUnit: "GPU-hour", region: "Global",
    countryCode: "GL", availability: "unknown", sourceUrl: "https://www.hyperstack.cloud/gpu-pricing",
    observedAt, dataStatus: "official-page",
  }],
};

test("native currency, period, explicit geography and unavailable status survive ingestion", () => {
  const result = fixture();
  Object.assign(result.prices[3], {
    amount: "467.7900", currency: "CNY", unit: "gpu_month", billing_mode: "monthly",
    gpu_count: 4, regions: ["cn-wlcb"], zones: ["cn-wlcb-01"], location: { country_code: "CN" },
    availability: "offline", instance_price: { amount: "1871.16", currency: "CNY", unit: "instance_month" },
    resources: { vcpu_count: 32, memory_mb: 131072 },
    promotion: { activity_id: "test", title: "Public GPU promotion", only_new_users: true, purchase_limit: 3, eligibility_verified: false },
  });
  const { offers, generatedCatalog } = normalizeLibraryResult(result);
  const row = offers[3];
  assert.equal(row.pricePerGpuHour, null);
  assert.equal(row.pricePerGpuUnit, 467.79);
  assert.equal(row.sourceAmount, "467.7900");
  assert.equal(row.sourceCurrency, "CNY");
  assert.equal(row.billingUnit, "GPU-month");
  assert.equal(row.billingMode, "monthly");
  assert.equal(row.rentalType, "Monthly");
  assert.equal(row.availability, "unavailable");
  assert.equal(row.sourceAvailability, "offline");
  assert.deepEqual(row.regions, ["cn-wlcb"]);
  assert.deepEqual(row.zones, ["cn-wlcb-01"]);
  assert.equal(row.countryCode, "CN");
  assert.equal(row.instancePrice, 1871.16);
  assert.equal(row.instanceBillingUnit, "instance-month");
  assert.equal(row.promotion.eligibility_verified, false);
  assert.ok(row.conditions.some((condition) => condition.includes("new customers only") && condition.includes("purchase limit 3")));
  assert.equal(row.vcpu, 32);
  assert.equal(row.ramGb, undefined); // memory_mb is not fabricated as a published GB value.
  assert.equal(offers[0].countryCode, "");
  assert.equal(offers[0].region, "Not published");
  assert.equal(offers[0].gpuCount, null);
  assert.equal(generatedCatalog.gpus[0].vramGb, null);
});

test("contact-sales rows, starting prices, memberships and cloud tiers remain explicit", () => {
  const result = fixture();
  Object.assign(result.prices[1], { amount: null, quote_status: "contact_sales" });
  Object.assign(result.prices[4], { price_basis: "starting_price", quote_status: "starting_at", pricing_tier: "member", membership_required: true });
  result.prices[5].cloud_tier = "community";
  const { offers } = normalizeLibraryResult(result);
  assert.equal(offers[1].pricePerGpuUnit, null);
  assert.equal(offers[1].pricePerGpuHour, null);
  assert.equal(offers[1].quoteStatus, "contact_sales");
  assert.equal(offers[4].priceBasis, "starting_price");
  assert.equal(offers[4].quoteStatus, "starting_at");
  assert.ok(offers[4].conditions.includes("Membership required; eligibility not verified"));
  assert.ok(offers[5].conditions.includes("Cloud tier: community"));
});

test("stable IDs survive price, observation, stock and key-order changes", () => {
  const result = fixture();
  const before = normalizeLibraryResult(result).offers[0].id;
  const source = result.prices[0];
  source.amount = "9.99";
  source.observed_at = "2026-10-21T08:00:00Z";
  source.availability = "offline";
  source.effective_from = "2026-10-21";
  result.prices[0] = Object.fromEntries(Object.entries(source).reverse());
  assert.equal(normalizeLibraryResult(result).offers[0].id, before);
});

test("different configurations, GPU variants, tiers, regions and currencies are separate offers", () => {
  const variations = [
    { gpu_variant: "PCIe" }, { vram_gb: 94 }, { gpu_count: 8 }, { currency: "EUR" },
    { unit: "gpu_month" }, { billing_mode: "spot" }, { pricing_tier: "member" },
    { cloud_tier: "secure" }, { regions: ["us-north1"] }, { zones: ["us-north1-a"] },
    { resources: { vcpus: 16 } }, { conditions: { purchase_option: "spot" } },
    { promotion: { activity_id: "different-promotion" } },
  ];
  const result = fixture(variations.map((variant) => quote("nebius", variant)));
  assert.equal(new Set(normalizeLibraryResult(result).offers.map((offer) => offer.id)).size, result.prices.length);
});

test("coverage families keep T4S separate from T4 and do not map unknown A100 memory to 80GB", () => {
  const result = fixture();
  result.prices[0].gpu_model = "T4S";
  result.prices[1].gpu_model = "T4";
  result.prices[2].gpu_model = "A100";
  result.coverage.models = [
    { gpu_model: "T4S", quote_indices: [0] }, { gpu_model: "T4", quote_indices: [1] },
    { gpu_model: "A100", quote_indices: [2] },
    { gpu_model: "H100", quote_indices: result.prices.slice(3).map((_, index) => index + 3) },
  ];
  const { offers } = normalizeLibraryResult(result);
  assert.equal(offers[0].gpuSlug, "nvidia-t4s");
  assert.equal(offers[1].gpuSlug, "nvidia-t4");
  assert.equal(offers[2].gpuSlug, "nvidia-a100");
});

test("missing, failed, partial, empty and mismatched required sources abort", () => {
  for (const mutate of [
    (value) => { value.status = "partial"; },
    (value) => { value.provider_results.pop(); },
    (value) => { value.provider_results[0].status = "failed"; },
    (value) => { value.provider_results[0].returned_count = 0; },
    (value) => { value.provider_results[0].returned_count = 20; },
    (value) => { value.coverage.models[0].quote_indices.pop(); },
    (value) => { value.coverage.models[0].quote_indices.push(0); },
  ]) {
    const value = fixture();
    mutate(value);
    assert.throws(() => validatePublicResult(value));
  }
});

test("invalid prices, inconsistent contact-sales, unsupported units and duplicates abort", () => {
  for (const change of [
    { amount: "NaN" }, { amount: "-1" }, { amount: "Infinity" }, { amount: 1.2 },
    { amount: null }, { quote_status: "contact_sales" }, { unit: "instance_hour" },
    { gpu_count: 0 }, { currency: "" },
  ]) {
    const value = fixture();
    Object.assign(value.prices[0], change);
    assert.throws(() => normalizeLibraryResult(value));
  }
  assert.throws(() => normalizeLibraryResult(fixture([quote("nebius")])), /Duplicate offer id/);
});

test("zero is retained as an actual published amount", () => {
  const result = fixture();
  result.prices[0].amount = "0";
  assert.equal(normalizeLibraryResult(result).offers[0].pricePerGpuUnit, 0);
});

test("Python bridge uses explicit public Settings rather than dotenv or process credentials", async () => {
  let captured;
  const result = await collectPublicLibrary({ python: "/custom/python", exec: async (...args) => {
    captured = args;
    return { stdout: JSON.stringify(fixture()) };
  } });
  assert.equal(result.status, "success");
  assert.equal(captured[0], "/custom/python");
  assert.deepEqual(captured[1], ["-c", PYTHON_COLLECTION_CODE]);
  assert.ok(PYTHON_COLLECTION_CODE.includes(`__version__ != "${LIBRARY_VERSION}"`));
  assert.ok(PYTHON_COLLECTION_CODE.includes('collect_prices("all", settings=Settings(), include_coverage=True)'));
  assert.ok(!PYTHON_COLLECTION_CODE.includes("from_env"));
  await assert.rejects(collectPublicLibrary({ exec: async () => ({ stdout: "not-json" }) }), /valid JSON/);
});

test("Python selection prefers explicit path then clone-local venv over global Python", () => {
  assert.equal(collectionPython({ explicit: "/chosen/python", root: "/repo", exists: () => true }), "/chosen/python");
  assert.equal(collectionPython({ explicit: "", root: "/repo", exists: (path) => path.endsWith("/bin/python") }), "/repo/.venv/bin/python");
  assert.equal(collectionPython({ explicit: "", root: "/repo", exists: (path) => path.endsWith("/Scripts/python.exe") }), "/repo/.venv/Scripts/python.exe");
  assert.equal(collectionPython({ explicit: "", root: "/repo", exists: () => false }), "python3");
});

test("dataset replaces obsolete collectors and preserves explicit dated references only", () => {
  const reference = { ...additional.offers[0], id: "dated-reference", providerSlug: "vast-ai", dataStatus: "seed" };
  const output = buildRackRateDataset({ offers: [reference, { ...reference, id: "obsolete", dataStatus: "official-page" }] }, fixture(), additional);
  assert.equal(output.schemaVersion, 2);
  assert.equal(output.offers.length, 13);
  assert.ok(output.offers.some((offer) => offer.id === "dated-reference" && offer.dataStatus === "seed"));
  assert.ok(!output.offers.some((offer) => offer.id === "obsolete"));
  assert.equal(output.sources.filter((source) => source.status === "ok").length, 12);
  assert.equal(output.collector.mode, "public-only");
  assert.equal(output.offers.find((offer) => offer.providerSlug === "hyperstack").countryCode, "");
});

test("USD conversion preserves native prices and periods and requires matching provenance", () => {
  const result = fixture();
  Object.assign(result.prices[3], { amount: "80", currency: "CNY", unit: "gpu_month", billing_mode: "monthly", availability: "offline" });
  Object.assign(result.prices[4], { amount: "8", currency: "CNY" });
  const original = buildRackRateDataset({ offers: [] }, result, additional);
  const output = convertDatasetToUsd(original, rates);
  validateOffers(output.offers, { requireUsd: true, rates });
  const month = output.offers.find((offer) => offer.providerSlug === "ucloud");
  const hour = output.offers.find((offer) => offer.providerSlug === "autodl");
  assert.equal(month.priceUsdPerGpuUnit, 12);
  assert.equal(month.pricePerGpuUnit, 80);
  assert.equal(month.pricePerGpuHour, null);
  assert.equal(month.availability, "unavailable");
  assert.equal(month.billingUnit, "GPU-month");
  assert.equal(hour.pricePerGpuHour, 1.2);
  assert.equal(hour.sourceCurrency, "CNY");
  assert.deepEqual(output.offers.map((offer) => offer.id), original.offers.map((offer) => offer.id));
  hour.fx.sourceUrl = "https://unverified.example";
  assert.throws(() => validateOffers(output.offers, { requireUsd: true, rates }), /provenance/);
  const forged = convertDatasetToUsd(original, rates);
  forged.offers[0].priceUsdPerGpuUnit += 1;
  assert.throws(() => validateOffers(forged.offers, { requireUsd: true, rates }), /exact source conversion/);
});

test("refresh aborts before any write when a required public source fails", async () => {
  const result = fixture();
  result.provider_results[3].status = "failed";
  let writes = 0;
  await assert.rejects(refreshPrices({
    read: async (path) => JSON.stringify(path.endsWith("offers.json") ? { offers: [] } : { snapshots: [] }),
    collect: async () => result, collectAdditional: async () => additional,
    collectRates: async () => rates,
    write: async () => { writes++; },
  }), /Required public source failed/);
  assert.equal(writes, 0);
});

test("refresh aborts before any write when FX rates cannot be verified", async () => {
  let writes = 0;
  await assert.rejects(refreshPrices({
    read: async (path) => JSON.stringify(path.endsWith("offers.json") ? { offers: [] } : { snapshots: [] }),
    collect: async () => fixture(), collectAdditional: async () => additional,
    collectRates: async () => { throw new Error("ECB rate source unavailable"); },
    write: async () => { writes++; },
  }), /ECB rate source unavailable/);
  assert.equal(writes, 0);
});

test("refresh retains complete raw provenance and publishes dataset after history", async () => {
  const files = new Map();
  const publications = [];
  const result = fixture();
  await refreshPrices({
    directory: "/example", read: async (path) => JSON.stringify(path.endsWith("offers.json") ? { offers: [] } : { snapshots: [] }),
    collect: async () => result, collectAdditional: async () => additional,
    collectRates: async () => rates,
    write: async (path, body) => files.set(path, JSON.parse(body)),
    move: async (from, to) => publications.push([from, to]), remove: async () => {},
  });
  assert.deepEqual(files.get("/example/data/public-prices.json.tmp"), result);
  assert.deepEqual(files.get("/example/data/fx-rates.json.tmp"), rates);
  assert.equal(publications.at(-1)[1], "/example/data/offers.json");
  assert.equal(files.get("/example/data/price-history.json.tmp").snapshots[0].offers[0].sourceCurrency, "USD");
  assert.equal(files.get("/example/data/price-history.json.tmp").snapshots[0].fx.rateDate, "2026-10-19");
  assert.equal(files.get("/example/data/price-history.json.tmp").snapshots[0].offers[0].fx, undefined);
});
