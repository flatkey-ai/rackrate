import assert from "node:assert/strict";
import test from "node:test";
import { parseHyperstackPricing } from "./lib/hyperstack.mjs";

const fixture = `
  <div><span>B200</span><span>192</span><span>31</span><span>256</span><span>$6.00</span></div>
  <div><span>H200 SXM</span><span>141</span><span>22</span><span>225</span><span>$3.99</span></div>
  <div><span>H100</span><span>80</span><span>28</span><span>180</span><span>$2.50</span></div>
  <div><span>A100</span><span>80</span><span>28</span><span>120</span><span>&nbsp;$1.35</span></div>
`;

test("extracts Hyperstack on-demand rows with their node configuration", () => {
  const offers = parseHyperstackPricing(fixture, "2026-10-13T00:00:00.000Z");
  assert.equal(offers.length, 4);
  const h100 = offers.find((offer) => offer.gpuSlug === "nvidia-h100");
  assert.equal(h100.pricePerGpuHour, 2.5);
  assert.equal(h100.vcpu, 28);
  assert.equal(h100.ramGb, 180);
});

test("fails closed when the pricing table changes", () => {
  assert.throws(() => parseHyperstackPricing("no pricing rows"), /expected 4 offers/);
});
