import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { blogDate, blogExcerpt, fetchBlogPost } from "@/lib/blog";
import { absoluteUrl, siteConfig } from "@/lib/site";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await fetchBlogPost(slug);
  if (!post) return {};
  const canonical = post.canonical_url ? new URL(post.canonical_url, siteConfig.url).toString() : absoluteUrl(`/blog/${post.slug}`);
  const description = post.meta_description || blogExcerpt(post, 155);
  return {
    title: post.meta_title || post.title,
    description,
    alternates: { canonical },
    openGraph: { type: "article", title: post.meta_title || post.title, description, url: canonical, publishedTime: post.published_at || undefined, modifiedTime: post.updated_at, images: post.cover_image_url ? [post.cover_image_url] : undefined },
    twitter: { card: post.cover_image_url ? "summary_large_image" : "summary", title: post.meta_title || post.title, description },
  };
}

export default async function BlogArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const post = await fetchBlogPost(slug);
  if (!post) notFound();
  const canonical = post.canonical_url ? new URL(post.canonical_url, siteConfig.url).toString() : absoluteUrl(`/blog/${post.slug}`);
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.meta_description || blogExcerpt(post, 155),
    datePublished: post.published_at,
    dateModified: post.updated_at,
    mainEntityOfPage: canonical,
    author: { "@type": "Person", name: post.author_display_name || "RackRate Market Desk" },
    publisher: { "@type": "Organization", name: siteConfig.name, url: siteConfig.url },
    image: post.cover_image_url || undefined,
  };

  return (
    <main className="blog-article-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
      <header className="shell blog-article-hero">
        <Link href="/blog" className="blog-back">← All market notes</Link>
        <div className="blog-article-heading"><div><span>{post.category?.name || "GPU pricing"}</span><time dateTime={post.published_at || post.updated_at}>{blogDate(post.published_at || post.updated_at)}</time></div><h1>{post.title}</h1><p>{blogExcerpt(post, 260)}</p></div>
      </header>
      {post.cover_image_url ? <div className="shell blog-cover"><img src={post.cover_image_url} alt="" /></div> : null}
      <div className="shell blog-article-layout">
        <aside><strong>RackRate market desk</strong><span>Prices need a timestamp.</span><span>Compare normalized units, terms, region, and availability.</span></aside>
        <article className="cms-prose" dangerouslySetInnerHTML={{ __html: post.html_content }} />
      </div>
      <section className="shell blog-article-next"><div><span>Compare current offers</span><h2>Move from a headline rate to a usable shortlist.</h2></div><Link href="/#prices">Open the price board ↓</Link></section>
    </main>
  );
}
