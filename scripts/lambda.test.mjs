import assert from "node:assert/strict";
import test from "node:test";
import { parseLambdaPricing } from "./lib/lambda.mjs";

const fixture = `
  NVIDIA B200 SXM6 180 GB 208 2900 GiB 22 TiB SSD $6.69
  NVIDIA B200 SXM6 180 GB 104 1440 GiB 11 TiB SSD $6.79
  NVIDIA H100 SXM 80 GB 208 1800 GiB 22 TiB SSD $3.99
  NVIDIA H100 PCIe 80 GB 26 225 GiB 1 TiB SSD $3.29
  NVIDIA A100 SXM 80 GB 240 1800 GiB 19.5 TiB SSD $2.79
`;

test("keeps the lowest published per-GPU rate for each Lambda accelerator", () => {
  const offers = parseLambdaPricing(fixture, "2026-10-13T00:00:00.000Z");
  assert.equal(offers.length, 3);
  const h100 = offers.find((offer) => offer.gpuSlug === "nvidia-h100");
  assert.equal(h100.pricePerGpuHour, 3.29);
  assert.equal(h100.vcpu, 26);
  assert.equal(h100.ramGb, 225);
});

test("fails closed when Lambda changes its pricing table", () => {
  assert.throws(() => parseLambdaPricing("no pricing rows"), /expected 3 offers/);
});
