import type { MetadataRoute } from "next";
import { gpus, providers, regions } from "@/lib/data";
import { fetchBlogPosts } from "@/lib/blog";
import { absoluteUrl } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { path: "/", priority: 1 },
    { path: "/gpus", priority: 0.9 },
    { path: "/providers", priority: 0.85 },
    { path: "/regions", priority: 0.85 },
    { path: "/guides/gpu-rental-pricing", priority: 0.9 },
    { path: "/blog", priority: 0.8 },
    { path: "/methodology", priority: 0.6 },
  ].map(({ path, priority }) => ({
    url: absoluteUrl(path),
    changeFrequency: path === "/" || path === "/blog" ? "weekly" : "monthly",
    priority,
  }));
  const gpuRoutes: MetadataRoute.Sitemap = gpus.map((gpu) => ({ url: absoluteUrl(`/gpus/${gpu.slug}`), changeFrequency: "weekly", priority: 0.8 }));
  const providerRoutes: MetadataRoute.Sitemap = providers.map((provider) => ({ url: absoluteUrl(`/providers/${provider.slug}`), changeFrequency: "weekly", priority: 0.75 }));
  const regionRoutes: MetadataRoute.Sitemap = regions.map((region) => ({ url: absoluteUrl(`/regions/${region.slug}`), changeFrequency: "weekly", priority: 0.75 }));
  const posts = await fetchBlogPosts(100);
  const blogRoutes: MetadataRoute.Sitemap = posts.map((post) => ({
    url: absoluteUrl(`/blog/${post.slug}`),
    lastModified: post.updated_at,
    changeFrequency: "daily",
    priority: 0.7,
  }));
  return [...staticRoutes, ...gpuRoutes, ...providerRoutes, ...regionRoutes, ...blogRoutes];
}
