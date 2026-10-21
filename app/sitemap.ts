import type { MetadataRoute } from "next";
import { getPricingSnapshot } from "@/lib/pricing-snapshot";
import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { gpus, isRegionIndexable, providers, regions } = await getPricingSnapshot();
  const staticRoutes: MetadataRoute.Sitemap = [
    { path: "/", priority: 1 },
    { path: "/gpus", priority: 0.9 },
    { path: "/providers", priority: 0.85 },
    { path: "/providers/flatkey", priority: 0.75 },
    { path: "/regions", priority: 0.85 },
    { path: "/guides/gpu-rental-pricing", priority: 0.9 },
    { path: "/methodology", priority: 0.6 },
  ].map(({ path, priority }) => ({
    url: absoluteUrl(path),
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority,
  }));
  const gpuRoutes: MetadataRoute.Sitemap = gpus.map((gpu) => ({ url: absoluteUrl(`/gpus/${gpu.slug}`), changeFrequency: "weekly", priority: 0.8 }));
  const providerRoutes: MetadataRoute.Sitemap = providers.map((provider) => ({ url: absoluteUrl(`/providers/${provider.slug}`), changeFrequency: "weekly", priority: 0.75 }));
  const regionRoutes: MetadataRoute.Sitemap = regions
    .filter((region) => isRegionIndexable(region.slug))
    .map((region) => ({ url: absoluteUrl(`/regions/${region.slug}`), changeFrequency: "weekly", priority: 0.75 }));
  return [...staticRoutes, ...gpuRoutes, ...providerRoutes, ...regionRoutes];
}
