import test from "node:test";
import assert from "node:assert/strict";
import { COMPETITOR_PROVIDER_SLUGS, createPricingData, prioritizeGpuCatalog, type Offer, type PricingDataset } from "./data.ts";

const quote = (overrides: Partial<Offer> = {}): Offer => ({
  id: "public-example-hourly", gpuSlug: "nvidia-h100", providerSlug: "nebius", gpuCount: null, gpuVariant: "PCIe", vramGb: 80,
  pricePerGpuUnit: 2, priceUsdPerGpuUnit: 2, pricePerGpuHour: 2, rentalType: "On-demand", region: "eu-north1", regions: ["eu-north1"], zones: [], countryCode: "FI", computeCountries: ["FI"], priceScope: "regional_quote",
  availability: "unknown", egress: "Not published", sourceUrl: "https://example.com/prices", observedAt: "2026-10-20T08:00:00Z",
  sourceAmount: "2", sourceCurrency: "USD", billingUnit: "GPU-hour", quoteStatus: "quoted", priceBasis: "advertised_per_gpu", conditions: [], dataStatus: "official-page", ...overrides,
});
const dataset = (overrides: Partial<PricingDataset> = {}): PricingDataset => ({
  schemaVersion: 2, generatedAt: "2026-10-20T08:00:00Z", offers: [quote()],
  sources: [{ provider: "nebius", status: "ok", offerCount: 1 }],
  generatedCatalog: {
    gpus: [{ slug: "nvidia-h100", name: "H100", shortName: "H100", vendor: "NVIDIA", vramGb: null, bandwidth: null, memoryType: null }],
    providers: [{ slug: "nebius", name: "Nebius", website: "https://nebius.com", type: "GPU cloud" }],
  }, ...overrides,
});

test("H100, H200, B200 and B300 lead the first four models without reordering the remaining catalog", () => {
  const slugs = ["nvidia-a100", "nvidia-b300", "amd-mi300x", "nvidia-h200", "nvidia-h100", "nvidia-b200", "nvidia-t4"];
  const catalog = slugs.map((slug) => ({ slug }));
  assert.deepEqual(prioritizeGpuCatalog(catalog).map((gpu) => gpu.slug), [
    "nvidia-h100", "nvidia-h200", "nvidia-b200", "nvidia-b300", "nvidia-a100", "amd-mi300x", "nvidia-t4",
  ]);
  assert.deepEqual(catalog.map((gpu) => gpu.slug), slugs);
  assert.deepEqual(prioritizeGpuCatalog([{ slug: "nvidia-a100" }]), [{ slug: "nvidia-a100" }]);
});

test("catalog projection follows each snapshot without retaining a prior catalogue", () => {
  const first = dataset();
  const next = dataset({
    offers: [...first.offers, quote({ id: "future", gpuSlug: "nvidia-future", providerSlug: "lambda" })],
    generatedCatalog: {
      gpus: [...first.generatedCatalog!.gpus, { slug: "nvidia-future", name: "Future", shortName: "Future" }, { slug: "nvidia-unquoted", name: "Unquoted", shortName: "Unquoted" }],
      providers: [...first.generatedCatalog!.providers, { slug: "lambda", name: "Lambda", website: "https://lambda.ai" }, { slug: "new-platform", name: "New platform", website: "https://new.example.com" }],
    },
  });
  const originalJson = JSON.stringify(first);
  const a = createPricingData(first);
  const b = createPricingData(next);
  assert.equal(a.getGpu("nvidia-future"), undefined);
  assert.equal(b.getGpu("nvidia-future")?.name, "Future");
  assert.equal(b.getProvider("lambda")?.name, "Lambda");
  assert.equal(b.getProvider("new-platform"), undefined);
  assert.equal(b.getGpu("nvidia-unquoted"), undefined);
  assert.equal(JSON.stringify(first), originalJson);
  assert.equal(a.getGpu("nvidia-h100")?.vramGb, null);
  assert.equal(a.getGpu("nvidia-h100")?.bandwidth, "See provider specification");
});

test("the current board excludes other collectors and dated references while keeping the commercial CTA profile", () => {
  const excluded = ["aws", "vast-ai", "hyperstack", "ebcloud", "suanli", "flatkey"];
  const input = dataset({ offers: [quote(), ...excluded.map((providerSlug) => quote({ id: providerSlug, providerSlug })),
    quote({ id: "dated-nebius", providerSlug: "nebius", dataStatus: "seed" })],
    sources: [{ provider: "nebius", status: "ok" }, ...excluded.map((provider) => ({ provider, status: "reference" }))],
  });
  const before = JSON.stringify(input);
  const current = createPricingData(input);
  assert.deepEqual(current.offers.map((offer) => offer.id), ["public-example-hourly"]);
  assert.deepEqual(current.providers.map((provider) => provider.slug), ["nebius"]);
  assert.deepEqual(current.sources.map((source) => source.provider), ["nebius"]);
  assert.equal(current.pricingDatasetStatus.counts.referenceOffers, 0);
  assert.deepEqual(Object.keys(current.pricingDatasetStatus.providerCounts), ["nebius"]);
  assert.equal(current.getProvider("flatkey")?.name, "Flatkey");
  assert.deepEqual(current.getOffersForProvider("flatkey"), []);
  assert.equal(JSON.stringify(input), before);
});

test("all nine current competitors appear only when the snapshot contains their source-backed quotes", () => {
  const input = dataset({
    offers: COMPETITOR_PROVIDER_SLUGS.map((providerSlug) => quote({ id: providerSlug, providerSlug })),
    sources: COMPETITOR_PROVIDER_SLUGS.map((provider) => ({ provider, status: "ok", offerCount: 1 })),
    generatedCatalog: {
      gpus: dataset().generatedCatalog!.gpus,
      providers: COMPETITOR_PROVIDER_SLUGS.map((slug) => ({ slug, name: slug, website: `https://example.com/${slug}` })),
    },
  });
  const current = createPricingData(input);
  assert.equal(current.offers.length, 9);
  assert.deepEqual(current.providers.map((provider) => provider.slug).sort(), [...COMPETITOR_PROVIDER_SLUGS].sort());
  assert.equal(current.sources.length, 9);
  assert.equal(current.getOffersForProvider("runpod").length, 1);
  assert.equal(current.getOffersForProvider("azure").length, 1);
});
test("monthly source records remain in audit/status and never reach any hourly comparison", () => {
  const monthly = quote({ id: "monthly", sourceCurrency: "CNY", billingUnit: "GPU-month", pricePerGpuUnit: 100, priceUsdPerGpuUnit: 15, pricePerGpuHour: null, availability: "unavailable", rentalType: "Monthly", regions: ["United States", "Finland"], region: "United States, Finland" });
  const data = createPricingData(dataset({ offers: [monthly] }));
  assert.deepEqual(data.offers, []);
  assert.equal(data.collectedOffers[0].pricePerGpuUnit, 100);
  assert.equal(data.collectedOffers[0].priceUsdPerGpuUnit, 15);
  assert.equal(data.collectedOffers[0].pricePerGpuHour, null);
  assert.equal(data.getCheapestOffer(), undefined);
  assert.equal(data.pricingDatasetStatus.counts.offlineOffers, 1);
  assert.equal(data.pricingDatasetStatus.counts.totalCollectedOffers, 1);
  assert.equal(data.pricingDatasetStatus.counts.comparableOffers, 0);
  assert.equal(data.pricingDatasetStatus.counts.excludedFromComparison, 1);
  assert.deepEqual(data.gpus, []);
  assert.deepEqual(data.providers, []);
  assert.deepEqual(data.getOffersForRegion("united-states"), []);
  assert.deepEqual(data.getOffersForRegion("europe"), []);
});

test("website market includes hourly catalogs while regional directories keep verified price locations", () => {
  const valid = quote();
  const excluded = [
    quote({ id: "unlocated", providerSlug: "lambda", gpuSlug: "nvidia-a100", priceScope: "unlocated_catalog" }),
    quote({ id: "coverage", providerSlug: "crusoe", gpuSlug: "nvidia-a100", priceScope: "platform_coverage", coverageRegions: ["eu-north1"] }),
    quote({ id: "country-missing", countryCode: "", computeCountries: [] }),
    quote({ id: "region-unverified", regionPriceVerified: false }), quote({ id: "from", quoteStatus: "starting_at" }),
    quote({ id: "component", priceBasis: "gpu_component" }),
  ];
  const input = dataset({ offers: [valid, ...excluded], generatedCatalog: {
    gpus: [...dataset().generatedCatalog!.gpus, { slug: "nvidia-a100", name: "A100", shortName: "A100" }],
    providers: [...dataset().generatedCatalog!.providers,
      { slug: "lambda", name: "Lambda", website: "https://lambda.ai" },
      { slug: "crusoe", name: "Crusoe", website: "https://crusoe.ai" }],
  } }), before = JSON.stringify(input), current = createPricingData(input);
  assert.deepEqual(current.offers.map((offer) => offer.id), [valid.id, "unlocated", "coverage", "country-missing", "region-unverified"]);
  assert.deepEqual(current.providers.map((provider) => provider.slug).sort(), ["crusoe", "lambda", "nebius"]);
  assert.deepEqual(current.gpus.map((gpu) => gpu.slug), ["nvidia-h100", "nvidia-a100"]);
  assert.equal(current.collectedOffers.length, 7);
  assert.equal(current.pricingDatasetStatus.counts.offers, 7);
  assert.equal(current.pricingDatasetStatus.counts.comparableOffers, 5);
  assert.equal(current.pricingDatasetStatus.counts.regionalOffers, 1);
  assert.equal(current.pricingDatasetStatus.counts.catalogOffers, 3);
  assert.equal(current.pricingDatasetStatus.comparisonScope, "market-gpu-hour");
  assert.deepEqual(current.pricingDatasetStatus.comparableProviderCounts, { crusoe: 1, lambda: 1, nebius: 3 });
  assert.deepEqual(current.pricingDatasetStatus.providerCounts, { crusoe: 1, lambda: 1, nebius: 5 });
  assert.deepEqual(current.getOffersForRegion("europe").map((offer) => offer.id), [valid.id]);
  assert.equal(JSON.stringify(input), before);
});
