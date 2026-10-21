import test from "node:test";
import assert from "node:assert/strict";
import { collectionIsDue, shouldCollectPrices } from "./daily-refresh.mjs";
import { REQUIRED_PROVIDERS } from "./lib/library.mjs";

function snapshot(collectedAt) {
  const prices = REQUIRED_PROVIDERS.map((provider) => ({ provider, gpu_model: "H100", amount: "1.25",
    currency: "USD", unit: "gpu_hour", observed_at: collectedAt }));
  return { schema_version: 1, status: "success", collected_at: collectedAt, prices,
    provider_results: REQUIRED_PROVIDERS.map((provider) => ({ provider, status: "success", error: null,
      returned_count: 1, observed_at: collectedAt })),
    coverage: { collection_status: "success", scope: "returned_quotes", excluded_quote_indices: [],
      extra_models: [], models: [{ gpu_model: "H100", quote_indices: prices.map((_, index) => index) }] },
  };
}
// Synthetic CSV fixture, not an application-side serializer. Quotes include a
// comma and newline so physical-line counting cannot define record validity.
function csvFor(collectedAt, { bilingual = true } = {}) {
  const header = bilingual
    ? "provider（平台）,gpu_model（GPU型号）,amount（原币价格）,currency（币种）,unit（计费单位）,price_scope（地区价格范围）,availability（可用状态）,observed_at（报价采集时间）,notes（备注）,collected_at（批次采集时间）,collection_status（采集状态）"
    : "provider,gpu_model,amount,currency,unit,price_scope,availability,observed_at,notes,collected_at,collection_status";
  return "\uFEFF" + [header, ...REQUIRED_PROVIDERS.map((provider) =>
    `${provider},H100,1.25,USD,gpu_hour,unlocated_catalog,unknown,${collectedAt},"detail, note\r\ncontinued",${collectedAt},success`)].join("\r\n") + "\r\n";
}
const now = new Date("2026-10-20T02:45:00Z");

test("one verified post-10:30 Shanghai JSON and same-batch CSV prevents duplicate collections", () => {
  for (const [collectedAt, due] of [
    ["2026-10-20T02:30:00Z", false], ["2026-10-20T02:29:59Z", true], ["2026-10-19T03:00:00Z", true],
  ]) {
    assert.equal(collectionIsDue(snapshot(collectedAt), now, csvFor(collectedAt)), due);
  }
});

test("failed, future, incomplete or malformed JSON cannot suppress a fresh collection", () => {
  const collectedAt = "2026-10-20T02:40:00Z";
  assert.equal(collectionIsDue(null, now, csvFor(collectedAt)), true);
  assert.equal(collectionIsDue({ ...snapshot(collectedAt), status: "partial" }, now, csvFor(collectedAt)), true);
  const incomplete = snapshot(collectedAt);
  incomplete.provider_results.pop();
  assert.equal(collectionIsDue(incomplete, now, csvFor(collectedAt)), true);
  const invalidCoverage = snapshot(collectedAt);
  invalidCoverage.coverage.models[0].quote_indices.pop();
  assert.equal(collectionIsDue(invalidCoverage, now, csvFor(collectedAt)), true);
  const future = "2026-10-20T03:00:00Z";
  assert.equal(collectionIsDue(snapshot(future), now, csvFor(future)), true);
});

test("missing or invalid CSV refreshes an already successful JSON-only collection", () => {
  const collectedAt = "2026-10-20T02:40:00Z";
  const complete = snapshot(collectedAt);
  const csv = csvFor(collectedAt);
  for (const invalid of [undefined, null, "", csv.slice(1), csv.replaceAll("\r\n", "\n"),
    csv.replace("price_scope", "region"), csv.slice(0, csv.indexOf("\r\n") + 2)]) {
    assert.equal(collectionIsDue(complete, now, invalid), true);
    assert.equal(shouldCollectPrices(complete, { now, csv: invalid }), true);
  }
});

test("a CSV from an earlier batch or with different exact batch time triggers collection", () => {
  const collectedAt = "2026-10-20T02:40:00Z";
  const complete = snapshot(collectedAt);
  for (const bilingual of [true, false]) {
    assert.equal(collectionIsDue(complete, now, csvFor("2026-10-19T03:00:00Z", { bilingual })), true);
    assert.equal(collectionIsDue(complete, now, csvFor("2026-10-20T02:30:00Z", { bilingual })), true);
    assert.equal(collectionIsDue(complete, now, csvFor("2026-10-20T02:40:00.000Z", { bilingual })), true);
    assert.equal(collectionIsDue(complete, now, csvFor(collectedAt, { bilingual }).replaceAll(",success\r\n", ",partial\r\n")), true);
    assert.equal(collectionIsDue(complete, now, csvFor(collectedAt, { bilingual })), false);
  }
});

test("same-batch legacy English CSV remains valid during bilingual-header rollout", () => {
  const collectedAt = "2026-10-20T02:40:00Z";
  const complete = snapshot(collectedAt);
  assert.equal(shouldCollectPrices(complete, { now, csv: csvFor(collectedAt) }), false);
  assert.equal(shouldCollectPrices(complete, { now, csv: csvFor(collectedAt, { bilingual: false }) }), false);
  assert.equal(collectionIsDue(complete, now, csvFor(collectedAt).replace("collection_status（采集状态）", "status（采集状态）")), true);
});

test("a prior five-source run cannot suppress the expanded nine-source collection", () => {
  const collectedAt = "2026-10-20T02:40:00Z";
  const previous = snapshot(collectedAt);
  previous.provider_results = previous.provider_results.slice(0, 5);
  assert.equal(collectionIsDue(previous, now, csvFor(collectedAt)), true);
});

test("force refresh only bypasses daily deduplication for explicit manual runs", () => {
  const collectedAt = "2026-10-20T02:40:00Z";
  const options = { now, ref: "refs/heads/main", csv: csvFor(collectedAt) };
  const complete = snapshot(collectedAt);
  assert.equal(shouldCollectPrices(complete, { ...options, eventName: "workflow_dispatch", forceRefresh: true }), true);
  assert.equal(shouldCollectPrices(complete, { ...options, eventName: "workflow_dispatch", forceRefresh: "true" }), true);
  assert.equal(shouldCollectPrices(complete, { ...options, eventName: "workflow_dispatch", forceRefresh: "false" }), false);
  assert.equal(shouldCollectPrices(complete, { ...options, eventName: "schedule", forceRefresh: true }), false);
  assert.equal(shouldCollectPrices(complete, { ...options, eventName: "push", forceRefresh: true }), false);
  assert.equal(shouldCollectPrices(complete, { ...options, ref: "refs/heads/codex/test", eventName: "workflow_dispatch" }), true);
});
