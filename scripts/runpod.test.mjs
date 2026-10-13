import assert from "node:assert/strict";
import test from "node:test";
import { parseRunpodPricing } from "./lib/runpod.mjs";

const fixture = [
  "H100 PCIe cloud GPU rental on Runpod. Community Cloud $1.99/hr, Secure Cloud $2.89/hr.",
  "H200 cloud GPU rental on Runpod. Community Cloud $3.59/hr, Secure Cloud $4.59/hr.",
  "B200 cloud GPU rental on Runpod. Community Cloud $5.98/hr, Secure Cloud $6.79/hr.",
  "A100 PCIe cloud GPU rental on Runpod. Community Cloud $1.19/hr, Secure Cloud $1.59/hr.",
  "L40S cloud GPU rental on Runpod. Community Cloud $0.79/hr, Secure Cloud $1.09/hr.",
  "4090 cloud GPU rental on Runpod. Community Cloud $0.34/hr, Secure Cloud $0.74/hr.",
].join(" ");

test("extracts normalized per-GPU hourly rates from the official pricing copy", () => {
  const offers = parseRunpodPricing(fixture, "2026-10-13T00:00:00.000Z");
  assert.equal(offers.length, 6);
  assert.equal(offers.find((offer) => offer.id === "runpod-h100-global").pricePerGpuHour, 1.99);
  assert.equal(offers.find((offer) => offer.id === "runpod-4090-global").pricePerGpuHour, 0.34);
});

test("fails closed when the upstream layout no longer matches", () => {
  assert.throws(() => parseRunpodPricing("pricing page changed"), /expected at least 5 offers/);
});
