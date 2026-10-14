import Link from "next/link";
import { PriceExplorer } from "@/components/price-explorer";
import { getCheapestOffer, getOffersForGpu, getOffersForProvider, getOffersForRegion, gpus, isRegionIndexable, offers, providers, regions } from "@/lib/data";
import { flatkeyWebsiteUrl } from "@/lib/site";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export default function Home() {
  const h100 = getCheapestOffer("nvidia-h100");
  const a100 = getCheapestOffer("nvidia-a100-80gb");
  const l40s = getCheapestOffer("nvidia-l40s");

  return (
    <main>
      <section className="hero">
        <div className="hero-grid shell">
          <div className="hero-copy">
            <div className="hero-kicker"><span>GPU market intelligence</span><i />Labeled launch sample</div>
            <h1>The price of compute,<br /><em>made comparable.</em></h1>
            <p>Compare sample GPU rental prices per hour across providers, regions, and purchase models. Review the listed configuration context before you shortlist a cloud.</p>
            <div className="hero-actions">
              <a className="button button-primary" href={flatkeyWebsiteUrl("home_hero")} target="_blank" rel="sponsored nofollow noreferrer">Explore Flatkey GPU Cloud <span>↗</span></a>
              <Link className="button button-secondary" href="#prices">Compare GPU prices <span>↓</span></Link>
            </div>
          </div>
          <div className="market-terminal" aria-label="Sample GPU market snapshot">
            <div className="terminal-top"><span>MARKET / ON-DEMAND</span><span className="terminal-live"><i /> SAMPLE</span></div>
            <div className="terminal-focus">
              <div>
                <span>Lowest sample rate</span>
                <strong>H100</strong>
              </div>
              <div className="terminal-price"><strong>{money.format(h100.pricePerGpuHour)}</strong><span>/ GPU / HR</span></div>
            </div>
            <div className="sparkline" aria-hidden="true">
              <svg viewBox="0 0 540 110" preserveAspectRatio="none"><path className="area" d="M0 88 L45 72 L90 80 L135 54 L180 59 L225 42 L270 48 L315 26 L360 34 L405 22 L450 31 L495 17 L540 20 L540 110 L0 110Z" /><path className="line" d="M0 88 L45 72 L90 80 L135 54 L180 59 L225 42 L270 48 L315 26 L360 34 L405 22 L450 31 L495 17 L540 20" /></svg>
              <span className="spark-label start">Illustrative only</span><span className="spark-label end">Not historical</span>
            </div>
            <div className="terminal-stats">
              <div><span>A100 80GB</span><strong>{money.format(a100.pricePerGpuHour)}</strong><small>floor</small></div>
              <div><span>L40S</span><strong>{money.format(l40s.pricePerGpuHour)}</strong><small>floor</small></div>
              <div><span>Configurations</span><strong>{offers.length}</strong><small>sample feed</small></div>
            </div>
          </div>
        </div>
        <div className="ticker" aria-label="Supported GPU models">
          <div className="ticker-track">
            {[0, 1].map((group) => <div className="ticker-group" aria-hidden={group === 1} key={group}>{gpus.map((gpu) => <span key={`${group}-${gpu.slug}`}><i />{gpu.shortName}<small>{gpu.vramGb} GB</small></span>)}</div>)}
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
                <p>{gpu.architecture} · {gpu.vramGb} GB {gpu.memoryType}</p>
                <div className="gpu-card-bottom"><span>From <strong>{money.format(cheapest.pricePerGpuHour)}</strong>/hr</span><span>{listings.length} offers ↗</span></div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="providers-section" id="providers">
        <div className="shell">
          <div className="section-heading split-heading inverse">
            <div><span className="eyebrow">Provider index</span><h2>Know who owns the capacity.</h2></div>
            <div className="section-heading-aside"><p>Marketplace, specialist cloud, or hyperscaler—the operating model matters almost as much as the sticker price.</p><Link href="/providers">Compare all providers →</Link></div>
          </div>
          <div className="provider-list">
            {providers.map((provider, index) => {
              const providerOffers = getOffersForProvider(provider.slug);
              const floor = [...providerOffers].sort((a, b) => a.pricePerGpuHour - b.pricePerGpuHour)[0];
              return (
                <Link href={`/providers/${provider.slug}`} className="provider-row" key={provider.slug}>
                  <span className="provider-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="provider-name">{provider.name}<small>{provider.type}</small></span>
                  <span className="provider-hq">{provider.hq}</span>
                  <span className="provider-count">{providerOffers.length} configuration{providerOffers.length === 1 ? "" : "s"}</span>
                  <span className="provider-floor">from <strong>{floor ? money.format(floor.pricePerGpuHour) : "—"}</strong></span>
                  <span className="provider-arrow">↗</span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="home-regions shell">
        <div className="section-heading split-heading">
          <div><span className="eyebrow">GPU cloud regions</span><h2>Location changes the real cost.</h2></div>
          <div className="section-heading-aside"><p>Compare regional price signals without losing the latency, data movement, and availability questions behind them.</p><Link href="/regions">Explore every region →</Link></div>
        </div>
        <div className="home-region-grid">
          {regions.filter((region) => isRegionIndexable(region.slug)).map((region) => {
            const regionOffers = getOffersForRegion(region.slug).sort((a, b) => a.pricePerGpuHour - b.pricePerGpuHour);
            return <Link href={`/regions/${region.slug}`} key={region.slug}><span>{region.label}</span><strong>{region.name}</strong><small>{regionOffers.length} offer{regionOffers.length === 1 ? "" : "s"} · from {regionOffers[0] ? money.format(regionOffers[0].pricePerGpuHour) : "—"}/hr</small><i>↗</i></Link>;
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
          <article><span>01</span><h3>Source-linked</h3><p>Every sample offer carries a provider or pricing-page link for follow-up verification.</p></article>
          <article><span>02</span><h3>Normalized</h3><p>Sample rates are shown in USD per GPU-hour while preserving total-node cost and purchase type.</p></article>
          <article><span>03</span><h3>Status-labeled</h3><p>Availability labels remain visible, but launch samples are never presented as live inventory.</p></article>
        </div>
      </section>
    </main>
  );
}
