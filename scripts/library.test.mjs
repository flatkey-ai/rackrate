import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRackRateDataset, collectPublicLibrary, collectionPython, LIBRARY_VERSION, normalizeLibraryResult,
  PYTHON_COLLECTION_CODE, REQUIRED_PROVIDERS, validatePublicResult,
  validateOffers, collectAuthorizedLibrary, collectionMode, collectionEnvironment, AUTHORIZED_SECRET_NAMES,
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
test("the scheduled collector requires exactly the five selected competitors", () => {
  assert.deepEqual(REQUIRED_PROVIDERS, ["nebius", "crusoe", "lambda", "ucloud", "autodl"]);
});

test("native currency, period, explicit geography and unavailable status survive ingestion", () => {
  const result = fixture();
  Object.assign(result.prices[3], {
    amount: "467.7900", currency: "CNY", unit: "gpu_month", billing_mode: "monthly",
    gpu_count: 4, regions: ["cn-wlcb"], zones: ["cn-wlcb-01"], location: { country_code: "CN" },
    compute_countries: ["CN"], price_scope: "zone_quote",
    location_source: { api_url: "https://api.ucloud.cn/", country_field: "CountryCode" },
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
  assert.deepEqual(row.computeCountries, ["CN"]);
  assert.equal(row.priceScope, "zone_quote");
  assert.deepEqual(row.locationSource, result.prices[3].location_source);
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
  result.prices[2].cloud_tier = "community";
  const { offers } = normalizeLibraryResult(result);
  assert.equal(offers[1].pricePerGpuUnit, null);
  assert.equal(offers[1].pricePerGpuHour, null);
  assert.equal(offers[1].quoteStatus, "contact_sales");
  assert.equal(offers[4].priceBasis, "starting_price");
  assert.equal(offers[4].quoteStatus, "starting_at");
  assert.ok(offers[4].conditions.includes("Membership required; eligibility not verified"));
  assert.ok(offers[2].conditions.includes("Cloud tier: community"));
});

test("stable IDs survive price, observation, stock and key-order changes", () => {
  const result = fixture();
  const before = normalizeLibraryResult(result).offers[0].id;
  const source = result.prices[0];
  source.amount = "9.99";
  source.observed_at = "2026-10-21T08:00:00Z";
  source.availability = "offline";
  source.effective_from = "2026-10-21";
  // Enriching the same source SKU with provenance does not create a new tariff.
  source.price_scope = "unlocated_catalog";
  source.compute_countries = [];
  source.location_source = { api_url: "https://example.com/source-directory" };
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

test("incomplete collection reports the failing sources without upstream response text", () => {
  const value = fixture();
  value.status = "partial";
  value.provider_results[0] = { provider: "nebius", status: "failed", returned_count: 0,
    error: { code: "parse_failed", message: "untrusted response body" } };
  value.provider_results[1] = { provider: "crusoe", status: "failed", returned_count: 0,
    error: { code: "unsafe response body", message: "untrusted response body" } };
  assert.throws(() => validatePublicResult(value), {
    message: "Public collection was incomplete: nebius (parse_failed), crusoe; existing data was preserved",
  });
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
  assert.ok(PYTHON_COLLECTION_CODE.includes(`collect_prices(${JSON.stringify(REQUIRED_PROVIDERS)}, settings=Settings(), include_coverage=True)`));
  assert.ok(!PYTHON_COLLECTION_CODE.includes("from_env"));
  await assert.rejects(collectPublicLibrary({ exec: async () => ({ stdout: "not-json" }) }), /valid JSON/);
});

test("Python selection prefers explicit path then clone-local venv over global Python", () => {
  assert.equal(collectionPython({ explicit: "/chosen/python", root: "/repo", exists: () => true }), "/chosen/python");
  assert.equal(collectionPython({ explicit: "", root: "/repo", exists: (path) => path.endsWith("/bin/python") }), "/repo/.venv/bin/python");
  assert.equal(collectionPython({ explicit: "", root: "/repo", exists: (path) => path.endsWith("/Scripts/python.exe") }), "/repo/.venv/Scripts/python.exe");
  assert.equal(collectionPython({ explicit: "", root: "/repo", exists: () => false }), "python3");
});

test("current dataset contains only this five-provider collection and never reobserves old offers", () => {
  const references = ["vast-ai", "aws", "hyperstack", "runpod", "flatkey"].map((providerSlug) => ({
    id: `dated-${providerSlug}`, providerSlug, dataStatus: "seed", observedAt: "2020-01-01T00:00:00Z",
  }));
  const current = { offers: [...references, { id: "obsolete", providerSlug: "nebius", dataStatus: "official-page" }] };
  const before = JSON.stringify(current);
  const output = buildRackRateDataset(current, fixture());
  assert.equal(output.schemaVersion, 2);
  assert.equal(output.offers.length, 5);
  assert.ok(output.offers.every((offer) => REQUIRED_PROVIDERS.includes(offer.providerSlug) && offer.dataStatus === "official-page"));
  assert.ok(!output.offers.some((offer) => offer.id === "obsolete"));
  assert.deepEqual(output.sources.map((source) => source.provider).sort(), [...REQUIRED_PROVIDERS].sort());
  assert.equal(output.generatedAt, observedAt);
  assert.equal(output.collector.mode, "public-only");
  assert.equal(JSON.stringify(current), before);
});

test("platform coverage cannot supply a country-price label even when old location metadata is present", () => {
  const result = fixture();
  Object.assign(result.prices[0], { regions: ["eu-north1"], compute_countries: ["FI"],
    location: { country_code: "FI" }, price_scope: "platform_coverage" });
  const row = normalizeLibraryResult(result).offers[0];
  assert.equal(row.priceScope, "platform_coverage");
  assert.deepEqual(row.computeCountries, []);
  assert.equal(row.countryCode, "");
  assert.deepEqual(row.regions, ["eu-north1"]);
});

test("USD conversion preserves native prices and periods and requires matching provenance", () => {
  const result = fixture();
  Object.assign(result.prices[3], { amount: "80", currency: "CNY", unit: "gpu_month", billing_mode: "monthly", availability: "offline" });
  Object.assign(result.prices[4], { amount: "8", currency: "CNY" });
  const original = buildRackRateDataset({ offers: [] }, result);
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
    collect: async () => result,
    collectRates: async () => rates,
    write: async () => { writes++; },
  }), /Required public source failed/);
  assert.equal(writes, 0);
});

test("refresh aborts before any write when FX rates cannot be verified", async () => {
  let writes = 0;
  await assert.rejects(refreshPrices({
    read: async (path) => JSON.stringify(path.endsWith("offers.json") ? { offers: [] } : { snapshots: [] }),
    collect: async () => fixture(),
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
    directory: "/example", read: async (path) => {
      if (path.includes("/price-history/")) throw Object.assign(new Error("Missing new shard"), { code: "ENOENT" });
      return JSON.stringify(path.endsWith("offers.json") ? { offers: [] } : { snapshots: [] });
    },
    collect: async () => result,
    collectRates: async () => rates,
    write: async (path, body) => files.set(path, JSON.parse(body)),
    move: async (from, to) => publications.push([from, to]), remove: async () => {}, makeDirectory: async () => {},
  });
  assert.deepEqual(files.get("/example/data/public-prices.json.tmp"), result);
  assert.deepEqual(files.get("/example/data/fx-rates.json.tmp"), rates);
  assert.equal(publications.at(-1)[1], "/example/data/offers.json");
  const index = files.get("/example/data/price-history.json.tmp");
  assert.equal(index.schemaVersion, 3);
  const history = files.get(`/example/data/${index.shards[0].path}.tmp`);
  assert.equal(history.snapshots[0].offers[0].sourceCurrency, "USD");
  assert.equal(history.snapshots[0].fx.rateDate, "2026-10-19");
  assert.equal(history.snapshots[0].offers[0].fx, undefined);
  assert.ok(publications.findIndex(([, to]) => to.endsWith(index.shards[0].path))
    < publications.findIndex(([, to]) => to.endsWith("price-history.json")));
});

test("failed publication preserves expired shards and removes staged files", async () => {
  const deletes = [], writes = [], moves = [];
  const expiredPath = "price-history/2025-01-01.json";
  const currentHistory = { schemaVersion: 3, retentionDays: 180, shards: [{ date: "2025-01-01", path: expiredPath,
    snapshotCount: 1, offerCount: 1, bytes: 100, firstObservedAt: "2025-01-01T01:00:00Z", lastObservedAt: "2025-01-01T01:00:00Z" }] };
  await assert.rejects(refreshPrices({
    directory: "/example", read: async (path) => {
      if (path.includes("/price-history/")) throw Object.assign(new Error("Missing new shard"), { code: "ENOENT" });
      return JSON.stringify(path.endsWith("offers.json") ? { offers: [] } : currentHistory);
    },
    collect: async () => fixture(), collectRates: async () => rates,
    makeDirectory: async () => {}, write: async (path) => writes.push(path),
    move: async (from, to) => { moves.push(to); if (to.endsWith("price-history.json")) throw new Error("rename failed"); },
    remove: async (path) => deletes.push(path),
  }), /rename failed/);
  assert.ok(!moves.includes("/example/data/offers.json"));
  assert.ok(!deletes.some((path) => path.endsWith(expiredPath)));
  assert.deepEqual(deletes.sort(), writes.sort());
});


function authorizedFixture() {
  const result = fixture([quote("nebius", { collection_source: "nebius_account", account_scope: "account_quote" })]);
  result.collection_mode = "authorized";
  result.validation_policy = "visible-catalog-v1";
  for (const source of result.provider_results) {
    source.source_observations = (source.provider === "nebius" ? ["nebius_public", "nebius_account"] : [source.provider]).map((selection) => ({
      selection, status: "success", source_url: source.source_url, source_type: source.source_type,
      observed_at: observedAt, returned_count: 1, limitations: [],
    }));
  }
  return result;
}

test("authorization is explicit, environment allowlisted and child errors never expose secrets", async () => {
  const env = { ...Object.fromEntries(AUTHORIZED_SECRET_NAMES.map((name) => [name, "synthetic-secret"])),
    PATH: "/usr/bin", RANDOM_SECRET: "not-for-python", LAMBDA_SOURCE: "public", UCLOUD_PROJECT_ID: "not-for-python" };
  assert.equal(collectionMode(""), "public");
  assert.throws(() => collectionMode("other"), /must be public or authorized/);
  assert.deepEqual(collectionEnvironment("public", env), { PATH: "/usr/bin" });
  const child = collectionEnvironment("authorized", env);
  assert.equal(child.RACKRATE_LAMBDA_STORAGE_STATE_JSON, "synthetic-secret");
  assert.equal(child.RANDOM_SECRET, undefined);
  assert.equal(child.LAMBDA_SOURCE, undefined);
  assert.throws(() => collectionEnvironment("authorized", { ...env, RACKRATE_NEBIUS_ACCESS_TOKEN: "" }), /credentials/);
  let called = false;
  await assert.rejects(collectAuthorizedLibrary({ env: {}, exec: async () => { called = true; } }), /credentials/);
  assert.equal(called, false);
  await assert.rejects(collectAuthorizedLibrary({ env, exec: async () => { throw new Error("synthetic-secret response body"); } }),
    (error) => !error.message.includes("synthetic-secret") && error.message.includes("preserved"));
  const result = await collectAuthorizedLibrary({ env, exec: async (_python, args, options) => {
    assert.ok(args[0].endsWith("collect-authorized.py"));
    assert.equal(args[1], LIBRARY_VERSION);
    assert.ok(!args.join(" ").includes("synthetic-secret"));
    assert.equal(options.env.RANDOM_SECRET, undefined);
    return { stdout: JSON.stringify(authorizedFixture()) };
  } });
  assert.equal(result.collection_mode, "authorized");
});

test("authorized validation keeps known visibility limits partial and rejects missing or failed sub-sources", () => {
  const result = authorizedFixture();
  result.status = result.coverage.collection_status = "partial";
  const nebius = result.provider_results[0];
  nebius.status = nebius.source_observations[1].status = "partial";
  nebius.source_observations[1].limitations = [{ scope: "documented_public_region", status: "no_accessible_project" }];
  assert.equal(validatePublicResult(result), result);
  const output = buildRackRateDataset({}, result);
  assert.equal(output.collector.mode, "authorized");
  assert.equal(output.coverage.collection_status, "partial");
  assert.equal(output.sources[0].collectionStatus, "partial");
  for (const mutate of [
    (value) => { value.provider_results[0].source_observations.pop(); },
    (value) => { value.provider_results[0].source_observations[1].status = "failed"; },
    (value) => { value.provider_results[0].source_observations[1].limitations[0].status = "authentication_error"; },
    (value) => { value.provider_results[0].source_observations[1].returned_count = 0; },
  ]) {
    const changed = structuredClone(result); mutate(changed);
    assert.throws(() => validatePublicResult(changed));
  }
});

test("public and account observations, configurations and reserved terms remain separate without invented countries", () => {
  const result = fixture([
    quote("lambda", { visible_source: "console", source_conditions: { duration: "1-week" } }),
    quote("lambda", { visible_source: "console", source_conditions: { duration: "4-weeks" } }),
  ]);
  Object.assign(result.prices[2], { visible_source: "public", applicable_regions: ["us-test"], applicable_countries: ["US"],
    price_scope: "unlocated_catalog", price_applicability: { scope: "currently_selectable_standard_regions" } });
  const output = normalizeLibraryResult(result);
  assert.equal(output.offers.length, 7);
  assert.equal(new Set(output.offers.map((offer) => offer.id)).size, 7);
  assert.deepEqual(output.offers[2].regions, []);
  assert.deepEqual(output.offers[2].computeCountries, []);
  assert.deepEqual(output.offers[2].applicableRegions, ["us-test"]);
  assert.equal(output.offers[5].sourceConditions.duration, "1-week");
  assert.equal(output.offers[6].sourceConditions.duration, "4-weeks");
});
