import test from "node:test";
import assert from "node:assert/strict";
import type { Offer } from "./data";

const { groupOffersForComparison, comparisonBucketKey, offerAudience, isMemberPrice, hasAdditionalEligibility, isLowestPriceCandidate } = await import(new URL("./offer-comparison.ts", import.meta.url).href) as typeof import("./offer-comparison");

const quote = (overrides: Partial<Offer> = {}): Offer => ({
  id: "regular", gpuSlug: "nvidia-rtx-4090", providerSlug: "example", gpuCount: 1, gpuVariant: null, vramGb: 24,
  pricePerGpuUnit: 2, priceUsdPerGpuUnit: 2, pricePerGpuHour: 2, rentalType: "On-demand", region: "Not published", regions: [], zones: [], countryCode: "",
  availability: "unknown", egress: "Not published", sourceUrl: "https://example.com/prices", observedAt: "2026-10-20T08:00:00Z",
  sourceCurrency: "USD", billingUnit: "GPU-hour", quoteStatus: "quoted", priceBasis: "advertised_per_gpu", conditions: [], dataStatus: "official-page", ...overrides,
});

test("canonical GPU grouping puts platforms together and sorts compatible prices without mutating input", () => {
  const input = [quote({ id: "high", providerSlug: "lambda", priceUsdPerGpuUnit: 3 }), quote({ id: "other-model", gpuSlug: "nvidia-h100", priceUsdPerGpuUnit: 0.1 }), quote({ id: "low", providerSlug: "autodl", priceUsdPerGpuUnit: 1 }), quote({ id: "middle", providerSlug: "runpod" })];
  const before = input.map((offer) => offer.id);
  const groups = groupOffersForComparison(input);
  const group = groups.find((entry) => entry.gpuSlug === "nvidia-rtx-4090")!;
  assert.equal(groups.length, 2);
  assert.deepEqual(group.offers.map((offer: Offer) => offer.id), ["low", "middle", "high"]);
  assert.deepEqual(group.buckets[0].lowestRegularIds, ["low"]);
  assert.deepEqual(input.map((offer) => offer.id), before);
});

test("regular and member minima stay separate, support ties, and exclude extra eligibility", () => {
  const group = groupOffersForComparison([
    quote({ id: "ordinary", priceUsdPerGpuUnit: 2 }), quote({ id: "ordinary-tie", providerSlug: "second", priceUsdPerGpuUnit: 2 }),
    quote({ id: "member", membershipRequired: true, priceUsdPerGpuUnit: 1 }), quote({ id: "member-tie", conditions: ["会员专享价格"], priceUsdPerGpuUnit: 1 }),
    quote({ id: "new-customer", conditions: ["New-customer price"], priceUsdPerGpuUnit: 0.2 }),
    quote({ id: "restricted-member", membershipRequired: true, conditions: ["New customer offer"], priceUsdPerGpuUnit: 0.1 }),
  ])[0];
  assert.deepEqual(group.buckets[0].lowestRegularIds, ["ordinary", "ordinary-tie"]);
  assert.deepEqual(group.buckets[0].lowestMemberIds, ["member", "member-tie"]);
  assert.equal(offerAudience(group.offers.find((offer: Offer) => offer.id === "new-customer")!), "conditional");
  assert.equal(offerAudience(group.offers.find((offer: Offer) => offer.id === "restricted-member")!), "member");
});

test("membership is explicit, ordinary source caveats do not become member or conditional prices", () => {
  assert.equal(isMemberPrice(quote({ membershipRequired: true })), true);
  assert.equal(isMemberPrice(quote({ conditions: ["This discounted price requires AutoDL membership eligibility; no membership was purchased or verified."] })), true);
  assert.equal(offerAudience(quote({ conditions: ["普通用户价格", "Non-member rate", "Membership is not required"] })), "regular");
  assert.equal(offerAudience(quote({ conditions: ["Availability, account eligibility and checkout totals were not verified."] })), "regular");
  assert.equal(hasAdditionalEligibility(quote({ conditions: ["ILS prices apply to companies from Israel"] })), true);
  assert.equal(hasAdditionalEligibility(quote({ conditions: ["No minimum commitment"] })), false);
});

test("period, procurement model, memory, board variant and component basis each create separate comparison buckets", () => {
  const baseline = quote();
  const variants: Partial<Offer>[] = [
    { billingUnit: "GPU-month" }, { rentalType: "Spot" }, { rentalType: "Reserved" },
    { vramGb: 48 }, { vramGb: null }, { gpuVariant: "PCIe" }, { gpuVariant: "SXM" },
    { priceBasis: "gpu_component" }, { priceBasis: "starting_price" },
  ];
  const grouped = groupOffersForComparison([baseline, ...variants.map((change, i) => quote({ id: `incompatible-${i}`, priceUsdPerGpuUnit: 0.01, ...change }))])[0];
  assert.equal(grouped.buckets.length, variants.length + 1);
  assert.deepEqual(grouped.buckets.find((bucket: { offers: Offer[] }) => bucket.offers.includes(baseline))!.lowestRegularIds, ["regular"]);
  assert.equal(comparisonBucketKey(quote({ gpuVariant: "4090" })), comparisonBucketKey(baseline));
  assert.equal(comparisonBucketKey(quote({ gpuVariant: "PCI-E" })), comparisonBucketKey(quote({ gpuVariant: "PCIe" })));
  assert.notEqual(comparisonBucketKey(quote({ gpuVariant: "4090_48G" })), comparisonBucketKey(baseline));
});

test("whole-node allocated and advertised GPU rates share a full-price bucket", () => {
  const groups = groupOffersForComparison([quote(), quote({ id: "node", gpuCount: 8, priceBasis: "instance_total_allocated", instancePriceUsd: 8, priceUsdPerGpuUnit: 1 })]);
  assert.equal(groups[0].buckets.length, 1);
  assert.equal(groups[0].buckets[0].priceBasis, "full_price");
  assert.deepEqual(groups[0].buckets[0].lowestRegularIds, ["node"]);
});

test("lower-price configurations appear first without merging their lowest badges", () => {
  const buckets = groupOffersForComparison([
    quote({ id: "expensive", gpuVariant: "HGX", priceUsdPerGpuUnit: 5 }),
    quote({ id: "cheap", gpuVariant: "PCIe", priceUsdPerGpuUnit: 1 }),
    quote({ id: "middle", gpuVariant: "SXM", priceUsdPerGpuUnit: 3 }),
  ])[0].buckets;
  assert.deepEqual(buckets.map((bucket) => bucket.offers[0].id), ["cheap", "middle", "expensive"]);
  assert.deepEqual(buckets.map((bucket) => bucket.lowestRegularIds), [["cheap"], ["middle"], ["expensive"]]);
});

test("offline, reference, starting, component, invalid and contact-sales prices cannot claim a lowest badge", () => {
  const invalidCases: Partial<Offer>[] = [
    { availability: "unavailable" }, { dataStatus: "seed" }, { quoteStatus: "starting_at" }, { quoteStatus: "contact_sales" },
    { priceBasis: "gpu_component" }, { priceBasis: "starting_price" }, { pricePerGpuUnit: null },
    { priceUsdPerGpuUnit: null }, { priceUsdPerGpuUnit: Infinity }, { priceUsdPerGpuUnit: NaN }, { priceUsdPerGpuUnit: -1 },
    { conditions: ["Prepaid promotional price; purchase limit 3"] },
  ];
  const invalid = invalidCases.map((change, index) => ({ id: `invalid-${index}`, priceUsdPerGpuUnit: 0.01, ...change }));
  for (const change of invalid) assert.equal(isLowestPriceCandidate(quote(change)), false, change.id);
  const group = groupOffersForComparison([quote(), ...invalid.map((change) => quote(change))])[0];
  assert.equal(group.offers.length, invalid.length + 1);
  assert.deepEqual(group.buckets.flatMap((bucket: { lowestRegularIds: string[] }) => bucket.lowestRegularIds), ["regular"]);
  assert.equal(isLowestPriceCandidate(quote({ priceUsdPerGpuUnit: 0, pricePerGpuUnit: 0 })), true);
  assert.equal(isLowestPriceCandidate(quote({ availability: "unknown" })), true);
});

test("converted minima require finite positive FX and a dated source without inventing an hourly equivalent", () => {
  const converted = quote({ sourceCurrency: "CNY", pricePerGpuUnit: 10, priceUsdPerGpuUnit: 1.4, pricePerGpuHour: 1.4, fx: { rateToUsd: 0.14, rateDate: "2026-10-19", sourceName: "ECB", sourceUrl: "https://www.ecb.europa.eu/" } });
  assert.equal(isLowestPriceCandidate(converted), true);
  for (const fx of [null, { ...converted.fx!, rateToUsd: 0 }, { ...converted.fx!, rateToUsd: Infinity }, { ...converted.fx!, rateDate: "" }, { ...converted.fx!, sourceUrl: "" }]) {
    assert.equal(isLowestPriceCandidate({ ...converted, fx }), false);
  }
  const monthly = { ...converted, id: "monthly", rentalType: "Monthly" as const, billingUnit: "GPU-month" as const, pricePerGpuHour: null };
  const group = groupOffersForComparison([converted, monthly])[0];
  assert.equal(group.buckets.length, 2);
  assert.deepEqual(group.buckets.map((bucket: { lowestRegularIds: string[] }) => bucket.lowestRegularIds), [["regular"], ["monthly"]]);
});
