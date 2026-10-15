"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { gpus, offers, offerDatasetGeneratedAt, offerDatasetSources, providers, type Availability, type RentalType } from "@/lib/data";
import { flatkeyWebsiteUrl } from "@/lib/site";
import { trackSiteEvent } from "@/components/site-analytics";
import { FilterSelect } from "@/components/filter-select";
import { FlatkeyRecommendation } from "@/components/flatkey-recommendation";

const availabilityLabel: Record<Availability, string> = {
  available: "Available",
  limited: "Limited",
  unavailable: "Out",
  unknown: "Check provider",
};

const freshness = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
}).format(new Date(offerDatasetGeneratedAt));

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const observedDate = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeZone: "UTC",
});

const datasetAgeHours = Math.max(0, (Date.now() - new Date(offerDatasetGeneratedAt).getTime()) / 3_600_000);
const datasetIsFresh = datasetAgeHours <= 18;
const automatedSourceCount = offerDatasetSources.filter((source) => source.status === "ok").length;

export function PriceExplorer() {
  const [query, setQuery] = useState("");
  const [gpu, setGpu] = useState("all");
  const [rental, setRental] = useState<"all" | RentalType>("On-demand");
  const [region, setRegion] = useState("all");
  const [availableOnly, setAvailableOnly] = useState(true);

  const regions = useMemo(
    () => Array.from(new Set(offers.map((offer) => offer.region))).sort(),
    [],
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return offers
      .filter((offer) => {
        const gpuEntry = gpus.find((entry) => entry.slug === offer.gpuSlug);
        const provider = providers.find((entry) => entry.slug === offer.providerSlug);
        const haystack = `${gpuEntry?.name} ${provider?.name} ${offer.region}`.toLowerCase();
        return (
          (!term || haystack.includes(term)) &&
          (gpu === "all" || offer.gpuSlug === gpu) &&
          (rental === "all" || offer.rentalType === rental) &&
          (region === "all" || offer.region === region) &&
          (!availableOnly || offer.availability !== "unavailable")
        );
      })
      .sort((a, b) => a.pricePerGpuHour - b.pricePerGpuHour);
  }, [availableOnly, gpu, query, region, rental]);

  const resetFilters = () => {
    setQuery("");
    setGpu("all");
    setRental("On-demand");
    setRegion("all");
    setAvailableOnly(true);
  };

  return (
    <div className="explorer-card">
      <div className="explorer-head">
        <div>
          <span className="eyebrow">Market scanner / sourced feed</span>
          <h2>Find capacity without opening thirty tabs.</h2>
        </div>
        <div className={`freshness ${datasetIsFresh ? "" : "delayed"}`}><span /> {datasetIsFresh ? "Fresh source snapshot" : "Refresh delayed — verify sources"} · {freshness} UTC</div>
      </div>

      <FlatkeyRecommendation content="comparison_recommended" />

      <div className="filter-bar">
        <label className="search-field">
          <span className="sr-only">Search offers</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 21-4.35-4.35m2.35-5.15A7.5 7.5 0 1 1 4 11.5a7.5 7.5 0 0 1 15 0Z" /></svg>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search GPU, provider, or region" />
        </label>
        <FilterSelect label="GPU" value={gpu}
          options={[{ value: "all", label: "All GPUs", description: "Every indexed accelerator" }, ...gpus.map((entry) => ({ value: entry.slug, label: entry.shortName, description: `${entry.vramGb} GB · ${entry.architecture}` }))]}
          onChange={(value) => { setGpu(value); trackSiteEvent("price_filter_changed", { filter: "gpu", value }); }} />
        <FilterSelect label="Rental" value={rental}
          options={[
            { value: "all", label: "All types", description: "Compare purchase models" },
            { value: "On-demand", label: "On-demand", description: "Flexible usage" },
            { value: "Spot", label: "Spot", description: "Interruptible capacity" },
            { value: "Reserved", label: "Reserved", description: "Committed capacity" },
          ]}
          onChange={(value) => { setRental(value as "all" | RentalType); trackSiteEvent("price_filter_changed", { filter: "rental", value }); }} />
        <FilterSelect label="Region" value={region}
          options={[{ value: "all", label: "All regions" }, ...regions.map((entry) => ({ value: entry, label: entry }))]}
          onChange={(value) => { setRegion(value); trackSiteEvent("price_filter_changed", { filter: "region", value }); }} />
      </div>

      <div className="result-toolbar">
        <p><strong>{filtered.length}</strong> matching configuration{filtered.length === 1 ? "" : "s"}</p>
        <div className="result-controls">
          <button type="button" className="reset-filters" onClick={resetFilters}>Reset filters</button>
          <label className="check-control">
            <input type="checkbox" checked={availableOnly} onChange={(event) => setAvailableOnly(event.target.checked)} />
            <span aria-hidden="true" />
            Hide unavailable listings
          </label>
        </div>
      </div>

      <div className="source-legend" aria-label="Price source labels">
        <div><strong>Verified official price</strong><span>Collected from a provider-owned public pricing page and checked by the latest successful collector run.</span></div>
        <div><strong>Reference price</strong><span>A dated public observation kept for market context; verify it directly before budgeting or procurement.</span></div>
      </div>

      <div className="table-scroll-hint" aria-hidden="true"><span>Swipe to compare all columns</span><i>→</i></div>
      <div className="price-table-wrap" tabIndex={0} role="region" aria-label="Scrollable GPU price comparison table">
        <table className="price-table">
          <thead>
            <tr>
              <th>GPU / provider</th>
              <th>Configuration</th>
              <th>Region</th>
              <th>Rental</th>
              <th>Availability</th>
              <th className="numeric">Per GPU / hr</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((offer) => {
              const gpuEntry = gpus.find((entry) => entry.slug === offer.gpuSlug)!;
              const provider = providers.find((entry) => entry.slug === offer.providerSlug)!;
              return (
                <tr key={offer.id}>
                  <td>
                    <Link className="gpu-link" href={`/gpus/${gpuEntry.slug}`}>{gpuEntry.shortName}</Link>
                    <Link className="provider-link" href={`/providers/${provider.slug}`}>{provider.name}</Link>
                    <span className="offer-evidence">
                      <a href={offer.sourceUrl} target="_blank" rel="nofollow noreferrer">
                        {offer.dataStatus === "official-page" ? "Verified official price" : "Reference price"} ↗
                      </a>
                      <span aria-hidden="true">·</span>
                      <time dateTime={offer.observedAt}>{observedDate.format(new Date(offer.observedAt))}</time>
                    </span>
                  </td>
                  <td>{offer.vcpu && offer.ramGb ? <><strong>{offer.gpuCount}×</strong> · {offer.vcpu} vCPU · {offer.ramGb} GB</> : <><strong>{offer.gpuCount}×</strong> · configuration varies</>}</td>
                  <td><span className="country-code">{offer.countryCode}</span>{offer.region}</td>
                  <td>{offer.rentalType}</td>
                  <td><span className={`status ${offer.availability}`}><i />{availabilityLabel[offer.availability]}</span></td>
                  <td className="numeric price-cell"><strong>{money.format(offer.pricePerGpuHour)}</strong><small>{money.format(offer.pricePerGpuHour * offer.gpuCount)} total</small></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="empty-state"><strong>No exact match.</strong><span>Clear a filter or try a broader region.</span></div>}
      </div>
      <div className="table-footnote">
        <span>Prices are normalized to USD per GPU-hour · {automatedSourceCount} automated official sources.</span>
        <div><Link href="/methodology">How comparison works →</Link><a href="https://github.com/flatkey-ai/rackrate/issues/new?labels=data-correction&amp;title=Data%20correction%3A%20" target="_blank" rel="nofollow noreferrer">Report a data issue ↗</a></div>
      </div>
      {filtered.length > 0 && (
        <div className="explorer-conversion">
          <div><strong>Have a configuration in mind?</strong><span>Take the GPU, region and duration to Flatkey for a formal quote.</span></div>
          <a className="button button-primary" href={flatkeyWebsiteUrl("comparison_results", "price_comparison")} target="_blank" rel="sponsored nofollow noreferrer">Request a Flatkey quote <span>↗</span></a>
        </div>
      )}
    </div>
  );
}
