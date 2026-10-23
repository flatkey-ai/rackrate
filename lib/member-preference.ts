import type { Offer } from "./data";

const priceFields = new Set([
  "id", "sourceQuoteIndex", "pricePerGpuHour", "pricePerGpuUnit", "priceUsdPerGpuUnit",
  "exactApiHourlyAmount", "sourceAmount", "usdSourceAmount", "instancePrice", "instancePriceUsd", "instanceSourceAmount",
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

type Decimal = { coefficient: bigint; scale: number };
function decimal(value: unknown): Decimal | null {
  if (typeof value !== "string" || value.length > 128 || !/^\d+(?:\.\d+)?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return { coefficient: BigInt(whole + fraction), scale: fraction.length };
}
function compare(left: Decimal, right: Decimal): bigint {
  const scale = Math.max(left.scale, right.scale);
  return left.coefficient * BigInt(10) ** BigInt(scale - left.scale) - right.coefficient * BigInt(10) ** BigInt(scale - right.scale);
}
function roundedCents(value: Decimal): Decimal {
  if (value.scale <= 2) return { coefficient: value.coefficient * BigInt(10) ** BigInt(2 - value.scale), scale: 2 };
  const divisor = BigInt(10) ** BigInt(value.scale - 2);
  return { coefficient: (value.coefficient + divisor / BigInt(2)) / divisor, scale: 2 };
}
function tariff(offer: Offer): { amount: Decimal; exact: Decimal } | null {
  const member = offer.pricingTier === "member" && offer.membershipRequired === true;
  const ordinary = offer.pricingTier === "ordinary" && offer.membershipRequired === false;
  const expected = member ? ["Requires AutoDL member eligibility."] : [];
  if ((!member && !ordinary) || JSON.stringify(offer.quoteConditions) !== JSON.stringify(expected)
      || JSON.stringify(offer.sourceConditions) !== JSON.stringify(expected)) return null;
  const amount = decimal(offer.sourceAmount);
  let exact = decimal(offer.exactApiHourlyAmount ?? offer.sourceAmount);
  if (!amount || !exact || typeof offer.pricePerGpuUnit !== "number" || !Number.isFinite(offer.pricePerGpuUnit)
      || offer.pricePerGpuUnit <= 0 || offer.pricePerGpuUnit !== Number(offer.sourceAmount)
      || typeof offer.priceUsdPerGpuUnit !== "number" || !Number.isFinite(offer.priceUsdPerGpuUnit)
      || offer.priceUsdPerGpuUnit <= 0) return null;
  if (offer.priceSource != null) {
    const source = offer.priceSource;
    const native = source.native_amount_milli_cny;
    if (source.field !== `machine_sku_info[0].level_config[${member ? "member_user" : "normal_user"}].discounted_price`
        || source.native_currency !== "CNY" || !Number.isSafeInteger(native) || Number(native) < 0) return null;
    const nativeExact = { coefficient: BigInt(native as number), scale: 3 };
    if (offer.exactApiHourlyAmount != null && compare(nativeExact, exact) !== BigInt(0)) return null;
    exact = nativeExact;
  }
  if (compare(roundedCents(exact), amount) !== BigInt(0)) return null;
  return { amount, exact };
}
function pairKey(offer: Offer): string | null {
  if (offer.providerSlug !== "autodl" || offer.sourceUrl !== "https://www.autodl.com/api/v1/user/machine/list"
      || offer.sourceType !== "official_internal_api" || offer.productType !== "gpu_container"
      || offer.sourceCurrency !== "CNY" || offer.billingUnit !== "GPU-hour" || offer.billingMode !== "on_demand"
      || offer.priceBasis !== "advertised_per_gpu" || offer.dataStatus !== "official-page" || offer.quoteStatus !== "quoted"
      || !offer.rawSku?.trim() || !offer.gpuSlug || !Number.isInteger(offer.vramGb) || Number(offer.vramGb) <= 0
      || !offer.resources || !Object.keys(offer.resources).length
      || !Array.isArray(offer.regions) || offer.regions.length !== 1 || !offer.regions[0]
      || !Array.isArray(offer.zones) || offer.location?.region !== offer.regions[0]
      || !Number.isFinite(Date.parse(offer.observedAt)) || !tariff(offer)) return null;
  const identity: Record<string, unknown> = {};
  // Every other retained source/configuration field, including unknown future
  // restrictions, must match. Only reviewed AutoDL tariff fields may differ.
  for (const [key, value] of Object.entries(offer)) {
    if (priceFields.has(key)) continue;
    if (key === "priceSource" && value !== null && typeof value === "object") {
      identity[key] = Object.fromEntries(Object.entries(value).filter(([name]) => !["field", "native_amount_milli_cny"].includes(name)));
    } else identity[key] = ["conditions", "sourceConditions", "quoteConditions"].includes(key) && Array.isArray(value)
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
    if (pair.ordinary.length !== 1 || pair.member.length !== 1) continue;
    const ordinary = pair.ordinary[0], member = pair.member[0];
    const regularPrice = tariff(ordinary), memberPrice = tariff(member);
    if (regularPrice && memberPrice && compare(memberPrice.amount, regularPrice.amount) <= BigInt(0)
        && compare(memberPrice.exact, regularPrice.exact) <= BigInt(0)
        && member.pricePerGpuUnit! <= ordinary.pricePerGpuUnit!
        && member.priceUsdPerGpuUnit! <= ordinary.priceUsdPerGpuUnit!) hidden.add(ordinary);
  }
  return input.filter((offer) => !hidden.has(offer));
}
