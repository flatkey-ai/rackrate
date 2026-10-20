"use client";

import Link from "next/link";
import { Fragment, useId, useMemo, useState } from "react";
import { gpuMemoryLabel, type Gpu, type Offer, type PricingDataset, type Provider } from "@/lib/data";
import { availabilityLabel, billingUnitLabel, compareOffers, formatAmount, formatOfferPrice, priceBasisLabel, hasEligibilityConditions as conditional } from "@/lib/pricing";
import { flatkeyWebsiteUrl } from "@/lib/site";
import { trackSiteEvent } from "@/components/site-analytics";
import { FilterSelect } from "@/components/filter-select";
import { OfferDetails } from "@/components/offer-details";
import styles from "./price-explorer.module.css";

const unique = (items: string[]) => [...new Set(items)].sort();

export type PriceExplorerData = {
  offers: Offer[]; gpus: Gpu[]; providers: Provider[];
  generatedAt: string; sources: PricingDataset["sources"];
};

function Chevron({ open = false }: { open?: boolean }) {
  return <svg viewBox="0 0 20 20" aria-hidden="true" data-open={open}><path d="m6 8 4 4 4-4" /></svg>;
}

function OfferPrice({ offer }: { offer: Offer }) {
  return <div className={styles.price}>
    <strong>{formatOfferPrice(offer)}</strong>
    <span>per {billingUnitLabel(offer)}</span>
    {offer.sourceCurrency !== "USD" && offer.pricePerGpuUnit !== null && <small>{formatAmount(offer.pricePerGpuUnit, offer.sourceCurrency)} original · FX {offer.fx?.rateDate ?? "unavailable"}</small>}
  </div>;
}

function OfferTerms({ offer }: { offer: Offer }) {
  return <div className={styles.terms}>
    <span className={styles.plan}>{offer.rentalType}{offer.cloudTier ? ` · ${offer.cloudTier}` : ""}</span>
    <div className={styles.badges}>
      <span className={`${styles.status} ${offer.availability === "unavailable" ? styles.offline : ""}`} data-availability={offer.dataStatus === "seed" ? "unknown" : offer.availability}><i />{offer.dataStatus === "seed" ? "Historical reference" : availabilityLabel[offer.availability]}</span>
      {conditional(offer) && <span className={styles.conditional}>{/member|会员/i.test(offer.conditions.join(" ")) ? "Member rate" : "Conditions apply"}</span>}
      {offer.priceBasis === "gpu_component" && <span className={styles.conditional}>GPU component</span>}
      {offer.quoteStatus === "starting_at" && <span className={styles.conditional}>Starting price</span>}
    </div>
  </div>;
}

export function PriceExplorer({ offers, gpus, providers, generatedAt, sources, gpuSlug, providerSlug, regionNames }: PriceExplorerData & { gpuSlug?: string; providerSlug?: string; regionNames?: string[] }) {
  const id = useId();
  const freshness = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Shanghai" }).format(new Date(generatedAt));
  const automatedSourceCount = sources.filter((source) => source.status === "ok").length;
  const scopedOffers = useMemo(() => offers.filter((offer) => (!gpuSlug || offer.gpuSlug === gpuSlug) && (!providerSlug || offer.providerSlug === providerSlug) && (!regionNames || offer.regions.some((entry) => regionNames.includes(entry)))), [offers, gpuSlug, providerSlug, regionNames]);
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
  const [advanced, setAdvanced] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const regionOptions = useMemo(() => unique(scopedOffers.flatMap((offer) => offer.regions)), [scopedOffers]);
  const zoneOptions = useMemo(() => unique(scopedOffers.flatMap((offer) => offer.zones)), [scopedOffers]);
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
        && (region === "all" || (region === "__unpublished" ? offer.regions.length === 0 : offer.regions.includes(region))) && (zone === "all" || (zone === "__unpublished" ? offer.zones.length === 0 : offer.zones.includes(zone)))
        && (basis === "all" || offer.priceBasis === basis)
        && (!hideConditional || !conditional(offer));
    }).sort(compareOffers);
  }, [scopedOffers, gpuMap, providerMap, query, gpu, provider, rental, currency, unit, region, zone, basis, hideConditional]);
  const filtered = useMemo(() => matchedOffers.filter((offer) => !availableOnly || offer.availability !== "unavailable"), [matchedOffers, availableOnly]);
  const pageSize = 25;
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)));
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const change = (filter: string, setter: (value: string) => void) => (value: string) => { setter(value); setPage(1); trackSiteEvent("price_filter_changed", { filter, value }); };
  const resetFilters = () => { setQuery(""); setGpu("all"); setProvider("all"); setRental(isScoped ? "all" : "On-demand"); setCurrency("all"); setUnit(isScoped ? "all" : "GPU-hour"); setRegion("all"); setZone("all"); setBasis("all"); setAvailableOnly(!isScoped); setHideConditional(false); setPage(1); };
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
  const configuration = (offer: Offer) => [offer.vramGb !== null ? `${offer.vramGb} GB` : null, offer.gpuVariant, offer.gpuCount !== null ? `${offer.gpuCount}× GPU` : null].filter(Boolean).join(" · ") || "See configuration details";
  const toggleDetails = (offerId: string) => setExpanded(expanded === offerId ? null : offerId);

  return <section className={styles.explorer} aria-label="GPU price comparison">
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>THE PRICE BOARD</span><h2>Compare GPU prices.</h2><p>Find your GPU. Compare the price and the terms.</p></div>
      <div className={styles.updated}><span>{automatedSourceCount} public sources <i /> Daily refresh</span><time dateTime={generatedAt}>Collected {freshness}</time><small>China time · UTC+8</small></div>
    </header>
    <div className={styles.filters}>
      <div className={styles.searchLine}>
        <div className={styles.search}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 21-4.35-4.35m2.35-5.15A7.5 7.5 0 1 1 4 11.5a7.5 7.5 0 0 1 15 0Z" /></svg><input aria-label="Search offers" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search GPU, platform or region…" />{query && <button type="button" aria-label="Clear search" onClick={() => { setQuery(""); setPage(1); }}>×</button>}</div>
        <button className={`${styles.moreFilters} ${advanced ? styles.moreFiltersOpen : ""}`} type="button" aria-expanded={advanced} aria-controls={advanced ? `${id}-advanced` : undefined} onClick={() => setAdvanced(!advanced)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14M7 3v4m6 1v4m-6 1v4" /></svg>More filters{advancedCount > 0 && <span>{advancedCount}</span>}<Chevron open={advanced} /></button>
      </div>
      <div className={styles.primaryFilters}>
        {!gpuSlug && <FilterSelect label="GPU" value={gpu} options={[{ value: "all", label: "All GPUs" }, ...gpus.filter((entry) => scopedOffers.some((offer) => offer.gpuSlug === entry.slug)).map((entry) => ({ value: entry.slug, label: entry.shortName, description: gpuMemoryLabel(entry) }))]} onChange={change("gpu", setGpu)} />}
        {!providerSlug && <FilterSelect label="Platform" value={provider} options={[{ value: "all", label: "All platforms" }, ...providers.filter((entry) => scopedOffers.some((offer) => offer.providerSlug === entry.slug)).map((entry) => ({ value: entry.slug, label: entry.name }))]} onChange={change("provider", setProvider)} />}
        <FilterSelect label="Region" value={region} options={[{ value: "all", label: "All regions" }, { value: "__unpublished", label: "Region not published" }, ...regionOptions.map((entry) => ({ value: entry, label: entry }))]} onChange={change("region", setRegion)} />
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
      <p aria-live="polite"><strong>{filtered.length.toLocaleString("en-US")}</strong> offers <span>of {scopedOffers.length.toLocaleString("en-US")} sourced</span></p>
      <div className={styles.resultActions}><label className={styles.check}><input type="checkbox" checked={availableOnly} onChange={(event) => { setAvailableOnly(event.target.checked); setPage(1); }} />Hide offline</label><button type="button" onClick={resetFilters}>Reset</button><button type="button" onClick={showAll}>Show all</button></div>
    </div>
    <div className={styles.usdNote}><span><strong>USD</strong> per GPU · <span>≈ converted price, original currency preserved</span></span><details><summary>About these prices <Chevron /></summary><p>Daily ECB reference rates include their publication date and source in each offer’s details. Monthly prices stay monthly. Results are sorted by USD price within billing period, purchase model and price basis. A listed price does not confirm inventory; member rates, offline offers and historical references are labeled. <Link href="/methodology">Read the methodology ↗</Link></p></details></div>
    <div className={styles.desktopResults}>
      <table className={styles.table}><caption className="sr-only">GPU prices with their configuration, region, terms, USD amount and original currency</caption><thead><tr><th scope="col">GPU / Platform</th><th scope="col">Region / Zone</th><th scope="col">Plan / Availability</th><th scope="col" className={styles.priceHeading}>Price in USD</th><th scope="col"><span className="sr-only">Offer details</span></th></tr></thead><tbody>{visible.map((offer) => {
        const gpuEntry = gpuMap.get(offer.gpuSlug)!;
        const providerEntry = providerMap.get(offer.providerSlug)!;
        const open = expanded === offer.id;
        return <Fragment key={offer.id}><tr className={open ? styles.selectedRow : undefined}>
          <td><Link className={styles.gpuName} href={`/gpus/${gpuEntry.slug}`}>{gpuEntry.shortName}</Link><div className={styles.modelMeta}><Link href={`/providers/${providerEntry.slug}`}>{providerEntry.name}</Link><span>·</span><span>{configuration(offer)}</span></div></td>
          <td><span className={styles.location}>{offer.regions.length ? offer.regions.join(" · ") : "Not published"}</span>{offer.zones.length > 0 && <small className={styles.zone}>{offer.zones.join(" · ")}</small>}</td>
          <td><OfferTerms offer={offer} /></td>
          <td><OfferPrice offer={offer} /></td>
          <td><button className={styles.detailsButton} type="button" aria-label={`${open ? "Hide" : "View"} ${gpuEntry.shortName} on ${providerEntry.name} details`} aria-expanded={open} aria-controls={open ? `${id}-desktop-${offer.id}` : undefined} onClick={() => toggleDetails(offer.id)}>Details<Chevron open={open} /></button></td>
        </tr>{open && <tr className={styles.expandedRow} id={`${id}-desktop-${offer.id}`}><td colSpan={5}><div className={styles.details}><OfferDetails offer={offer} /></div></td></tr>}</Fragment>;
      })}</tbody></table>
    </div>
    <div className={styles.mobileResults} aria-label="GPU price offers">{visible.map((offer) => {
      const gpuEntry = gpuMap.get(offer.gpuSlug)!;
      const providerEntry = providerMap.get(offer.providerSlug)!;
      const open = expanded === offer.id;
      return <article key={offer.id} className={styles.offerCard}>
        <div className={styles.cardTop}><div><Link className={styles.gpuName} href={`/gpus/${gpuEntry.slug}`}>{gpuEntry.shortName}</Link><Link className={styles.provider} href={`/providers/${providerEntry.slug}`}>{providerEntry.name}</Link></div><OfferPrice offer={offer} /></div>
        <div className={styles.cardConfiguration}>{configuration(offer)}</div>
        <OfferTerms offer={offer} />
        <div className={styles.cardBottom}><span className={styles.location}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16 8c0 4-6 9-6 9S4 12 4 8a6 6 0 1 1 12 0Z" /><circle cx="10" cy="8" r="2" /></svg><span>{offer.regions.length ? offer.regions.join(" · ") : "Region not published"}{offer.zones.length > 0 && <small>{offer.zones.join(" · ")}</small>}</span></span><button className={styles.detailsButton} type="button" aria-label={`${open ? "Hide" : "View"} ${gpuEntry.shortName} on ${providerEntry.name} details`} aria-expanded={open} aria-controls={open ? `${id}-mobile-${offer.id}` : undefined} onClick={() => toggleDetails(offer.id)}>Details<Chevron open={open} /></button></div>
        {open && <div className={styles.details} id={`${id}-mobile-${offer.id}`}><OfferDetails offer={offer} /></div>}
      </article>;
    })}</div>
    {filtered.length === 0 && <div className={styles.empty}><span aria-hidden="true">⌕</span><h3>{matchedOffers.length > 0 ? `${matchedOffers.length} matching offers are offline` : "No matching offers"}</h3><p>{matchedOffers.length > 0 ? "These published prices are unavailable. Include them to compare without changing your filters." : "Try another model or region, or include every sourced record."}</p><button type="button" onClick={matchedOffers.length > 0 ? () => { setAvailableOnly(false); setPage(1); } : showAll}>{matchedOffers.length > 0 ? "Include offline offers" : "Show all offers"}</button></div>}
    <footer className={styles.tableFooter}><span>{filtered.length ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filtered.length)} of ${filtered.length} offers` : "0 offers"}</span>{filtered.length > pageSize && <nav className={styles.pagination} aria-label="Price results pages"><button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} aria-label="Previous page">←</button><span>{currentPage} / {Math.ceil(filtered.length / pageSize)}</span><button disabled={currentPage * pageSize >= filtered.length} onClick={() => setPage(currentPage + 1)} aria-label="Next page">→</button></nav>}<a href="https://github.com/flatkey-ai/rackrate/issues/new?labels=data-correction&amp;title=Data%20correction%3A%20" target="_blank" rel="nofollow noreferrer">Report an issue ↗</a></footer>
    <aside className={styles.partner}><div><span>FLATKEY COMPUTE · COMMERCIAL PARTNER</span><p>Need a configuration matched to your workload?</p></div><a href={flatkeyWebsiteUrl("comparison_results", "price_comparison")} target="_blank" rel="sponsored nofollow noreferrer">Request a quote <span>↗</span></a></aside>
  </section>;
}
