import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getGpu, getOffersForGpu, getProvider, gpus } from "@/lib/data";
import { flatkeyComputeUrl } from "@/lib/site";

type PageProps = { params: Promise<{ slug: string }> };
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export function generateStaticParams() {
  return gpus.map((gpu) => ({ slug: gpu.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const gpu = getGpu((await params).slug);
  if (!gpu) return {};
  return {
    title: `${gpu.shortName} cloud pricing`,
    description: `Compare ${gpu.name} rental prices, providers, regions, and configurations.`,
  };
}

export default async function GpuPage({ params }: PageProps) {
  const gpu = getGpu((await params).slug);
  if (!gpu) notFound();
  const listings = getOffersForGpu(gpu.slug).sort((a, b) => a.pricePerGpuHour - b.pricePerGpuHour);
  const floor = listings[0];
  const prices = listings.map((offer) => offer.pricePerGpuHour).sort((a, b) => a - b);
  const median = prices.length ? prices[Math.floor(prices.length / 2)] : 0;

  return (
    <main className="detail-main">
      <section className="detail-hero shell">
        <div className="breadcrumbs"><Link href="/">Home</Link><span>/</span><Link href="/#gpus">GPUs</Link><span>/</span><strong>{gpu.shortName}</strong></div>
        <div className="detail-title-grid">
          <div>
            <span className="eyebrow">{gpu.vendor} · {gpu.architecture}</span>
            <h1>{gpu.shortName}<small>{gpu.vramGb} GB {gpu.memoryType}</small></h1>
            <p>{gpu.summary}</p>
          </div>
          <div className="detail-price-block"><span>Lowest observed rate</span><strong>{floor ? money.format(floor.pricePerGpuHour) : "—"}</strong><small>per GPU / hour · sample feed</small><a href={flatkeyComputeUrl(gpu.slug)} target="_blank" rel="noreferrer">Get a Flatkey quote ↗</a></div>
        </div>
        <div className="spec-strip">
          <div><span>Architecture</span><strong>{gpu.architecture}</strong></div>
          <div><span>VRAM</span><strong>{gpu.vramGb} GB</strong></div>
          <div><span>Memory bandwidth</span><strong>{gpu.bandwidth}</strong></div>
          <div><span>Published</span><strong>{gpu.released}</strong></div>
        </div>
      </section>

      <section className="detail-content shell">
        <div className="detail-section-heading"><div><span className="eyebrow">Price board</span><h2>{listings.length} configurations tracked</h2></div><p>Median sample rate: <strong>{money.format(median)}</strong> per GPU-hour.</p></div>
        <div className="offer-stack">
          {listings.map((offer, index) => {
            const provider = getProvider(offer.providerSlug)!;
            return (
              <article className="offer-card" key={offer.id}>
                <div className="offer-rank">#{index + 1}</div>
                <div><Link href={`/providers/${provider.slug}`} className="offer-provider">{provider.name}</Link><span>{provider.type}</span></div>
                <div><span>Configuration</span><strong>{offer.gpuCount}× {gpu.shortName} · {offer.vcpu} vCPU</strong></div>
                <div><span>Region</span><strong>{offer.region}</strong></div>
                <div><span>Purchase</span><strong>{offer.rentalType}</strong></div>
                <div className="offer-price"><strong>{money.format(offer.pricePerGpuHour)}</strong><span>/ GPU / hr</span></div>
                <a href={flatkeyComputeUrl(`${gpu.slug}_${provider.slug}`)} target="_blank" rel="noreferrer" className="offer-source">Quote ↗</a>
              </article>
            );
          })}
        </div>
        <aside className="data-notice"><strong>Launch dataset</strong><p>These rates are representative seed data used to validate the product experience. Production collectors will attach refresh status, raw currency, and the exact provider source to every row.</p><Link href="/methodology">Review the data contract →</Link></aside>
      </section>
    </main>
  );
}
