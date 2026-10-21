import type { Offer } from "./data";
import { isPlatformCoverage, isRegionSpecificPrice, publishedPriceRegionCodes } from "./region-matching.ts";
import { isAccountSpecificPrice } from "./pricing.ts";
import { isMarketHourlyOffer } from "./offer-geography.mjs";

export type OfferAudience = "regular" | "member" | "conditional";

export function matchesPriceRegionFilter(offer: Offer, region: string): boolean {
  const codes = publishedPriceRegionCodes(offer);
  return region === "all" || (region === "__coverage" ? isPlatformCoverage(offer) : region === "__published" ? codes.length > 0
    : region === "__unpublished" ? codes.length === 0 : codes.includes(region));
}

export function priceRegionCoverage(offers: readonly Offer[]) {
  const official = offers.filter((offer) => offer.dataStatus === "official-page");
  const regional = official.filter(isRegionSpecificPrice);
  const coverage = official.filter(isPlatformCoverage);
  return {
    offerCount: regional.length,
    providerCount: new Set(regional.map((offer) => offer.providerSlug)).size,
    regionCount: new Set(regional.flatMap(publishedPriceRegionCodes)).size,
    unspecifiedCount: official.length - regional.length - coverage.length,
    coverageOnlyCount: coverage.length,
  };
}

export type OfferComparisonBucket = {
  key: string;
  billingUnit: Offer["billingUnit"];
  rentalType: Offer["rentalType"];
  priceBasis: string;
  vramGb: number | null;
  gpuVariant: string | null;
  offers: Offer[];
  lowestRegularIds: string[];
  lowestMemberIds: string[];
};

export type OfferComparisonGroup = {
  gpuSlug: string;
  buckets: OfferComparisonBucket[];
  offers: Offer[];
  requireRegionalPrice?: boolean;
};

export type OfferComparisonSummary = {
  key: string;
  billingUnit: Offer["billingUnit"];
  rentalType: Offer["rentalType"];
  lowestRegularOffers: Offer[];
  lowestMemberOffers: Offer[];
};

const membershipPattern = /\bmember(?:ship)?\b|会员/i;
const ordinaryMembershipPattern = /\bnon[- ]?members?\b|\bmembership (?:is )?not required\b|\bno membership (?:is )?required\b|无需会员|非会员/i;
const eligibilityPattern = /\breserved\b|\bcommitment\b|\bprepaid\b|\bnew[\s-]+customers?\b|\bpromot(?:ion|ional)\b|\bpurchase limit\b|\bminimum[\s-]+(?:term|duration|quantity|spend)\b|prices apply to companies from Israel|仅新客户|新客|限购|仅限/i;

export function isMemberPrice(offer: Offer): boolean {
  if (offer.membershipRequired === true || offer.pricingTier === "member") return true;
  if (offer.membershipRequired === false || ["ordinary", "regular"].includes(offer.pricingTier ?? "")) return false;
  return offer.conditions.some((condition) =>
    membershipPattern.test(condition) && !ordinaryMembershipPattern.test(condition),
  );
}

// Generic source caveats (stock/account/checkout not verified) are not special
// eligibility. Only published purchase restrictions make an offer conditional.
export function hasAdditionalEligibility(offer: Offer): boolean {
  return isAccountSpecificPrice(offer) || offer.conditions.some((condition) => eligibilityPattern.test(condition)
    && !/\bno (?:minimum )?commitment\b|\bwithout (?:a )?commitment\b/i.test(condition));
}

export function offerAudience(offer: Offer): OfferAudience {
  if (isMemberPrice(offer)) return "member";
  return hasAdditionalEligibility(offer) ? "conditional" : "regular";
}

function normalizedVariant(offer: Offer): string | null {
  const value = offer.gpuVariant?.trim().replace(/\s+/g, " ");
  if (!value) return null;
  const compact = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const model = offer.gpuSlug.toLowerCase().replace(/^(?:nvidia|amd|gpu)-/, "").replace(/[^a-z0-9]/g, "");
  // Some adapters repeat the model in the variant field (e.g. "4090"). That
  // does not create a distinct board variant; 4090_48G, SXM and PCIe still do.
  if (compact === model || compact === model.replace(/^rtx/, "") || compact === model.replace(/\d+gb$/, "")) return null;
  return ({ pcie: "PCIe", sxm: "SXM", sxm2: "SXM2", sxm4: "SXM4", sxm5: "SXM5", sxm6: "SXM6", nvlink: "NVLink", nvl: "NVL", nvl72: "NVL72", hgx: "HGX" } as Record<string, string>)[compact] ?? value;
}

function normalizedBasis(offer: Offer): string {
  return ["instance_total_allocated", "advertised_per_gpu"].includes(offer.priceBasis) ? "full_price" : offer.priceBasis;
}

export function comparisonBucketKey(offer: Offer): string {
  return JSON.stringify([
    offer.gpuSlug, offer.billingUnit, offer.rentalType, normalizedBasis(offer),
    offer.vramGb, normalizedVariant(offer)?.toLowerCase() ?? null,
  ]);
}

function sortableUsd(offer: Offer): number {
  return typeof offer.priceUsdPerGpuUnit === "number" && Number.isFinite(offer.priceUsdPerGpuUnit) && offer.priceUsdPerGpuUnit >= 0
    ? offer.priceUsdPerGpuUnit : Infinity;
}

export function isLowestPriceCandidate(offer: Offer, requireRegionalPrice = false): boolean {
  const hasUsd = Number.isFinite(sortableUsd(offer));
  const hasOriginal = typeof offer.pricePerGpuUnit === "number" && Number.isFinite(offer.pricePerGpuUnit) && offer.pricePerGpuUnit >= 0;
  const fx = offer.fx;
  const hasFx = offer.sourceCurrency === "USD" || Boolean(fx
    && Number.isFinite(fx.rateToUsd) && fx.rateToUsd > 0
    && /^\d{4}-\d{2}-\d{2}$/.test(fx.rateDate)
    && Number.isFinite(Date.parse(`${fx.rateDate}T00:00:00Z`))
    && fx.sourceUrl.trim() && fx.sourceName.trim());
  return hasUsd && hasOriginal && hasFx
    && offer.dataStatus === "official-page" && offer.availability !== "unavailable"
    && offer.quoteStatus === "quoted" && normalizedBasis(offer) === "full_price"
    && !hasAdditionalEligibility(offer)
    && (!requireRegionalPrice || isRegionSpecificPrice(offer));
}

/** A GPU card prefers a regular on-demand quote. A Spot-only model can show an
 * actual regular Spot quote, with its own purchase-mode label at the call site.
 * Never compare the two modes by price or substitute a restricted/member rate. */
export function directoryHeadlineOffer(offers: readonly Offer[]): Offer | undefined {
  const eligible = offers.filter((offer) => isMarketHourlyOffer(offer)
    && isLowestPriceCandidate(offer) && offerAudience(offer) === "regular");
  for (const mode of ["On-demand", "Spot"] as const) {
    const selected = eligible.filter((offer) => offer.rentalType === mode)
      .sort((a, b) => a.priceUsdPerGpuUnit! - b.priceUsdPerGpuUnit! || a.id.localeCompare(b.id));
    if (selected.length) return selected[0];
  }
  return undefined;
}

function lowestOffers(offers: readonly Offer[], audience: "regular" | "member", requireRegionalPrice = false): Offer[] {
  const eligible = offers.filter((offer) => isLowestPriceCandidate(offer, requireRegionalPrice) && offerAudience(offer) === audience);
  const minimum = Math.min(...eligible.map((offer) => offer.priceUsdPerGpuUnit!));
  return eligible.filter((offer) => offer.priceUsdPerGpuUnit === minimum);
}

function lowestIds(offers: Offer[], audience: "regular" | "member", requireRegionalPrice = false): string[] {
  return lowestOffers(offers, audience, requireRegionalPrice).map((offer) => offer.id);
}

const periodOrder: Record<Offer["billingUnit"], number> = { "GPU-hour": 0, "GPU-month": 1 };
const rentalOrder: Record<Offer["rentalType"], number> = { "On-demand": 0, Spot: 1, Reserved: 2, Monthly: 3, Other: 4 };

/** Starting minima for a collapsed model, separated by period and purchase plan.
 * Unlike configuration-level lowest badges, these summaries span configurations.
 * Return original offers so callers can show the configuration and node size of
 * every tied minimum. Missing eligible prices stay empty instead of using a
 * reference, an offline offer, a component price, or an invented zero.
 */
export function summarizeComparisonGroup(group: OfferComparisonGroup): OfferComparisonSummary[] {
  const summaries = new Map<string, { summary: OfferComparisonSummary; offers: Offer[] }>();
  for (const offer of group.offers) {
    const key = JSON.stringify([offer.billingUnit, offer.rentalType]);
    let entry = summaries.get(key);
    if (!entry) {
      entry = { summary: { key, billingUnit: offer.billingUnit, rentalType: offer.rentalType, lowestRegularOffers: [], lowestMemberOffers: [] }, offers: [] };
      summaries.set(key, entry);
    }
    entry.offers.push(offer);
  }
  return [...summaries.values()].map(({ summary, offers }) => ({
    ...summary,
    lowestRegularOffers: lowestOffers(offers, "regular", group.requireRegionalPrice),
    lowestMemberOffers: lowestOffers(offers, "member", group.requireRegionalPrice),
  })).sort((a, b) => periodOrder[a.billingUnit] - periodOrder[b.billingUnit]
    || rentalOrder[a.rentalType] - rentalOrder[b.rentalType]);
}

function compareBuckets(a: OfferComparisonBucket, b: OfferComparisonBucket): number {
  return periodOrder[a.billingUnit] - periodOrder[b.billingUnit]
    || rentalOrder[a.rentalType] - rentalOrder[b.rentalType]
    || (a.priceBasis === "full_price" ? 0 : 1) - (b.priceBasis === "full_price" ? 0 : 1)
    || a.priceBasis.localeCompare(b.priceBasis)
    || Math.min(...a.offers.map(sortableUsd)) - Math.min(...b.offers.map(sortableUsd))
    || (a.vramGb ?? Infinity) - (b.vramGb ?? Infinity)
    || (a.gpuVariant ?? "").localeCompare(b.gpuVariant ?? "")
    || a.key.localeCompare(b.key);
}

/** Canonical model groups, then compatible configuration buckets, then USD ASC.
 * Lowest badges are scoped to a bucket and audience, never across configurations.
 * Input offers are retained (including dated/offline records) and never mutated.
 */
export function groupOffersForComparison(input: readonly Offer[], { requireRegionalPrice = false } = {}): OfferComparisonGroup[] {
  const groups = new Map<string, Map<string, OfferComparisonBucket>>();
  for (const offer of input) {
    let buckets = groups.get(offer.gpuSlug);
    if (!buckets) groups.set(offer.gpuSlug, buckets = new Map());
    const key = comparisonBucketKey(offer);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { key, billingUnit: offer.billingUnit, rentalType: offer.rentalType, priceBasis: normalizedBasis(offer), vramGb: offer.vramGb, gpuVariant: normalizedVariant(offer), offers: [], lowestRegularIds: [], lowestMemberIds: [] };
      buckets.set(key, bucket);
    }
    bucket.offers.push(offer);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([gpuSlug, bucketsByKey]) => {
    const buckets = [...bucketsByKey.values()].sort(compareBuckets).map((bucket) => {
      bucket.offers.sort((a, b) => sortableUsd(a) - sortableUsd(b) || a.providerSlug.localeCompare(b.providerSlug) || a.id.localeCompare(b.id));
      bucket.lowestRegularIds = lowestIds(bucket.offers, "regular", requireRegionalPrice);
      bucket.lowestMemberIds = lowestIds(bucket.offers, "member", requireRegionalPrice);
      return bucket;
    });
    return { gpuSlug, buckets, offers: buckets.flatMap((bucket) => bucket.offers), requireRegionalPrice };
  });
}
