import type { MetadataRoute } from "next";
import { gpus, providers } from "@/lib/data";
import { siteConfig } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = ["", "/methodology"].map((route) => ({
    url: `${siteConfig.url}${route}`,
    lastModified: new Date(),
  }));
  const gpuRoutes = gpus.map((gpu) => ({ url: `${siteConfig.url}/gpus/${gpu.slug}`, lastModified: new Date() }));
  const providerRoutes = providers.map((provider) => ({ url: `${siteConfig.url}/providers/${provider.slug}`, lastModified: new Date() }));
  return [...staticRoutes, ...gpuRoutes, ...providerRoutes];
}
