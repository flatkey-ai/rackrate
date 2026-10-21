import type { ReactNode } from "react";
import type { Offer } from "@/lib/data";
import { availabilityLabel, billingUnitLabel, cloudTierLabel, isAccountSpecificPrice, priceBasisLabel } from "@/lib/pricing";
import { offerAudience } from "@/lib/offer-comparison";
import { isCatalogPriceOffer, offerProviderLabel } from "@/lib/offer-geography.mjs";
import { getOfferCountryCodes, isRegionSpecificPrice, publishedPriceRegionCodes, publishedRegionLabel } from "@/lib/region-matching";

type PublicOfferDetails = Offer & {
  promotion?: Record<string, unknown> | null;
  selectedConfiguration?: Record<string, unknown> | null;
  sourceConditions?: Record<string, unknown> | null;
  minimumCommitment?: unknown;
  membershipDiscount?: string | null;
  billingMeter?: string | null;
  taxScope?: string | null;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
};

type DetailItem = [label: string, value: ReactNode];
const fieldLabel = (key: string) => key.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
function sourceValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(sourceValue).join(" · ");
  if (typeof value === "object") return Object.entries(value).filter(([, item]) => item !== null && item !== undefined && item !== "")
    .map(([key, item]) => `${fieldLabel(key)}: ${sourceValue(item)}`).join("; ");
  return String(value);
}
function exactAmount(value: string | null | undefined, fallback: number | null | undefined, currency: string, unit: string) {
  const amount = value ?? (fallback === null || fallback === undefined ? null : String(fallback));
  return amount === null ? "—" : `${amount} ${currency} / ${unit}`;
}
function timestamp(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? `${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Shanghai" }).format(parsed)} China time`
    : value;
}
function DetailList({ items }: { items: DetailItem[] }) {
  return <dl className="quote-detail-list">{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}
function knownNumber(value: unknown): value is number | string {
  return (typeof value === "number" || typeof value === "string") && value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;
}
function quantity(resources: Record<string, unknown>, fields: [string, string][]): string | null {
  for (const [field, unit] of fields) if (knownNumber(resources[field])) return `${resources[field]} ${unit}`;
  return null;
}
function storageLabel(resources: Record<string, unknown>): string | null {
  const storage = resources.storage;
  if (storage && typeof storage === "object" && !Array.isArray(storage)) {
    const item = storage as Record<string, unknown>;
    if (knownNumber(item.amount) && typeof item.unit === "string") return [item.amount, item.unit, item.type].filter(Boolean).join(" ");
  }
  return quantity(resources, [["storage_gib", "GiB"], ["storage_gb", "GB"], ["disk_gb", "GB"]]);
}

export function OfferDetails({ offer }: { offer: Offer }) {
  const published = offer as PublicOfferDetails;
  const resources = offer.resources ?? {};
  const unit = billingUnitLabel(offer);
  const converted = offer.sourceCurrency !== "USD";
  const perGpuResources = resources.allocation_scope === "per_gpu";
  const configuration: DetailItem[] = [];
  const model = offer.rawGpuModel ?? offer.gpuModel;
  const name = offer.rawName ?? model ?? "";
  const compactName = name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const gpu = [name,
    model && !compactName.includes(model.toUpperCase().replace(/[^A-Z0-9]/g, "")) ? model : null,
    offer.gpuVariant && !compactName.includes(offer.gpuVariant.toUpperCase().replace(/[^A-Z0-9]/g, "")) ? offer.gpuVariant : null,
    offer.vramGb != null && !new RegExp(`${offer.vramGb}\\s*GB\\b`, "i").test(name) ? `${offer.vramGb} GB VRAM` : null,
  ].filter(Boolean).join(" · ");
  if (gpu) configuration.push(["GPU", gpu]);
  if (offer.gpuCount != null) configuration.push(["GPUs per node", offer.gpuCount]);
  const cpu = knownNumber(offer.vcpu) ? `${offer.vcpu} vCPU`
    : quantity(resources, [["vcpus", "vCPU"], ["vcpu_count", "vCPU"], ["cpu_count", "CPUs"], ["cpu_cores_per_gpu", "CPU cores per GPU"]]);
  if (cpu) configuration.push(["CPU", cpu]);
  const ram = quantity(resources, [["memory_gib", "GiB"], ["ram_gib", "GiB"], ["memory_mb", "MB"], ["ram_mb", "MB"], ["ram_gb", "GB"], ["memory_gb", "GB"]])
    ?? (knownNumber(offer.ramGb) ? `${offer.ramGb} GB` : null);
  if (ram) configuration.push([perGpuResources ? "RAM per GPU" : "System RAM", ram]);
  const memoryPerGpu = resources.memory_per_gpu as { amount?: unknown; unit?: unknown } | undefined;
  if (!ram && memoryPerGpu && knownNumber(memoryPerGpu.amount) && typeof memoryPerGpu.unit === "string") {
    configuration.push(["RAM per GPU", `${memoryPerGpu.amount} ${memoryPerGpu.unit}`]);
  }
  const storage = storageLabel(resources);
  if (storage) configuration.push(["Storage", storage]);
  const network = quantity(resources, [["bandwidth_mbps", "Mbps"], ["bandwidth_gbps", "Gbps"], ["network_gbps", "Gbps"]]);
  if (network) configuration.push(["Network", network]);

  const price: DetailItem[] = [];
  if (offer.quoteStatus === "contact_sales") price.push(["Price", "Contact sales"]);
  else {
    const prefix = offer.quoteStatus === "starting_at" ? "From " : "";
    price.push([converted ? "Original per GPU" : "Price per GPU", `${prefix}${exactAmount(offer.sourceAmount, offer.pricePerGpuUnit, offer.sourceCurrency, unit)}`]);
    if (converted) price.push(["USD equivalent", `≈ ${prefix}${exactAmount(offer.usdSourceAmount, offer.priceUsdPerGpuUnit, "USD", unit)}`]);
    const nodeCurrency = offer.instanceCurrency ?? offer.sourceCurrency;
    const separateNodeTotal = offer.instancePrice != null && ((offer.gpuCount ?? 0) > 1
      || nodeCurrency !== offer.sourceCurrency || offer.instancePrice !== offer.pricePerGpuUnit);
    if (separateNodeTotal) {
      const nodeUnit = offer.instanceBillingUnit === "instance-month" ? "node / month" : "node / hour";
      price.push(["Node total", exactAmount(offer.instanceSourceAmount, offer.instancePrice, nodeCurrency, nodeUnit)]);
      if (nodeCurrency !== "USD") price.push(["USD node total", `≈ ${exactAmount(offer.instanceUsdSourceAmount, offer.instancePriceUsd, "USD", nodeUnit)}`]);
    }
  }
  price.push(["Price basis", priceBasisLabel(offer)]);
  if (converted && offer.fx && offer.quoteStatus !== "contact_sales") {
    price.push(["Exchange rate", <>1 {offer.sourceCurrency} = {offer.fx.rateToUsdDecimal ?? offer.fx.rateToUsd} USD<br /><a href={offer.fx.sourceUrl} target="_blank" rel="nofollow noreferrer">ECB · {offer.fx.rateDate} ↗</a></>]);
  }

  const zones = isRegionSpecificPrice(offer) ? offer.zones ?? [] : [];
  const countries = getOfferCountryCodes(offer);
  const countryNames = new Intl.DisplayNames(["en"], { type: "region" });
  const terms: DetailItem[] = [
    ["Price country", countries.map((code) => `${countryNames.of(code) ?? code} (${code})`).join(" · ") || "Not specified"],
    ["Price region", publishedPriceRegionCodes(offer).map((code) => publishedRegionLabel(offer, code)).join(" · ") || "Not specified"],
  ];
  if (isCatalogPriceOffer(offer)) terms.unshift(["Price scope", "Catalog price; region not specified. This does not establish a worldwide rate."]);
  if (offer.productLine || offerProviderLabel(offer) === "UCloud · CompShare") {
    terms.unshift(["Product line", offerProviderLabel(offer, offer.productLine ?? offer.providerSlug)]);
  }
  if (zones.length) terms.push(["Zone", zones.join(" · ")]);
  const audience = offerAudience(offer);
  const tier = isAccountSpecificPrice(offer) ? (/contract/i.test(offer.accountScope ?? "") ? "Account contract quote" : "Account-specific quote")
    : /^authenticated/.test(offer.accountScope ?? "") ? "Signed-in catalog"
      : audience === "member" ? "Member price; eligibility not verified"
        : audience === "conditional" ? "Conditional price" : "Regular price";
  terms.push(["Plan", [offer.rentalType, cloudTierLabel(offer)].filter(Boolean).join(" · ")], ["Price access", tier]);
  terms.push(["Availability", offer.dataStatus === "seed" ? "Historical reference" : availabilityLabel[offer.availability]]);
  const countryRestriction = offer.conditions.find((condition) => /prices apply to companies from Israel/i.test(condition));
  if (countryRestriction) terms.push(["Eligibility", countryRestriction]);
  if (published.minimumCommitment != null) terms.push(["Minimum term", sourceValue(published.minimumCommitment)]);
  if (published.taxScope === "excluded" || published.taxScope === "included") terms.push(["Tax", published.taxScope === "excluded" ? "Excluded" : "Included"]);

  const additional: DetailItem[] = [];
  if (published.promotion) additional.push(["Promotion", sourceValue(published.promotion)]);
  if (published.sourceConditions) additional.push(["Source terms", sourceValue(published.sourceConditions)]);
  if (published.selectedConfiguration) additional.push(["Selected configuration", sourceValue(published.selectedConfiguration)]);
  if (published.membershipDiscount) additional.push(["Membership discount", published.membershipDiscount]);
  if (published.pricingProductScope?.length) additional.push(["Applicable products", sourceValue(published.pricingProductScope)]);
  if (published.billingMeter) additional.push(["Billing meter", published.billingMeter]);
  if (Array.isArray(resources.disks) && resources.disks.length) additional.push(["Disks", sourceValue(resources.disks)]);
  const locationSource = offer.locationSource?.source_url ?? offer.locationSource?.api_url ?? offer.locationSource?.url;
  if (typeof locationSource === "string" && /^https?:\/\//.test(locationSource)) {
    additional.push(["Country mapping", <a href={locationSource} target="_blank" rel="nofollow noreferrer">Official location directory ↗</a>]);
  }
  const conditions = [...new Set(offer.conditions ?? [])];
  const source: DetailItem[] = [
    ["Source", <a href={offer.sourceUrl} target="_blank" rel="nofollow noreferrer">{offer.dataStatus === "seed" ? "Historical source" : "Official pricing source"} ↗</a>],
    ["Collected", <time dateTime={offer.observedAt}>{timestamp(offer.observedAt)}</time>],
  ];
  if (published.effectiveFrom) source.push(["Effective from", timestamp(published.effectiveFrom)]);
  if (published.effectiveUntil) source.push(["Effective until", timestamp(published.effectiveUntil)]);
  if (offer.sourceSnapshotAt) source.push(["API earliest sample", timestamp(offer.sourceSnapshotAt)]);
  if (offer.providerSkuId) source.push(["Provider SKU", offer.providerSkuId]);
  if (offer.apiSourceUrl) source.push(["Source data", <a href={offer.apiSourceUrl} target="_blank" rel="nofollow noreferrer">Official price API ↗</a>]);

  return <div className="quote-detail-grid">
    <section className="quote-detail-section"><h4>Configuration</h4><DetailList items={configuration} /></section>
    <section className="quote-detail-section"><h4>Price</h4><DetailList items={price} /></section>
    <section className="quote-detail-section"><h4>Terms</h4><DetailList items={terms} />{(additional.length > 0 || conditions.length > 0) && <details><summary>More terms &amp; source notes</summary><DetailList items={additional} />{conditions.length > 0 && <ul className="quote-detail-notes">{conditions.map((condition, index) => <li key={index}>{condition}</li>)}</ul>}</details>}</section>
    <section className="quote-detail-section"><h4>Source</h4><DetailList items={source} /></section>
  </div>;
}
