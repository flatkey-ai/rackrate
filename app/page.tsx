import Link from "next/link";
import { PriceExplorer } from "@/components/price-explorer";
import { getCheapestOffer, getOffersForGpu, getOffersForProvider, getOffersForRegion, gpus, gpuMemoryLabel, isRegionIndexable, offers, providers, regions } from "@/lib/data";
import { cheapestComparableOffer, formatFxRate, formatInstancePrice, formatOriginalPrice, formatBenchmarkPrice } from "@/lib/pricing";
import { flatkeyWebsiteUrl } from "@/lib/site";


export default function Home() {
  const h100 = getCheapestOffer("nvidia-h100");
  const a100 = getCheapestOffer("nvidia-a100");
  const l40s = getCheapestOffer("nvidia-l40s");

  return (
    <main>
      <section className="hero">
        <div className="hero-grid shell">
          <div className="hero-copy">
            <div className="hero-kicker"><span>GPU market intelligence</span><i />Source-linked pricing</div>
            <h1>The price of compute,<br /><em>made comparable.</em></h1>
            <p>Compare GPU rental prices by model, region and purchase terms. Use the market as a benchmark, then ask Flatkey for a configuration and quote matched to your workload.</p>
            <div className="hero-actions">
              <a className="button button-primary" href={flatkeyWebsiteUrl("home_hero")} target="_blank" rel="sponsored nofollow noreferrer">Explore Flatkey GPU Cloud <span>↗</span></a>
              <Link className="button button-secondary" href="#prices">Compare GPU prices <span>↓</span></Link>
            </div>
          </div>
          <div className="market-terminal" aria-label="Observed GPU pricing snapshot">
            <div className="terminal-top"><span>MARKET / OBSERVED RATES</span><span className="terminal-live"><i /> SOURCED</span></div>
            <div className="terminal-focus">
              <div>
                <span>USD on-demand benchmark</span>
                <strong>H100</strong>
              </div>
              <div className="terminal-price"><strong>{formatBenchmarkPrice(h100)}</strong><span>/ GPU / HR</span></div>
            </div>
            <div className="terminal-evidence">
              <span>{h100 ? `${providers.find((provider) => provider.slug === h100.providerSlug)?.name} · ${h100.region} · ${h100.rentalType}` : "No comparable USD hourly quote"}</span>
              <p>{h100 ? formatInstancePrice(h100) : "Check source configurations"}</p>{h100 && <small>{formatOriginalPrice(h100)} · {formatFxRate(h100)}</small>}
              <a href={h100?.sourceUrl ?? "/methodology"} target="_blank" rel="nofollow noreferrer">{h100?.dataStatus === "official-page" ? "Official-source price" : "Dated reference price"} ↗</a>
              <small>Observed {h100?.observedAt.slice(0, 10) ?? "Not observed"} · Confirm current price and capacity with the provider.</small>
            </div>
            <div className="terminal-stats">
              <div><span>A100 family</span><strong>{formatBenchmarkPrice(a100)}</strong><small>USD on-demand / GPU-hour</small></div>
              <div><span>L40S</span><strong>{formatBenchmarkPrice(l40s)}</strong><small>USD on-demand / GPU-hour</small></div>
              <div><span>Configurations</span><strong>{offers.length}</strong><small>indexed offers</small></div>
            </div>
          </div>
        </div>
        <div className="ticker" aria-label="Supported GPU models">
          <div className="ticker-track">
            {[0, 1].map((group) => <div className="ticker-group" aria-hidden={group === 1} key={group}>{gpus.map((gpu) => <span key={`${group}-${gpu.slug}`}><i />{gpu.shortName}<small>{gpu.vramGb === null ? "Multiple variants" : `${gpu.vramGb} GB`}</small></span>)}</div>)}
          </div>
        </div>
      </section>

      <section className="prices-section shell" id="prices">
        <PriceExplorer />
      </section>

      <section className="catalogue-section shell" id="gpus">
        <div className="section-heading split-heading">
          <div><span className="eyebrow">GPU catalogue</span><h2>Start with the silicon.</h2></div>
          <div className="section-heading-aside"><p>Compare the market around a specific accelerator—memory, architecture, pricing floor, and which clouds list it.</p><Link href="/gpus">View all GPU rental prices →</Link></div>
        </div>
        <div className="gpu-grid">
          {gpus.map((gpu, index) => {
            const listings = getOffersForGpu(gpu.slug);
            const cheapest = getCheapestOffer(gpu.slug);
            return (
              <Link href={`/gpus/${gpu.slug}`} className="gpu-card" key={gpu.slug}>
                <div className="gpu-card-top"><span>0{index + 1}</span><span className="tier-tag">{gpu.tier}</span></div>
                <h3>{gpu.shortName}</h3>
                <p>{gpu.architecture} · {gpuMemoryLabel(gpu)}</p>
                <div className="gpu-card-bottom"><span>USD on-demand <strong>{formatBenchmarkPrice(cheapest)}</strong>/hr</span><span>{listings.length} offers ↗</span></div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="providers-section" id="providers">
        <div className="shell">
          <div className="section-heading split-heading inverse">
            <div><span className="eyebrow">Provider index</span><h2>Know who provides the capacity.</h2></div>
            <div className="section-heading-aside"><p>Marketplace, specialist cloud, or hyperscaler—the operating model matters almost as much as the sticker price.</p><Link href="/providers">Compare all providers →</Link></div>
          </div>
          <div className="provider-list">
            {providers.map((provider, index) => {
              const providerOffers = getOffersForProvider(provider.slug);
              const floor = cheapestComparableOffer(providerOffers);
              return (
                <Link href={`/providers/${provider.slug}`} className="provider-row" key={provider.slug}>
                  <span className="provider-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="provider-name">{provider.name}<small>{provider.type}</small></span>
                  <span className="provider-hq">{provider.hq}</span>
                  <span className="provider-count">{provider.slug === "flatkey" ? "Workload-based quotes" : `${providerOffers.length} configuration${providerOffers.length === 1 ? "" : "s"}`}</span>
                  <span className="provider-floor">{floor ? <>USD / hr <strong>{formatBenchmarkPrice(floor)}</strong></> : <strong>{provider.slug === "flatkey" ? "Request quote" : "See rates"}</strong>}</span>
                  <span className="provider-arrow">↗</span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="flatkey-overview shell">
        <div className="section-heading split-heading">
          <div><span className="eyebrow">Flatkey Compute</span><h2>From a price benchmark to a deployment plan.</h2></div>
          <div className="section-heading-aside"><p>A useful quote connects the GPU rate to the workload, location and time you need. Flatkey offers a request-based path to scope those details together.</p><Link href="/providers/flatkey">Explore Flatkey Compute →</Link></div>
        </div>
        <div className="principle-grid">
          <article><span>01</span><h3>Workload-based matching</h3><p>Describe the model, GPU count and operating requirements so the proposed configuration can be checked against the job.</p></article>
          <article><span>02</span><h3>A quote with context</h3><p>Confirm the price alongside the region, configuration, delivery conditions and validity period.</p></article>
          <article><span>03</span><h3>Terms for the project</h3><p>Discuss flexible, reserved or dedicated capacity requests according to duration and deployment requirements.</p></article>
        </div>
        <p className="partner-note">Based on <a href={flatkeyWebsiteUrl("home_service_source")} target="_blank" rel="sponsored nofollow noreferrer">Flatkey’s service overview ↗</a>. Flatkey is RackRate’s commercial partner. Availability and terms are confirmed per quote.</p>
      </section>

      <section className="home-regions shell">
        <div className="section-heading split-heading">
          <div><span className="eyebrow">GPU cloud regions</span><h2>Location changes the real cost.</h2></div>
          <div className="section-heading-aside"><p>Compare regional price signals without losing the latency, data movement, and availability questions behind them.</p><Link href="/regions">Explore every region →</Link></div>
        </div>
        <div className="home-region-grid">
          {regions.filter((region) => isRegionIndexable(region.slug)).map((region) => {
            const regionOffers = getOffersForRegion(region.slug);
            const floor = cheapestComparableOffer(regionOffers);
            return <Link href={`/regions/${region.slug}`} key={region.slug}><span>{region.label}</span><strong>{region.name}</strong><small>{regionOffers.length} offer{regionOffers.length === 1 ? "" : "s"} · USD on-demand {formatBenchmarkPrice(floor)}/hr</small><i>↗</i></Link>;
          })}
        </div>
      </section>

      <section className="home-guide">
        <div className="shell home-guide-grid">
          <div><span className="eyebrow">Buyer field guide</span><h2>The hourly rate is only one line in the bill.</h2></div>
          <div><p>Learn how to normalize per-GPU and node rates, separate spot from on-demand pricing, model egress and idle time, and request a quote procurement can verify.</p><Link className="button button-secondary" href="/guides/gpu-rental-pricing">Read the pricing guide <span>→</span></Link></div>
        </div>
      </section>

      <section className="principles shell">
        <div className="principle-lead"><span className="eyebrow">Built for scrutiny</span><h2>A cheap number is useless without context.</h2></div>
        <div className="principle-grid">
          <article><span>01</span><h3>Source-linked</h3><p>Every indexed offer carries a provider or pricing-page link for follow-up verification.</p></article>
          <article><span>02</span><h3>Normalized</h3><p>Prices are displayed in USD using dated ECB reference rates where conversion is needed. Original amounts, periods, GPU variants and conditions remain visible. Benchmarks exclude offline, member and component-only rates.</p></article>
          <article><span>03</span><h3>Status-labeled</h3><p>Observation dates and source labels stay visible. A published price does not guarantee current inventory.</p></article>
        </div>
      </section>
    </main>
  );
}
