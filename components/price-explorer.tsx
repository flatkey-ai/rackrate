"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { gpus, offers, offerDatasetGeneratedAt, offerDatasetSources, providers, gpuMemoryLabel } from "@/lib/data";
import { availabilityLabel, billingUnitLabel, compareOffers, configurationLabel, formatFxRate, formatInstancePrice, formatOfferPrice, formatOriginalInstancePrice, formatOriginalPrice, priceBasisLabel } from "@/lib/pricing";
import { flatkeyWebsiteUrl } from "@/lib/site";
import { trackSiteEvent } from "@/components/site-analytics";
import { FilterSelect } from "@/components/filter-select";
import { FlatkeyRecommendation } from "@/components/flatkey-recommendation";

const observedDate = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });
const freshness = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Shanghai" }).format(new Date(offerDatasetGeneratedAt));
const automatedSourceCount = offerDatasetSources.filter((source) => source.status === "ok").length;
const unique = (items: string[]) => [...new Set(items)].sort();

export function PriceExplorer({ gpuSlug, providerSlug, regionNames }: { gpuSlug?: string; providerSlug?: string; regionNames?: string[] } = {}) {
  const scopedOffers = useMemo(() => offers.filter((offer) => (!gpuSlug || offer.gpuSlug === gpuSlug) && (!providerSlug || offer.providerSlug === providerSlug) && (!regionNames || offer.regions.some((entry) => regionNames.includes(entry)))), [gpuSlug, providerSlug, regionNames]);
  const isScoped = Boolean(gpuSlug || providerSlug || regionNames);
  const [query, setQuery] = useState("");
  const [gpu, setGpu] = useState("all");
  const [provider, setProvider] = useState("all");
  const [rental, setRental] = useState(isScoped ? "all" : "On-demand");
  const [currency, setCurrency] = useState("all");
  const [unit, setUnit] = useState(isScoped ? "all" : "GPU-hour");
  const [region, setRegion] = useState("all");
  const [zone, setZone] = useState("all");
  const [basis, setBasis] = useState("all");
  const [availableOnly, setAvailableOnly] = useState(!isScoped);
  const [hideConditional, setHideConditional] = useState(false);
  const [page, setPage] = useState(1);
  const regionOptions = useMemo(() => unique(scopedOffers.flatMap((offer) => offer.regions)), [scopedOffers]);
  const zoneOptions = useMemo(() => unique(scopedOffers.flatMap((offer) => offer.zones)), [scopedOffers]);
  const currencies = useMemo(() => unique(scopedOffers.map((offer) => offer.sourceCurrency)), [scopedOffers]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return scopedOffers.filter((offer) => {
      const gpuEntry = gpus.find((entry) => entry.slug === offer.gpuSlug);
      const providerEntry = providers.find((entry) => entry.slug === offer.providerSlug);
      const haystack = `${gpuEntry?.name} ${offer.rawGpuModel ?? ""} ${offer.gpuVariant ?? ""} ${providerEntry?.name} ${offer.region} ${offer.zones.join(" ")} ${offer.conditions.join(" ")}`.toLowerCase();
      return (!term || haystack.includes(term)) && (gpu === "all" || offer.gpuSlug === gpu)
        && (provider === "all" || offer.providerSlug === provider) && (rental === "all" || offer.rentalType === rental)
        && (currency === "all" || offer.sourceCurrency === currency) && (unit === "all" || offer.billingUnit === unit)
        && (region === "all" || (region === "__unpublished" ? offer.regions.length === 0 : offer.regions.includes(region))) && (zone === "all" || (zone === "__unpublished" ? offer.zones.length === 0 : offer.zones.includes(zone)))
        && (basis === "all" || offer.priceBasis === basis) && (!availableOnly || offer.availability !== "unavailable")
        && (!hideConditional || !offer.conditions.some((condition) => /member|会员|new.customer|新客|commitment|reserved/i.test(condition)));
    }).sort(compareOffers);
  }, [scopedOffers, query, gpu, provider, rental, currency, unit, region, zone, basis, availableOnly, hideConditional]);
  const pageSize = 50;
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const change = (filter: string, setter: (value: string) => void) => (value: string) => { setter(value); setPage(1); trackSiteEvent("price_filter_changed", { filter, value }); };
  const resetFilters = () => { setQuery(""); setGpu("all"); setProvider("all"); setRental(isScoped ? "all" : "On-demand"); setCurrency("all"); setUnit(isScoped ? "all" : "GPU-hour"); setRegion("all"); setZone("all"); setBasis("all"); setAvailableOnly(!isScoped); setHideConditional(false); setPage(1); };
  const showAll = () => { resetFilters(); setRental("all"); setCurrency("all"); setUnit("all"); setAvailableOnly(false); };

  return <div className="explorer-card">
    <div className="explorer-head"><div><span className="eyebrow">Market scanner / sourced feed</span><h2>Compare GPU prices with the terms attached.</h2></div><div className="freshness"><span /> Collected {freshness} China time</div></div>
    <FlatkeyRecommendation content="comparison_recommended" />
    <div className="filter-bar price-filter-grid">
      <label className="search-field"><span className="sr-only">Search offers</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 21-4.35-4.35m2.35-5.15A7.5 7.5 0 1 1 4 11.5a7.5 7.5 0 0 1 15 0Z" /></svg><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search model, variant, platform, region" /></label>
      {!gpuSlug && <FilterSelect label="GPU" value={gpu} options={[{ value: "all", label: "All GPUs" }, ...gpus.filter((entry) => scopedOffers.some((offer) => offer.gpuSlug === entry.slug)).map((entry) => ({ value: entry.slug, label: entry.shortName, description: gpuMemoryLabel(entry) }))]} onChange={change("gpu", setGpu)} />}
      {!providerSlug && <FilterSelect label="Platform" value={provider} options={[{ value: "all", label: "All platforms" }, ...providers.filter((entry) => scopedOffers.some((offer) => offer.providerSlug === entry.slug)).map((entry) => ({ value: entry.slug, label: entry.name }))]} onChange={change("provider", setProvider)} />}
      <FilterSelect label="Original currency" value={currency} options={[{ value: "all", label: "All source currencies" }, ...currencies.map((entry) => ({ value: entry, label: entry }))]} onChange={change("currency", setCurrency)} />
      <FilterSelect label="Billing period" value={unit} options={[{ value: "all", label: "All periods" }, { value: "GPU-hour", label: "Per GPU-hour" }, { value: "GPU-month", label: "Per GPU-month" }]} onChange={change("unit", setUnit)} />
      <FilterSelect label="Purchase model" value={rental} options={[{ value: "all", label: "All types" }, ...unique(scopedOffers.map((offer) => offer.rentalType)).map((entry) => ({ value: entry, label: entry }))]} onChange={change("rental", setRental)} />
      <FilterSelect label="Region" value={region} options={[{ value: "all", label: "All regions" }, { value: "__unpublished", label: "Region not published" }, ...regionOptions.map((entry) => ({ value: entry, label: entry }))]} onChange={change("region", setRegion)} />
      <FilterSelect label="Availability zone" value={zone} options={[{ value: "all", label: "All zones" }, { value: "__unpublished", label: "Zone not published" }, ...zoneOptions.map((entry) => ({ value: entry, label: entry }))]} onChange={change("zone", setZone)} />
      <FilterSelect label="Price basis" value={basis} options={[{ value: "all", label: "All bases" }, ...unique(scopedOffers.map((offer) => offer.priceBasis)).map((entry) => ({ value: entry, label: priceBasisLabel({ priceBasis: entry } as never) }))]} onChange={change("basis", setBasis)} />
    </div>
    <div className="result-toolbar"><p><strong>{filtered.length}</strong> matching / {scopedOffers.length} sourced records</p><div className="result-controls"><button type="button" className="reset-filters" onClick={showAll}>Show every sourced record</button><button type="button" className="reset-filters" onClick={resetFilters}>Reset filters</button><label className="check-control"><input type="checkbox" checked={availableOnly} onChange={(event) => { setAvailableOnly(event.target.checked); setPage(1); }} /><span aria-hidden="true" />Hide offline listings</label><label className="check-control"><input type="checkbox" checked={hideConditional} onChange={(event) => { setHideConditional(event.target.checked); setPage(1); }} /><span aria-hidden="true" />Hide member / eligibility rates</label></div></div>
    <div className="source-legend"><div><strong>USD display, original prices preserved</strong><span>Headline amounts use USD. Converted amounts are marked ≈. Each converted row shows its original currency, exchange rate, reference date and source; exact decimal values are expandable. Daily ECB reference rates are indicative; payment fees are excluded. Monthly prices stay per month. Rows are grouped by billing period, purchase model and price basis before USD sorting.</span></div><div><strong>Public price ≠ bookable inventory</strong><span>Offline records remain accessible. Stock unknown means the source did not confirm availability. Member, cloud tier and eligibility terms remain attached.</span></div></div>
    <div className="table-scroll-hint" aria-hidden="true"><span>Swipe to compare all columns</span><i>→</i></div>
    <div className="price-table-wrap" tabIndex={0} role="region" aria-label="Scrollable GPU price comparison table"><table className="price-table"><thead><tr><th>GPU / platform</th><th>Variant / configuration</th><th>Region / zone</th><th>Terms / basis</th><th>Status</th><th className="numeric">USD per-GPU price / original</th></tr></thead><tbody>{visible.map((offer) => {
      const gpuEntry = gpus.find((entry) => entry.slug === offer.gpuSlug)!;
      const providerEntry = providers.find((entry) => entry.slug === offer.providerSlug)!;
      return <tr key={offer.id}><td><Link className="gpu-link" href={`/gpus/${gpuEntry.slug}`}>{gpuEntry.shortName}</Link><Link className="provider-link" href={`/providers/${providerEntry.slug}`}>{providerEntry.name}</Link><span className="offer-evidence"><a href={offer.sourceUrl} target="_blank" rel="nofollow noreferrer">{offer.dataStatus === "official-page" ? "Official public source" : "Dated reference"} ↗</a><time dateTime={offer.observedAt}>{observedDate.format(new Date(offer.observedAt))}</time></span></td><td><strong>{offer.rawGpuModel ?? offer.gpuModel ?? gpuEntry.shortName}</strong><small className="cell-detail">{configurationLabel(offer)}</small>{offer.rawSku && <small className="cell-detail">SKU: {offer.rawSku}</small>}{offer.resources && Object.keys(offer.resources).length > 0 && <details className="offer-conditions"><summary>Published configuration</summary><ul>{Object.entries(offer.resources).map(([key, value]) => <li key={key}>{key.replaceAll("_", " ")}: {typeof value === "object" ? JSON.stringify(value) : String(value)}</li>)}</ul></details>}</td><td>{offer.countryCode && <span className="country-code">{offer.countryCode}</span>}{offer.regions.length ? offer.regions.join(" · ") : "Not published"}<small className="cell-detail">{offer.zones.length ? `Zone: ${offer.zones.join(" · ")}` : "Zone not published"}</small><small className="cell-detail">Scope: {offer.regionScope ?? offer.geographicScope ?? "Not published"}</small></td><td>{offer.rentalType}{offer.cloudTier && <small className="cell-detail">Cloud tier: {offer.cloudTier}</small>}{offer.pricingTier && <small className="cell-detail">Price tier: {offer.pricingTier}</small>}{offer.conditions.some((condition) => /member|会员/i.test(condition)) && <small className="cell-detail">Member / eligibility conditions apply</small>}<small className="cell-detail">{priceBasisLabel(offer)}</small>{offer.conditions.length > 0 && <details className="offer-conditions"><summary>{offer.conditions.length} source conditions</summary><ul>{offer.conditions.map((condition, index) => <li key={index}>{condition}</li>)}</ul></details>}</td><td><span className={`status ${offer.dataStatus === "seed" ? "unknown" : offer.availability}`}><i />{offer.dataStatus === "seed" ? "Reference / not live" : availabilityLabel[offer.availability]}</span><small className="cell-detail">{offer.dataStatus === "seed" ? "Historical observation; current stock not checked" : offer.quoteStatus === "starting_at" ? "Starting price" : offer.quoteStatus === "contact_sales" ? "Sales quote required" : "Published quote"}</small></td><td className="numeric price-cell"><strong>{formatOfferPrice(offer)}</strong><small>/ {billingUnitLabel(offer)} · {offer.sourceCurrency === "USD" ? "native USD" : "converted to USD"}</small><small>{formatOriginalPrice(offer)}</small><small>{offer.fx && offer.sourceCurrency !== "USD" ? <a href={offer.fx.sourceUrl} target="_blank" rel="nofollow noreferrer">{formatFxRate(offer)} · {offer.fx.sourceName} ↗</a> : formatFxRate(offer)}</small><small>{formatInstancePrice(offer)}</small>{offer.instancePrice != null && offer.sourceCurrency !== "USD" && <small>{formatOriginalInstancePrice(offer)}</small>}{offer.sourceAmount && <details className="offer-conditions"><summary>Exact source / conversion</summary><small>Source: {offer.sourceAmount} {offer.sourceCurrency} / {billingUnitLabel(offer)}</small>{offer.usdSourceAmount && <small>USD decimal: {offer.usdSourceAmount}</small>}{offer.fx?.rateToUsdDecimal && <small>Exact FX: {offer.fx.rateToUsdDecimal}</small>}{offer.fx?.formula && <small>{offer.fx.formula}</small>}{offer.fx?.rounding && <small>Rounding: {offer.fx.rounding}</small>}</details>}</td></tr>;
    })}</tbody></table>{filtered.length === 0 && <div className="empty-state"><strong>No records match these filters.</strong><span>Use “Show every sourced record” to include all currencies, monthly packages and offline prices.</span></div>}</div>
    {filtered.length > pageSize && <div className="price-pagination"><button disabled={page === 1} onClick={() => setPage(page - 1)}>← Previous</button><span>Page {page} / {Math.ceil(filtered.length / pageSize)}</span><button disabled={page * pageSize >= filtered.length} onClick={() => setPage(page + 1)}>Next →</button></div>}
    <div className="table-footnote"><span>{automatedSourceCount} successful public sources · USD via dated ECB reference rates · Original periods and source timestamps preserved.</span><div><Link href="/methodology">How comparison works →</Link><a href="https://github.com/flatkey-ai/rackrate/issues/new?labels=data-correction&amp;title=Data%20correction%3A%20" target="_blank" rel="nofollow noreferrer">Report a data issue ↗</a></div></div>
    <div className="explorer-conversion"><div><strong>Have a configuration in mind?</strong><span>Take the GPU, region and duration to Flatkey for a formal quote.</span></div><a className="button button-primary" href={flatkeyWebsiteUrl("comparison_results", "price_comparison")} target="_blank" rel="sponsored nofollow noreferrer">Request a Flatkey quote <span>↗</span></a></div>
  </div>;
}
