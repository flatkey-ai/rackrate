import test from "node:test";
import assert from "node:assert/strict";
import { collectVast, parseVastOffers } from "./lib/vast.mjs";

const fixture = {
  offers: [
    { id: 1, gpu_name: "H100 SXM", num_gpus: 8, dph_total: 16, cpu_cores_effective: 96, cpu_ram: 1048576, geolocation: "Mumbai, IN", rentable: true, rented: false },
    { id: 2, gpu_name: "H100 SXM", num_gpus: 4, dph_total: 6, cpu_cores_effective: 64, cpu_ram: 524288, geolocation: "Delhi, IN", rentable: true, rented: false },
    { id: 3, gpu_name: "RTX 4090", num_gpus: 2, dph_total: 0.7, cpu_cores: 24, cpu_ram: 131072, geolocation: "Paris, FR", rentable: true, rented: false, internet_down_cost_per_tb: 3 },
    { id: 4, gpu_name: "A100", gpu_ram: 40960, num_gpus: 1, dph_total: 0.5, geolocation: "Chicago, US", rentable: true, rented: false },
    { id: 5, gpu_name: "A100", gpu_ram: 81920, num_gpus: 1, dph_total: 0.9, geolocation: "Dallas, US", rentable: true, rented: false },
  ],
};

test("parseVastOffers keeps the cheapest supported offer per GPU market", () => {
  const offers = parseVastOffers(fixture, "2026-10-14T00:00:00.000Z");
  assert.equal(offers.length, 3);
  assert.equal(offers.find((offer) => offer.id === "vast-h100-in").pricePerGpuHour, 1.5);
  assert.equal(offers.find((offer) => offer.id === "vast-rtx-4090-fr").egress, "$3.00/TB down");
  assert.equal(offers.find((offer) => offer.id === "vast-a100-80gb-us").pricePerGpuHour, 0.9);
});

test("collectVast is optional without a token", async () => {
  assert.equal(await collectVast(""), null);
});

