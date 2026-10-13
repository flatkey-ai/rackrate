const BLOGGER_API_URL = (process.env.BLOGGER_API_URL || "https://blog.solvea.io").replace(/\/+$/, "");
const BLOGGER_SITE_SLUG = process.env.BLOGGER_SITE_SLUG || "rackrate";
const BLOGGER_ACCESS_KEY = process.env.BLOGGER_ACCESS_KEY;

export type BlogCategory = {
  id: string;
  name: string;
  slug: string;
};

export type BlogPost = {
  id: string;
  site_slug: string;
  title: string;
  slug: string;
  language: string;
  path: string;
  html_content: string;
  excerpt: string | null;
  cover_image_url: string | null;
  meta_title: string | null;
  meta_description: string | null;
  canonical_url: string | null;
  author_display_name: string | null;
  published_at: string | null;
  updated_at: string;
  category: BlogCategory | null;
};

async function bloggerRequest<T>(path: string): Promise<T | null> {
  if (!BLOGGER_ACCESS_KEY) return null;

  try {
    const response = await fetch(`${BLOGGER_API_URL}${path}`, {
      headers: { Authorization: `Bearer ${BLOGGER_ACCESS_KEY}` },
      next: { revalidate: 300 },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchBlogPosts(limit = 24): Promise<BlogPost[]> {
  const params = new URLSearchParams({ language: "en", limit: String(limit), offset: "0" });
  return (await bloggerRequest<BlogPost[]>(`/api/integration/sites/${BLOGGER_SITE_SLUG}/posts?${params}`)) || [];
}

export async function fetchBlogPost(slug: string): Promise<BlogPost | null> {
  const params = new URLSearchParams({ language: "en" });
  return bloggerRequest<BlogPost>(`/api/integration/sites/${BLOGGER_SITE_SLUG}/posts/${encodeURIComponent(slug)}?${params}`);
}

export function blogExcerpt(post: BlogPost, maxLength = 190) {
  const text = (post.excerpt || post.html_content)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text;
}

export function blogDate(value: string | null) {
  if (!value) return "Unscheduled";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}
