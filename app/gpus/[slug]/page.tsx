import { FlatkeyRecommendation } from "@/components/flatkey-recommendation";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getGpu, getOffersForGpu, getProvider, gpus } from "@/lib/data";
import { absoluteUrl, flatkeyWebsiteUrl } from "@/lib/site";

type PageProps = { params: Promise<{ slug: string }> };
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export function generateStaticParams() {
  return gpus.map((gpu) => ({ slug: gpu.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const gpu = getGpu((await params).slug);
  if (!gpu) return {};
  const title = `${gpu.shortName} GPU rental prices per hour`;
  const description = `Compare sourced ${gpu.name} rental prices per hour, cloud providers, regions, node configurations, and availability.`;
  return {
    title,
    description,
    alternates: { canonical: absoluteUrl(`/gpus/${gpu.slug}`) },
    openGraph: { title, description, url: absoluteUrl(`/gpus/${gpu.slug}`) },
  };
}

export default async function GpuPage({ params }: PageProps) {
  const gpu = getGpu((await params).slug);
  if (!gpu) notFound();
  const listings = getOffersForGpu(gpu.slug).sort((a, b) => a.pricePerGpuHour - b.pricePerGpuHour);
  const floor = listings[0];
  const prices = listings.map((offer) => offer.pricePerGpuHour).sort((a, b) => a - b);
  const midpoint = Math.floor(prices.length / 2);
  const median = prices.length === 0
    ? 0
    : prices.length % 2 === 0
      ? (prices[midpoint - 1] + prices[midpoint]) / 2
      : prices[midpoint];
  const verifiedCount = listings.filter((offer) => offer.dataStatus === "official-page").length;
  const referenceCount = listings.length - verifiedCount;
  const newestObservation = listings
    .map((offer) => Date.parse(offer.observedAt))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];
  const checkedAt = newestObservation
    ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(newestObservation))
    : "Not yet observed";

  return (
    <main className="detail-main">
      <section className="detail-hero shell">
        <div className="breadcrumbs"><Link href="/">Home</Link><span>/</span><Link href="/gpus">GPUs</Link><span>/</span><strong>{gpu.shortName}</strong></div>
        <div className="detail-title-grid">
          <div>
            <span className="eyebrow">{gpu.vendor} · {gpu.architecture}</span>
            <h1>{gpu.shortName}<small>{gpu.vramGb} GB {gpu.memoryType}</small></h1>
            <p>{gpu.summary}</p>
          </div>
          <div className="detail-price-block">
            <span>Lowest observed rate</span>
            <strong>{floor ? money.format(floor.pricePerGpuHour) : "—"}</strong>
            <small>per GPU / hour · sourced snapshot</small>
            <a className="detail-flatkey-cta" href={flatkeyWebsiteUrl(`${gpu.slug}_profile`, "gpu_detail")} target="_blank" rel="sponsored nofollow noreferrer">Request a {gpu.shortName} quote <span>↗</span></a>
          </div>
        </div>
        <div className="spec-strip">
          <div><span>Architecture</span><strong>{gpu.architecture}</strong></div>
          <div><span>VRAM</span><strong>{gpu.vramGb} GB</strong></div>
          <div><span>Memory bandwidth</span><strong>{gpu.bandwidth}</strong></div>
          <div><span>Published</span><strong>{gpu.released}</strong></div>
        </div>
      </section>

      <section className="detail-content shell">
        <div className="detail-section-heading"><div><span className="eyebrow">Price board</span><h2>{listings.length} configurations tracked</h2></div><p>Median: <strong>{money.format(median)}</strong>/GPU-hour across listed purchase models. Compare like-for-like terms.</p></div>
        <FlatkeyRecommendation content={`${gpu.slug}_recommended`} />
        <div className="offer-stack">
          {listings.map((offer, index) => {
            const provider = getProvider(offer.providerSlug)!;
            return (
              <article className="offer-card" key={offer.id}>
                <div className="offer-rank">#{index + 1}</div>
                <div><Link href={`/providers/${provider.slug}`} className="offer-provider">{provider.name}</Link><span>{provider.type}</span></div>
                <div><span>Configuration</span><strong>{offer.gpuCount}× {gpu.shortName} · {offer.vcpu ? `${offer.vcpu} vCPU` : "CPU varies"}</strong></div>
                <div className="offer-region"><span>Region</span><strong>{offer.region}</strong></div>
                <div className="offer-purchase"><span>Purchase</span><strong>{offer.rentalType}</strong></div>
                <div className="offer-price"><strong>{money.format(offer.pricePerGpuHour)}</strong><span>/ GPU / hr</span><span>{money.format(offer.pricePerGpuHour * offer.gpuCount)} / node / hr</span><a className="data-source-link" href={offer.sourceUrl} target="_blank" rel="nofollow noreferrer">{offer.dataStatus === "official-page" ? "Official source" : "Reference"} · {offer.observedAt.slice(0, 10)} ↗</a></div>
              </article>
            );
          })}
        </div>
        <aside className="data-notice"><strong>Source-backed snapshot</strong><p>{verifiedCount} price{verifiedCount === 1 ? "" : "s"} on this page come from automated official-source collectors; {referenceCount} dated reference record{referenceCount === 1 ? "" : "s"} still require provider confirmation. Latest observation: {checkedAt}.</p><Link href="/methodology">Review collection rules and limits →</Link></aside>
        <div className="detail-next-links"><Link href="/guides/gpu-rental-pricing"><span>Buying guide</span><strong>How to compare GPU rental prices →</strong></Link><Link href="/regions"><span>Location index</span><strong>Compare GPU cloud regions →</strong></Link></div>
      </section>
    </main>
  );
}
