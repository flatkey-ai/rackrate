import type { Offer } from "./data";

const priceFields = new Set([
  "id", "sourceQuoteIndex", "pricePerGpuHour", "pricePerGpuUnit", "priceUsdPerGpuUnit",
  "sourceAmount", "usdSourceAmount", "instancePrice", "instancePriceUsd", "instanceSourceAmount",
  "instanceUsdSourceAmount", "pricingTier", "membershipRequired", "membershipDiscount",
]);
// These are the reviewed AutoDL eligibility notice and our own tier labels.
// Other restrictions stay in the identity, so they cannot be paired away.
const membershipLabels = new Set([
  "Requires AutoDL member eligibility.", "Membership required; eligibility not verified",
  "Pricing tier: ordinary", "Pricing tier: member",
]);
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)]),
  );
  return value;
}

function pairKey(offer: Offer): string | null {
  const member = offer.pricingTier === "member" && offer.membershipRequired === true;
  const ordinary = offer.pricingTier === "ordinary" && offer.membershipRequired === false;
  if ((!member && !ordinary) || offer.dataStatus !== "official-page" || offer.quoteStatus !== "quoted"
      || !offer.rawSku || !offer.sourceType || !offer.billingMode || !offer.sourceUrl
      || !offer.resources || !Object.keys(offer.resources).length
      || !(typeof offer.pricePerGpuUnit === "number" && offer.pricePerGpuUnit > 0)
      || !Array.isArray(offer.regions) || !Array.isArray(offer.zones)) return null;
  const identity: Record<string, unknown> = {};
  // Compare every retained source/configuration field, including observation,
  // cloud tier, country/region/zone and any newly added fields. Missing identity
  // or differing restrictions leave both rows visible. No model/price shortcut.
  for (const [key, value] of Object.entries(offer)) {
    if (priceFields.has(key)) continue;
    identity[key] = ["conditions", "sourceConditions", "quoteConditions"].includes(key) && Array.isArray(value)
      ? value.filter((item) => typeof item !== "string" || !membershipLabels.has(item)) : value;
  }
  return JSON.stringify(canonical(identity));
}

/** Display-only preference; the input/source dataset keeps both observations. */
export function preferMemberOffers(input: readonly Offer[]): Offer[] {
  const pairs = new Map<string, { ordinary: Offer[]; member: Offer[] }>();
  for (const offer of input) {
    const key = pairKey(offer);
    if (key === null) continue;
    if (!pairs.has(key)) pairs.set(key, { ordinary: [], member: [] });
    pairs.get(key)![offer.membershipRequired ? "member" : "ordinary"].push(offer);
  }
  const hidden = new Set<Offer>();
  for (const pair of pairs.values()) {
    // Ambiguous duplicates or multiple membership tiers require separate review.
    if (pair.ordinary.length === 1 && pair.member.length === 1) hidden.add(pair.ordinary[0]);
  }
  return input.filter((offer) => !hidden.has(offer));
}
