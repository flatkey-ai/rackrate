import test from "node:test";
import assert from "node:assert/strict";
import { collectionIsDue, shouldCollectPrices } from "./daily-refresh.mjs";
import { LIBRARY_VERSION, REQUIRED_PROVIDERS } from "./lib/library.mjs";
import { compactPricesToCsv } from "./lib/compact-csv.mjs";

function snapshot(collectedAt) {
  const prices = REQUIRED_PROVIDERS.map((provider) => ({ provider, gpu_model: "H100", amount: "1.25",
    currency: "USD", unit: "gpu_hour", observed_at: collectedAt }));
  return { schema_version: 1, status: "success", collected_at: collectedAt, prices,
    execution: { runtime: "python", parsing: "deterministic_rules", uses_llm: false, source_policy: "api_preferred" },
    provider_results: REQUIRED_PROVIDERS.map((provider) => ({ provider, status: "success", error: null,
      returned_count: 1, observed_at: collectedAt })),
    coverage: { collection_status: "success", scope: "returned_quotes", excluded_quote_indices: [],
      extra_models: [], models: [{ gpu_model: "H100", quote_indices: prices.map((_, index) => index) }] },
  };
}
// Synthetic CSV fixture, not an application-side serializer. Quotes include a
// comma and newline so physical-line counting cannot define record validity.
function csvFor(collectedAt, { bilingual = true, providers = REQUIRED_PROVIDERS } = {}) {
  const header = bilingual
    ? "provider（平台）,gpu_model（GPU型号）,amount（原币价格）,currency（币种）,unit（计费单位）,price_scope（地区价格范围）,availability（可用状态）,observed_at（报价采集时间）,notes（备注）,collected_at（批次采集时间）,collection_status（采集状态）"
    : "provider,gpu_model,amount,currency,unit,price_scope,availability,observed_at,notes,collected_at,collection_status";
  return "\uFEFF" + [header, ...providers.map((provider) =>
    `${provider},H100,1.25,USD,gpu_hour,unlocated_catalog,unknown,${collectedAt},"detail, note\r\ncontinued",${collectedAt},success`)].join("\r\n") + "\r\n";
}
function artifactsFor(collectedAt, options = {}) {
  const dataset = {
    schemaVersion: 2, generatedAt: collectedAt,
    collector: { name: "gpu-price-monitor", version: LIBRARY_VERSION },
    generatedCatalog: { providers: REQUIRED_PROVIDERS.map((slug) => ({ slug, name: slug })) },
    offers: REQUIRED_PROVIDERS.map((providerSlug) => ({
      id: providerSlug, providerSlug, gpuSlug: "nvidia-h100", gpuModel: "H100",
      sourceAmount: "1.25", sourceCurrency: "USD", usdSourceAmount: "1.25",
      pricePerGpuUnit: 1.25, priceUsdPerGpuUnit: 1.25, priceBasis: "advertised_per_gpu",
      billingUnit: "GPU-hour", billingMode: "on_demand", quoteStatus: "quoted", dataStatus: "official-page",
      priceScope: "regional_quote", regions: ["synthetic-region1"], computeCountries: ["US"],
      sourceAvailability: "unknown", sourceUrl: `https://example.com/${providerSlug}/pricing`,
      observedAt: collectedAt,
    })),
  };
  return { csv: csvFor(collectedAt, options), compactCsv: compactPricesToCsv(dataset), dataset };
}
const now = new Date("2026-10-20T02:45:00Z");
const due = (current, artifacts) => collectionIsDue(current, now, artifacts.csv, artifacts);

test("only verified post-10:30 Shanghai raw and strict artifacts from one batch prevent collection", () => {
  for (const [collectedAt, due] of [
    ["2026-10-20T02:30:00Z", false], ["2026-10-20T02:29:59Z", true], ["2026-10-19T03:00:00Z", true],
  ]) {
    const artifacts = artifactsFor(collectedAt);
    assert.equal(collectionIsDue(snapshot(collectedAt), now, artifacts.csv, artifacts), due);
  }
});

test("failed, future, incomplete or malformed JSON cannot suppress a fresh collection", () => {
  const collectedAt = "2026-10-20T02:40:00Z";
  const artifacts = artifactsFor(collectedAt);
  assert.equal(due(null, artifacts), true);
  assert.equal(due({ ...snapshot(collectedAt), status: "partial" }, artifacts), true);
  const incomplete = snapshot(collectedAt);
  incomplete.provider_results.pop();
  assert.equal(due(incomplete, artifacts), true);
  const invalidCoverage = snapshot(collectedAt);
  invalidCoverage.coverage.models[0].quote_indices.pop();
  assert.equal(due(invalidCoverage, artifacts), true);
  const future = "2026-10-20T03:00:00Z";
  assert.equal(due(snapshot(future), artifactsFor(future)), true);
});

test("missing or invalid CSV refreshes an already successful JSON-only collection", () => {
  const collectedAt = "2026-10-20T02:40:00Z";
  const complete = snapshot(collectedAt);
  const artifacts = artifactsFor(collectedAt), csv = artifacts.csv;
  for (const invalid of [undefined, null, "", csv.slice(1), csv.replaceAll("\r\n", "\n"),
    csv.replace("price_scope", "region"), csv.slice(0, csv.indexOf("\r\n") + 2)]) {
    assert.equal(due(complete, { ...artifacts, csv: invalid }), true);
    assert.equal(shouldCollectPrices(complete, { now, ...artifacts, csv: invalid }), true);
  }
});

test("a CSV from an earlier batch or with different exact batch time triggers collection", () => {
  const collectedAt = "2026-10-20T02:40:00Z";
  const complete = snapshot(collectedAt);
  for (const bilingual of [true, false]) {
    const artifacts = artifactsFor(collectedAt, { bilingual });
    assert.equal(due(complete, { ...artifacts, csv: csvFor("2026-10-19T03:00:00Z", { bilingual }) }), true);
    assert.equal(due(complete, { ...artifacts, csv: csvFor("2026-10-20T02:30:00Z", { bilingual }) }), true);
    assert.equal(due(complete, { ...artifacts, csv: csvFor("2026-10-20T02:40:00.000Z", { bilingual }) }), true);
    assert.equal(due(complete, { ...artifacts, csv: artifacts.csv.replaceAll(",success\r\n", ",partial\r\n") }), true);
    assert.equal(due(complete, artifacts), false);
  }
});

test("same-batch legacy English CSV remains valid during bilingual-header rollout", () => {
  const collectedAt = "2026-10-20T02:40:00Z";
  const complete = snapshot(collectedAt), artifacts = artifactsFor(collectedAt);
  assert.equal(shouldCollectPrices(complete, { now, ...artifacts }), false);
  assert.equal(shouldCollectPrices(complete, { now, ...artifacts, csv: csvFor(collectedAt, { bilingual: false }) }), false);
  assert.equal(due(complete, { ...artifacts, csv: artifacts.csv.replace("collection_status（采集状态）", "status（采集状态）") }), true);
});

test("a prior five-source run cannot suppress the expanded nine-source collection", () => {
  const collectedAt = "2026-10-20T02:40:00Z";
  const previous = snapshot(collectedAt);
  previous.provider_results = previous.provider_results.slice(0, 5);
  assert.equal(due(previous, artifactsFor(collectedAt)), true);
});

test("the old audit-only signature cannot suppress the strict CSV rollout", () => {
  const collectedAt = "2026-10-20T02:40:00Z", complete = snapshot(collectedAt);
  assert.equal(collectionIsDue(complete, now, csvFor(collectedAt)), true);
  assert.equal(shouldCollectPrices(complete, { now, csv: csvFor(collectedAt) }), true);
});

test("missing, empty, legacy or edited strict CSV always requires collection", () => {
  const collectedAt = "2026-10-20T02:40:00Z", complete = snapshot(collectedAt);
  const artifacts = artifactsFor(collectedAt), strict = artifacts.compactCsv;
  for (const compactCsv of [undefined, null, "", strict.slice(1), strict.replaceAll("\r\n", "\n"),
    strict.slice(0, strict.indexOf("\r\n") + 2), artifacts.csv, strict.replace("1.25", "1.26")]) {
    assert.equal(due(complete, { ...artifacts, compactCsv }), true);
    assert.equal(shouldCollectPrices(complete, { now, ...artifacts, compactCsv }), true);
  }
});

test("offers must have the current collector version and the exact raw batch timestamp", () => {
  const collectedAt = "2026-10-20T02:40:00Z", complete = snapshot(collectedAt);
  const artifacts = artifactsFor(collectedAt);
  for (const dataset of [undefined, null, {}, { ...artifacts.dataset, collector: undefined },
    { ...artifacts.dataset, collector: { version: "0.10.0" } },
    { ...artifacts.dataset, generatedAt: "2026-10-20T02:30:00Z" },
    { ...artifacts.dataset, generatedAt: "2026-10-20T02:40:00.000Z" },
    { ...artifacts.dataset, offers: [] }, { ...artifacts.dataset, offers: null }]) {
    assert.equal(due(complete, { ...artifacts, dataset }), true);
  }
  const oldBatch = artifactsFor("2026-10-20T02:30:00Z");
  assert.equal(due(complete, { ...artifacts, dataset: oldBatch.dataset, compactCsv: oldBatch.compactCsv }), true);
});

test("strict data must exactly match the offers artifact and contain eligible rows", () => {
  const collectedAt = "2026-10-20T02:40:00Z", complete = snapshot(collectedAt);
  const artifacts = artifactsFor(collectedAt);
  const changed = structuredClone(artifacts.dataset);
  changed.offers[0].sourceAmount = "2.5";
  changed.offers[0].pricePerGpuUnit = 2.5;
  changed.offers[0].usdSourceAmount = "2.5";
  changed.offers[0].priceUsdPerGpuUnit = 2.5;
  assert.equal(due(complete, { ...artifacts, dataset: changed }), true);
  const empty = { ...artifacts.dataset, offers: [] };
  assert.equal(due(complete, { ...artifacts, dataset: empty, compactCsv: compactPricesToCsv(empty) }), true);
  const monthlyOnly = { ...artifacts.dataset, offers: artifacts.dataset.offers.map((offer) =>
    ({ ...offer, billingUnit: "GPU-month", billingMode: "monthly" })) };
  assert.equal(due(complete, { ...artifacts, dataset: monthlyOnly, compactCsv: compactPricesToCsv(monthlyOnly) }), true);
});

test("every raw CSV record must belong to the offers batch even with quoted multiline notes", () => {
  const collectedAt = "2026-10-20T02:40:00Z", complete = snapshot(collectedAt);
  const artifacts = artifactsFor(collectedAt), previous = "2026-10-20T02:30:00Z";
  const mixedBatch = artifacts.csv.replace(`,${collectedAt},success\r\n`, `,${previous},success\r\n`);
  const spoofedNote = csvFor(previous).replace("detail, note\r\ncontinued",
    `detail, note,${collectedAt},success\r\ncontinued`);
  const extraRows = artifacts.csv + artifacts.csv.slice(artifacts.csv.indexOf("\r\n") + 2);
  for (const csv of [mixedBatch, spoofedNote, extraRows,
    csvFor(collectedAt, { providers: REQUIRED_PROVIDERS.slice(1) }),
    artifacts.csv.replace('"detail, note\r\ncontinued"', '"unterminated note')]) {
    assert.equal(due(complete, { ...artifacts, csv }), true);
  }
  assert.equal(due(complete, artifacts), false);
});

test("force refresh only bypasses daily deduplication for explicit manual runs", () => {
  const collectedAt = "2026-10-20T02:40:00Z";
  const options = { now, ref: "refs/heads/main", ...artifactsFor(collectedAt) };
  const complete = snapshot(collectedAt);
  assert.equal(shouldCollectPrices(complete, { ...options, eventName: "workflow_dispatch", forceRefresh: true }), true);
  assert.equal(shouldCollectPrices(complete, { ...options, eventName: "workflow_dispatch", forceRefresh: "true" }), true);
  assert.equal(shouldCollectPrices(complete, { ...options, eventName: "workflow_dispatch", forceRefresh: "false" }), false);
  assert.equal(shouldCollectPrices(complete, { ...options, eventName: "schedule", forceRefresh: true }), false);
  assert.equal(shouldCollectPrices(complete, { ...options, eventName: "push", forceRefresh: true }), false);
  assert.equal(shouldCollectPrices(complete, { ...options, ref: "refs/heads/codex/test", eventName: "workflow_dispatch" }), true);
  assert.equal(shouldCollectPrices(null, { now, ref: "refs/heads/codex/test", eventName: "push" }), true);
});
