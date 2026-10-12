import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getGpu, getOffersForRegion, getProvider, getRegion, regions } from "@/lib/data";
import { absoluteUrl, flatkeyComputeUrl } from "@/lib/site";

type PageProps = { params: Promise<{ slug: string }> };
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export function generateStaticParams() {
  return regions.map((region) => ({ slug: region.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const region = getRegion((await params).slug);
  if (!region) return {};
  const title = region.slug === "global"
    ? "Global GPU cloud listings and rental pricing"
    : `${region.name} GPU cloud pricing and rental options`;
  const description = `${region.summary} Compare providers, GPU models, configurations, and normalized hourly rates.`;
  return {
    title,
    description,
    alternates: { canonical: absoluteUrl(`/regions/${region.slug}`) },
    openGraph: { title, description, url: absoluteUrl(`/regions/${region.slug}`) },
  };
}

export default async function RegionDetailPage({ params }: PageProps) {
  const region = getRegion((await params).slug);
  if (!region) notFound();
  const regionOffers = getOffersForRegion(region.slug).sort((a, b) => a.pricePerGpuHour - b.pricePerGpuHour);
  const floor = regionOffers[0];
  const providerCount = new Set(regionOffers.map((offer) => offer.providerSlug)).size;
  const gpuCount = new Set(regionOffers.map((offer) => offer.gpuSlug)).size;
  const sourceLabels = Array.from(new Set(regionOffers.map((offer) => offer.region)));
  const otherRegions = regions.filter((entry) => entry.slug !== region.slug).slice(0, 3);

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: "Regions", item: absoluteUrl("/regions") },
      { "@type": "ListItem", position: 3, name: region.name, item: absoluteUrl(`/regions/${region.slug}`) },
    ],
  };

  return (
    <main className="region-detail detail-main">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <section className="region-detail-hero shell">
        <div className="breadcrumbs"><Link href="/">Home</Link><span>/</span><Link href="/regions">Regions</Link><span>/</span><strong>{region.name}</strong></div>
        <div className="region-detail-title">
          <div><span className="eyebrow">{region.label}</span><h1>GPU cloud pricing in {region.name}.</h1><p>{region.summary}</p><a className="button button-primary hero-flatkey-cta" href={flatkeyComputeUrl(`region_${region.slug}_profile`, "region_detail")} target="_blank" rel="sponsored nofollow noreferrer">Continue to Flatkey Compute <span>↗</span></a></div>
          <div className="region-metric-panel">
            <div><span>Sample floor</span><strong>{floor ? money.format(floor.pricePerGpuHour) : "—"}</strong><small>per GPU / hour</small></div>
            <div><span>Indexed GPUs</span><strong>{gpuCount}</strong><small>accelerator models</small></div>
            <div><span>Providers</span><strong>{providerCount}</strong><small>in launch sample</small></div>
            <div><span>Source labels</span><strong className="metric-text">{sourceLabels.join(" · ") || "None"}</strong><small>grouped on this page</small></div>
          </div>
        </div>
      </section>

      <section className="region-offers shell">
        <div className="detail-section-heading"><div><span className="eyebrow">Regional price board</span><h2>{regionOffers.length} sample configuration{regionOffers.length === 1 ? "" : "s"}</h2></div><p>Sorted by normalized price per physical GPU-hour.</p></div>
        <div className="region-offer-list">
          {regionOffers.map((offer) => {
            const gpu = getGpu(offer.gpuSlug)!;
            const provider = getProvider(offer.providerSlug)!;
            return (
              <article className="region-offer-row" key={offer.id}>
                <div><span>GPU</span><Link href={`/gpus/${gpu.slug}`}>{gpu.shortName}</Link><small>{gpu.vramGb} GB {gpu.memoryType}</small></div>
                <div><span>Provider</span><Link href={`/providers/${provider.slug}`}>{provider.name}</Link><small>{provider.type}</small></div>
                <div><span>Node</span><strong>{offer.gpuCount}× GPU · {offer.vcpu} vCPU</strong><small>{offer.ramGb} GB system RAM</small></div>
                <div><span>Terms</span><strong>{offer.rentalType}</strong><small>{offer.availability} · egress {offer.egress}</small></div>
                <div className="region-offer-price"><span>Per GPU / hr</span><strong>{money.format(offer.pricePerGpuHour)}</strong><small>{money.format(offer.pricePerGpuHour * offer.gpuCount)} total / hr</small></div>
              </article>
            );
          })}
        </div>
        <div className="sample-disclosure"><strong>Sample coverage, not live inventory.</strong><p>These launch records demonstrate the comparison model. Confirm current location, quantity, machine specification, terms, and availability with a provider or a firm quote before making a deployment decision.</p></div>
      </section>

      <section className="region-notes">
        <div className="shell region-notes-grid">
          <div><span className="eyebrow">Planning context</span><h2>When {region.name} belongs on the shortlist.</h2><p>{region.bestFor}</p></div>
          <ol>{region.planningNotes.map((note, index) => <li key={note}><span>0{index + 1}</span><p>{note}</p></li>)}</ol>
        </div>
      </section>

      <section className="related-markets shell">
        <div className="directory-intro"><div><span className="eyebrow">Compare alternatives</span><h2>Keep another region in the cost model.</h2></div><p>A nearby or globally listed option can reveal the premium attached to location, procurement model, or scarce capacity.</p></div>
        <div className="related-link-grid">
          {otherRegions.map((entry) => <Link href={`/regions/${entry.slug}`} key={entry.slug}><span>{entry.label}</span><strong>{entry.name}</strong><i>↗</i></Link>)}
        </div>
      </section>
    </main>
  );
}
