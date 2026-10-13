"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { gpus, offers, offerDatasetGeneratedAt, providers, type Availability, type RentalType } from "@/lib/data";
import { flatkeyComputeUrl } from "@/lib/site";

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
        <div className="freshness"><span /> Dataset refreshed {freshness} UTC</div>
      </div>

      <div className="filter-bar">
        <label className="search-field">
          <span className="sr-only">Search offers</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 21-4.35-4.35m2.35-5.15A7.5 7.5 0 1 1 4 11.5a7.5 7.5 0 0 1 15 0Z" /></svg>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search GPU, provider, or region" />
        </label>
        <label>
          <span className="filter-label">GPU</span>
          <select value={gpu} onChange={(event) => setGpu(event.target.value)}>
            <option value="all">All GPUs</option>
            {gpus.map((entry) => <option key={entry.slug} value={entry.slug}>{entry.shortName}</option>)}
          </select>
        </label>
        <label>
          <span className="filter-label">Rental</span>
          <select value={rental} onChange={(event) => setRental(event.target.value as "all" | RentalType)}>
            <option value="all">All types</option>
            <option value="On-demand">On-demand</option>
            <option value="Spot">Spot</option>
            <option value="Reserved">Reserved</option>
          </select>
        </label>
        <label>
          <span className="filter-label">Region</span>
          <select value={region} onChange={(event) => setRegion(event.target.value)}>
            <option value="all">All regions</option>
            {regions.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </select>
        </label>
      </div>

      <div className="result-toolbar">
        <p><strong>{filtered.length}</strong> matching configurations</p>
        <div className="result-controls">
          <button type="button" className="reset-filters" onClick={resetFilters}>Reset filters</button>
          <label className="check-control">
            <input type="checkbox" checked={availableOnly} onChange={(event) => setAvailableOnly(event.target.checked)} />
            <span aria-hidden="true" />
            Available capacity only
          </label>
        </div>
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
                        {offer.dataStatus === "official-page" ? "Official source" : "Baseline source"} ↗
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
        <span>Prices are normalized to USD per GPU-hour.</span>
        <Link href="/methodology">How comparison works →</Link>
      </div>
      {filtered.length > 0 && (
        <div className="explorer-conversion">
          <div><strong>Ready to deploy the shortlist?</strong><span>Continue to Flatkey Compute to review current GPU options.</span></div>
          <a className="button button-primary" href={flatkeyComputeUrl("comparison_results", "price_comparison")} target="_blank" rel="sponsored nofollow noreferrer">Continue to Flatkey Compute <span>↗</span></a>
        </div>
      )}
    </div>
  );
}
