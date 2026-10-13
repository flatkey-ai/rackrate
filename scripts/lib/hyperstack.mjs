const HYPERSTACK_URL = "https://www.hyperstack.cloud/gpu-pricing";

const products = [
  { label: "B200", id: "hyper-b200-global", gpuSlug: "nvidia-b200", vramGb: 192 },
  { label: "H200 SXM", id: "hyper-h200-ca", gpuSlug: "nvidia-h200", vramGb: 141 },
  { label: "H100", id: "hyper-h100-ca", gpuSlug: "nvidia-h100", vramGb: 80 },
  { label: "A100", id: "hyper-a100-ca", gpuSlug: "nvidia-a100-80gb", vramGb: 80 },
];

function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

export function parseHyperstackPricing(html, observedAt = new Date().toISOString()) {
  const text = visibleText(html);
  const offers = [];

  for (const product of products) {
    const escaped = product.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`(?:NVIDIA )?${escaped} ${product.vramGb} (\\d+) (\\d+) \\$([0-9]+(?:\\.[0-9]+)?)`));
    if (!match) continue;
    const price = Number(match[3]);
    if (!Number.isFinite(price) || price <= 0 || price > 100) continue;
    offers.push({
      id: product.id,
      gpuSlug: product.gpuSlug,
      providerSlug: "hyperstack",
      gpuCount: 1,
      vcpu: Number(match[1]),
      ramGb: Number(match[2]),
      pricePerGpuHour: price,
      rentalType: "On-demand",
      region: "Global",
      countryCode: "GL",
      availability: "unknown",
      egress: "Free",
      sourceUrl: HYPERSTACK_URL,
      observedAt,
      sourceCurrency: "USD",
      billingUnit: "GPU-hour",
      dataStatus: "official-page",
    });
  }

  if (offers.length < 4) {
    throw new Error(`Hyperstack parser expected 4 offers, found ${offers.length}`);
  }
  return offers;
}

export async function collectHyperstack(fetchImpl = fetch) {
  const response = await fetchImpl(HYPERSTACK_URL, {
    headers: { "user-agent": "RackRateDataBot/1.0 (+https://rackrate.org/methodology)" },
  });
  if (!response.ok) throw new Error(`Hyperstack returned HTTP ${response.status}`);
  const observedAt = new Date().toISOString();
  return { offers: parseHyperstackPricing(await response.text(), observedAt), observedAt, url: HYPERSTACK_URL };
}
