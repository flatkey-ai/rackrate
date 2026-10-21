export const dynamic = "force-dynamic";

import Link from "next/link";
import { PriceExplorer } from "@/components/price-explorer";
import { getPricingSnapshot } from "@/lib/pricing-snapshot";
import { FxDisclosure } from "@/components/fx-disclosure";
import { PricingRefresh } from "@/components/pricing-refresh";
import { gpuMemoryLabel } from "@/lib/data";
import { formatBenchmarkPrice, summaryConfigurationLabel } from "@/lib/pricing";
import { directoryHeadlineOffer } from "@/lib/offer-comparison";
import { flatkeyWebsiteUrl } from "@/lib/site";

export default async function Home() {
  const snapshot = await getPricingSnapshot();
  const { getCheapestOffer, getOffersForGpu, getOffersForProvider, gpus, offers, providers } = snapshot;
  const explorerData = { offers, gpus, providers, generatedAt: snapshot.generatedAt, sources: snapshot.sources };
  const h100 = getCheapestOffer("nvidia-h100");
  const collectedAt = new Intl.DateTimeFormat("en", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Shanghai",
  }).format(new Date(snapshot.generatedAt));

  return (
    <main className="home-page">
      <section className="hero">
        <div className="hero-grid shell">
          <div className="hero-copy">
            <div className="hero-kicker"><span>{providers.length} platforms</span>Official pricing sources</div>
            <h1>Compare GPU<br /><em>rental prices.</em></h1>
            <p>Compare hourly GPU catalog and regional prices. Check configuration, price scope and purchase terms.</p>
            <div className="hero-actions">
              <Link className="button button-primary" href="#prices">Compare prices <span>↓</span></Link>
              <Link className="button button-secondary" href="/methodology">How we collect prices <span>→</span></Link>
            </div>
          </div>
          <div className="market-terminal" aria-label="GPU pricing snapshot">
            <div className="terminal-top"><span>PRICE SNAPSHOT</span><span className="terminal-live">USD / GPU-HOUR</span></div>
            <div className="terminal-focus">
              <div><span>Lowest regular · On-demand</span><strong>H100</strong></div>
              <div className="terminal-price"><strong>{formatBenchmarkPrice(h100)}</strong><span>/ GPU / HR</span></div>
            </div>
            <div className="terminal-evidence">
              <span>{h100 ? `${providers.find((provider) => provider.slug === h100.providerSlug)?.name} · ${summaryConfigurationLabel(h100)}` : "No comparable hourly quote"}</span>
              <a href={h100?.sourceUrl ?? "/methodology"} target="_blank" rel="nofollow noreferrer">View source ↗</a>
              <small>Collected <time dateTime={snapshot.generatedAt}>{collectedAt}</time> · China time</small>
            </div>
            <div className="terminal-stats">
              <div><span>Platforms</span><strong>{providers.length}</strong></div>
              <div><span>GPU models</span><strong>{gpus.length}</strong></div>
              <div><span>Hourly prices</span><strong>{offers.length}</strong></div>
            </div>
          </div>
        </div>
      </section>

      <section className="prices-section shell" id="prices">
        <PriceExplorer {...explorerData} />
      </section>

      <section className="catalogue-section shell" id="gpus">
        <div className="section-heading split-heading">
          <div><span className="eyebrow">Browse by model</span><h2>GPU prices</h2></div>
          <div className="section-heading-aside"><Link href="/gpus">View all {gpus.length} GPU models →</Link></div>
        </div>
        <div className="gpu-grid home-gpu-grid">
          {gpus.slice(0, 8).map((gpu, index) => {
            const listings = getOffersForGpu(gpu.slug);
            const cheapest = directoryHeadlineOffer(listings);
            return (
              <Link href={`/gpus/${gpu.slug}`} className="gpu-card" key={gpu.slug}>
                <div className="gpu-card-top"><span>{String(index + 1).padStart(2, "0")}</span><span className="tier-tag">{gpu.tier}</span></div>
                <h3>{gpu.shortName}</h3>
                <p>{gpuMemoryLabel(gpu)}</p>
                <div className="gpu-card-bottom"><span>{cheapest ? <>{cheapest.rentalType} <strong>{formatBenchmarkPrice(cheapest)}</strong><br />/ GPU-hour</> : "See published hourly rates"}</span><span>{listings.length} quotes ↗</span></div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="providers-section" id="providers">
        <div className="shell">
          <div className="section-heading split-heading inverse">
            <div><span className="eyebrow">Pricing sources</span><h2>Platforms</h2></div>
            <div className="section-heading-aside"><Link href="/providers">View platform details →</Link></div>
          </div>
          <div className="home-provider-directory">
            {providers.map((provider) => (
              <Link href={`/providers/${provider.slug}`} className="home-provider-link" key={provider.slug}>
                <span className="provider-name">{provider.name}<small>{getOffersForProvider(provider.slug).length} hourly prices</small></span>
                <span className="provider-arrow">↗</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="flatkey-overview shell">
        <div className="section-heading split-heading">
          <div><span className="eyebrow">Commercial partner</span><h2>Need a tailored quote?</h2></div>
          <div className="section-heading-aside">
            <p>Ask Flatkey about the GPU configuration, region and capacity you need.</p>
            <a className="button button-secondary" href={flatkeyWebsiteUrl("home_quote")} target="_blank" rel="sponsored nofollow noreferrer">Request a Flatkey quote <span>↗</span></a>
          </div>
        </div>
        <p className="partner-note">Flatkey is RackRate’s commercial partner. Its quote service is separate from the prices compared above. Availability and terms are confirmed per quote.</p>
      </section>

      {(snapshot.publication.status === "fallback" || snapshot.publication.stale) && (
        <aside className="data-notice shell" role="status">
          <strong>{snapshot.publication.status === "fallback" ? "Showing the last validated snapshot" : "Price refresh is overdue"}</strong>
          <p>Collected {collectedAt} China time. The latest refresh has not been confirmed; check the provider before purchasing.</p>
        </aside>
      )}
      <div className="home-source-notes shell">
        <p>Prices are shown in USD. Original amounts and terms stay with each quote. Published prices do not guarantee stock.</p>
        <nav aria-label="Pricing information"><Link href="/methodology">Methodology</Link><Link href="/regions">Regions</Link><Link href="/guides/gpu-rental-pricing">Pricing guide</Link></nav>
        <details><summary>Currency conversion details</summary><FxDisclosure offers={offers} /></details>
      </div>
      <PricingRefresh generatedAt={snapshot.generatedAt} sha256={snapshot.publication.sha256} publicationStatus={snapshot.publication.status} stale={snapshot.publication.stale} />
    </main>
  );
}
