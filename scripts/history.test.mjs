import test from "node:test";
import assert from "node:assert/strict";
import { appendPriceHistory } from "./lib/history.mjs";
import { MAX_HISTORY_SHARD_BYTES, planPriceHistory } from "./lib/history-storage.mjs";

test("appendPriceHistory deduplicates timestamps and expires old snapshots", () => {
  const dataset = { generatedAt: "2026-10-14T00:00:00.000Z", offers: [{ id: "x", pricePerGpuHour: 1.2, availability: "available", dataStatus: "official-page" }] };
  const history = appendPriceHistory({ snapshots: [
    { observedAt: "2026-01-01T00:00:00.000Z", offers: [] },
    { observedAt: dataset.generatedAt, offers: [] },
  ] }, dataset);
  assert.equal(history.snapshots.length, 1);
  assert.deepEqual(history.snapshots[0].offers[0], dataset.offers[0]);
});

test("history keeps native monthly currencies and contact-sales nulls", () => {
  const dataset = { generatedAt: "2026-10-20T08:00:00Z", offers: [
    { id: "monthly", pricePerGpuHour: null, pricePerGpuUnit: 467.79, sourceAmount: "467.79", sourceCurrency: "CNY", billingUnit: "GPU-month", quoteStatus: "quoted", priceBasis: "instance_total_allocated", availability: "unavailable", dataStatus: "official-page" },
    { id: "contact", pricePerGpuHour: null, pricePerGpuUnit: null, sourceAmount: null, sourceCurrency: "USD", billingUnit: "GPU-hour", quoteStatus: "contact_sales", priceBasis: "advertised_per_gpu", availability: "unknown", dataStatus: "official-page" },
  ] };
  const result = appendPriceHistory({ snapshots: [] }, dataset);
  assert.equal(result.schemaVersion, 2);
  assert.equal(result.snapshots[0].offers[0].sourceCurrency, "CNY");
  assert.equal(result.snapshots[0].offers[0].billingUnit, "GPU-month");
  assert.equal(result.snapshots[0].offers[0].pricePerGpuHour, null);
  assert.equal(result.snapshots[0].offers[1].pricePerGpuUnit, null);
  assert.equal(result.snapshots[0].offers[1].quoteStatus, "contact_sales");
});

test("snapshot stores FX provenance once per actual source observation", () => {
  const fx = {
    sourceName: "European Central Bank reference rates",
    sourceUrl: "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
    rateDate: "2026-10-19", observedAt: "2026-10-20T08:00:00Z",
    targetCurrency: "USD", ratesToUsd: { USD: "1", CNY: "0.150000000000000000" },
    formula: "native amount × (USD per EUR ÷ source currency per EUR)",
  };
  const offers = Array.from({ length: 754 }, (_, index) => ({
    id: `public-provider-${index.toString().padStart(24, "0")}`,
    pricePerGpuHour: null, pricePerGpuUnit: 467.79, sourceAmount: "467.790000000000",
    sourceCurrency: "CNY", billingUnit: "GPU-month", quoteStatus: "quoted",
    priceBasis: "instance_total_allocated", pricingTier: null, cloudTier: null,
    priceUsdPerGpuUnit: 70.1685, usdSourceAmount: "70.168500000000", fx: { ...fx, sourceCurrency: "CNY" },
    availability: "unavailable", dataStatus: "official-page",
  }));
  const dataset = { generatedAt: "2026-10-20T08:00:00Z", fx, offers };
  const { snapshots: [snapshot] } = appendPriceHistory({ snapshots: [] }, dataset);
  assert.deepEqual(snapshot.fx, fx);
  assert.ok(snapshot.offers.every((offer) => !Object.hasOwn(offer, "fx")));
  assert.equal(snapshot.offers[0].sourceCurrency, "CNY");
  assert.equal(snapshot.offers[0].priceUsdPerGpuUnit, 70.1685);
  const serialized = JSON.stringify(snapshot);
  assert.equal(serialized.split(fx.sourceUrl).length - 1, 1);
  assert.ok(Buffer.byteLength(serialized) < MAX_HISTORY_SHARD_BYTES);
});

const dataset = (time, offers = [{ id: "test", observedAt: time, pricePerGpuHour: 1,
  availability: "available", dataStatus: "official-page" }]) => ({ generatedAt: time, offers });
const missing = async () => { const error = new Error("not found"); error.code = "ENOENT"; throw error; };
const blank = () => ({ schemaVersion: 2, retentionDays: 180, snapshots: [] });
const savedPlan = (plan) => new Map(plan.writes.map((write) => [write.path, write.contents]));
const storedReader = (files, calls = []) => async (path) => {
  calls.push(path);
  if (!files.has(path)) return missing();
  return files.get(path);
};

test("source observations across midnight create distinct UTC shards without rewriting their timestamps", async () => {
  const time = "2026-10-24T00:01:00Z";
  const before = "2026-10-23T23:59:59.123456+00:00";
  const after = "2026-10-24T00:00:01.234567+00:00";
  const plan = await planPriceHistory(blank(), dataset(time, [
    { ...dataset(time).offers[0], id: "before", observedAt: before },
    { ...dataset(time).offers[0], id: "after", observedAt: after },
  ]), { readShard: missing });
  assert.equal(plan.index.schemaVersion, 3);
  assert.deepEqual(plan.index.shards.map((entry) => entry.date), ["2026-10-23", "2026-10-24"]);
  assert.deepEqual(plan.writes.map((entry) => entry.value.snapshots[0].observedAt), [before, after]);
  assert.ok(plan.index.shards.every((entry) => !Object.hasOwn(entry, "offers")));
});

test("schema 2 migration preserves all retained legacy offers, FX, metadata and original times", async () => {
  const original = { schemaVersion: 2, retentionDays: 180, snapshots: [
    { observedAt: "2026-10-21T16:00:00.123Z", note: "retained legacy metadata", fx: { ratesToUsd: { CNY: "0.14" } },
      offers: [{ id: "monthly", sourceCurrency: "CNY", sourceAmount: "400", pricePerGpuHour: null, billingUnit: "GPU-month", customLegacyField: 4 }] },
    { observedAt: "2026-10-22T09:00:00Z", offers: [{ id: "sales", sourceAmount: null, quoteStatus: "contact_sales" }] },
  ] };
  const plan = await planPriceHistory(original, dataset("2026-10-23T00:00:00Z"), { readShard: missing });
  const migrated = plan.writes.flatMap((entry) => entry.value.snapshots);
  assert.deepEqual(migrated.slice(0, 2), original.snapshots);
  assert.equal(plan.index.shards.reduce((sum, entry) => sum + entry.offerCount, 0), 3);
  assert.deepEqual(plan.deletes, []);
  assert.equal(original.schemaVersion, 2);
});

test("replay deduplicates source timestamps and IDs; later collection time creates no new observation", async () => {
  const first = await planPriceHistory(blank(), dataset("2026-10-23T01:00:00Z"), { readShard: missing });
  const files = savedPlan(first);
  const replay = await planPriceHistory(first.index, dataset("2026-10-23T02:00:00Z", dataset("2026-10-23T01:00:00Z").offers),
    { readShard: storedReader(files) });
  assert.deepEqual(replay.index, first.index);
  assert.deepEqual(replay.writes, []);
  const other = { ...dataset("2026-10-23T01:00:00Z").offers[0], id: "another-source" };
  const added = await planPriceHistory(first.index, dataset("2026-10-23T02:00:00Z", [other]),
    { readShard: storedReader(files) });
  assert.equal(added.writes[0].value.snapshots.length, 1);
  assert.deepEqual(added.writes[0].value.snapshots[0].offers.map((offer) => offer.id), ["test", "another-source"]);
});

test("rollover removes expired shards without reading them and trims the exact 180-day boundary", async () => {
  const now = new Date("2026-10-23T12:00:00Z");
  const cutoff = new Date(now.getTime() - 180 * 86400000).toISOString();
  const before = new Date(Date.parse(cutoff) - 1000).toISOString();
  const old = new Date(Date.parse(cutoff) - 86400000).toISOString();
  const source = { schemaVersion: 2, snapshots: [old, before, cutoff].map((observedAt) =>
    ({ observedAt, offers: [{ id: observedAt, sourceAmount: "1" }] })) };
  const first = await planPriceHistory(source, dataset(before), { readShard: missing, now: new Date(before) });
  const files = savedPlan(first), reads = [];
  const plan = await planPriceHistory(first.index, dataset(now.toISOString()), { readShard: storedReader(files, reads), now });
  assert.deepEqual(plan.deletes, [`price-history/${old.slice(0, 10)}.json`]);
  assert.ok(!reads.includes(plan.deletes[0]));
  const boundary = plan.writes.find((entry) => entry.value.date === cutoff.slice(0, 10));
  assert.deepEqual(boundary.value.snapshots.map((entry) => entry.observedAt), [cutoff]);
  assert.equal(plan.index.retentionDays, 180);
});

test("interrupted migration or append recovers an already-written but unindexed day", async () => {
  const first = await planPriceHistory(blank(), dataset("2026-10-23T01:00:00Z"), { readShard: missing });
  const recovered = await planPriceHistory({ schemaVersion: 3, retentionDays: 180, shards: [] },
    dataset("2026-10-23T02:00:00Z"), { readShard: storedReader(savedPlan(first)) });
  assert.deepEqual(recovered.writes[0].value.snapshots.map((entry) => entry.observedAt),
    ["2026-10-23T01:00:00Z", "2026-10-23T02:00:00Z"]);
  assert.equal(recovered.index.shards[0].offerCount, 2);
});

test("a valid late observation revives the cutoff day without deleting its replacement shard", async () => {
  const now = new Date("2026-10-23T12:00:00Z");
  const cutoff = new Date(now.getTime() - 180 * 86400000).toISOString();
  const before = new Date(Date.parse(cutoff) - 1000).toISOString();
  const first = await planPriceHistory(blank(), dataset(before), { readShard: missing });
  const plan = await planPriceHistory(first.index, dataset(now.toISOString(), dataset(cutoff).offers),
    { readShard: storedReader(savedPlan(first)), now });
  assert.deepEqual(plan.deletes, []);
  assert.equal(plan.index.shards.length, 1);
  assert.equal(plan.writes[0].path, first.writes[0].path);
  assert.deepEqual(plan.writes[0].value.snapshots.map((entry) => entry.observedAt), [cutoff]);
});

test("indexed missing or malformed shards and traversal descriptors fail instead of dropping records", async () => {
  const initial = await planPriceHistory(blank(), dataset("2026-10-23T01:00:00Z"), { readShard: missing });
  await assert.rejects(planPriceHistory(initial.index, dataset("2026-10-23T02:00:00Z"), { readShard: missing }), /not found/);
  await assert.rejects(planPriceHistory(initial.index, dataset("2026-10-23T02:00:00Z"),
    { readShard: async () => JSON.stringify({ schemaVersion: 3, date: "2026-10-22", snapshots: [] }) }), /invalid daily shard/);
  const invalid = structuredClone(initial.index);
  invalid.shards[0].path = "../../secret.json";
  await assert.rejects(planPriceHistory(invalid, dataset("2026-10-23T02:00:00Z"), { readShard: missing }), /invalid shard descriptor/);
  await assert.rejects(planPriceHistory(blank(), dataset("2026-10-23T02:00:00Z", [{ id: "bad", observedAt: "not-a-date" }]),
    { readShard: missing }), /invalid observation timestamp/);
});

test("day-size limit rejects the whole plan and never trims snapshots to fit", async () => {
  const input = dataset("2026-10-23T02:00:00Z", Array.from({ length: 100 }, (_, i) =>
    ({ ...dataset("2026-10-23T02:00:00Z").offers[0], id: `gpu-${i}` })));
  await assert.rejects(planPriceHistory(blank(), input, { readShard: missing, maxShardBytes: 1000 }), /day exceeds/);
  assert.equal(input.offers.length, 100);
  await assert.rejects(planPriceHistory(blank(), input, { readShard: missing, maxShardBytes: MAX_HISTORY_SHARD_BYTES + 1 }), /Invalid price-history storage limits/);
});

test("7479-offer daily catalogs keep each file bounded and updating does not load 180 days", async () => {
  const time = "2026-10-23T12:00:00Z";
  const offers = Array.from({ length: 7479 }, (_, index) => ({
    ...dataset(time).offers[0], id: `platform-instance-${index.toString().padStart(24, "0")}`,
    pricePerGpuUnit: 1.2, sourceAmount: "1.200000000000", sourceCurrency: "USD", billingUnit: "GPU-hour",
    quoteStatus: "quoted", priceBasis: "instance_total_allocated", priceUsdPerGpuUnit: 1.2, usdSourceAmount: "1.200000000000",
  }));
  const first = await planPriceHistory(blank(), dataset(time, offers), { readShard: missing });
  const day = first.writes[0];
  assert.ok(Buffer.byteLength(day.contents) < MAX_HISTORY_SHARD_BYTES);
  // The former monolith would exceed GitHub's per-file limit for this catalog.
  assert.ok(Buffer.byteLength(day.contents) * 180 > 100 * 1024 * 1024);
  const shards = Array.from({ length: 180 }, (_, i) => {
    const observedAt = new Date(Date.parse(time) - i * 86400000).toISOString();
    const date = observedAt.slice(0, 10);
    return { ...first.index.shards[0], date, path: `price-history/${date}.json`, firstObservedAt: observedAt, lastObservedAt: observedAt };
  });
  const reads = [];
  const plan = await planPriceHistory({ schemaVersion: 3, retentionDays: 180, shards }, dataset(time, offers),
    { readShard: storedReader(savedPlan(first), reads) });
  assert.deepEqual(reads, [day.path]);
  assert.equal(plan.index.shards.length, 180);
  assert.ok(Buffer.byteLength(JSON.stringify(plan.index)) < 128 * 1024);
  assert.deepEqual(plan.writes, []);
});

