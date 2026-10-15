import { FlatkeyRecommendation } from "@/components/flatkey-recommendation";
import type { Metadata } from "next";
import { FlatkeyProfile } from "@/components/flatkey-profile";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getGpu, getOffersForProvider, getProvider, getRegionForOffer, providers } from "@/lib/data";
import { absoluteUrl, flatkeyWebsiteUrl } from "@/lib/site";

type PageProps = { params: Promise<{ slug: string }> };
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export function generateStaticParams() {
  return providers.map((provider) => ({ slug: provider.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
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
  const provider = getProvider((await params).slug);
  if (!provider) notFound();
  if (provider.slug === "flatkey") return <FlatkeyProfile />;
  const listings = getOffersForProvider(provider.slug).sort((a, b) => a.pricePerGpuHour - b.pricePerGpuHour);
  const gpuCount = new Set(listings.map((offer) => offer.gpuSlug)).size;
  const regions = new Set(listings.map((offer) => offer.region)).size;
  const floor = listings[0];

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
            <div><span>Starting at</span><strong>{floor ? money.format(floor.pricePerGpuHour) : "—"}</strong><small>per GPU / hour</small></div>
            <div><span>GPUs listed</span><strong>{gpuCount}</strong><small>models</small></div>
            <div><span>Regions</span><strong>{regions}</strong><small>in indexed offers</small></div>
            <div><span>Billing</span><strong className="text-value">{provider.billing}</strong><small>provider policy</small></div>
          </div>
        </div>
      </section>

      <section className="detail-content shell">
        <div className="detail-section-heading"><div><span className="eyebrow">Sourced catalogue</span><h2>Indexed GPU configurations</h2></div><p>Sorted by normalized per-GPU hourly rate.</p></div>
        <FlatkeyRecommendation content={`provider_${provider.slug}_recommended`} />
        <div className="provider-offers-grid">
          {listings.map((offer) => {
            const gpu = getGpu(offer.gpuSlug)!;
            const region = getRegionForOffer(offer);
            return (
              <article className="provider-offer" key={offer.id}>
                <div className="provider-offer-top"><span>{offer.countryCode}</span><span className={`status ${offer.availability}`}><i />{offer.availability}</span></div>
                <Link href={`/gpus/${gpu.slug}`}><h3>{gpu.shortName}</h3></Link>
                <p>{offer.gpuCount}× GPU · {offer.ramGb ? `${offer.ramGb} GB RAM` : "RAM varies"} · {region ? <Link href={`/regions/${region.slug}`}>{offer.region}</Link> : offer.region}</p>
                <div className="provider-offer-price"><strong>{money.format(offer.pricePerGpuHour)}</strong><span>/ GPU / hr</span></div>
                <div className="provider-offer-foot"><a className="data-source-link" href={offer.sourceUrl} target="_blank" rel="nofollow noreferrer">{offer.dataStatus === "official-page" ? "Official source" : "Reference"} · {offer.observedAt.slice(0, 10)} ↗</a></div>
              </article>
            );
          })}
        </div>
        <div className="detail-next-links"><Link href="/guides/gpu-rental-pricing"><span>Pricing guide</span><strong>Evaluate the full cost per GPU-hour →</strong></Link><Link href="/providers"><span>Provider directory</span><strong>Compare other GPU clouds →</strong></Link></div>
      </section>
    </main>
  );
}
