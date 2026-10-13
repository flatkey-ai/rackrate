import assert from "node:assert/strict";
import test from "node:test";
import { parseNebiusPricing } from "./lib/nebius.mjs";

const fixture = `
  <p>Item</p><p>vCPUs</p><p>RAM, GB</p><p>GPU-hour</p>
  <p>NVIDIA HGX B200</p><p>20</p><p>224</p><p>$8.50</p>
  <p>NVIDIA HGX H200</p><p>16</p><p>200</p><p>$5.40</p>
  <p>NVIDIA HGX H100</p><p>16</p><p>200</p><p>$4.50</p>
  <p>NVIDIA L40S with Intel CPU</p><p>8-40</p><p>32-160</p><p>from $1.55</p>
`;

test("extracts Nebius GPU-hour rows and preserves variable configurations", () => {
  const offers = parseNebiusPricing(fixture, "2026-10-13T00:00:00.000Z");
  assert.equal(offers.length, 4);
  assert.equal(offers.find((offer) => offer.gpuSlug === "nvidia-b200").pricePerGpuHour, 8.5);
  assert.equal(offers.find((offer) => offer.gpuSlug === "nvidia-h100").ramGb, 200);
  assert.equal(offers.find((offer) => offer.gpuSlug === "nvidia-l40s").ramGb, undefined);
});

test("fails closed when the GPU-hour table changes", () => {
  assert.throws(() => parseNebiusPricing("no pricing rows"), /expected 4 offers/);
});
