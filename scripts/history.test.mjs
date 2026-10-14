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

