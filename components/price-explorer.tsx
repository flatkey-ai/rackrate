"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { gpuMemoryLabel, type Gpu, type Offer, type PricingDataset, type Provider } from "@/lib/data";
import { compareOffers, priceBasisLabel } from "@/lib/pricing";
import { flatkeyWebsiteUrl } from "@/lib/site";
import { trackSiteEvent } from "@/components/site-analytics";
import { FilterSelect } from "@/components/filter-select";
import { GpuComparisonGroup } from "@/components/gpu-comparison-group";
import { groupOffersForComparison, offerAudience, matchesPriceRegionFilter, priceRegionCoverage } from "@/lib/offer-comparison";
import { getOfferCountryCodes, matchesCountryRegionSelection, publishedRegionLabel, publishedRegionsForCountry, publishedZonesForSelection } from "@/lib/region-matching";
import styles from "./price-explorer.module.css";

const unique = (items: string[]) => [...new Set(items)].sort();
const countryNames = new Intl.DisplayNames(["en"], { type: "region" });

export type PriceExplorerData = {
  offers: Offer[]; gpus: Gpu[]; providers: Provider[];
  generatedAt: string; sources: PricingDataset["sources"];
};

function Chevron({ open = false }: { open?: boolean }) {
  return <svg viewBox="0 0 20 20" aria-hidden="true" data-open={open}><path d="m6 8 4 4 4-4" /></svg>;
}

export function PriceExplorer({ offers, gpus, providers, generatedAt, sources, gpuSlug, providerSlug, regionNames, scopeLabel }: PriceExplorerData & { gpuSlug?: string; providerSlug?: string; regionNames?: string[]; scopeLabel?: string }) {
  const id = useId();
  const freshness = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Shanghai" }).format(new Date(generatedAt));
  const automatedSourceCount = sources.filter((source) => source.status === "ok").length;
  const scopedOffers = useMemo(() => offers.filter((offer) => (!gpuSlug || offer.gpuSlug === gpuSlug) && (!providerSlug || offer.providerSlug === providerSlug) && (!regionNames || offer.regions.some((entry) => regionNames.includes(entry)))), [offers, gpuSlug, providerSlug, regionNames]);
  const isScoped = Boolean(gpuSlug || providerSlug || regionNames || scopeLabel);
  const [query, setQuery] = useState("");
  const [gpu, setGpu] = useState("all");
  const [provider, setProvider] = useState("all");
  const [rental, setRental] = useState(isScoped ? "all" : "On-demand");
  const [currency, setCurrency] = useState("all");
  const [unit, setUnit] = useState(isScoped ? "all" : "GPU-hour");
  const [region, setRegion] = useState("all");
  const [country, setCountry] = useState("all");
  const [zone, setZone] = useState("all");
  const [basis, setBasis] = useState("all");
  const [availableOnly, setAvailableOnly] = useState(!isScoped);
  const [hideConditional, setHideConditional] = useState(false);
  const [page, setPage] = useState(1);
  const [advanced, setAdvanced] = useState(false);
  const locationOffers = useMemo(() => scopedOffers.filter((offer) => (gpu === "all" || offer.gpuSlug === gpu)
    && (provider === "all" || offer.providerSlug === provider)), [scopedOffers, gpu, provider]);
  const countryOptions = useMemo(() => unique(locationOffers.flatMap(getOfferCountryCodes)).sort((a, b) => (countryNames.of(a) ?? a).localeCompare(countryNames.of(b) ?? b)), [locationOffers]);
  const regionOptions = useMemo(() => {
    const entries = new Map<string, string>();
    for (const offer of locationOffers) {
      for (const code of publishedRegionsForCountry(offer, country)) if (!entries.has(code)) entries.set(code, publishedRegionLabel(offer, code));
    }
    return [...entries].sort((a, b) => a[1].localeCompare(b[1]));
  }, [locationOffers, country]);
  const zoneOptions = useMemo(() => unique(locationOffers.filter((offer) => matchesCountryRegionSelection(offer, country, region)
    && matchesPriceRegionFilter(offer, region)).flatMap((offer) => publishedZonesForSelection(offer, country, region))), [locationOffers, country, region]);
  const currencies = useMemo(() => unique(scopedOffers.map((offer) => offer.sourceCurrency)), [scopedOffers]);
  const gpuMap = useMemo(() => new Map(gpus.map((entry) => [entry.slug, entry])), [gpus]);
  const providerMap = useMemo(() => new Map(providers.map((entry) => [entry.slug, entry])), [providers]);
  const matchedOffers = useMemo(() => {
    const term = query.trim().toLowerCase();
    return scopedOffers.filter((offer) => {
      const haystack = `${gpuMap.get(offer.gpuSlug)?.name} ${offer.rawGpuModel ?? ""} ${offer.gpuVariant ?? ""} ${providerMap.get(offer.providerSlug)?.name} ${offer.region} ${offer.zones.join(" ")} ${offer.conditions.join(" ")}`.toLowerCase();
      return (!term || haystack.includes(term)) && (gpu === "all" || offer.gpuSlug === gpu)
        && (provider === "all" || offer.providerSlug === provider) && (rental === "all" || offer.rentalType === rental)
        && (currency === "all" || offer.sourceCurrency === currency) && (unit === "all" || offer.billingUnit === unit)
        && matchesCountryRegionSelection(offer, country, region)
        && matchesPriceRegionFilter(offer, region) && (zone === "all" || (zone === "__unpublished" ? offer.zones.length === 0 : publishedZonesForSelection(offer, country, region).includes(zone)))
        && (basis === "all" || offer.priceBasis === basis)
        && (!hideConditional || offerAudience(offer) === "regular");
    }).sort(compareOffers);
  }, [scopedOffers, gpuMap, providerMap, query, gpu, provider, rental, currency, unit, country, region, zone, basis, hideConditional]);
  const filtered = useMemo(() => matchedOffers.filter((offer) => !availableOnly || offer.availability !== "unavailable"), [matchedOffers, availableOnly]);
  const regionCoverage = useMemo(() => priceRegionCoverage(filtered), [filtered]);
  const requireRegionalPrice = Boolean(scopeLabel) || country !== "all" || (region !== "all" && region !== "__unpublished");
  const groups = useMemo(() => {
    const order = new Map(gpus.map((entry, index) => [entry.slug, index]));
    return groupOffersForComparison(filtered, { requireRegionalPrice }).sort((a, b) => (order.get(a.gpuSlug) ?? Infinity) - (order.get(b.gpuSlug) ?? Infinity) || a.gpuSlug.localeCompare(b.gpuSlug));
  }, [filtered, gpus, requireRegionalPrice]);
  const pageSize = 4;
  const currentPage = Math.min(page, Math.max(1, Math.ceil(groups.length / pageSize)));
  const visibleGroups = groups.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const visibleOfferCount = visibleGroups.reduce((total, group) => total + group.offers.length, 0);
  const change = (filter: string, setter: (value: string) => void) => (value: string) => { setter(value); setPage(1); trackSiteEvent("price_filter_changed", { filter, value }); };
  const changeLocationScope = (filter: string, setter: (value: string) => void) => (value: string) => {
    change(filter, setter)(value); setCountry("all"); setRegion("all"); setZone("all");
  };
  const changeRegion = (value: string) => { change("region", setRegion)(value); setZone("all"); };
  const resetFilters = () => { setQuery(""); setGpu("all"); setProvider("all"); setRental(isScoped ? "all" : "On-demand"); setCurrency("all"); setUnit(isScoped ? "all" : "GPU-hour"); setCountry("all"); setRegion("all"); setZone("all"); setBasis("all"); setAvailableOnly(!isScoped); setHideConditional(false); setPage(1); };
  const changePeriod = (value: string) => {
    change("unit", setUnit)(value);
    if ((value === "GPU-month" && rental === "On-demand") || (value === "GPU-hour" && rental === "Monthly")) setRental("all");
  };
  const showAll = () => { resetFilters(); setRental("all"); setUnit("all"); setAvailableOnly(false); };
  const advancedCount = Number(currency !== "all") + Number(rental !== "all") + Number(zone !== "all") + Number(basis !== "all") + Number(hideConditional);
  const activeChips = [
    ...(rental !== "all" ? [{ label: rental, clear: () => change("rental", setRental)("all") }] : []),
    ...(currency !== "all" ? [{ label: `Original: ${currency}`, clear: () => change("currency", setCurrency)("all") }] : []),
    ...(zone !== "all" ? [{ label: zone === "__unpublished" ? "Zone not published" : zone, clear: () => change("zone", setZone)("all") }] : []),
    ...(basis !== "all" ? [{ label: priceBasisLabel({ priceBasis: basis } as Offer), clear: () => change("basis", setBasis)("all") }] : []),
    ...(hideConditional ? [{ label: "No eligibility rates", clear: () => { setHideConditional(false); setPage(1); } }] : []),
  ];

  return <section className={styles.explorer} aria-label="GPU price comparison">
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>PRICE COMPARISON</span><h2>GPU rental prices</h2><p>Published rates by model, platform and region.</p></div>
      <div className={styles.updated}><span>{automatedSourceCount} public sources <i /> Daily refresh</span><time dateTime={generatedAt}>Collected {freshness}</time><small>China time · UTC+8</small></div>
    </header>
    <div className={styles.filters}>
      <div className={styles.searchLine}>
        <div className={styles.search}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 21-4.35-4.35m2.35-5.15A7.5 7.5 0 1 1 4 11.5a7.5 7.5 0 0 1 15 0Z" /></svg><input aria-label="Search offers" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search GPU, platform or region…" />{query && <button type="button" aria-label="Clear search" onClick={() => { setQuery(""); setPage(1); }}>×</button>}</div>
        <button className={`${styles.moreFilters} ${advanced ? styles.moreFiltersOpen : ""}`} type="button" aria-expanded={advanced} aria-controls={advanced ? `${id}-advanced` : undefined} onClick={() => setAdvanced(!advanced)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14M7 3v4m6 1v4m-6 1v4" /></svg>More filters{advancedCount > 0 && <span>{advancedCount}</span>}<Chevron open={advanced} /></button>
      </div>
      <div className={styles.primaryFilters}>
        {!gpuSlug && <FilterSelect label="GPU" value={gpu} options={[{ value: "all", label: "All GPUs" }, ...gpus.filter((entry) => scopedOffers.some((offer) => offer.gpuSlug === entry.slug)).map((entry) => ({ value: entry.slug, label: entry.shortName, description: gpuMemoryLabel(entry) }))]} onChange={changeLocationScope("gpu", setGpu)} />}
        {!providerSlug && <FilterSelect label="Platform" value={provider} options={[{ value: "all", label: "All platforms" }, ...providers.filter((entry) => scopedOffers.some((offer) => offer.providerSlug === entry.slug)).map((entry) => ({ value: entry.slug, label: entry.name }))]} onChange={changeLocationScope("provider", setProvider)} />}
        <FilterSelect label="Country" value={country} options={[{ value: "all", label: "All countries" }, ...countryOptions.map((code) => ({ value: code, label: countryNames.of(code) ?? code }))]} onChange={(value) => { change("country", setCountry)(value); setRegion("all"); setZone("all"); }} />
        <FilterSelect label="Region" value={region} options={[{ value: "all", label: "All regions" }, { value: "__published", label: "With published region info" }, { value: "__unpublished", label: "Quote region not provided" }, ...regionOptions.map(([value, label]) => ({ value, label }))]} onChange={changeRegion} />
        <FilterSelect label="Billing period" value={unit} options={[{ value: "all", label: "All periods" }, { value: "GPU-hour", label: "Per GPU-hour" }, { value: "GPU-month", label: "Per GPU-month" }]} onChange={changePeriod} />
      </div>
      {advanced && <div className={styles.advanced} id={`${id}-advanced`}>
        <div className={styles.advancedFilters}>
          <FilterSelect label="Original currency" value={currency} options={[{ value: "all", label: "All source currencies" }, ...currencies.map((entry) => ({ value: entry, label: entry }))]} onChange={change("currency", setCurrency)} />
          <FilterSelect label="Purchase model" value={rental} options={[{ value: "all", label: "All types" }, ...unique(scopedOffers.map((offer) => offer.rentalType)).map((entry) => ({ value: entry, label: entry }))]} onChange={change("rental", setRental)} />
          <FilterSelect label="Availability zone" value={zone} options={[{ value: "all", label: "All zones" }, { value: "__unpublished", label: "Zone not published" }, ...zoneOptions.map((entry) => ({ value: entry, label: entry }))]} onChange={change("zone", setZone)} />
          <FilterSelect label="Price basis" value={basis} options={[{ value: "all", label: "All bases" }, ...unique(scopedOffers.map((offer) => offer.priceBasis)).map((entry) => ({ value: entry, label: priceBasisLabel({ priceBasis: entry } as Offer) }))]} onChange={change("basis", setBasis)} />
        </div>
        <label className={styles.check}><input type="checkbox" checked={hideConditional} onChange={(event) => { setHideConditional(event.target.checked); setPage(1); }} />Hide member / eligibility rates</label>
      </div>}
      {activeChips.length > 0 && <div className={styles.chips} aria-label="Active filters">{activeChips.map((chip) => <button key={chip.label} type="button" onClick={chip.clear} aria-label={`Remove ${chip.label} filter`}>{chip.label}<span aria-hidden="true">×</span></button>)}</div>}
    </div>
    <div className={styles.results}>
      <p aria-live="polite"><strong>{filtered.length.toLocaleString("en-US")}</strong> {filtered.length === 1 ? "offer" : "offers"} <span>across {groups.length} GPU {groups.length === 1 ? "model" : "models"} · {scopedOffers.length.toLocaleString("en-US")} sourced</span></p>
      <div className={styles.resultActions}><label className={styles.check}><input type="checkbox" checked={availableOnly} onChange={(event) => { setAvailableOnly(event.target.checked); setPage(1); }} />Hide offline</label><button type="button" onClick={resetFilters}>Reset</button><button type="button" onClick={showAll}>Show all</button></div>
    </div>
    <div className={styles.regionCoverage} aria-live="polite"><span><strong>{regionCoverage.offerCount}</strong> official {regionCoverage.offerCount === 1 ? "quote" : "quotes"} with published region info{regionCoverage.unspecifiedCount > 0 ? ` · ${regionCoverage.unspecifiedCount} do not specify a quote region` : ""}.</span>{region === "all" && regionCoverage.offerCount > 0 && regionCoverage.unspecifiedCount > 0 && <button type="button" onClick={() => changeRegion("__published")}>Show quotes with region info →</button>}</div>
    <div className={styles.usdNote}><span><strong>USD</strong> per GPU · <span>≈ converted price, original currency preserved</span></span><details><summary>About these prices <Chevron /></summary><p>Collapsed summaries show each model’s lowest qualifying regular and member rates for each billing period and purchase model. Memory, variant, region and node bundles can differ between those starting rates; each summary labels its configuration. Expanded USD prices run low to high within the same memory, variant, period and plan, with separate lowest-price badges. Full node prices divided by GPU count can be compared with advertised per-GPU rates. Component-only charges, starting prices, extra eligibility restrictions, offline offers and historical references do not qualify for minima. All minima use your active filters. A listed price does not confirm inventory. Original currency and dated ECB conversion details stay available. <Link href="/methodology">Read the methodology ↗</Link></p></details></div>
    {groups.length > 0 && <div className={styles.comparisonLegend}><p>{requireRegionalPrice ? "Lowest labels require a price tied to the selected location. Platform coverage alone does not qualify." : "Starting rates across configurations. Expand a model for platform quotes."}</p></div>}
    <div className={styles.groupedResults}>{visibleGroups.map((group) => <GpuComparisonGroup key={group.gpuSlug} group={group} gpu={gpuMap.get(group.gpuSlug)!} providers={providerMap} id={`${id}-${group.gpuSlug}`} />)}</div>
    {filtered.length === 0 && <div className={styles.empty}><span aria-hidden="true">⌕</span><h3>{matchedOffers.length > 0 ? `${matchedOffers.length} matching offers are offline` : "No matching offers"}</h3><p>{matchedOffers.length > 0 ? "These published prices are unavailable. Include them to compare without changing your filters." : "Try another model or region, or include every sourced record."}</p><button type="button" onClick={matchedOffers.length > 0 ? () => { setAvailableOnly(false); setPage(1); } : showAll}>{matchedOffers.length > 0 ? "Include offline offers" : "Show all offers"}</button></div>}
    <footer className={styles.tableFooter}><span>{groups.length ? `${groups.length === 1 ? "Model" : "Models"} ${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, groups.length)} of ${groups.length} · ${visibleOfferCount} ${visibleOfferCount === 1 ? "offer" : "offers"} across ${visibleGroups.length === 1 ? "this model" : "these models"}` : "0 offers"}</span>{groups.length > pageSize && <nav className={styles.pagination} aria-label="GPU model pages"><button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} aria-label="Previous models">←</button><span>{currentPage} / {Math.ceil(groups.length / pageSize)}</span><button disabled={currentPage * pageSize >= groups.length} onClick={() => setPage(currentPage + 1)} aria-label="Next models">→</button></nav>}<a href="https://github.com/flatkey-ai/rackrate/issues/new?labels=data-correction&amp;title=Data%20correction%3A%20" target="_blank" rel="nofollow noreferrer">Report an issue ↗</a></footer>
    <aside className={styles.partner}><div><span>FLATKEY COMPUTE · COMMERCIAL PARTNER</span><p>Need a configuration matched to your workload?</p></div><a href={flatkeyWebsiteUrl("comparison_results", "price_comparison")} target="_blank" rel="sponsored nofollow noreferrer">Request a quote <span>↗</span></a></aside>
  </section>;
}
