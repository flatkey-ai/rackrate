export const dynamic = "force-dynamic";

import { PriceExplorer } from "@/components/price-explorer";
import type { Metadata } from "next";
import { FlatkeyProfile } from "@/components/flatkey-profile";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPricingSnapshot } from "@/lib/pricing-snapshot";
import { SnapshotFooter } from "@/components/snapshot-footer";
import { cheapestComparableOffer, formatBenchmarkPrice } from "@/lib/pricing";
import { absoluteUrl, flatkeyWebsiteUrl } from "@/lib/site";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { getProvider } = await getPricingSnapshot();
  const provider = getProvider((await params).slug);
  if (!provider) return {};
  const title = provider.slug === "flatkey" ? "Flatkey Compute: GPU capacity and quote requests" : `${provider.name} GPU rental prices and cloud costs`;
  const description = provider.slug === "flatkey" ? "Explore Flatkey’s request-based GPU service: workload matching, formal quotes, and confirmed configuration and delivery terms." : `Compare sourced ${provider.name} GPU rental prices per hour, accelerators, regions, configurations, and purchase terms.`;
  return {
    title,
    description,
    alternates: { canonical: absoluteUrl(`/providers/${provider.slug}`) },
    openGraph: { title, description, url: absoluteUrl(`/providers/${provider.slug}`) },
  };
}

export default async function ProviderPage({ params }: PageProps) {
  const snapshot = await getPricingSnapshot();
  const { getOffersForProvider, getAuditOffersForProvider, getProviderSourceNotice, getProvider, providers } = snapshot;
  const explorerData = { offers: snapshot.offers, gpus: snapshot.gpus, providers: snapshot.providers, generatedAt: snapshot.generatedAt, sources: snapshot.sources };

  const provider = getProvider((await params).slug);
  if (!provider) notFound();
  if (provider.slug === "flatkey") return <FlatkeyProfile />;
  const listings = getOffersForProvider(provider.slug);
  const auditListings = getAuditOffersForProvider(provider.slug);
  const sourceNotice = getProviderSourceNotice(provider.slug);
  const gpuCount = new Set(listings.map((offer) => offer.gpuSlug)).size;
  const regions = new Set(listings.map((offer) => offer.region)).size;
  const floor = cheapestComparableOffer(listings);

  return (
    <main className="detail-main provider-detail">
      <section className="provider-hero shell">
        <div className="breadcrumbs"><Link href="/">Home</Link><span>/</span><Link href="/providers">Providers</Link><span>/</span><strong>{provider.name}</strong></div>
        <div className="provider-hero-grid">
          <div>
            <span className="eyebrow">{provider.type} · {provider.hq}</span>
            <h1>{provider.name}</h1>
            <p>{provider.summary}</p>
            <a className="button button-primary hero-flatkey-cta" href={flatkeyWebsiteUrl(`provider_${provider.slug}_profile`, "provider_detail")} target="_blank" rel="sponsored nofollow noreferrer">Request a Flatkey quote <span>↗</span></a>
          </div>
          <div className="provider-scorecard">
            <div><span>USD on-demand benchmark</span><strong>{formatBenchmarkPrice(floor)}</strong><small>per GPU / hour</small></div>
            <div><span>GPUs listed</span><strong>{gpuCount}</strong><small>models</small></div>
            <div><span>Regions</span><strong>{regions}</strong><small>in indexed offers</small></div>
            <div><span>Billing</span><strong className="text-value">{provider.billing}</strong><small>provider policy</small></div>
          </div>
        </div>
      </section>

      <section className="detail-content shell">
        {sourceNotice && <p>{sourceNotice}</p>}
        <div className="detail-section-heading"><div><span className="eyebrow">Verified regional prices</span><h2>Hourly GPU configurations</h2></div><p>Fixed hourly prices with verified countries and regions. Shared catalog prices are included only where their listed regions are verified.</p></div>
        {listings.length ? <PriceExplorer {...explorerData} providerSlug={provider.slug} /> : <p>No verified regional fixed rates are available for comparison yet.</p>}
        {auditListings.length > 0 && <section className="directory-intro" aria-label="Source catalog audit"><div><span className="eyebrow">Source catalog</span><h2>{auditListings.length} records kept for audit</h2></div><p>These records have unconfirmed quote geography, starting prices, non-hourly billing or require a sales quote. They are excluded from formal price comparisons. <a href={auditListings[0].sourceUrl} target="_blank" rel="noreferrer">View the original source ↗</a> · <a href="https://raw.githubusercontent.com/flatkey-ai/rackrate/main/data/public-prices.json" target="_blank" rel="noreferrer">All source records (JSON) ↗</a></p></section>}
        <div className="detail-next-links"><Link href="/guides/gpu-rental-pricing"><span>Pricing guide</span><strong>Evaluate the full cost per GPU-hour →</strong></Link><Link href="/providers"><span>Provider directory</span><strong>Compare other GPU clouds →</strong></Link></div>
      </section>
      <SnapshotFooter offers={snapshot.offers} generatedAt={snapshot.generatedAt} publication={snapshot.publication} />
    </main>
  );
}
