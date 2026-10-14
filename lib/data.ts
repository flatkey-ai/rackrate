import offerDataset from "@/data/offers.json";

export type Availability = "available" | "limited" | "unavailable" | "unknown";
export type RentalType = "On-demand" | "Spot" | "Reserved";

export type Gpu = {
  slug: string;
  name: string;
  shortName: string;
  vendor: "NVIDIA" | "AMD";
  architecture: string;
  vramGb: number;
  memoryType: string;
  bandwidth: string;
  released: number;
  tier: "Datacenter" | "Workstation" | "Consumer";
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
  gpuCount: number;
  vcpu?: number;
  ramGb?: number;
  pricePerGpuHour: number;
  rentalType: RentalType;
  region: string;
  countryCode: string;
  availability: Availability;
  egress: string;
  sourceUrl: string;
  observedAt: string;
  sourceCurrency: "USD";
  billingUnit: "GPU-hour";
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

export const gpus: Gpu[] = [
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

export const providers: Provider[] = [
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

export const seedOffers: Omit<Offer, "sourceCurrency" | "billingUnit" | "dataStatus">[] = [
  { id: "vast-h100-in", gpuSlug: "nvidia-h100", providerSlug: "vast-ai", gpuCount: 8, vcpu: 192, ramGb: 2268, pricePerGpuHour: 1.56, rentalType: "On-demand", region: "India", countryCode: "IN", availability: "limited", egress: "Free", sourceUrl: "https://vast.ai", observedAt: "2026-10-12" },
  { id: "hyper-h100-ca", gpuSlug: "nvidia-h100", providerSlug: "hyperstack", gpuCount: 8, vcpu: 252, ramGb: 1440, pricePerGpuHour: 2.5, rentalType: "On-demand", region: "Canada", countryCode: "CA", availability: "available", egress: "Free", sourceUrl: "https://www.hyperstack.cloud/gpu-pricing", observedAt: "2026-10-12" },
  { id: "runpod-h100-global", gpuSlug: "nvidia-h100", providerSlug: "runpod", gpuCount: 8, vcpu: 64, ramGb: 512, pricePerGpuHour: 2.59, rentalType: "On-demand", region: "Global", countryCode: "GL", availability: "limited", egress: "$0.10/GB", sourceUrl: "https://www.runpod.io/pricing", observedAt: "2026-10-12" },
  { id: "lambda-h100-us", gpuSlug: "nvidia-h100", providerSlug: "lambda", gpuCount: 1, vcpu: 26, ramGb: 200, pricePerGpuHour: 4.29, rentalType: "On-demand", region: "United States", countryCode: "US", availability: "limited", egress: "$0.02/GB", sourceUrl: "https://lambda.ai/service/gpu-cloud", observedAt: "2026-10-12" },
  { id: "aws-h100-spot", gpuSlug: "nvidia-h100", providerSlug: "aws", gpuCount: 8, vcpu: 192, ramGb: 2048, pricePerGpuHour: 3.78, rentalType: "Spot", region: "US East", countryCode: "US", availability: "limited", egress: "Variable", sourceUrl: "https://aws.amazon.com/ec2/pricing/", observedAt: "2026-10-12" },
  { id: "hyper-h200-ca", gpuSlug: "nvidia-h200", providerSlug: "hyperstack", gpuCount: 8, vcpu: 252, ramGb: 1800, pricePerGpuHour: 3.42, rentalType: "On-demand", region: "Canada", countryCode: "CA", availability: "available", egress: "Free", sourceUrl: "https://www.hyperstack.cloud/gpu-pricing", observedAt: "2026-10-12" },
  { id: "runpod-h200-global", gpuSlug: "nvidia-h200", providerSlug: "runpod", gpuCount: 8, vcpu: 128, ramGb: 1440, pricePerGpuHour: 3.59, rentalType: "On-demand", region: "Global", countryCode: "GL", availability: "limited", egress: "$0.10/GB", sourceUrl: "https://www.runpod.io/pricing", observedAt: "2026-10-12" },
  { id: "nebius-h200-eu", gpuSlug: "nvidia-h200", providerSlug: "nebius", gpuCount: 8, vcpu: 160, ramGb: 1280, pricePerGpuHour: 3.85, rentalType: "Reserved", region: "Finland", countryCode: "FI", availability: "available", egress: "Variable", sourceUrl: "https://nebius.com/prices", observedAt: "2026-10-12" },
  { id: "nebius-b200-eu", gpuSlug: "nvidia-b200", providerSlug: "nebius", gpuCount: 8, vcpu: 224, ramGb: 1800, pricePerGpuHour: 5.5, rentalType: "Reserved", region: "Finland", countryCode: "FI", availability: "limited", egress: "Variable", sourceUrl: "https://nebius.com/prices", observedAt: "2026-10-12" },
  { id: "runpod-b200-global", gpuSlug: "nvidia-b200", providerSlug: "runpod", gpuCount: 8, vcpu: 180, ramGb: 1600, pricePerGpuHour: 5.89, rentalType: "On-demand", region: "Global", countryCode: "GL", availability: "limited", egress: "$0.10/GB", sourceUrl: "https://www.runpod.io/pricing", observedAt: "2026-10-12" },
  { id: "vast-a100-us", gpuSlug: "nvidia-a100-80gb", providerSlug: "vast-ai", gpuCount: 4, vcpu: 64, ramGb: 512, pricePerGpuHour: 0.88, rentalType: "On-demand", region: "United States", countryCode: "US", availability: "available", egress: "Variable", sourceUrl: "https://vast.ai", observedAt: "2026-10-12" },
  { id: "runpod-a100-global", gpuSlug: "nvidia-a100-80gb", providerSlug: "runpod", gpuCount: 1, vcpu: 16, ramGb: 125, pricePerGpuHour: 1.19, rentalType: "On-demand", region: "Global", countryCode: "GL", availability: "available", egress: "$0.10/GB", sourceUrl: "https://www.runpod.io/pricing", observedAt: "2026-10-12" },
  { id: "hyper-a100-ca", gpuSlug: "nvidia-a100-80gb", providerSlug: "hyperstack", gpuCount: 1, vcpu: 28, ramGb: 180, pricePerGpuHour: 1.35, rentalType: "On-demand", region: "Canada", countryCode: "CA", availability: "available", egress: "Free", sourceUrl: "https://www.hyperstack.cloud/gpu-pricing", observedAt: "2026-10-12" },
  { id: "hyper-l40s-ca", gpuSlug: "nvidia-l40s", providerSlug: "hyperstack", gpuCount: 1, vcpu: 16, ramGb: 60, pricePerGpuHour: 0.69, rentalType: "On-demand", region: "Canada", countryCode: "CA", availability: "available", egress: "Free", sourceUrl: "https://www.hyperstack.cloud/gpu-pricing", observedAt: "2026-10-12" },
  { id: "runpod-l40s-global", gpuSlug: "nvidia-l40s", providerSlug: "runpod", gpuCount: 1, vcpu: 16, ramGb: 94, pricePerGpuHour: 0.79, rentalType: "Spot", region: "Global", countryCode: "GL", availability: "available", egress: "$0.10/GB", sourceUrl: "https://www.runpod.io/pricing", observedAt: "2026-10-12" },
  { id: "vast-4090-eu", gpuSlug: "nvidia-rtx-4090", providerSlug: "vast-ai", gpuCount: 1, vcpu: 12, ramGb: 64, pricePerGpuHour: 0.32, rentalType: "On-demand", region: "Europe", countryCode: "EU", availability: "available", egress: "Variable", sourceUrl: "https://vast.ai", observedAt: "2026-10-12" },
  { id: "runpod-4090-global", gpuSlug: "nvidia-rtx-4090", providerSlug: "runpod", gpuCount: 1, vcpu: 16, ramGb: 62, pricePerGpuHour: 0.59, rentalType: "On-demand", region: "Global", countryCode: "GL", availability: "available", egress: "$0.10/GB", sourceUrl: "https://www.runpod.io/pricing", observedAt: "2026-10-12" }
];

export const offers = offerDataset.offers as Offer[];
export const offerDatasetGeneratedAt = offerDataset.generatedAt;
export const offerDatasetSources = offerDataset.sources;

export const regions: RegionProfile[] = [
  {
    slug: "canada",
    name: "Canada",
    label: "Canadian GPU cloud",
    countryCodes: ["CA"],
    regionNames: ["Canada"],
    summary: "Compare sample GPU cloud rates published for Canadian capacity, including Hopper and Ampere accelerators.",
    bestFor: "Teams that want a Canadian deployment location and a direct view of locally listed accelerator options.",
    marketContext: "Canada can be a useful shortlist for teams that want data and users to remain in-country, but RackRate currently has only a narrow reference observation for this market. Treat the page as a procurement checklist until more providers expose verifiable Canadian price and inventory data.",
    buyingQuestions: [
      "Which Canadian datacenter and availability zone will host the GPUs?",
      "Is the quoted rate a firm on-demand price or a manually observed reference price?",
      "Can the provider replace or scale the same GPU configuration without moving the workload abroad?",
    ],
    planningNotes: [
      "Confirm the exact datacenter location rather than treating a country-level label as a latency guarantee.",
      "Ask whether public bandwidth, storage, and support are included in the advertised accelerator rate.",
      "Validate current capacity before designing a cluster around a low sample price.",
    ],
  },
  {
    slug: "united-states",
    name: "United States",
    label: "US GPU cloud",
    countryCodes: ["US"],
    regionNames: ["United States", "US East"],
    summary: "Review sample US GPU rental offers across marketplace, specialist-cloud, and hyperscaler purchasing models.",
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
    countryCodes: ["EU", "FI"],
    regionNames: ["Europe", "Finland"],
    summary: "Compare sample European GPU capacity, from flexible single-GPU listings to reserved high-memory accelerators.",
    bestFor: "Workloads that benefit from a European deployment footprint or need to shortlist region-specific infrastructure.",
    marketContext: "European listings in the current feed mix broad marketplace labels with named-country specialist capacity. Buyers should resolve the actual facility before using the price for latency, data-residency, renewable-energy, or contractual decisions.",
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
    summary: "Inspect the sample GPU capacity currently indexed for India and compare its normalized per-GPU cost.",
    bestFor: "Teams prioritizing an India deployment footprint or testing regional capacity close to South Asian users and data.",
    marketContext: "India is still a discovery market in the current RackRate dataset. One marketplace observation can reveal that capacity exists, but it cannot establish a dependable regional price floor or the supply needed for production scale-out.",
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
    slug: "global",
    name: "Global listings",
    label: "Global GPU marketplace",
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

export const getGpu = (slug: string) => gpus.find((gpu) => gpu.slug === slug);
export const getProvider = (slug: string) => providers.find((provider) => provider.slug === slug);
export const getOffersForGpu = (slug: string) => offers.filter((offer) => offer.gpuSlug === slug);
export const getOffersForProvider = (slug: string) => offers.filter((offer) => offer.providerSlug === slug);
export const getRegion = (slug: string) => regions.find((region) => region.slug === slug);
export const getOffersForRegion = (slug: string) => {
  const region = getRegion(slug);
  if (!region) return [];
  return offers.filter(
    (offer) => region.countryCodes.includes(offer.countryCode) || region.regionNames.includes(offer.region),
  );
};
export function getRegionCoverage(slug: string) {
  const regionOffers = getOffersForRegion(slug);
  const officialCount = regionOffers.filter((offer) => offer.dataStatus === "official-page").length;
  return {
    offerCount: regionOffers.length,
    officialCount,
    referenceCount: regionOffers.length - officialCount,
  };
}
export function isRegionIndexable(slug: string) {
  const coverage = getRegionCoverage(slug);
  return coverage.offerCount >= 3 && coverage.officialCount >= 1;
}
export const getRegionForOffer = (offer: Offer) =>
  regions.find(
    (region) => region.countryCodes.includes(offer.countryCode) || region.regionNames.includes(offer.region),
  );

export function getCheapestOffer(gpuSlug?: string) {
  const matching = gpuSlug ? offers.filter((offer) => offer.gpuSlug === gpuSlug) : offers;
  return matching
    .filter((offer) => offer.availability !== "unavailable")
    .sort((a, b) => a.pricePerGpuHour - b.pricePerGpuHour)[0];
}
