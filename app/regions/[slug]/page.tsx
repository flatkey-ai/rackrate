export const dynamic = "force-dynamic";

import { PriceExplorer } from "@/components/price-explorer";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPricingSnapshot } from "@/lib/pricing-snapshot";
import { SnapshotFooter } from "@/components/snapshot-footer";
import { cheapestComparableOffer, formatBenchmarkPrice } from "@/lib/pricing";
import { absoluteUrl, flatkeyWebsiteUrl } from "@/lib/site";
import { isRegionSpecificPrice, publishedRegionCodes, publishedRegionLabel, regionMappingSources } from "@/lib/region-matching";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { getRegion, isRegionIndexable } = await getPricingSnapshot();
  const region = getRegion((await params).slug);
  if (!region) return {};
  const title = region.slug === "global"
    ? "Global GPU cloud listings and rental pricing"
    : `${region.name} GPU cloud pricing and rental options`;
  const description = `${region.summary} Compare providers, GPU models, configurations, and normalized hourly rates.`;
  return {
    title,
    description,
    robots: { index: isRegionIndexable(region.slug), follow: true },
    alternates: { canonical: absoluteUrl(`/regions/${region.slug}`) },
    openGraph: { title, description, url: absoluteUrl(`/regions/${region.slug}`) },
  };
}

export default async function RegionDetailPage({ params }: PageProps) {
  const snapshot = await getPricingSnapshot();
  const { getOffersForRegion, getRegion, getRegionCoverage, isRegionIndexable, regions } = snapshot;
  const region = getRegion((await params).slug);
  if (!region) notFound();
  const regionOffers = getOffersForRegion(region.slug);
  const explorerData = { offers: regionOffers, gpus: snapshot.gpus, providers: snapshot.providers, generatedAt: snapshot.generatedAt, sources: snapshot.sources };
  const floor = cheapestComparableOffer(regionOffers.filter(isRegionSpecificPrice));
  const providerCount = new Set(regionOffers.map((offer) => offer.providerSlug)).size;
  const gpuCount = new Set(regionOffers.map((offer) => offer.gpuSlug)).size;
  const sourceLabels = Array.from(new Set(regionOffers.flatMap((offer) => publishedRegionCodes(offer).map((code) => `${snapshot.providers.find((provider) => provider.slug === offer.providerSlug)?.name ?? offer.providerSlug} · ${publishedRegionLabel(offer, code)}`))));
  const mappingSources = regionMappingSources(regionOffers);
  const coverage = getRegionCoverage(region.slug);
  const observedTimes = regionOffers.map((offer) => new Date(offer.observedAt).getTime()).filter(Number.isFinite);
  const latestObservation = observedTimes.length ? new Date(Math.max(...observedTimes)) : null;
  const otherRegions = regions.filter((entry) => entry.slug !== region.slug && getRegionCoverage(entry.slug).offerCount > 0).slice(0, 3);
  const verificationDate = latestObservation
    ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(latestObservation)
    : "No observation";
  const faqs = [
    {
      question: `Is ${region.name} the cheapest region for GPU rental?`,
      answer: `RackRate does not treat the lowest visible observation as a universal regional floor. This page currently contains ${coverage.offerCount} configuration${coverage.offerCount === 1 ? "" : "s"} from ${providerCount} provider${providerCount === 1 ? "" : "s"}; terms, node size, availability, and data transfer can change the actual cost.`,
    },
    {
      question: `How current is the ${region.name} pricing data?`,
      answer: `The newest source observation on this page is dated ${verificationDate}. Verified official prices come from provider-owned pricing pages; reference prices are dated observations that require direct confirmation.`,
    },
    {
      question: `What should buyers verify before deploying in ${region.name}?`,
      answer: region.buyingQuestions.join(" "),
    },
  ];

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: "Regions", item: absoluteUrl("/regions") },
      { "@type": "ListItem", position: 3, name: region.name, item: absoluteUrl(`/regions/${region.slug}`) },
    ],
  };
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };

  return (
    <main className="region-detail detail-main">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <section className="region-detail-hero shell">
        <div className="breadcrumbs"><Link href="/">Home</Link><span>/</span><Link href="/regions">Regions</Link><span>/</span><strong>{region.name}</strong></div>
        <div className="region-detail-title">
          <div><span className="eyebrow">{region.label}</span><h1>GPU cloud pricing in {region.name}.</h1><p>{region.summary}</p><a className="button button-primary hero-flatkey-cta" href={flatkeyWebsiteUrl(`region_${region.slug}_profile`, "region_detail")} target="_blank" rel="sponsored nofollow noreferrer">Discuss this region with Flatkey <span>↗</span></a></div>
          <div className="region-metric-panel">
            <div><span>USD on-demand benchmark</span><strong>{formatBenchmarkPrice(floor)}</strong><small>{floor ? "per GPU / hour" : coverage.offlineCount === coverage.offerCount && coverage.offerCount > 0 ? "All listed offers are offline" : "No eligible hourly rate"}</small></div>
            <div><span>Indexed GPUs</span><strong>{gpuCount}</strong><small>accelerator models</small></div>
            <div><span>Source coverage</span><strong>{coverage.officialCount} / {coverage.referenceCount}</strong><small>official / reference{coverage.offlineCount > 0 ? ` · ${coverage.offlineCount} offline` : ""}</small></div>
            <div><span>Last checked</span><strong className="metric-text">{verificationDate}</strong><small>{sourceLabels.length ? `${sourceLabels.length} source region label${sourceLabels.length === 1 ? "" : "s"}` : "No source label"}</small></div>
          </div>
        </div>
      </section>

      <section className="region-offers shell">
        <div className="detail-section-heading"><div><span className="eyebrow">Regional price board</span><h2>{coverage.regionalPriceCount} regional price{coverage.regionalPriceCount === 1 ? "" : "s"}{coverage.coverageOnlyCount > 0 ? ` · ${coverage.coverageOnlyCount} platform coverage listings` : ""}</h2></div><p>Compare the exact location on each quote. Nebius lists platform availability by region separately from its generic catalog rate; platform coverage listings never establish a regional lowest price. Offline prices retain their status and also stay out of the hourly benchmark.</p></div>
        {sourceLabels.length > 0 && <details className="coverage-disclosure"><summary>Source regions included in this market</summary><ul>{sourceLabels.map((label) => <li key={label}>{label}</li>)}</ul>{mappingSources.length > 0 && <p>Provider code references: {mappingSources.map((source, index) => <span key={source}>{index > 0 ? " · " : ""}<a href={source} target="_blank" rel="nofollow noreferrer">{new URL(source).hostname} ↗</a></span>)}</p>}<p>Multi-region source records retain all original region labels. A platform-coverage code identifies supported hardware locations; it does not bind a generic catalog price to that region. Unlocated catalogs are excluded.</p></details>}
        {regionOffers.length === 0 ? <div className="empty-state"><strong>No sourced prices indexed for {region.name} yet.</strong><span>Use the location checklist below and confirm the facility and capacity.</span></div> : <PriceExplorer {...explorerData} scopeLabel={region.name} />}
        <div className="coverage-disclosure"><strong>Check the location and capacity before committing.</strong><p>Indexed rates are dated observations. Ask Flatkey to confirm your requested region, quantity, machine specification, price and delivery conditions in a formal quote; the regional rates above remain a separate market benchmark.</p></div>
      </section>

      <section className="region-research shell">
        <div className="directory-intro">
          <div><span className="eyebrow">Coverage before conclusions</span><h2>What this page can—and cannot—tell you.</h2></div>
          <p>{region.marketContext}</p>
        </div>
        <div className="region-research-grid">
          <article><span>01</span><h3>Evidence in scope</h3><p>{coverage.regionalPriceCount} regional price{coverage.regionalPriceCount === 1 ? "" : "s"}{coverage.coverageOnlyCount > 0 ? ` and ${coverage.coverageOnlyCount} platform coverage listings` : ""}, from {providerCount} provider{providerCount === 1 ? "" : "s"}. {coverage.officialCount} records use official sources and {coverage.referenceCount} are dated references.{coverage.offlineCount > 0 ? ` ${coverage.offlineCount} listed configurations are offline.` : ""} The newest observation is {verificationDate}.</p></article>
          <article><span>02</span><h3>What remains unknown</h3><p>RackRate does not infer unlisted inventory, private discounts, tax, storage, support, facility-level latency, or contractual data-residency guarantees.</p></article>
          <article><span>03</span><h3>Search-quality policy</h3><p>{isRegionIndexable(region.slug) ? "This market has enough verified breadth to appear in the public sitemap." : "This limited research note stays out of the public sitemap until verified coverage reaches at least three configurations."}</p></article>
        </div>
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

      <section className="region-faq shell">
        <div className="directory-intro"><div><span className="eyebrow">Buyer questions</span><h2>Before the region becomes a commitment.</h2></div><p>These answers reflect the coverage visible on this page, not a confirmation of current inventory.</p></div>
        <div className="faq-list">{faqs.map((faq) => <details key={faq.question}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}</div>
      </section>
      <SnapshotFooter offers={snapshot.offers} generatedAt={snapshot.generatedAt} publication={snapshot.publication} />
    </main>
  );
}
