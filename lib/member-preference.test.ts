import test from "node:test";
import assert from "node:assert/strict";
import type { Offer } from "./data";
import { preferMemberOffers } from "./member-preference.ts";
import { groupOffersForComparison } from "./offer-comparison.ts";

const ordinary = (): Offer => ({ id: "ordinary", providerSlug: "autodl", gpuSlug: "nvidia-h100", rawSku: "actual-sku",
  gpuCount: 1, gpuVariant: "SXM", vramGb: 80, resources: { allocation_scope: "per_gpu", cpu: 16, ram_gb: 128 },
  pricePerGpuUnit: 10, priceUsdPerGpuUnit: 10, pricePerGpuHour: 10, sourceAmount: "10", sourceCurrency: "USD",
  rentalType: "On-demand", billingMode: "on_demand", billingUnit: "GPU-hour", pricingTier: "ordinary", membershipRequired: false,
  countryCode: "CN", regions: ["cn-one"], zones: ["cn-one-a"], region: "cn-one", availability: "unknown",
  sourceUrl: "https://www.autodl.com/api/v1/user/machine/list", sourceType: "official_internal_api", observedAt: "2026-10-23T06:00:00Z",
  egress: "Not published", quoteStatus: "quoted", priceBasis: "advertised_per_gpu", dataStatus: "official-page", conditions: ["Pricing tier: ordinary"] });
const member = (): Offer => ({ ...ordinary(), id: "member", pricingTier: "member", membershipRequired: true,
  sourceAmount: "9", pricePerGpuUnit: 9, priceUsdPerGpuUnit: 9, pricePerGpuHour: 9,
  conditions: ["Pricing tier: member", "Requires AutoDL member eligibility.", "Membership required; eligibility not verified"] });

test("exact same-source configuration prefers its explicit member rate without deleting either source row", () => {
  const input = [ordinary(), member()]; const before = JSON.stringify(input);
  assert.deepEqual(preferMemberOffers(input).map(q => q.id), ["member"]);
  assert.deepEqual(groupOffersForComparison(input)[0].offers.map(q => q.id), ["member"]);
  assert.deepEqual(preferMemberOffers(input.filter(q => !q.membershipRequired)).map(q => q.id), ["ordinary"]);
  assert.equal(JSON.stringify(input), before);
});

test("different SKU, source, hardware, country, region, zone, cloud, currency, unit and restrictions never pair", () => {
  const changes: Partial<Offer>[] = [
    { rawSku: "another-sku" }, { rawSku: undefined }, { providerSlug: "another" }, { sourceUrl: "https://another.example/prices" },
    { sourceType: "public_page" }, { gpuVariant: "PCIe" }, { vramGb: 94 }, { gpuCount: 8 },
    { resources: { cpu: 32 } }, { resources: undefined }, { countryCode: "US" }, { regions: ["cn-two"] },
    { zones: ["cn-one-b"] }, { cloudTier: "secure" }, { sourceCurrency: "CNY" },
    { billingUnit: "GPU-month" }, { billingMode: "reserved" }, { priceBasis: "starting_price" },
    { observedAt: "2026-10-23T07:00:00Z" }, { accountScope: "account_quote" },
    { conditions: ["Requires AutoDL member eligibility.", "Minimum commitment: 12 months"] },
  ];
  for (const change of changes) assert.equal(preferMemberOffers([ordinary(), { ...member(), ...change }]).length, 2, JSON.stringify(change));
});

test("ambiguous tier duplicates and Secure/Community cloud prices remain separate", () => {
  assert.equal(preferMemberOffers([ordinary(), member(), { ...member(), id: "second-member" }]).length, 3);
  const secure = { ...ordinary(), providerSlug: "runpod", cloudTier: "secure", pricingTier: null, membershipRequired: false };
  const community = { ...secure, id: "community", cloudTier: "community" };
  assert.equal(preferMemberOffers([secure, community]).length, 2);
  assert.equal(preferMemberOffers([ordinary(), { ...member(), membershipRequired: false }]).length, 2);
});
