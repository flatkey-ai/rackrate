import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getGpu, getOffersForProvider, getProvider, providers } from "@/lib/data";
import { flatkeyComputeUrl } from "@/lib/site";

type PageProps = { params: Promise<{ slug: string }> };
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export function generateStaticParams() {
  return providers.map((provider) => ({ slug: provider.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const provider = getProvider((await params).slug);
  if (!provider) return {};
  return {
    title: `${provider.name} GPU pricing`,
    description: `Compare ${provider.name} GPU offers, regions, configurations, and hourly prices.`,
  };
}

export default async function ProviderPage({ params }: PageProps) {
  const provider = getProvider((await params).slug);
  if (!provider) notFound();
  const listings = getOffersForProvider(provider.slug).sort((a, b) => a.pricePerGpuHour - b.pricePerGpuHour);
  const gpuCount = new Set(listings.map((offer) => offer.gpuSlug)).size;
  const regions = new Set(listings.map((offer) => offer.region)).size;
  const floor = listings[0];

  return (
    <main className="detail-main provider-detail">
      <section className="provider-hero shell">
        <div className="breadcrumbs"><Link href="/">Home</Link><span>/</span><Link href="/#providers">Providers</Link><span>/</span><strong>{provider.name}</strong></div>
        <div className="provider-hero-grid">
          <div>
            <span className="eyebrow">{provider.type} · {provider.hq}</span>
            <h1>{provider.name}</h1>
            <p>{provider.summary}</p>
            <a className="button button-primary" href={flatkeyComputeUrl(`provider_${provider.slug}`)} target="_blank" rel="noreferrer">Source via Flatkey <span>↗</span></a>
          </div>
          <div className="provider-scorecard">
            <div><span>Starting at</span><strong>{floor ? money.format(floor.pricePerGpuHour) : "—"}</strong><small>per GPU / hour</small></div>
            <div><span>GPUs listed</span><strong>{gpuCount}</strong><small>models</small></div>
            <div><span>Regions</span><strong>{regions}</strong><small>in sample feed</small></div>
            <div><span>Billing</span><strong className="text-value">{provider.billing}</strong><small>provider policy</small></div>
          </div>
        </div>
      </section>

      <section className="detail-content shell">
        <div className="detail-section-heading"><div><span className="eyebrow">Available catalogue</span><h2>Published GPU offers</h2></div><p>Sorted by normalized per-GPU hourly rate.</p></div>
        <div className="provider-offers-grid">
          {listings.map((offer) => {
            const gpu = getGpu(offer.gpuSlug)!;
            return (
              <article className="provider-offer" key={offer.id}>
                <div className="provider-offer-top"><span>{offer.countryCode}</span><span className={`status ${offer.availability}`}><i />{offer.availability}</span></div>
                <Link href={`/gpus/${gpu.slug}`}><h3>{gpu.shortName}</h3></Link>
                <p>{offer.gpuCount}× GPU · {offer.ramGb} GB RAM · {offer.region}</p>
                <div className="provider-offer-price"><strong>{money.format(offer.pricePerGpuHour)}</strong><span>/ GPU / hr</span></div>
                <div className="provider-offer-foot"><a className="data-source-link" href={offer.sourceUrl} target="_blank" rel="nofollow noreferrer">Data source</a><a href={flatkeyComputeUrl(`${gpu.slug}_${provider.slug}`)} target="_blank" rel="noreferrer">Flatkey quote ↗</a></div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
