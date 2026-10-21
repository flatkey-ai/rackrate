import test from "node:test";
import assert from "node:assert/strict";
import type { Offer } from "./data";

const { groupOffersForComparison, comparisonBucketKey, offerAudience, isMemberPrice, hasAdditionalEligibility, isLowestPriceCandidate, summarizeComparisonGroup, matchesPriceRegionFilter, priceRegionCoverage, directoryHeadlineOffer } = await import(new URL("./offer-comparison.ts", import.meta.url).href) as typeof import("./offer-comparison");

const quote = (overrides: Partial<Offer> = {}): Offer => ({
  id: "regular", gpuSlug: "nvidia-rtx-4090", providerSlug: "example", gpuCount: 1, gpuVariant: null, vramGb: 24,
  pricePerGpuUnit: 2, priceUsdPerGpuUnit: 2, pricePerGpuHour: 2, rentalType: "On-demand", region: "Not published", regions: [], zones: [], countryCode: "",
  availability: "unknown", egress: "Not published", sourceUrl: "https://example.com/prices", observedAt: "2026-10-20T08:00:00Z",
  sourceCurrency: "USD", billingUnit: "GPU-hour", quoteStatus: "quoted", priceBasis: "advertised_per_gpu", conditions: [], dataStatus: "official-page", ...overrides,
});

const regional = (id: string, rentalType: Offer["rentalType"], amount: number, overrides: Partial<Offer> = {}) => quote({
  id, rentalType, sourceAmount: String(amount), pricePerGpuUnit: amount, priceUsdPerGpuUnit: amount, pricePerGpuHour: amount,
  region: "eu-north1", regions: ["eu-north1"], computeCountries: ["FI"], countryCode: "FI", priceScope: "regional_quote", ...overrides,
});

test("GPU directory cards prefer regular on-demand without comparing its price against cheaper Spot", () => {
  const input = [regional("spot", "Spot", 0.5), regional("on-demand-high", "On-demand", 4), regional("on-demand-low", "On-demand", 3)];
  const before = JSON.stringify(input);
  assert.equal(directoryHeadlineOffer(input)?.id, "on-demand-low");
  assert.equal(directoryHeadlineOffer(input)?.rentalType, "On-demand");
  assert.equal(JSON.stringify(input), before);
});

test("Spot-only GPU directory cards return an actual regular Spot quote with its purchase mode intact", () => {
  const selected = directoryHeadlineOffer([
    regional("spot-high", "Spot", 3.8), regional("spot-low", "Spot", 1.6),
    regional("member-on-demand", "On-demand", 0.1, { membershipRequired: true }),
  ]);
  assert.equal(selected?.id, "spot-low");
  assert.equal(selected?.rentalType, "Spot");
  assert.equal(selected?.sourceAmount, "1.6");
});

test("directory Spot fallback cannot promote unavailable, monthly, starting, component, member or conditional rates", () => {
  const excluded = [
    regional("component", "Spot", 0.1, { priceBasis: "gpu_component" }),
    regional("offline", "Spot", 0.1, { availability: "unavailable" }),
    regional("monthly", "Monthly", 0.1, { billingUnit: "GPU-month" }),
    regional("starting", "Spot", 0.1, { quoteStatus: "starting_at" }),
    regional("member", "Spot", 0.1, { membershipRequired: true }),
    regional("conditional", "Spot", 0.1, { conditions: ["New-customer price"] }),
  ];
  assert.equal(directoryHeadlineOffer(excluded), undefined);
  assert.equal(directoryHeadlineOffer([...excluded, regional("valid-spot", "Spot", 2)])?.id, "valid-spot");
});

test("directory cards can use complete catalog prices without attaching their coverage to the price", () => {
  const catalog = regional("catalog", "On-demand", 2, { priceScope: "platform_coverage", regionPriceVerified: false,
    regions: [], computeCountries: [], countryCode: "", coverageRegions: ["eu-north1"] });
  const before = JSON.stringify(catalog);
  assert.equal(directoryHeadlineOffer([catalog, regional("spot", "Spot", 0.1)])?.id, "catalog");
  assert.deepEqual(matchesPriceRegionFilter(catalog, "eu-north1"), false);
  assert.equal(JSON.stringify(catalog), before);
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

test("regional filters recalculate minima without attaching a region to the cheaper catalog quote", () => {
  const input = [
    quote({ id: "catalog", priceUsdPerGpuUnit: 1 }),
    quote({ id: "us", providerSlug: "azure", regions: ["eastus2"], priceUsdPerGpuUnit: 2 }),
    quote({ id: "eu", providerSlug: "nebius", regions: ["eu-north1", "eu-west1"], priceUsdPerGpuUnit: 3 }),
    quote({ id: "reference", dataStatus: "seed", regions: ["Canada"], priceUsdPerGpuUnit: 0.1 }),
  ];
  assert.deepEqual(priceRegionCoverage(input), { offerCount: 2, providerCount: 2, regionCount: 3, unspecifiedCount: 1, coverageOnlyCount: 0 });
  assert.deepEqual(summarizeComparisonGroup(groupOffersForComparison(input)[0])[0].lowestRegularOffers.map((offer) => offer.id), ["catalog"]);
  const published = input.filter((offer) => matchesPriceRegionFilter(offer, "__published"));
  assert.deepEqual(summarizeComparisonGroup(groupOffersForComparison(published)[0])[0].lowestRegularOffers.map((offer) => offer.id), ["us"]);
  assert.deepEqual(input.filter((offer) => matchesPriceRegionFilter(offer, "eu-north1")).map((offer) => offer.id), ["eu"]);
  assert.deepEqual(input.filter((offer) => matchesPriceRegionFilter(offer, "__unpublished")).map((offer) => offer.id), ["catalog", "reference"]);
  assert.deepEqual(input[0].regions, []);
});

test("regional minima exclude platform availability lists while retaining those catalog prices for inspection", () => {
  const input = [
    quote({ id: "coverage", providerSlug: "nebius", regions: ["eu-north1"], priceUsdPerGpuUnit: 1,
      conditions: ["Published platform availability is not a region-specific price quote."] }),
    quote({ id: "regional", providerSlug: "azure", regions: ["swedencentral"], priceUsdPerGpuUnit: 2 }),
  ];
  const catalog = groupOffersForComparison(input)[0];
  assert.deepEqual(summarizeComparisonGroup(catalog)[0].lowestRegularOffers.map((offer) => offer.id), ["coverage"]);
  const regional = groupOffersForComparison(input, { requireRegionalPrice: true })[0];
  assert.equal(regional.offers.length, 2);
  assert.deepEqual(summarizeComparisonGroup(regional)[0].lowestRegularOffers.map((offer) => offer.id), ["regional"]);
  assert.deepEqual(regional.buckets[0].lowestRegularIds, ["regional"]);
});

test("price-region filtering excludes coverage codes from old and new snapshots while keeping public references visible", () => {
  const legacyCoverage = quote({ id: "old-coverage", providerSlug: "nebius", regions: ["eu-north1"], priceScope: "platform_coverage" });
  const coverage = quote({ id: "coverage", providerSlug: "nebius", coverageRegions: ["eu-north1"], coverageCountries: ["FI"], priceScope: "platform_coverage" });
  const catalog = quote({ id: "catalog", providerSlug: "lambda", priceScope: "unlocated_catalog" });
  const regional = quote({ id: "regional", providerSlug: "azure", regions: ["eu-north1"], priceScope: "regional_quote" });
  const input = [legacyCoverage, coverage, catalog, regional];
  assert.deepEqual(input.filter((offer) => matchesPriceRegionFilter(offer, "all")), input);
  assert.deepEqual(input.filter((offer) => matchesPriceRegionFilter(offer, "eu-north1")).map((offer) => offer.id), ["regional"]);
  assert.deepEqual(input.filter((offer) => matchesPriceRegionFilter(offer, "__published")).map((offer) => offer.id), ["regional"]);
  assert.deepEqual(input.filter((offer) => matchesPriceRegionFilter(offer, "__coverage")).map((offer) => offer.id), ["old-coverage", "coverage"]);
  assert.deepEqual(priceRegionCoverage(input), { offerCount: 1, providerCount: 1, regionCount: 1, unspecifiedCount: 1, coverageOnlyCount: 2 });
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
  const compShare = quote({ providerSlug: "ucloud", pricingTier: "ordinary", membershipRequired: false,
    conditions: ["API 折后价资格未核实，未当作会员价或比较价格。"] });
  assert.equal(isMemberPrice(compShare), false);
  assert.equal(offerAudience(compShare), "regular");
});

test("account-specific quote amounts remain inspectable but cannot claim a public regular minimum", () => {
  const account = quote({ id: "account-price", accountScope: "account_quote", priceUsdPerGpuUnit: 0.1 });
  const publicRate = quote({ id: "public-rate", accountScope: "public_catalog", priceUsdPerGpuUnit: 2 });
  assert.equal(offerAudience(account), "conditional");
  assert.equal(isLowestPriceCandidate(account), false);
  const group = groupOffersForComparison([account, publicRate])[0];
  assert.equal(group.offers.length, 2);
  assert.deepEqual(group.buckets[0].lowestRegularIds, ["public-rate"]);
  assert.deepEqual(summarizeComparisonGroup(group)[0].lowestRegularOffers.map((offer) => offer.id), ["public-rate"]);
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

test("collapsed summaries keep hourly, monthly, spot and reserved prices in separate plan rows", () => {
  const group = groupOffersForComparison([
    quote({ id: "monthly", billingUnit: "GPU-month", rentalType: "Monthly", priceUsdPerGpuUnit: 80, pricePerGpuHour: null }),
    quote({ id: "spot", rentalType: "Spot", priceUsdPerGpuUnit: 0.2 }),
    quote({ id: "reserved", rentalType: "Reserved", priceUsdPerGpuUnit: 0.5 }),
    quote({ id: "on-demand", priceUsdPerGpuUnit: 2 }),
    quote({ id: "monthly-on-demand", billingUnit: "GPU-month", priceUsdPerGpuUnit: 200, pricePerGpuHour: null }),
  ])[0];
  const summaries = summarizeComparisonGroup(group);
  assert.deepEqual(summaries.map((summary) => [summary.billingUnit, summary.rentalType]), [
    ["GPU-hour", "On-demand"], ["GPU-hour", "Spot"], ["GPU-hour", "Reserved"],
    ["GPU-month", "On-demand"], ["GPU-month", "Monthly"],
  ]);
  assert.equal(new Set(summaries.map((summary) => summary.key)).size, summaries.length);
  assert.deepEqual(summaries.map((summary) => summary.lowestRegularOffers.map((offer) => offer.id)), [
    ["on-demand"], ["spot"], ["reserved"], ["monthly-on-demand"], ["monthly"],
  ]);
  assert.equal(summaries.at(-1)!.lowestRegularOffers[0].pricePerGpuHour, null);
});

test("collapsed summaries span configurations, retain every tied original offer, and separate member minima", () => {
  const regular = quote({ id: "regular-cheapest", providerSlug: "autodl", priceUsdPerGpuUnit: 1 });
  const regularTie = quote({ id: "regular-node-tie", providerSlug: "runpod", gpuVariant: "SXM", vramGb: 48, gpuCount: 8, priceBasis: "instance_total_allocated", instancePriceUsd: 8, priceUsdPerGpuUnit: 1 });
  const member = quote({ id: "member-cheapest", providerSlug: "autodl", gpuVariant: "4090_48G", vramGb: 48, membershipRequired: true, priceUsdPerGpuUnit: 0.5 });
  const memberTie = quote({ id: "member-tie", providerSlug: "second", conditions: ["会员专享价格"], priceUsdPerGpuUnit: 0.5 });
  const group = groupOffersForComparison([
    quote({ id: "regular-higher", gpuVariant: "HGX", priceUsdPerGpuUnit: 3 }),
    quote({ id: "member-higher", membershipRequired: true, priceUsdPerGpuUnit: 1.5 }),
    regular, regularTie, member, memberTie,
  ])[0];
  const inputIds = group.offers.map((offer) => offer.id);
  const summary = summarizeComparisonGroup(group)[0];
  assert.deepEqual(summary.lowestRegularOffers.map((offer) => offer.id).sort(), [regular.id, regularTie.id].sort());
  assert.deepEqual(summary.lowestMemberOffers.map((offer) => offer.id).sort(), [member.id, memberTie.id].sort());
  assert.equal(summary.lowestRegularOffers.find((offer) => offer.id === regularTie.id), regularTie);
  assert.equal(summary.lowestMemberOffers.find((offer) => offer.id === member.id), member);
  assert.equal(regularTie.gpuCount, 8);
  assert.deepEqual(group.offers.map((offer) => offer.id), inputIds);
  assert.ok(group.buckets.length > 1);
});

test("collapsed summaries never substitute offline, historical, conditional or partial prices for a missing minimum", () => {
  const excluded: Partial<Offer>[] = [
    { availability: "unavailable" }, { dataStatus: "seed" },
    { priceBasis: "starting_price", quoteStatus: "starting_at" },
    { priceBasis: "gpu_component" }, { quoteStatus: "contact_sales" },
    { conditions: ["New-customer price"] },
    { membershipRequired: true, conditions: ["Prepaid promotional price"] },
    { sourceCurrency: "CNY", fx: null },
  ];
  const group = groupOffersForComparison(excluded.map((change, i) => quote({ id: `excluded-${i}`, priceUsdPerGpuUnit: 0.01, ...change })))[0];
  assert.deepEqual(summarizeComparisonGroup(group).map((summary) => [summary.lowestRegularOffers, summary.lowestMemberOffers]), [[[], []]]);
  assert.equal(group.offers.length, excluded.length);

  const memberOnly = groupOffersForComparison([quote({ id: "member-only", membershipRequired: true })])[0];
  assert.deepEqual(summarizeComparisonGroup(memberOnly)[0].lowestRegularOffers, []);
  assert.deepEqual(summarizeComparisonGroup(memberOnly)[0].lowestMemberOffers.map((offer) => offer.id), ["member-only"]);
  assert.deepEqual(summarizeComparisonGroup({ gpuSlug: "nvidia-rtx-4090", buckets: [], offers: [] }), []);
});
