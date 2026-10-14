const LAMBDA_URL = "https://lambda.ai/service/gpu-cloud";

const products = [
  { pattern: "B200 SXM6", id: "lambda-b200-us", gpuSlug: "nvidia-b200", vramGb: 180 },
  { pattern: "H100(?: SXM| PCIe)", id: "lambda-h100-us", gpuSlug: "nvidia-h100", vramGb: 80 },
  { pattern: "A100 SXM", id: "lambda-a100-us", gpuSlug: "nvidia-a100-80gb", vramGb: 80 },
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

export function parseLambdaPricing(html, observedAt = new Date().toISOString()) {
  const text = visibleText(html);
  const offers = [];

  for (const product of products) {
    const pattern = new RegExp(`NVIDIA ${product.pattern} ${product.vramGb} GB (\\d+) (\\d+) GiB [^$]{0,80}\\$([0-9]+(?:\\.[0-9]+)?)`, "g");
    const candidates = [...text.matchAll(pattern)].map((match) => ({
      vcpu: Number(match[1]),
      ramGb: Number(match[2]),
      price: Number(match[3]),
    })).filter((entry) => Number.isFinite(entry.price) && entry.price > 0 && entry.price < 100);
    if (!candidates.length) continue;
    const best = candidates.sort((a, b) => a.price - b.price)[0];
    offers.push({
      id: product.id,
      gpuSlug: product.gpuSlug,
      providerSlug: "lambda",
      gpuCount: 1,
      vcpu: best.vcpu,
      ramGb: best.ramGb,
      pricePerGpuHour: best.price,
      rentalType: "On-demand",
      region: "United States",
      countryCode: "US",
      availability: "unknown",
      egress: "Free",
      sourceUrl: LAMBDA_URL,
      observedAt,
      sourceCurrency: "USD",
      billingUnit: "GPU-hour",
      dataStatus: "official-page",
    });
  }

  if (offers.length < 3) {
    throw new Error(`Lambda parser expected 3 offers, found ${offers.length}`);
  }
  return offers;
}

export async function collectLambda(fetchImpl = fetch) {
  const response = await fetchImpl(LAMBDA_URL, {
    headers: { "user-agent": "RackRateDataBot/1.0 (+https://rackrate.org/methodology)" },
  });
  if (!response.ok) throw new Error(`Lambda returned HTTP ${response.status}`);
  const observedAt = new Date().toISOString();
  return { provider: "lambda", offers: parseLambdaPricing(await response.text(), observedAt), observedAt, url: LAMBDA_URL };
}
