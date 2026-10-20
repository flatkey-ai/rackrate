import test from "node:test";
import assert from "node:assert/strict";
import { appendPriceHistory } from "./lib/history.mjs";

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

test("snapshot stores FX provenance once and keeps 180 daily full-catalog snapshots below repository limits", () => {
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
  assert.ok(Buffer.byteLength(serialized) * 180 < 80 * 1024 * 1024);
});

