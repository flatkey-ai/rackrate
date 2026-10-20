import { PriceExplorer } from "@/components/price-explorer";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getGpu, getOffersForGpu, gpus, gpuMemoryLabel } from "@/lib/data";
import { cheapestComparableOffer, formatBenchmarkPrice } from "@/lib/pricing";
import { absoluteUrl, flatkeyWebsiteUrl } from "@/lib/site";

type PageProps = { params: Promise<{ slug: string }> };

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
  const listings = getOffersForGpu(gpu.slug);
  const floor = cheapestComparableOffer(listings);
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
            <h1>{gpu.shortName}<small>{gpuMemoryLabel(gpu)}</small></h1>
            <p>{gpu.summary}</p>
          </div>
          <div className="detail-price-block">
            <span>USD on-demand benchmark</span>
            <strong>{formatBenchmarkPrice(floor)}</strong>
            <small>per GPU / hour · eligible public quotes</small>
            <a className="detail-flatkey-cta" href={flatkeyWebsiteUrl(`${gpu.slug}_profile`, "gpu_detail")} target="_blank" rel="sponsored nofollow noreferrer">Request a {gpu.shortName} quote <span>↗</span></a>
          </div>
        </div>
        <div className="spec-strip">
          <div><span>Architecture</span><strong>{gpu.architecture}</strong></div>
          <div><span>VRAM</span><strong>{gpu.vramGb === null ? "Varies by listing" : `${gpu.vramGb} GB`}</strong></div>
          <div><span>Memory bandwidth</span><strong>{gpu.bandwidth}</strong></div>
          <div><span>Published</span><strong>{gpu.released ?? "Not catalogued"}</strong></div>
        </div>
      </section>

      <section className="detail-content shell">
        <div className="detail-section-heading"><div><span className="eyebrow">Price board</span><h2>{listings.length} configurations tracked</h2></div><p>Variants, currencies and purchase models stay separate. The benchmark excludes offline, reference, member, starting and component-only prices.</p></div>
        <PriceExplorer gpuSlug={gpu.slug} />
        <aside className="data-notice"><strong>Source-backed snapshot</strong><p>{verifiedCount} price{verifiedCount === 1 ? "" : "s"} on this page come from automated official-source collectors; {referenceCount} dated reference record{referenceCount === 1 ? "" : "s"} still require provider confirmation. Latest observation: {checkedAt}.</p><Link href="/methodology">Review collection rules and limits →</Link></aside>
        <div className="detail-next-links"><Link href="/guides/gpu-rental-pricing"><span>Buying guide</span><strong>How to compare GPU rental prices →</strong></Link><Link href="/regions"><span>Location index</span><strong>Compare GPU cloud regions →</strong></Link></div>
      </section>
    </main>
  );
}
