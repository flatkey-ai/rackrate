import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPricingData, prioritizeGpuCatalog, type Offer, type PricingDataset } from "./data.ts";

const quote = (overrides: Partial<Offer> = {}): Offer => ({
  id: "public-example-hourly", gpuSlug: "nvidia-h100", providerSlug: "nebius", gpuCount: null, gpuVariant: "PCIe", vramGb: 80,
  pricePerGpuUnit: 2, priceUsdPerGpuUnit: 2, pricePerGpuHour: 2, rentalType: "On-demand", region: "us-central1", regions: ["us-central1"], zones: [], countryCode: "US", priceScope: "regional_quote",
  availability: "unknown", egress: "Not published", sourceUrl: "https://example.com/prices", observedAt: "2026-10-20T08:00:00Z",
  sourceCurrency: "USD", billingUnit: "GPU-hour", quoteStatus: "quoted", priceBasis: "advertised_per_gpu", conditions: [], dataStatus: "official-page", ...overrides,
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
  const excluded = ["aws", "vast-ai", "hyperstack", "runpod", "flatkey"];
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

test("only reviewed RunPod API observations enter the board, with cloud tiers and unknown regions intact", () => {
  const secure = quote({ id: "secure", providerSlug: "runpod", sourceUrl: "https://www.runpod.io/pricing",
    apiSourceUrl: "https://api.runpod.io/graphql", sourceType: "official_public_api", accountScope: "public_catalog",
    cloudTier: "secure", billingMode: "on_demand", geographicScope: "unspecified", priceScope: "unlocated_catalog", region: "Not published", regions: [], countryCode: "" });
  const community = { ...secure, id: "community", cloudTier: "community" };
  const legacy = { ...secure, id: "legacy", sourceType: "public_page", region: "Global", apiSourceUrl: null };
  const inventedLocation = { ...secure, id: "invented", regions: ["us-west"], countryCode: "US" };
  const current = createPricingData(dataset({ offers: [secure, community, legacy, inventedLocation],
    sources: [{ provider: "runpod", status: "ok" }] }));
  assert.deepEqual(current.offers, []);
  assert.deepEqual(current.getAuditOffersForProvider("runpod").map(q => q.id), ["secure", "community"]);
  assert.equal(current.getProvider("runpod")?.name, "RunPod");
  assert.equal(current.getOffersForRegion("united-states").length, 0);
  assert.equal(current.getOffersForRegion("global").length, 0);
  assert.ok(current.getAuditOffersForProvider("runpod").every(q => q.membershipRequired !== true));
});
test("monthly prices remain in the source audit, outside the hourly comparison", () => {
  const monthly = quote({ id: "monthly", sourceCurrency: "CNY", billingUnit: "GPU-month", pricePerGpuUnit: 100, priceUsdPerGpuUnit: 15, pricePerGpuHour: null, availability: "unavailable", rentalType: "Monthly", regions: ["United States", "Finland"], region: "United States, Finland" });
  const data = createPricingData(dataset({ offers: [monthly] }));
  assert.equal(data.getAuditOffersForProvider("nebius")[0].pricePerGpuUnit, 100);
  assert.equal(data.getAuditOffersForProvider("nebius")[0].priceUsdPerGpuUnit, 15);
  assert.equal(data.getAuditOffersForProvider("nebius")[0].pricePerGpuHour, null);
  assert.equal(data.getCheapestOffer(), undefined);
  assert.equal(data.pricingDatasetStatus.counts.auditOnlyRecords, 1);
  assert.deepEqual(data.getOffersForRegion("united-states"), []);
  assert.deepEqual(data.getOffersForRegion("europe"), []);
});


test("all providers use the same hourly/geography gate, while verified Lambda shared regions remain eligible", () => {
  const lambda = quote({ ...JSON.parse(readFileSync(new URL("./fixtures/lambda-shared-catalog-2026-10-23.json", import.meta.url), "utf8")), id: "shared-lambda" });
  const excluded = ["nebius", "lambda", "crusoe"].map(providerSlug => quote({ id: providerSlug + "-unlocated", providerSlug,
    region: "Not published", regions: [], countryCode: "", priceScope: "unlocated_catalog" }));
  excluded.push(quote({ id: "coverage", priceScope: "platform_coverage" }),
    quote({ id: "regional-floor", quoteStatus: "starting_at", priceBasis: "starting_price" }),
    quote({ id: "component", priceBasis: "gpu_component_only" }),
    quote({ id: "unknown-country", providerSlug: "autodl", region: "Private region", regions: ["Private region"], countryCode: "" }));
  const input = dataset({ offers: [quote(), lambda, ...excluded] });
  const original = JSON.stringify(input);
  const data = createPricingData(input);
  assert.deepEqual(data.offers.map(q => q.id), ["public-example-hourly", "shared-lambda"]);
  assert.equal(data.pricingDatasetStatus.counts.sourceRecords, 9);
  assert.equal(data.pricingDatasetStatus.counts.auditOnlyRecords, 7);
  assert.ok(data.getOffersForRegion("india").some(q => q.id === "shared-lambda"));
  assert.equal(JSON.stringify(input), original);
});


test("explicit Nebius account exclusion is disclosed instead of implying signed-in account coverage", () => {
  const data = createPricingData(dataset({ sources: [{ provider: "nebius", status: "ok", sourceExclusions: [
    { selection: "nebius_account", reason: "billing_setup_required", status: "excluded_by_configuration" },
  ] }] }));
  assert.match(data.getProviderSourceNotice("nebius"), /Public sources only/);
  assert.equal(data.getProviderSourceNotice("lambda"), "");
  assert.equal(data.pricingDatasetStatus.sources[0].sourceExclusions.length, 1);
});


test("older five-source snapshots do not imply that newly configured sources were collected", () => {
  const providers = ["nebius", "lambda", "crusoe", "ucloud", "autodl"];
  const old = dataset({ offers: providers.map(providerSlug => quote({ id: providerSlug, providerSlug })),
    sources: providers.map(provider => ({ provider, status: "ok", offerCount: 1 })),
    generatedCatalog: { gpus: dataset().generatedCatalog!.gpus, providers: providers.map(slug => ({ slug, name: slug, website: `https://${slug}.example` })) } });
  const data = createPricingData(old);
  assert.deepEqual(data.providers.map(p => p.slug).sort(), [...providers].sort());
  assert.equal(data.sources.length, 5);
  assert.equal(data.pricingDatasetStatus.sourceCounts.offers, 5);
  for (const slug of ["runpod", "azure", "digitalocean", "verda"]) assert.equal(data.getProvider(slug), undefined);
  assert.equal(data.generatedAt, old.generatedAt);
});
