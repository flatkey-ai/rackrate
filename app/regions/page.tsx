import type { Metadata } from "next";
import Link from "next/link";
import { getGpu, getOffersForRegion, getProvider, getRegionCoverage, isRegionIndexable, regions } from "@/lib/data";
import { absoluteUrl } from "@/lib/site";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export const metadata: Metadata = {
  title: "GPU cloud regions and rental prices",
  description:
    "Compare sample GPU cloud prices and accelerator availability across Canada, the United States, Europe, India, and global listings.",
  alternates: { canonical: absoluteUrl("/regions") },
  openGraph: {
    title: "GPU cloud regions and rental prices",
    description: "Explore regional GPU cloud offers, providers, and hourly pricing signals.",
    url: absoluteUrl("/regions"),
  },
};

export default function RegionsIndexPage() {
  return (
    <main className="directory-page">
      <section className="directory-hero shell">
        <div className="breadcrumbs"><Link href="/">Home</Link><span>/</span><strong>Regions</strong></div>
        <div className="directory-hero-grid">
          <div>
            <span className="eyebrow">Regional GPU price index</span>
            <h1>Place compute near what matters.</h1>
            <p>Compare the sample accelerator catalogue by deployment area. Region affects latency, data movement, policy requirements, available providers, and whether a quoted machine can be delivered when you need it.</p>
          </div>
          <div className="region-map-card" aria-label="Region planning factors">
            <span className="map-label map-label-a">Latency</span>
            <span className="map-label map-label-b">Capacity</span>
            <span className="map-label map-label-c">Data</span>
            <span className="map-label map-label-d">Egress</span>
            <div className="map-orbit"><i /><i /><i /></div>
            <strong>Region is part of the price.</strong>
          </div>
        </div>
      </section>

      <section className="directory-content shell">
        <div className="directory-intro">
          <div><span className="eyebrow">Indexed markets</span><h2>Regional price signals, with their limits visible.</h2></div>
          <p>Some offers use a country or cloud-region label; others are listed globally. Open a page to see exactly which source labels are grouped into that market and how much sample coverage exists.</p>
        </div>
        <div className="region-grid">
          {regions.map((region, index) => {
            const regionOffers = getOffersForRegion(region.slug).sort((a, b) => a.pricePerGpuHour - b.pricePerGpuHour);
            const floor = regionOffers[0];
            const gpuCount = new Set(regionOffers.map((offer) => offer.gpuSlug)).size;
            const providerCount = new Set(regionOffers.map((offer) => offer.providerSlug)).size;
            const cheapestGpu = floor ? getGpu(floor.gpuSlug) : undefined;
            const cheapestProvider = floor ? getProvider(floor.providerSlug) : undefined;
            const coverage = getRegionCoverage(region.slug);
            const indexable = isRegionIndexable(region.slug);
            return (
              <Link className="region-card" href={`/regions/${region.slug}`} key={region.slug}>
                <div className="region-card-index">{String(index + 1).padStart(2, "0")}</div>
                <div className="region-card-copy"><span>{region.label}</span><h2>{region.name}</h2><p>{region.summary}</p></div>
                <div className="region-card-stats">
                  <span>{regionOffers.length} offer{regionOffers.length === 1 ? "" : "s"}</span>
                  <span>{gpuCount} GPU{gpuCount === 1 ? "" : "s"}</span>
                  <span>{providerCount} provider{providerCount === 1 ? "" : "s"}</span>
                  <span>{coverage.officialCount} verified · {coverage.referenceCount} reference</span>
                </div>
                <div className="region-card-floor"><span>{indexable ? "Comparable sample floor" : "Limited research note"}</span><strong>{floor ? money.format(floor.pricePerGpuHour) : "—"}</strong><small>{cheapestGpu?.shortName || "No GPU"} · {cheapestProvider?.name || "No provider"}</small></div>
                <span className="region-card-arrow">↗</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="region-planning shell">
        <div className="section-heading split-heading">
          <div><span className="eyebrow">Location checklist</span><h2>A region name is not a deployment plan.</h2></div>
          <p>Before choosing the lowest hourly rate, turn the location label into concrete infrastructure and operating assumptions.</p>
        </div>
        <div className="principle-grid">
          <article><span>01</span><h3>Resolve the facility</h3><p>Ask for the actual country, cloud region, or datacenter when a listing uses a broad geographic label.</p></article>
          <article><span>02</span><h3>Price data movement</h3><p>Model dataset ingress, checkpoint storage, cross-zone traffic, and user-facing egress alongside GPU hours.</p></article>
          <article><span>03</span><h3>Verify replacement supply</h3><p>Capacity for one node does not guarantee scale-out inventory or fast replacement after a failure.</p></article>
        </div>
        <div className="conversion-band">
          <div><span className="eyebrow">Region selected?</span><h2>Check the full cost behind the location.</h2><p>Carry data movement, storage, node configuration, and purchase terms into the shortlist.</p></div>
          <Link className="button button-primary" href="/guides/gpu-rental-pricing">Review the pricing guide <span>→</span></Link>
        </div>
      </section>
    </main>
  );
}
