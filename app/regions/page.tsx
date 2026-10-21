export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";
import { getPricingSnapshot } from "@/lib/pricing-snapshot";
import { SnapshotFooter } from "@/components/snapshot-footer";
import { cheapestComparableOffer, formatBenchmarkPrice } from "@/lib/pricing";
import { isRegionSpecificPrice } from "@/lib/region-matching";
import { absoluteUrl, flatkeyWebsiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "GPU cloud regions and rental prices",
  description:
    "Compare sourced GPU cloud prices across China, Canada, the United States, Europe, India, Asia Pacific, the Middle East and Latin America.",
  alternates: { canonical: absoluteUrl("/regions") },
  openGraph: {
    title: "GPU cloud regions and rental prices",
    description: "Explore regional GPU cloud offers, providers, and hourly pricing signals.",
    url: absoluteUrl("/regions"),
  },
};

export default async function RegionsIndexPage() {
  const snapshot = await getPricingSnapshot();
  const { getGpu, getOffersForRegion, getProvider, getRegionCoverage, isRegionIndexable, regions } = snapshot;

  return (
    <main className="directory-page">
      <section className="directory-hero shell">
        <div className="breadcrumbs"><Link href="/">Home</Link><span>/</span><strong>Regions</strong></div>
        <div className="directory-hero-grid">
          <div>
            <span className="eyebrow">Regional GPU price index</span>
            <h1>Place compute near what matters.</h1>
            <p>Use regional rates to plan for latency, data movement and deployment requirements. Ask Flatkey to confirm the requested location and delivery conditions in a quote; indexed prices below provide market context.</p>
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
          <p>Markets group numeric per-GPU hourly prices bound to a published country and region. Unverified locations, platform coverage references, starting prices and monthly packages are excluded from every comparison table.</p>
        </div>
        <div className="region-grid">
          {regions.filter((region) => getRegionCoverage(region.slug).offerCount > 0).map((region, index) => {
            const regionOffers = getOffersForRegion(region.slug);
            const floor = cheapestComparableOffer(regionOffers.filter(isRegionSpecificPrice));
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
                  <span>{coverage.officialCount} official · {coverage.referenceCount} reference</span>
                  <span>{coverage.regionalPriceCount} regional prices{coverage.coverageOnlyCount > 0 ? ` · ${coverage.coverageOnlyCount} platform coverage` : ""}</span>
                  {coverage.offlineCount > 0 && <span>{coverage.offlineCount} offline</span>}
                </div>
                <div className="region-card-floor"><span>{floor ? "USD on-demand benchmark / GPU-hour" : "No eligible on-demand hourly price"}</span><strong>{formatBenchmarkPrice(floor)}</strong><small>{floor ? `${cheapestGpu?.shortName} · ${cheapestProvider?.name}` : coverage.offlineCount === coverage.offerCount ? "All listed offers are offline" : indexable ? "See published periods and purchase terms" : "Limited sourced coverage"}</small></div>
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
          <div><span className="eyebrow">Region selected?</span><h2>Confirm the region in a quote.</h2><p>Share your preferred location, GPU count and start date with Flatkey. Confirm the actual facility, configuration and data-transfer terms before committing.</p></div>
          <a className="button button-primary" href={flatkeyWebsiteUrl("region_directory_quote")} target="_blank" rel="sponsored nofollow noreferrer">Discuss a region with Flatkey <span>↗</span></a>
        </div>
      </section>
      <SnapshotFooter offers={snapshot.offers} generatedAt={snapshot.generatedAt} publication={snapshot.publication} />
    </main>
  );
}
