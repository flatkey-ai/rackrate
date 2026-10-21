export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Link from "next/link";
import { getPricingSnapshot } from "@/lib/pricing-snapshot";
import { SnapshotFooter } from "@/components/snapshot-footer";
import { cheapestComparableOffer, formatBenchmarkPrice } from "@/lib/pricing";
import { absoluteUrl, flatkeyWebsiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "GPU cloud providers compared",
  description:
    "Compare GPU cloud providers by sourced hourly price, accelerator catalogue, regions, billing model, and available configurations.",
  alternates: { canonical: absoluteUrl("/providers") },
  openGraph: {
    title: "GPU cloud providers compared",
    description: "Compare marketplaces, specialist GPU clouds, and hyperscalers before renting GPU capacity.",
    url: absoluteUrl("/providers"),
  },
};

export default async function ProvidersIndexPage() {
  const snapshot = await getPricingSnapshot();
  const { getGpu, getOffersForProvider, providers } = snapshot;

  return (
    <main className="directory-page">
      <section className="directory-hero shell">
        <div className="breadcrumbs"><Link href="/">Home</Link><span>/</span><strong>Providers</strong></div>
        <div className="directory-hero-grid">
          <div>
            <span className="eyebrow">Cloud provider directory</span>
            <h1>Compare where you rent GPUs.</h1>
            <p>Compare quote-based GPU services, specialist clouds and marketplaces. Flatkey matches requirements to a formal quote; the other profiles provide sourced rates to help you evaluate configurations and costs.</p>
          </div>
          <div className="provider-type-key">
            <div><span>01</span><strong>Marketplace</strong><p>Distributed host inventory with flexible pricing and configuration variance.</p></div>
            <div><span>02</span><strong>GPU cloud</strong><p>Specialist infrastructure built around accelerator workloads and developer access.</p></div>
            <div><span>03</span><strong>Hyperscaler</strong><p>Broad cloud services, formal procurement, and many regional instance families.</p></div>
          </div>
        </div>
      </section>

      <section className="directory-content shell">
        <div className="directory-intro">
          <div><span className="eyebrow">Provider scorecards</span><h2>Compare the operating model, not just the rate.</h2></div>
          <p>Compare nine tracked providers: Nebius, Crusoe, Lambda, UCloud, AutoDL, RunPod, DigitalOcean, Verda and Microsoft Azure. Listing counts describe RackRate’s coverage, not a provider’s entire catalogue. Flatkey’s separate commercial profile and quote links are not competitor prices. Comparison rows are grouped by billing period, purchase model and price basis before sorting in USD. Summary benchmarks use eligible hourly on-demand prices, converted with the dated ECB rates disclosed below.</p>
        </div>
        <div className="directory-card-grid provider-directory-grid">
          {providers.map((provider) => {
            const providerOffers = getOffersForProvider(provider.slug);
            const floor = cheapestComparableOffer(providerOffers);
            const gpuNames = Array.from(new Set(providerOffers.map((offer) => getGpu(offer.gpuSlug)?.shortName).filter(Boolean)));
            const regionCount = new Set(providerOffers.map((offer) => offer.region)).size;
            return (
              <article className="directory-card provider-directory-card" key={provider.slug}>
                <div className="directory-card-meta"><span>{provider.type}</span><span>{provider.hq}</span></div>
                <Link href={`/providers/${provider.slug}`}><h2>{provider.name}</h2></Link>
                <p>{provider.summary}</p>
                <dl className="directory-facts">
                  <div><dt>Billing</dt><dd>{provider.billing}</dd></div>
                  <div><dt>{provider.slug === "flatkey" ? "Capacity" : "Indexed coverage"}</dt><dd>{provider.slug === "flatkey" ? "Model, quantity and region matched per request" : `${providerOffers.length} offers · ${regionCount} region${regionCount === 1 ? "" : "s"}`}</dd></div>
                  <div><dt>{provider.slug === "flatkey" ? "Delivery" : "GPUs indexed"}</dt><dd>{provider.slug === "flatkey" ? "Configuration and timing confirmed in the quote" : gpuNames.length ? gpuNames.join(", ") : "No indexed listings"}</dd></div>
                </dl>
                <div className="directory-card-foot">
                  <span>{floor ? <>USD on-demand <strong>{formatBenchmarkPrice(floor)}</strong>/hr</> : <strong>{provider.slug === "flatkey" ? "Request quote" : "See original rates"}</strong>}</span>
                  <Link href={`/providers/${provider.slug}`}>Review {provider.name} →</Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="buying-checklist shell">
        <div className="buying-checklist-head"><span className="eyebrow">Before you rent GPUs</span><h2>Six questions for every provider shortlist.</h2></div>
        <ol>
          <li><span>01</span><div><h3>Is capacity actually bookable?</h3><p>A published price does not guarantee stock for your GPU count, region, and start date.</p></div></li>
          <li><span>02</span><div><h3>What is the complete node?</h3><p>Confirm CPU, system RAM, local storage, network bandwidth, and accelerator interconnect.</p></div></li>
          <li><span>03</span><div><h3>How is usage metered?</h3><p>Per-second billing reduces idle cost, while minimum terms can change the effective hourly price.</p></div></li>
          <li><span>04</span><div><h3>What does data movement cost?</h3><p>Estimate ingress, internet egress, cross-zone traffic, and checkpoint transfer separately.</p></div></li>
          <li><span>05</span><div><h3>What happens when a node fails?</h3><p>Ask about replacement capacity, credits, persistent storage, and support response.</p></div></li>
          <li><span>06</span><div><h3>Can procurement verify the terms?</h3><p>Match the public listing to a quote that names the GPU, quantity, location, term, and exclusions.</p></div></li>
        </ol>
        <div className="conversion-band compact">
          <div><span className="eyebrow">Have your requirements ready?</span><h2>Request a quote you can compare.</h2></div>
          <a className="button button-primary" href={flatkeyWebsiteUrl("provider_directory_quote")} target="_blank" rel="sponsored nofollow noreferrer">Request a Flatkey quote <span>↗</span></a>
        </div>
      </section>
      <SnapshotFooter offers={snapshot.offers} generatedAt={snapshot.generatedAt} publication={snapshot.publication} />
    </main>
  );
}
