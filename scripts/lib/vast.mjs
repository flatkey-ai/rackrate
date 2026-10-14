const VAST_API_URL = "https://console.vast.ai/api/v0/bundles";
const VAST_SOURCE_URL = "https://cloud.vast.ai/create/";

const gpuAliases = [
  { pattern: /\bH100\b/i, slug: "nvidia-h100", short: "h100" },
  { pattern: /\bH200\b/i, slug: "nvidia-h200", short: "h200" },
  { pattern: /\bB200\b/i, slug: "nvidia-b200", short: "b200" },
  { pattern: /\bA100\b/i, slug: "nvidia-a100-80gb", short: "a100-80gb", minimumMemoryMb: 78_000 },
  { pattern: /\b(?:RTX[_ -]?)?4090\b/i, slug: "nvidia-rtx-4090", short: "rtx-4090" },
];

function gpuProfile(name, gpuRamMb) {
  const profile = gpuAliases.find((entry) => entry.pattern.test(name || "")) || null;
  if (profile?.minimumMemoryMb && Number(gpuRamMb) < profile.minimumMemoryMb) return null;
  return profile;
}

function countryCode(geolocation) {
  const match = String(geolocation || "").match(/(?:,|\s)\s*([A-Z]{2})$/);
  return match?.[1] || "GL";
}

function humanRegion(geolocation, code) {
  const value = String(geolocation || "").trim();
  return value || (code === "GL" ? "Global" : code);
}

function rawOffers(payload) {
  if (Array.isArray(payload?.offers)) return payload.offers;
  if (payload?.offers && typeof payload.offers === "object") return [payload.offers];
  return [];
}

export function parseVastOffers(payload, observedAt = new Date().toISOString()) {
  const cheapest = new Map();

  for (const raw of rawOffers(payload)) {
    const profile = gpuProfile(raw.gpu_name, raw.gpu_ram);
    const gpuCount = Number(raw.num_gpus);
    const totalHourly = Number(raw.dph_total ?? raw.search?.totalHour);
    if (!profile || !Number.isFinite(gpuCount) || gpuCount <= 0 || !Number.isFinite(totalHourly) || totalHourly <= 0) continue;
    if (raw.rentable === false || raw.rented === true) continue;

    const code = countryCode(raw.geolocation);
    const id = `vast-${profile.short}-${code.toLowerCase()}`;
    const offer = {
      id,
      gpuSlug: profile.slug,
      providerSlug: "vast-ai",
      gpuCount,
      vcpu: Math.max(1, Math.round(Number(raw.cpu_cores_effective ?? raw.cpu_cores) || 1)),
      ramGb: Math.max(1, Math.round((Number(raw.cpu_ram) || 1024) / 1024)),
      pricePerGpuHour: Number((totalHourly / gpuCount).toFixed(6)),
      rentalType: "On-demand",
      region: humanRegion(raw.geolocation, code),
      countryCode: code,
      availability: "available",
      egress: Number.isFinite(Number(raw.internet_down_cost_per_tb))
        ? `$${Number(raw.internet_down_cost_per_tb).toFixed(2)}/TB down`
        : "Variable",
      sourceUrl: VAST_SOURCE_URL,
      observedAt,
      sourceCurrency: "USD",
      billingUnit: "GPU-hour",
      dataStatus: "official-page",
    };

    const existing = cheapest.get(id);
    if (!existing || offer.pricePerGpuHour < existing.pricePerGpuHour) cheapest.set(id, offer);
  }

  const offers = [...cheapest.values()].sort((a, b) => a.id.localeCompare(b.id));
  if (offers.length < 2) throw new Error(`Vast.ai collector expected at least 2 supported GPU markets, found ${offers.length}`);
  return offers;
}

export async function collectVast(apiKey, fetchImpl = fetch) {
  if (!apiKey) return null;
  const response = await fetchImpl(VAST_API_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "user-agent": "RackRateDataBot/1.0 (+https://rackrate.org/methodology)",
    },
    body: JSON.stringify({
      limit: 100,
      type: "on-demand",
      verified: { eq: true },
      rentable: { eq: true },
      rented: { eq: false },
      order: [["dph_total", "asc"]],
    }),
  });
  if (!response.ok) throw new Error(`Vast.ai returned HTTP ${response.status}`);
  const observedAt = new Date().toISOString();
  return { provider: "vast-ai", offers: parseVastOffers(await response.json(), observedAt), observedAt, url: VAST_SOURCE_URL };
}

