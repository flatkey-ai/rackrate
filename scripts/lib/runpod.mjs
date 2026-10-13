const RUNPOD_URL = "https://www.runpod.io/pricing";

const productMap = new Map([
  ["H100 PCIe", { id: "runpod-h100-global", gpuSlug: "nvidia-h100" }],
  ["H200", { id: "runpod-h200-global", gpuSlug: "nvidia-h200" }],
  ["B200", { id: "runpod-b200-global", gpuSlug: "nvidia-b200" }],
  ["A100 PCIe", { id: "runpod-a100-global", gpuSlug: "nvidia-a100-80gb" }],
  ["L40S", { id: "runpod-l40s-global", gpuSlug: "nvidia-l40s" }],
  ["4090", { id: "runpod-4090-global", gpuSlug: "nvidia-rtx-4090" }],
]);

export function parseRunpodPricing(html, observedAt = new Date().toISOString()) {
  const offers = [];
  const pattern = /(H100 PCIe|H200|B200|A100 PCIe|L40S|4090) cloud GPU rental on Runpod\. Community Cloud \$([0-9]+(?:\.[0-9]+)?)\/hr/g;
  const seen = new Set();

  for (const match of html.matchAll(pattern)) {
    const product = productMap.get(match[1]);
    if (!product || seen.has(product.id)) continue;
    const price = Number(match[2]);
    if (!Number.isFinite(price) || price <= 0 || price > 100) continue;
    seen.add(product.id);
    offers.push({
      id: product.id,
      gpuSlug: product.gpuSlug,
      providerSlug: "runpod",
      gpuCount: 1,
      pricePerGpuHour: price,
      rentalType: "On-demand",
      region: "Global",
      countryCode: "GL",
      availability: "unknown",
      egress: "$0.10/GB",
      sourceUrl: RUNPOD_URL,
      observedAt,
      sourceCurrency: "USD",
      billingUnit: "GPU-hour",
      dataStatus: "official-page",
    });
  }

  if (offers.length < 5) {
    throw new Error(`RunPod parser expected at least 5 offers, found ${offers.length}`);
  }
  return offers;
}

export async function collectRunpod(fetchImpl = fetch) {
  const response = await fetchImpl(RUNPOD_URL, {
    headers: { "user-agent": "RackRateDataBot/1.0 (+https://rackrate.org/methodology)" },
  });
  if (!response.ok) throw new Error(`RunPod returned HTTP ${response.status}`);
  const observedAt = new Date().toISOString();
  return { offers: parseRunpodPricing(await response.text(), observedAt), observedAt, url: RUNPOD_URL };
}
