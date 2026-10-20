import test from "node:test";
import assert from "node:assert/strict";
import { createPricingData, type Offer, type PricingDataset } from "./data.ts";

const quote = (overrides: Partial<Offer> = {}): Offer => ({
  id: "public-example-hourly", gpuSlug: "nvidia-h100", providerSlug: "example", gpuCount: null, gpuVariant: "PCIe", vramGb: 80,
  pricePerGpuUnit: 2, priceUsdPerGpuUnit: 2, pricePerGpuHour: 2, rentalType: "On-demand", region: "Not published", regions: [], zones: [], countryCode: "",
  availability: "unknown", egress: "Not published", sourceUrl: "https://example.com/prices", observedAt: "2026-10-20T08:00:00Z",
  sourceCurrency: "USD", billingUnit: "GPU-hour", quoteStatus: "quoted", priceBasis: "advertised_per_gpu", conditions: [], dataStatus: "official-page", ...overrides,
});
const dataset = (overrides: Partial<PricingDataset> = {}): PricingDataset => ({
  schemaVersion: 2, generatedAt: "2026-10-20T08:00:00Z", offers: [quote()],
  sources: [{ provider: "example", status: "ok", offerCount: 1 }],
  generatedCatalog: {
    gpus: [{ slug: "nvidia-h100", name: "H100", shortName: "H100", vendor: "NVIDIA", vramGb: null, bandwidth: null, memoryType: null }],
    providers: [{ slug: "example", name: "Example", website: "https://example.com", type: "GPU cloud" }],
  }, ...overrides,
});

test("catalog projection follows each snapshot without retaining a prior catalogue", () => {
  const first = dataset();
  const next = dataset({ generatedCatalog: { gpus: [...first.generatedCatalog!.gpus, { slug: "nvidia-future", name: "Future", shortName: "Future" }], providers: [...first.generatedCatalog!.providers, { slug: "new-platform", name: "New platform", website: "https://new.example.com" }] } });
  const originalJson = JSON.stringify(first);
  const a = createPricingData(first);
  const b = createPricingData(next);
  assert.equal(a.getGpu("nvidia-future"), undefined);
  assert.equal(b.getGpu("nvidia-future")?.name, "Future");
  assert.equal(b.getProvider("new-platform")?.name, "New platform");
  assert.equal(JSON.stringify(first), originalJson);
  assert.equal(a.getGpu("nvidia-h100")?.vramGb, null);
  assert.equal(a.getGpu("nvidia-h100")?.bandwidth, "See provider specification");
});
test("status and filters use the same original-currency monthly snapshot", () => {
  const monthly = quote({ id: "monthly", sourceCurrency: "CNY", billingUnit: "GPU-month", pricePerGpuUnit: 100, priceUsdPerGpuUnit: 15, pricePerGpuHour: null, availability: "unavailable", rentalType: "Monthly", regions: ["United States", "Finland"], region: "United States, Finland" });
  const data = createPricingData(dataset({ offers: [monthly] }));
  assert.equal(data.offers[0].pricePerGpuUnit, 100);
  assert.equal(data.offers[0].priceUsdPerGpuUnit, 15);
  assert.equal(data.offers[0].pricePerGpuHour, null);
  assert.equal(data.getCheapestOffer(), undefined);
  assert.equal(data.pricingDatasetStatus.counts.offlineOffers, 1);
  assert.deepEqual(data.getOffersForRegion("united-states").map((offer) => offer.id), ["monthly"]);
  assert.deepEqual(data.getOffersForRegion("europe").map((offer) => offer.id), ["monthly"]);
});
