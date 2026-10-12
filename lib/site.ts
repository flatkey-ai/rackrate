export const siteConfig = {
  name: process.env.NEXT_PUBLIC_SITE_NAME || "RackRate",
  description:
    "Compare cloud GPU prices across providers, regions, and rental types with transparent sourcing.",
  url: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  computeUrl: process.env.NEXT_PUBLIC_FLATKEY_COMPUTE_URL || "https://flatkey.ai/compute",
};

export function flatkeyComputeUrl(content: string, campaign = "gpu_prices") {
  const url = new URL(siteConfig.computeUrl);
  url.searchParams.set("utm_source", "rackrate");
  url.searchParams.set("utm_medium", "referral");
  url.searchParams.set("utm_campaign", campaign);
  url.searchParams.set("utm_content", content);
  return url.toString();
}
