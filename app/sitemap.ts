import type { MetadataRoute } from "next";
import { gpus, providers, regions } from "@/lib/data";
import { absoluteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    { path: "/", priority: 1 },
    { path: "/gpus", priority: 0.9 },
    { path: "/providers", priority: 0.85 },
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
  const regionRoutes: MetadataRoute.Sitemap = regions.map((region) => ({ url: absoluteUrl(`/regions/${region.slug}`), changeFrequency: "weekly", priority: 0.75 }));
  return [...staticRoutes, ...gpuRoutes, ...providerRoutes, ...regionRoutes];
}
