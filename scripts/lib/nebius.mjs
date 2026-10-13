const NEBIUS_URL = "https://nebius.com/prices";

const products = [
  { label: "NVIDIA HGX B200", id: "nebius-b200-eu", gpuSlug: "nvidia-b200", vcpu: "20", ram: "224" },
  { label: "NVIDIA HGX H200", id: "nebius-h200-eu", gpuSlug: "nvidia-h200", vcpu: "16", ram: "200" },
  { label: "NVIDIA HGX H100", id: "nebius-h100-eu", gpuSlug: "nvidia-h100", vcpu: "16", ram: "200" },
  { label: "NVIDIA L40S with Intel CPU", id: "nebius-l40s-eu", gpuSlug: "nvidia-l40s", vcpu: "8-40", ram: "32-160" },
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

export function parseNebiusPricing(html, observedAt = new Date().toISOString()) {
  const text = visibleText(html);
  const offers = [];

  for (const product of products) {
    const escaped = product.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`${escaped} ${product.vcpu} ${product.ram} (?:from )?\\$([0-9]+(?:\\.[0-9]+)?)`));
    if (!match) continue;
    const price = Number(match[1]);
    if (!Number.isFinite(price) || price <= 0 || price > 100) continue;
    const fixedConfiguration = !product.vcpu.includes("-");
    offers.push({
      id: product.id,
      gpuSlug: product.gpuSlug,
      providerSlug: "nebius",
      gpuCount: 1,
      ...(fixedConfiguration ? { vcpu: Number(product.vcpu), ramGb: Number(product.ram) } : {}),
      pricePerGpuHour: price,
      rentalType: "On-demand",
      region: "Europe",
      countryCode: "EU",
      availability: "unknown",
      egress: "Variable",
      sourceUrl: NEBIUS_URL,
      observedAt,
      sourceCurrency: "USD",
      billingUnit: "GPU-hour",
      dataStatus: "official-page",
    });
  }

  if (offers.length < 4) {
    throw new Error(`Nebius parser expected 4 offers, found ${offers.length}`);
  }
  return offers;
}

export async function collectNebius(fetchImpl = fetch) {
  const response = await fetchImpl(NEBIUS_URL, {
    headers: { "user-agent": "RackRateDataBot/1.0 (+https://rackrate.org/methodology)" },
  });
  if (!response.ok) throw new Error(`Nebius returned HTTP ${response.status}`);
  const observedAt = new Date().toISOString();
  return { offers: parseNebiusPricing(await response.text(), observedAt), observedAt, url: NEBIUS_URL };
}
