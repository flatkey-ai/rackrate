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
import { priceRegionCoverage } from "@/lib/offer-comparison";

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
  const { getOffersForProvider, getProvider, providers } = snapshot;
  const explorerData = { offers: snapshot.offers, gpus: snapshot.gpus, providers: snapshot.providers, generatedAt: snapshot.generatedAt, sources: snapshot.sources };

  const provider = getProvider((await params).slug);
  if (!provider) notFound();
  if (provider.slug === "flatkey") return <FlatkeyProfile />;
  const listings = getOffersForProvider(provider.slug);
  const gpuCount = new Set(listings.map((offer) => offer.gpuSlug)).size;
  const location = priceRegionCoverage(listings);
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
            <div><span>Price regions</span><strong>{location.regionCount}</strong><small>{location.coverageOnlyCount ? `${location.coverageOnlyCount} platform coverage listings separately` : location.regionCount ? "tied to indexed prices" : "Price region unverified"}</small></div>
            <div><span>Billing</span><strong className="text-value">{provider.billing}</strong><small>provider policy</small></div>
          </div>
        </div>
      </section>

      <section className="detail-content shell">
        <div className="detail-section-heading"><div><span className="eyebrow">Regional hourly quotes</span><h2>Comparable GPU configurations</h2></div><p>Each price is numeric, per GPU-hour and tied to a published country and region. Original amounts and dated exchange rates stay attached. Monthly packages and unverified price locations are excluded.</p></div>
        <PriceExplorer {...explorerData} providerSlug={provider.slug} />
        <div className="detail-next-links"><Link href="/guides/gpu-rental-pricing"><span>Pricing guide</span><strong>Evaluate the full cost per GPU-hour →</strong></Link><Link href="/providers"><span>Provider directory</span><strong>Compare other GPU clouds →</strong></Link></div>
      </section>
      <SnapshotFooter offers={snapshot.offers} generatedAt={snapshot.generatedAt} publication={snapshot.publication} />
    </main>
  );
}
