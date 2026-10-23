import type { Offer } from "./data";

export const availabilityLabel = {
  available: "Available", limited: "Limited", unavailable: "Offline / unavailable", unknown: "Stock unknown",
};
export const billingUnitLabel = (offer: Offer) => offer.billingUnit === "GPU-month" ? "GPU / month" : "GPU / hour";
export function formatAmount(amount: number | null | undefined, currency: string) {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "code", minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(amount);
}
export function formatOfferPrice(offer: Offer) {
  const usd = offer.priceUsdPerGpuUnit;
  return offer.quoteStatus === "contact_sales" || offer.pricePerGpuUnit === null
    ? "Contact sales" : usd === null ? "USD conversion unavailable" : `${offer.quoteStatus === "starting_at" ? "From " : ""}${offer.sourceCurrency !== "USD" ? "≈ " : ""}${formatAmount(usd, "USD")}`;
}
export function formatBenchmarkPrice(offer: Offer | undefined) {
  return offer ? formatOfferPrice(offer) : "—";
}
export function formatOriginalPrice(offer: Offer) {
  return offer.pricePerGpuUnit === null ? "No public numeric price" : `Original: ${formatAmount(offer.pricePerGpuUnit, offer.sourceCurrency)} / ${billingUnitLabel(offer)}`;
}
export function formatFxRate(offer: Offer) {
  if (offer.sourceCurrency === "USD") return "Native USD · no conversion";
  if (!offer.fx) return "FX unavailable";
  return `1 ${offer.sourceCurrency} = ${offer.fx.rateToUsd.toLocaleString("en-US", { maximumFractionDigits: 8 })} USD · ${offer.fx.rateDate}`;
}
export function formatInstancePrice(offer: Offer) {
  const amount = offer.instancePriceUsd ?? ((offer.instanceCurrency ?? offer.sourceCurrency) === "USD" ? offer.instancePrice : null);
  return offer.instancePrice == null ? "Node total not published" : amount == null ? "USD node total unavailable" : `${(offer.instanceCurrency ?? offer.sourceCurrency) !== "USD" ? "≈ " : ""}${formatAmount(amount, "USD")} / ${offer.instanceBillingUnit === "instance-month" ? "node / month" : "node / hour"}`;
}
export function formatOriginalInstancePrice(offer: Offer) {
  return offer.instancePrice == null ? "" : `Original node: ${formatAmount(offer.instancePrice, offer.instanceCurrency ?? offer.sourceCurrency)} / ${offer.instanceBillingUnit === "instance-month" ? "month" : "hour"}`;
}
export function priceBasisLabel(offer: Offer) {
  return ({ instance_total_allocated: "Node price ÷ GPU count", advertised_per_gpu: "Advertised per GPU", gpu_component: "GPU component only", starting_price: "Starting price" } as Record<string, string>)[offer.priceBasis] ?? offer.priceBasis;
}
export function configurationLabel(offer: Offer) {
  return [offer.gpuCount === null ? "GPU count not published" : `${offer.gpuCount}× GPU`, offer.gpuVariant, offer.vramGb === null ? null : `${offer.vramGb} GB VRAM`, offer.vcpu ? `${offer.vcpu} vCPU` : null, offer.ramGb ? `${offer.ramGb} GB RAM` : null].filter(Boolean).join(" · ");
}
export function cloudTierLabel(offer: Pick<Offer, "cloudTier">): string | null {
  const tier = offer.cloudTier?.trim();
  if (!tier) return null;
  return ({ secure: "Secure Cloud", secure_cloud: "Secure Cloud", community: "Community Cloud", community_cloud: "Community Cloud" } as Record<string, string>)[tier.toLowerCase()]
    ?? `Cloud tier: ${tier}`;
}
export function isAccountSpecificPrice(offer: Pick<Offer, "accountScope">): boolean {
  return /^account(?:$|[_-])/.test(offer.accountScope ?? "");
}
export function summaryConfigurationLabel(offer: Offer): string {
  return [cloudTierLabel(offer), offer.vramGb == null ? null : `${offer.vramGb} GB`, offer.gpuVariant,
    offer.gpuCount == null ? null : `${offer.gpuCount}× GPU node`,
    isAccountSpecificPrice(offer) ? "Account-specific quote" : null].filter(Boolean).join(" · ")
    || "Configuration not published";
}
// USD-normalized comparisons never mix billing periods, offline/reference listings,
// starting prices, component-only charges, member rates or purchasing models.
export function hasEligibilityConditions(offer: Offer) {
  return isAccountSpecificPrice(offer) || offer.membershipRequired === true || offer.conditions.some((condition) => /member|membership|会员|reserved|commitment|prepaid|new.customer|新客|仅新客户|prices apply to companies from Israel/i.test(condition));
}
export function isComparableUsdHourly(offer: Offer): offer is Offer & { pricePerGpuHour: number } {
  return offer.billingUnit === "GPU-hour"
    && (offer.sourceCurrency === "USD" || Boolean(offer.fx?.rateToUsd && offer.fx?.rateDate))
    && offer.dataStatus === "official-page" && offer.availability !== "unavailable"
    && offer.rentalType === "On-demand" && offer.quoteStatus === "quoted"
    && ["instance_total_allocated", "advertised_per_gpu"].includes(offer.priceBasis)
    && !hasEligibilityConditions(offer)
    && typeof offer.pricePerGpuHour === "number" && Number.isFinite(offer.pricePerGpuHour) && offer.pricePerGpuHour >= 0;
}
export function cheapestComparableOffer(input: Offer[]) {
  return input.filter(isComparableUsdHourly).sort((a, b) => a.pricePerGpuHour - b.pricePerGpuHour)[0];
}
// Group billing periods and price bases before sorting USD-normalized amounts.
export function compareOffers(a: Offer, b: Offer) {
  const group = (offer: Offer) => `${offer.billingUnit}|${offer.rentalType}|${offer.priceBasis}`;
  return group(a).localeCompare(group(b)) || (a.priceUsdPerGpuUnit ?? Infinity) - (b.priceUsdPerGpuUnit ?? Infinity) || a.id.localeCompare(b.id);
}

export function sourceEvidenceLabel(offer: Pick<Offer, "dataStatus" | "accountScope" | "sourceType" | "collectionSource">): string {
  if (offer.dataStatus === "seed") return "Dated reference / not live";
  if (offer.sourceType === "official_quote_api" || offer.collectionSource === "nebius_account") return "Account estimate";
  if (isAccountSpecificPrice(offer)) return "Account quote";
  if (/^authenticated_/.test(offer.accountScope ?? "")) return "Signed-in catalog";
  return "Public price";
}
