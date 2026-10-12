import type { Metadata } from "next";
import Link from "next/link";
import { getGpu, getOffersForProvider, providers } from "@/lib/data";
import { absoluteUrl } from "@/lib/site";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export const metadata: Metadata = {
  title: "GPU cloud providers compared",
  description:
    "Compare GPU cloud providers by sample hourly price, accelerator catalogue, regions, billing model, and available configurations.",
  alternates: { canonical: absoluteUrl("/providers") },
  openGraph: {
    title: "GPU cloud providers compared",
    description: "Compare marketplaces, specialist GPU clouds, and hyperscalers before renting GPU capacity.",
    url: absoluteUrl("/providers"),
  },
};

export default function ProvidersIndexPage() {
  return (
    <main className="directory-page">
      <section className="directory-hero shell">
        <div className="breadcrumbs"><Link href="/">Home</Link><span>/</span><strong>Providers</strong></div>
        <div className="directory-hero-grid">
          <div>
            <span className="eyebrow">Cloud provider directory</span>
            <h1>Compare where you rent GPUs.</h1>
            <p>Provider type shapes pricing, supply, support, and operational control. Compare the sample catalogue first, then verify the exact region, machine, contract, and capacity behind any published rate.</p>
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
          <p>The cards use the launch sample feed. A provider with fewer rows may have a broader live catalogue than this preview shows, so treat counts as indexed coverage rather than a completeness claim.</p>
        </div>
        <div className="directory-card-grid provider-directory-grid">
          {providers.map((provider) => {
            const providerOffers = getOffersForProvider(provider.slug).sort((a, b) => a.pricePerGpuHour - b.pricePerGpuHour);
            const floor = providerOffers[0];
            const gpuNames = Array.from(new Set(providerOffers.map((offer) => getGpu(offer.gpuSlug)?.shortName).filter(Boolean)));
            const regionCount = new Set(providerOffers.map((offer) => offer.region)).size;
            return (
              <article className="directory-card provider-directory-card" key={provider.slug}>
                <div className="directory-card-meta"><span>{provider.type}</span><span>{provider.hq}</span></div>
                <Link href={`/providers/${provider.slug}`}><h2>{provider.name}</h2></Link>
                <p>{provider.summary}</p>
                <dl className="directory-facts">
                  <div><dt>Billing</dt><dd>{provider.billing}</dd></div>
                  <div><dt>Sample coverage</dt><dd>{providerOffers.length} offers · {regionCount} region{regionCount === 1 ? "" : "s"}</dd></div>
                  <div><dt>GPUs indexed</dt><dd>{gpuNames.length ? gpuNames.join(", ") : "No sample listings"}</dd></div>
                </dl>
                <div className="directory-card-foot">
                  <span>From <strong>{floor ? money.format(floor.pricePerGpuHour) : "—"}</strong>/hr</span>
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
          <div><span className="eyebrow">Ready to compare offers?</span><h2>Put every provider on the same unit.</h2></div>
          <Link className="button button-primary" href="/#prices">Open the price comparison <span>→</span></Link>
        </div>
      </section>
    </main>
  );
}
