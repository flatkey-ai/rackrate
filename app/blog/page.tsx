import type { Metadata } from "next";
import Link from "next/link";
import { blogDate, blogExcerpt, fetchBlogPosts } from "@/lib/blog";
import { absoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Cloud GPU pricing, providers, and cost guides",
  description: "Sourced guides to GPU rental prices, provider terms, regions, availability, and the hidden costs behind hourly rates.",
  robots: { index: false, follow: true },
  alternates: { canonical: absoluteUrl("/blog") },
};

export default async function BlogPage() {
  const posts = await fetchBlogPosts();

  return (
    <main className="blog-page">
      <header className="shell blog-index-hero">
        <div><span className="blog-kicker">RackRate market desk / English</span><h1>Price signals,<br /><em>with context.</em></h1></div>
        <p>Source-dated research on hourly GPU rates, billing models, regions, provider tradeoffs, availability, and the costs that rarely fit in a headline number.</p>
      </header>
      <section className="shell blog-index" aria-label="Latest market research">
        <div className="blog-index-heading"><span>Latest market research</span><span>{posts.length} published</span></div>
        {posts.length ? (
          <div className="blog-card-grid">
            {posts.map((post, index) => (
              <article className="blog-card" key={post.id}>
                <Link href={`/blog/${post.slug}`} aria-label={`Read ${post.title}`}>
                  {post.cover_image_url ? <img src={post.cover_image_url} alt="" /> : <span className="blog-card-signal"><small>MARKET NOTE</small>{String(index + 1).padStart(2, "0")}</span>}
                  <div className="blog-card-body">
                    <div className="blog-card-meta"><span>{post.category?.name || "GPU pricing"}</span><time dateTime={post.published_at || post.updated_at}>{blogDate(post.published_at || post.updated_at)}</time></div>
                    <h2>{post.title}</h2><p>{blogExcerpt(post)}</p><b>Open market note ↗</b>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="blog-empty"><strong>The market desk is connected.</strong><p>Reviewed RackRate research will appear here after the first article is approved and published.</p><Link href="/guides/gpu-rental-pricing">Read the pricing guide ↗</Link></div>
        )}
      </section>
    </main>
  );
}
