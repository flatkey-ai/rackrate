import { cheapestComparableOffer } from "./pricing.ts";
import { isRegionSpecificPrice, offerMatchesRegion, publishedRegionCodes } from "./region-matching.ts";

export type Availability = "available" | "limited" | "unavailable" | "unknown";
export type RentalType = "On-demand" | "Spot" | "Reserved";
export const COMPETITOR_PROVIDER_SLUGS = ["nebius", "crusoe", "lambda", "ucloud", "autodl"] as const;
const competitorProviders = new Set<string>(COMPETITOR_PROVIDER_SLUGS);
const priorityGpuSlugs = ["nvidia-h100", "nvidia-h200", "nvidia-b200", "nvidia-b300"];

export function prioritizeGpuCatalog<T extends { slug: string }>(catalog: readonly T[]): T[] {
  const priority = new Map(priorityGpuSlugs.map((slug, index) => [slug, index]));
  return catalog.map((gpu, index) => ({ gpu, index })).sort((a, b) =>
    (priority.get(a.gpu.slug) ?? priorityGpuSlugs.length) - (priority.get(b.gpu.slug) ?? priorityGpuSlugs.length)
    || a.index - b.index).map(({ gpu }) => gpu);
}

export type Gpu = {
  slug: string;
  name: string;
  shortName: string;
  vendor: "NVIDIA" | "AMD" | "Unknown";
  architecture: string;
  vramGb: number | null;
  memoryType: string;
  bandwidth: string;
  released: number | null;
  tier: string;
  summary: string;
};

export type Provider = {
  slug: string;
  name: string;
  type: "GPU cloud" | "Marketplace" | "Hyperscaler";
  hq: string;
  billing: string;
  summary: string;
  website: string;
};

export type Offer = {
  id: string;
  gpuSlug: string;
  providerSlug: string;
  gpuModel?: string;
  rawGpuModel?: string;
  rawName?: string;
  rawSku?: string;
  gpuCount: number | null;
  gpuVariant: string | null;
  vramGb: number | null;
  vcpu?: number;
  ramGb?: number;
  pricePerGpuUnit: number | null;
  priceUsdPerGpuUnit: number | null;
  usdSourceAmount?: string | null;
  fx?: { rateToUsd: number; rateDate: string; sourceUrl: string; sourceName: string; rateToUsdDecimal?: string; converted?: boolean; formula?: string; rounding?: string; observedAt?: string } | null;
  pricePerGpuHour: number | null;
  sourceAmount?: string | null;
  instancePrice?: number | null;
  instancePriceUsd?: number | null;
  instanceSourceAmount?: string | null;
  instanceUsdSourceAmount?: string | null;
  instanceBillingUnit?: string | null;
  instanceCurrency?: string | null;
  rentalType: RentalType | "Monthly" | "Other";
  billingMode?: string;
  pricingTier?: string | null;
  cloudTier?: string | null;
  membershipRequired?: boolean;
  accountScope?: string;
  region: string;
  regions: string[];
  zones: string[];
  geographicScope?: string;
  regionScope?: string;
  location?: Record<string, unknown> | null;
  locationSource?: Record<string, unknown> | null;
  computeCountries?: string[];
  priceScope?: string | null;
  applicableRegions?: string[];
  applicableCountries?: string[];
  priceApplicability?: Record<string, unknown> | null;
  capacityLocations?: Record<string, unknown>[];
  sourceType?: string;
  collectionSource?: string | null;
  visibleSource?: string | null;
  countryCode: string;
  availability: Availability;
  egress: string;
  sourceUrl: string;
  observedAt: string;
  sourceCurrency: string;
  billingUnit: "GPU-hour" | "GPU-month";
  quoteStatus: "quoted" | "starting_at" | "contact_sales";
  priceBasis: string;
  conditions: string[];
  resources?: Record<string, unknown>;
  dataStatus: "official-page" | "seed";
};

export type RegionProfile = {
  slug: string;
  name: string;
  label: string;
  countryCodes: string[];
  regionNames: string[];
  summary: string;
  bestFor: string;
  marketContext: string;
  buyingQuestions: [string, string, string];
  planningNotes: [string, string, string];
};

const curatedGpus: Gpu[] = [
  {
    slug: "nvidia-h100",
    name: "NVIDIA H100 80GB",
    shortName: "H100",
    vendor: "NVIDIA",
    architecture: "Hopper",
    vramGb: 80,
    memoryType: "HBM3",
    bandwidth: "3.35 TB/s",
    released: 2022,
    tier: "Datacenter",
    summary: "A widely deployed accelerator for large-model training and high-throughput inference.",
  },
  {
    slug: "nvidia-h200",
    name: "NVIDIA H200 141GB",
    shortName: "H200",
    vendor: "NVIDIA",
    architecture: "Hopper",
    vramGb: 141,
    memoryType: "HBM3e",
    bandwidth: "4.8 TB/s",
    released: 2024,
    tier: "Datacenter",
    summary: "A high-memory Hopper accelerator suited to larger contexts and memory-bound inference.",
  },
  {
    slug: "nvidia-b200",
    name: "NVIDIA B200 180GB",
    shortName: "B200",
    vendor: "NVIDIA",
    architecture: "Blackwell",
    vramGb: 180,
    memoryType: "HBM3e",
    bandwidth: "8.0 TB/s",
    released: 2025,
    tier: "Datacenter",
    summary: "A Blackwell datacenter GPU for frontier training and dense inference clusters.",
  },
  {
    slug: "nvidia-a100-80gb",
    name: "NVIDIA A100 80GB",
    shortName: "A100 80GB",
    vendor: "NVIDIA",
    architecture: "Ampere",
    vramGb: 80,
    memoryType: "HBM2e",
    bandwidth: "2.0 TB/s",
    released: 2020,
    tier: "Datacenter",
    summary: "A mature training and inference option with broad cloud availability.",
  },
  {
    slug: "nvidia-l40s",
    name: "NVIDIA L40S 48GB",
    shortName: "L40S",
    vendor: "NVIDIA",
    architecture: "Ada Lovelace",
    vramGb: 48,
    memoryType: "GDDR6",
    bandwidth: "864 GB/s",
    released: 2023,
    tier: "Datacenter",
    summary: "A flexible accelerator for inference, rendering, and multimodal workloads.",
  },
  {
    slug: "nvidia-rtx-4090",
    name: "NVIDIA RTX 4090 24GB",
    shortName: "RTX 4090",
    vendor: "NVIDIA",
    architecture: "Ada Lovelace",
    vramGb: 24,
    memoryType: "GDDR6X",
    bandwidth: "1.01 TB/s",
    released: 2022,
    tier: "Consumer",
    summary: "A cost-focused option for smaller inference jobs, image generation, and experimentation.",
  },
];

const curatedProviders: Provider[] = [
  {
    slug: "flatkey",
    name: "Flatkey",
    type: "GPU cloud",
    hq: "United States",
    billing: "By quote",
    summary: "GPU capacity matched to your workload, with configuration, region, price and delivery conditions confirmed in a formal quote.",
    website: "https://flatkey.ai/compute",
  },
  {
    slug: "vast-ai",
    name: "Vast.ai",
    type: "Marketplace",
    hq: "United States",
    billing: "Per second",
    summary: "A marketplace where independent hosts list GPU capacity across many regions and hardware configurations.",
    website: "https://vast.ai",
  },
  {
    slug: "hyperstack",
    name: "Hyperstack",
    type: "GPU cloud",
    hq: "United Kingdom",
    billing: "Per minute",
    summary: "A GPU-focused cloud with on-demand and reserved capacity across several datacenter regions.",
    website: "https://www.hyperstack.cloud",
  },
  {
    slug: "runpod",
    name: "Runpod",
    type: "GPU cloud",
    hq: "United States",
    billing: "Per second",
    summary: "A developer-oriented GPU platform spanning Pods, serverless inference, and community capacity.",
    website: "https://www.runpod.io",
  },
  {
    slug: "lambda",
    name: "Lambda",
    type: "GPU cloud",
    hq: "United States",
    billing: "Per hour",
    summary: "A specialist AI cloud offering single-node and multi-node GPU infrastructure.",
    website: "https://lambda.ai",
  },
  {
    slug: "nebius",
    name: "Nebius",
    type: "GPU cloud",
    hq: "Netherlands",
    billing: "Per second",
    summary: "An AI infrastructure platform providing GPU virtual machines and managed services.",
    website: "https://nebius.com",
  },
  {
    slug: "aws",
    name: "AWS",
    type: "Hyperscaler",
    hq: "United States",
    billing: "Per second",
    summary: "A global hyperscale cloud with GPU instances, capacity blocks, and spot purchasing options.",
    website: "https://aws.amazon.com/ec2/instance-types/accelerated-computing/",
  },
];

type GeneratedGpu = Partial<{ [K in keyof Gpu]: Gpu[K] | null }> & Pick<Gpu, "slug" | "name" | "shortName">;
type GeneratedProvider = Partial<{ [K in keyof Provider]: Provider[K] | null }> & Pick<Provider, "slug" | "name" | "website">;
export type PricingDataset = {
  schemaVersion?: number;
  offers: Offer[];
  generatedAt: string;
  collector?: { name: string; version: string; commit: string; providers?: string[] };
  coverage?: { totals: Record<string, number> };
  fx?: { rateDate: string; sourceName: string; sourceUrl: string; observedAt: string };
  sources: { provider: string; status: string; [key: string]: unknown }[];
  generatedCatalog?: { gpus: GeneratedGpu[]; providers: GeneratedProvider[] };
};
export const regions: RegionProfile[] = [
  {
    slug: "canada",
    name: "Canada",
    label: "Canadian GPU cloud",
    countryCodes: ["CA"],
    regionNames: ["Canada"],
    summary: "Compare source-published Canadian GPU rates by cloud-region code, configuration and purchase terms.",
    bestFor: "Teams that require a Canadian deployment location and need to confirm facility, capacity and procurement terms.",
    marketContext: "Canadian regional rates are grouped from the location attached to each quote, including explicitly identified cloud-region codes. The country grouping does not make Toronto, Quebec or different providers interchangeable: retain the exact region and configuration when comparing prices.",
    buyingQuestions: [
      "Which Canadian datacenter and availability zone will host the GPUs?",
      "Is the quoted rate a firm on-demand price or a manually observed reference price?",
      "Can the provider replace or scale the same GPU configuration without moving the workload abroad?",
    ],
    planningNotes: [
      "Confirm the exact datacenter location rather than treating a country-level label as a latency guarantee.",
      "Ask whether public bandwidth, storage, and support are included in the advertised accelerator rate.",
      "Validate current capacity before designing a cluster around a low advertised price.",
    ],
  },
  {
    slug: "united-states",
    name: "United States",
    label: "US GPU cloud",
    countryCodes: ["US"],
    regionNames: ["United States", "US East"],
    summary: "Review indexed US GPU rental offers across marketplace, specialist-cloud, and hyperscaler purchasing models.",
    bestFor: "Buyers comparing broad provider choice, flexible procurement models, and proximity to US-based data or users.",
    marketContext: "The United States has the broadest mix in the current dataset: marketplace listings, specialist GPU clouds, and hyperscaler capacity. That range improves discovery but makes like-for-like comparison harder, because spot, on-demand, and host-specific offers carry different interruption and support assumptions.",
    buyingQuestions: [
      "Which cloud region and facility are included in the published rate?",
      "Does the workload tolerate spot interruption or marketplace host replacement?",
      "What egress and cross-zone charges apply to training data and checkpoints?",
    ],
    planningNotes: [
      "Cloud regions within the United States can have materially different inventory, latency, and egress policies.",
      "Spot and marketplace listings should be evaluated separately from stable on-demand capacity.",
      "Compare the whole node configuration when CPU, RAM, local storage, or interconnect affects the workload.",
    ],
  },
  {
    slug: "europe",
    name: "Europe",
    label: "European GPU cloud",
    countryCodes: ["EU", "FI", "IS", "FR", "DE", "GB", "IE", "SE", "NL", "PL", "IT", "ES", "NO", "DK", "AT", "BE", "CH"],
    regionNames: ["Europe", "Finland"],
    summary: "Compare indexed European GPU offers and check the country, purchase terms and data-transfer costs behind each rate.",
    bestFor: "Workloads that benefit from a European deployment footprint or need to shortlist region-specific infrastructure.",
    marketContext: "European listings can use broad regional labels rather than a named facility. Buyers should resolve the actual country and datacenter before using the price for latency, data-residency, energy-source or contractual decisions.",
    buyingQuestions: [
      "Which country and legal entity will process and store the workload data?",
      "Does a reserved rate require a deposit, minimum term, or minimum GPU count?",
      "Are internet egress and cross-region transfers included in the comparison?",
    ],
    planningNotes: [
      "A generic Europe label may span several countries; request the physical location before assessing latency or policy needs.",
      "Reserved pricing can carry term, deposit, or minimum-quantity conditions that are not visible in the hourly rate.",
      "Keep data-transfer assumptions explicit when training data and checkpoints cross cloud or country boundaries.",
    ],
  },
  {
    slug: "india",
    name: "India",
    label: "India GPU cloud",
    countryCodes: ["IN"],
    regionNames: ["India"],
    summary: "Compare source-published GPU rates for Indian cloud regions, with dated references identified separately.",
    bestFor: "Teams prioritizing an India deployment footprint or testing regional capacity close to South Asian users and data.",
    marketContext: "The India index retains the exact source region, such as Central India or South India, alongside GPU configuration and purchase model. An on-demand rate and an interruptible Spot rate remain different offers. Neither a catalog rate nor a dated marketplace reference verifies current capacity.",
    buyingQuestions: [
      "Can the provider confirm the physical Indian location and network path?",
      "Is matching replacement capacity available if the listed host disappears?",
      "What support, tax, storage, and data-transfer charges sit outside the GPU rate?",
    ],
    planningNotes: [
      "A single listing is a market signal, not proof of durable regional supply; confirm replacement capacity and lead time.",
      "Multi-GPU nodes should be compared on total node cost as well as the normalized per-GPU figure.",
      "Verify interconnect, storage throughput, and network quotas before treating a cluster as training-ready.",
    ],
  },
  {
    slug: "china",
    name: "China",
    label: "China GPU cloud",
    countryCodes: ["CN"],
    regionNames: ["China"],
    summary: "Compare explicitly located Chinese GPU listings, preserving source region and availability-zone codes, monthly units and offline status.",
    bestFor: "Buyers comparing China deployments with a specific region, availability zone and billing period in mind.",
    marketContext: "A published China listing may remain in the catalog after it goes offline. Offline records are retained for research and never establish a rentable lowest price. Monthly prices stay per GPU-month; the page does not convert them into hourly prices or infer a currently orderable offer.",
    buyingQuestions: [
      "Is the exact region and availability zone still accepting new GPU orders?",
      "Does the quoted amount cover a full node, only the GPU component, or a monthly package?",
      "Which tax, storage, bandwidth and account requirements apply to this configuration?",
    ],
    planningNotes: [
      "Keep the provider's original region and zone codes when comparing quotes.",
      "Treat offline catalog entries as historical market context rather than available supply.",
      "Compare matching billing periods and node sizes before choosing a price.",
    ],
  },
  {
    slug: "asia-pacific",
    name: "Asia Pacific",
    label: "Asia Pacific GPU regions",
    countryCodes: ["AU", "NZ", "JP", "KR", "SG", "MY", "ID", "TH", "PH", "VN", "HK", "TW", "IN", "CN"],
    regionNames: ["Asia Pacific"],
    summary: "Explore source-located GPU prices across Asia Pacific while keeping each quote's country, cloud region and purchase terms visible.",
    bestFor: "Teams shortlisting regional capacity near Asia Pacific users, datasets or operations.",
    marketContext: "Asia Pacific is a navigation group, not a single deployment location or uniform regional tariff. Each returned quote retains its specific provider region code. Prices in Japan, Singapore, Australia, India and China must be compared with the relevant location and billing terms in view.",
    buyingQuestions: [
      "Which country and provider region does this particular price cover?",
      "Are network transfer, storage and local taxes included in the quoted amount?",
      "Can the provider confirm capacity and the latency to the intended users?",
    ],
    planningNotes: [
      "Select an exact cloud region in the price board before comparing a deployment shortlist.",
      "A broad market grouping does not make its countries or facilities interchangeable.",
      "Keep offline, Spot, member and monthly offers separate from ordinary hourly rates.",
    ],
  },
  {
    slug: "middle-east",
    name: "Middle East",
    label: "Middle East GPU regions",
    countryCodes: ["IL", "AE", "QA", "SA", "BH", "OM", "JO"],
    regionNames: ["Middle East"],
    summary: "Review GPU prices attached to explicit Middle East cloud regions, with each source region and rate condition retained.",
    bestFor: "Workloads that need a specific Middle East deployment country or cloud region.",
    marketContext: "This market index groups explicitly located quotes for navigation. It does not apply a rate from one country or provider to another. A provider's headquarters, billing country or customer eligibility requirement does not establish where its GPU price is available.",
    buyingQuestions: [
      "Which source region and physical deployment country are included in this rate?",
      "Does the price require a specific customer entity or account eligibility?",
      "Which availability, network and data-residency terms need direct confirmation?",
    ],
    planningNotes: [
      "Use each offer's source region rather than its provider's company address.",
      "Customer eligibility and deployment location are separate facts.",
      "Compare equivalent billing plans and configurations within the intended region.",
    ],
  },
  {
    slug: "latin-america",
    name: "Latin America",
    label: "Latin America GPU regions",
    countryCodes: ["BR", "MX", "CL", "AR", "CO", "PE"],
    regionNames: ["Latin America"],
    summary: "Review GPU prices attached to explicit Latin American cloud regions and compare their published configurations and terms.",
    bestFor: "Teams evaluating source-located capacity near Latin American users and data.",
    marketContext: "Latin America is a market index, not one cloud region or common tariff. Listings keep the original region code and provider. A published price does not establish inventory, local checkout totals, or a price in any other country within this grouping.",
    buyingQuestions: [
      "Which country and cloud region does this listing identify?",
      "Are local taxes, storage and network transfers included in the final charge?",
      "Is the configuration available at the required quantity and start date?",
    ],
    planningNotes: [
      "Retain the provider region code when asking for a confirmed quote.",
      "Compare Spot and ordinary on-demand prices separately.",
      "Include data movement and replacement capacity in regional cost estimates.",
    ],
  },
  {
    slug: "global",
    name: "Global listings",
    label: "Global GPU listings",
    countryCodes: ["GL"],
    regionNames: ["Global"],
    summary: "Compare globally labeled GPU listings when flexibility and accelerator choice matter more than a fixed location.",
    bestFor: "Portable inference, experiments, and batch workloads that can choose capacity based on price and availability.",
    marketContext: "Global is a provider catalogue label, not a physical deployment region. It is useful for price discovery and portable workloads, but a serious shortlist must resolve the final country, facility, network path, and governing terms before deployment.",
    buyingQuestions: [
      "Which concrete regions are available for this GPU and rate today?",
      "Will the price or configuration change after selecting a datacenter?",
      "Can regulated data and checkpoints move to the eventual host location?",
    ],
    planningNotes: [
      "Treat global as a discovery label; obtain the actual host region before moving regulated or latency-sensitive data.",
      "Check whether availability and pricing vary after selecting a concrete datacenter or host.",
      "Include egress and checkpoint movement in the cost model when jobs can land in different locations.",
    ],
  },
];

export const gpuMemoryLabel = (gpu: Gpu) => gpu.vramGb === null ? "Memory varies by listing" : `${gpu.vramGb} GB ${gpu.memoryType}`;

export function createPricingData(dataset: PricingDataset) {
  // Historical snapshots remain intact. The current board only projects
  // source-backed offers from the five explicitly tracked competitors.
  const currentOffers = dataset.offers.filter((offer) => competitorProviders.has(offer.providerSlug)
    && offer.dataStatus === "official-page");
  const currentGpuSlugs = new Set(currentOffers.map((offer) => offer.gpuSlug));
  const currentProviderSlugs = new Set(currentOffers.map((offer) => offer.providerSlug));
  const gpuCatalog = new Map(curatedGpus.filter((gpu) => currentGpuSlugs.has(gpu.slug)).map((gpu) => [gpu.slug, gpu]));
  for (const entry of dataset.generatedCatalog?.gpus ?? []) {
    if (!currentGpuSlugs.has(entry.slug)) continue;
    const curated = gpuCatalog.get(entry.slug);
    gpuCatalog.set(entry.slug, {
      slug: entry.slug, name: entry.name, shortName: entry.shortName,
      vendor: entry.vendor ?? curated?.vendor ?? "Unknown",
      architecture: entry.architecture ?? curated?.architecture ?? "Not catalogued",
      vramGb: entry.vramGb ?? null,
      memoryType: entry.memoryType ?? "Varies by listing",
      bandwidth: entry.bandwidth ?? "See provider specification",
      released: entry.released ?? curated?.released ?? null,
      tier: entry.tier ?? curated?.tier ?? "GPU",
      summary: entry.summary ?? "Source-backed GPU listings. Compare each listing’s variant, memory and terms.",
    });
  }
  const gpus: Gpu[] = prioritizeGpuCatalog([...gpuCatalog.values()]);
  const providerCatalog = new Map(curatedProviders.filter((provider) => competitorProviders.has(provider.slug)
    && currentProviderSlugs.has(provider.slug)).map((provider) => [provider.slug, provider]));
  for (const entry of dataset.generatedCatalog?.providers ?? []) {
    if (!competitorProviders.has(entry.slug) || !currentProviderSlugs.has(entry.slug)) continue;
    const curated = providerCatalog.get(entry.slug);
    providerCatalog.set(entry.slug, {
      slug: entry.slug, name: entry.name, website: entry.website,
      type: entry.type ?? curated?.type ?? "GPU cloud",
      hq: entry.hq ?? curated?.hq ?? "Not catalogued",
      billing: entry.billing ?? curated?.billing ?? "As published",
      summary: entry.summary ?? "Public provider pricing collected without credentials.",
    });
  }
  const providers: Provider[] = [...providerCatalog.values()];
  const offers: Offer[] = currentOffers.map((offer) => ({
    ...offer,
    pricePerGpuUnit: offer.pricePerGpuUnit ?? (offer.sourceCurrency === "USD" ? offer.pricePerGpuHour : null) ?? null,
    priceUsdPerGpuUnit: offer.priceUsdPerGpuUnit ?? (offer.sourceCurrency === "USD" ? offer.pricePerGpuUnit ?? offer.pricePerGpuHour : null) ?? null,
    gpuVariant: offer.gpuVariant ?? null,
    vramGb: offer.vramGb ?? null,
    quoteStatus: offer.quoteStatus ?? "quoted",
    priceBasis: offer.priceBasis ?? "advertised_per_gpu",
    conditions: offer.conditions ?? [],
    regions: offer.regions ?? (offer.region && offer.region !== "Global" ? [offer.region] : []),
    zones: offer.zones ?? [],
  }));
  const offerDatasetGeneratedAt = dataset.generatedAt;
  const offerDatasetSources = dataset.sources.filter((source) => competitorProviders.has(source.provider));

  const getGpu = (slug: string) => gpus.find((gpu) => gpu.slug === slug);
  // Flatkey keeps its separate commercial profile and CTA, with no competitor
  // price records or directory placement in the five-source comparison.
  const getProvider = (slug: string) => slug === "flatkey"
    ? curatedProviders.find((provider) => provider.slug === "flatkey")
    : providers.find((provider) => provider.slug === slug);
  const getOffersForGpu = (slug: string) => offers.filter((offer) => offer.gpuSlug === slug);
  const getOffersForProvider = (slug: string) => offers.filter((offer) => offer.providerSlug === slug);
  const getRegion = (slug: string) => regions.find((region) => region.slug === slug);
  const getOffersForRegion = (slug: string) => {
    const region = getRegion(slug);
    if (!region) return [];
    return offers.filter((offer) => offerMatchesRegion(offer, region));
  };
  function getRegionCoverage(slug: string) {
    const regionOffers = getOffersForRegion(slug);
    const officialCount = regionOffers.filter((offer) => offer.dataStatus === "official-page").length;
    return {
      offerCount: regionOffers.length,
      officialCount,
      referenceCount: regionOffers.length - officialCount,
      offlineCount: regionOffers.filter((offer) => offer.availability === "unavailable").length,
      regionalPriceCount: regionOffers.filter(isRegionSpecificPrice).length,
      coverageOnlyCount: regionOffers.filter((offer) => offer.dataStatus === "official-page"
        && publishedRegionCodes(offer).some((code) => !/^global(?: listings)?$/i.test(code))
        && !isRegionSpecificPrice(offer)).length,
    };
  }
  function isRegionIndexable(slug: string) {
    const coverage = getRegionCoverage(slug);
    return coverage.offerCount >= 3 && coverage.officialCount >= 1;
  }
  const getRegionForOffer = (offer: Offer) =>
    regions.find((region) => offerMatchesRegion(offer, region));

  function getCheapestOffer(gpuSlug?: string) {
    return cheapestComparableOffer(gpuSlug ? getOffersForGpu(gpuSlug) : offers);
  }

  // Public health metadata only. No process configuration or credentials are exposed.
  const pricingDatasetStatus = {
    schemaVersion: 1,
    generatedAt: dataset.generatedAt,
    collector: dataset.collector ?? null,
    libraryCoverage: { totals: dataset.coverage?.totals ?? null },
    fx: dataset.fx ? { rateDate: dataset.fx.rateDate, sourceName: dataset.fx.sourceName, sourceUrl: dataset.fx.sourceUrl, observedAt: dataset.fx.observedAt } : null,
    counts: {
      offers: offers.length,
      officialOffers: offers.filter((offer) => offer.dataStatus === "official-page").length,
      referenceOffers: offers.filter((offer) => offer.dataStatus === "seed").length,
      offlineOffers: offers.filter((offer) => offer.availability === "unavailable").length,
      contactSalesOffers: offers.filter((offer) => offer.quoteStatus === "contact_sales").length,
    },
    sources: offerDatasetSources.map((source) => ({ provider: source.provider, status: source.status, url: typeof source.url === "string" ? source.url : null, offerCount: typeof source.offerCount === "number" ? source.offerCount : 0, fetchedAt: typeof source.fetchedAt === "string" ? source.fetchedAt : null })),
    providerCounts: Object.fromEntries([...new Set(offers.map((offer) => offer.providerSlug))].sort().map((provider) => [provider, offers.filter((offer) => offer.providerSlug === provider).length])),
  };

  return {
    offers, gpus, providers, regions,
    generatedAt: dataset.generatedAt, sources: offerDatasetSources,
    offerDatasetGeneratedAt, offerDatasetSources,
    getGpu, getProvider, getOffersForGpu, getOffersForProvider,
    getRegion, getOffersForRegion, getRegionCoverage, isRegionIndexable, getRegionForOffer,
    getCheapestOffer, pricingDatasetStatus,
  };
}
