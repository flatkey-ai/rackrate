import type { ReactNode } from "react";
import type { Offer } from "@/lib/data";
import {
  availabilityLabel,
  billingUnitLabel,
  formatFxRate,
  formatInstancePrice,
  formatOfferPrice,
  formatOriginalInstancePrice,
  formatOriginalPrice,
  priceBasisLabel,
} from "@/lib/pricing";

type PublicOfferDetails = Offer & {
  location?: Record<string, unknown> | null;
  promotion?: Record<string, unknown> | null;
  selectedConfiguration?: Record<string, unknown> | null;
  sourceConditions?: Record<string, unknown> | null;
  minimumCommitment?: unknown;
  membershipDiscount?: string | null;
  pricingProductScope?: string[] | null;
  billingMeter?: string | null;
  accountScope?: string | null;
  taxScope?: string | null;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
};

type DetailItem = [label: string, value: ReactNode];
const absent = "Not published";
const fieldLabel = (key: string) => key.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
function sourceValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return absent;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.map(sourceValue).join(" · ") : absent;
  if (typeof value === "object") return Object.entries(value).map(([key, item]) => `${fieldLabel(key)}: ${sourceValue(item)}`).join("; ");
  return String(value);
}
function exactAmount(value: string | null | undefined, fallback: number | null | undefined, currency: string, unit: string) {
  const amount = value ?? (fallback === null || fallback === undefined ? null : String(fallback));
  return amount === null ? absent : `${amount} ${currency} / ${unit}`;
}
function timestamp(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value} (date only; time not published)`;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().replace("T", " ").replace(/\.000Z$/, " UTC").replace(/Z$/, " UTC") : value;
}
function DetailList({ items }: { items: DetailItem[] }) {
  return <dl className="quote-detail-list">{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

export function OfferDetails({ offer }: { offer: Offer }) {
  const published = offer as PublicOfferDetails;
  const unit = billingUnitLabel(offer);
  const regions = offer.regions ?? [];
  const zones = offer.zones ?? [];
  const conditions = offer.conditions ?? [];
  const nodeUnit = offer.instanceBillingUnit === "instance-month" ? "node / month" : "node / hour";
  const resources = Object.entries(offer.resources ?? {}).map(([key, value]): DetailItem => [fieldLabel(key), sourceValue(value)]);
  const configuration: DetailItem[] = [
    ["Source listing", offer.rawName ?? absent],
    ["Source GPU model", offer.rawGpuModel ?? offer.gpuModel ?? absent],
    ["Variant", offer.gpuVariant ?? absent],
    ["SKU", offer.rawSku ?? absent],
    ["GPU count", offer.gpuCount ?? absent],
    ["VRAM per GPU", offer.vramGb == null ? absent : `${offer.vramGb} GB`],
    ["vCPU", offer.vcpu ?? absent],
    ["System RAM", offer.ramGb == null ? absent : `${offer.ramGb} GB`],
  ];
  if (published.selectedConfiguration) configuration.push(["Selected source configuration", sourceValue(published.selectedConfiguration)]);

  const price: DetailItem[] = [
    ["USD per GPU", <>{formatOfferPrice(offer)}{offer.pricePerGpuUnit !== null && ` / ${unit}`}</>],
    ["Original per GPU", formatOriginalPrice(offer)],
    ["USD node total", formatInstancePrice(offer)],
    ["Original node total", formatOriginalInstancePrice(offer) || absent],
    ["Exact source price", exactAmount(offer.sourceAmount, offer.pricePerGpuUnit, offer.sourceCurrency, unit)],
    ["Exact USD price", exactAmount(offer.usdSourceAmount, offer.priceUsdPerGpuUnit, "USD", unit)],
  ];
  if (offer.instancePrice !== null && offer.instancePrice !== undefined) {
    price.push(
      ["Exact source node total", exactAmount(offer.instanceSourceAmount, offer.instancePrice, offer.instanceCurrency ?? offer.sourceCurrency, nodeUnit)],
      ["Exact USD node total", exactAmount(offer.instanceUsdSourceAmount, offer.instancePriceUsd, "USD", nodeUnit)],
    );
  }
  price.push(["Exchange rate", formatFxRate(offer)]);
  if (offer.fx) {
    if (offer.sourceCurrency !== "USD") {
      price.push(["Exact rate to USD", `1 ${offer.sourceCurrency} = ${offer.fx.rateToUsdDecimal ?? String(offer.fx.rateToUsd)} USD`]);
      price.push(["FX reference date", offer.fx.rateDate]);
      price.push(["FX source", <a href={offer.fx.sourceUrl} target="_blank" rel="nofollow noreferrer">{offer.fx.sourceName} ↗</a>]);
    }
    if (offer.fx.observedAt) price.push(["FX fetched at", timestamp(offer.fx.observedAt)]);
    if (offer.fx.formula) price.push(["Conversion", offer.fx.formula]);
    if (offer.fx.rounding) price.push(["Conversion precision", offer.fx.rounding]);
  }

  const locationAndTerms: DetailItem[] = [
    ["Regions", regions.length ? regions.join(" · ") : absent],
    ["Availability zones", zones.length ? zones.join(" · ") : absent],
    ["Geographic scope", offer.regionScope ?? offer.geographicScope ?? absent],
    ["Purchase model", offer.rentalType],
    ["Billing period", unit],
    ["Price basis", priceBasisLabel(offer)],
    ["Price tier", offer.pricingTier ?? absent],
    ["Cloud tier", offer.cloudTier ?? absent],
    ["Membership", offer.membershipRequired === true ? "Required; eligibility not verified" : offer.membershipRequired === false ? "Not required by this listed tier" : absent],
    ["Availability", offer.dataStatus === "seed" ? "Historical reference / not live" : availabilityLabel[offer.availability]],
  ];
  if (offer.countryCode) locationAndTerms.push(["Published country", offer.countryCode]);
  if (published.location) locationAndTerms.push(["Published location details", sourceValue(published.location)]);
  if (published.minimumCommitment !== null && published.minimumCommitment !== undefined) locationAndTerms.push(["Minimum commitment", sourceValue(published.minimumCommitment)]);
  if (published.membershipDiscount) locationAndTerms.push(["Published membership discount", published.membershipDiscount]);
  if (published.promotion) locationAndTerms.push(["Promotion and eligibility", sourceValue(published.promotion)]);
  if (published.sourceConditions) locationAndTerms.push(["Additional source conditions", sourceValue(published.sourceConditions)]);
  if (published.pricingProductScope?.length) locationAndTerms.push(["Applicable products", published.pricingProductScope.join(" · ")]);
  if (published.billingMeter) locationAndTerms.push(["Usage metering", published.billingMeter]);
  if (published.accountScope) locationAndTerms.push(["Customer price scope", published.accountScope]);
  if (published.taxScope) locationAndTerms.push(["Tax treatment", published.taxScope]);

  const source: DetailItem[] = [
    ["Evidence", offer.dataStatus === "official-page" ? "Official public source" : "Dated reference / not live"],
    ["Original source", <a href={offer.sourceUrl} target="_blank" rel="nofollow noreferrer">{offer.sourceUrl} ↗</a>],
    ["Observed at", <time dateTime={offer.observedAt}>{timestamp(offer.observedAt)}</time>],
    ["Quote status", offer.quoteStatus === "contact_sales" ? "Contact sales; no public numeric price" : offer.quoteStatus === "starting_at" ? "Starting price; final quote can differ" : "Published quote"],
  ];
  if (published.effectiveFrom) source.push(["Price effective from", timestamp(published.effectiveFrom)]);
  if (published.effectiveUntil) source.push(["Price effective until", timestamp(published.effectiveUntil)]);

  return <div className="quote-detail-grid">
    <section className="quote-detail-section"><h4>Configuration</h4><DetailList items={configuration} />{resources.length > 0 && <DetailList items={resources} />}</section>
    <section className="quote-detail-section"><h4>Price &amp; exchange rate</h4><DetailList items={price} /><p>Monthly prices stay monthly. Currency conversion does not include payment fees or exchange spreads.</p></section>
    <section className="quote-detail-section"><h4>Location &amp; terms</h4><DetailList items={locationAndTerms} />{conditions.length > 0 && <ul className="quote-detail-notes">{conditions.map((condition, index) => <li key={index}>{condition}</li>)}</ul>}</section>
    <section className="quote-detail-section"><h4>Source</h4><DetailList items={source} /><p>{offer.dataStatus === "seed" ? "This is a historical observation. Its original availability does not describe current inventory." : "A public price does not confirm current stock, purchase eligibility or the final checkout total."}</p></section>
  </div>;
}
