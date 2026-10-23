import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Offer } from "./data";
import { preferMemberOffers } from "./member-preference.ts";
import { groupOffersForComparison } from "./offer-comparison.ts";

const ordinary = (): Offer => ({ id: "ordinary", providerSlug: "autodl", gpuSlug: "nvidia-h100", rawSku: "actual-sku",
  gpuCount: 1, gpuVariant: "SXM", vramGb: 80, resources: { allocation_scope: "per_gpu", cpu: 16, ram_gb: 128 },
  pricePerGpuUnit: 10, priceUsdPerGpuUnit: 1.5, pricePerGpuHour: null, sourceAmount: "10", sourceCurrency: "CNY", productType: "gpu_container", location: { region: "cn-one" }, quoteConditions: [], sourceConditions: [],
  rentalType: "On-demand", billingMode: "on_demand", billingUnit: "GPU-hour", pricingTier: "ordinary", membershipRequired: false,
  countryCode: "CN", regions: ["cn-one"], zones: ["cn-one-a"], region: "cn-one", availability: "unknown",
  sourceUrl: "https://www.autodl.com/api/v1/user/machine/list", sourceType: "official_internal_api", observedAt: "2026-10-23T06:00:00Z",
  egress: "Not published", quoteStatus: "quoted", priceBasis: "advertised_per_gpu", dataStatus: "official-page", conditions: ["Pricing tier: ordinary"] });
const member = (): Offer => ({ ...ordinary(), id: "member", pricingTier: "member", membershipRequired: true,
  sourceAmount: "9", pricePerGpuUnit: 9, priceUsdPerGpuUnit: 1.35, pricePerGpuHour: null,
  quoteConditions: ["Requires AutoDL member eligibility."], sourceConditions: ["Requires AutoDL member eligibility."],
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
    { zones: ["cn-one-b"] }, { cloudTier: "secure" }, { sourceCurrency: "USD" },
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


test("unknown sources and an equal-looking but higher exact member tariff never hide the ordinary quote", () => {
  for (const shared of [ { providerSlug: "unknown" }, { sourceUrl: "https://unknown.example/pricing" }, { sourceType: "public_page" },
    { productType: "gpu_instance" }, { sourceCurrency: "USD" }, { billingMode: "reserved" }, { location: { region: "other" } } ]) {
    assert.equal(preferMemberOffers([{ ...ordinary(), ...shared }, { ...member(), ...shared }]).length, 2);
  }
  assert.equal(preferMemberOffers([{ ...ordinary(), sourceAmount: "3", pricePerGpuUnit: 3, priceUsdPerGpuUnit: .45 },
    { ...member(), sourceAmount: "5", pricePerGpuUnit: 5, priceUsdPerGpuUnit: .75 }]).length, 2);
  const regular = { ...ordinary(), sourceAmount: "3", pricePerGpuUnit: 3, exactApiHourlyAmount: "3.001" };
  const higherExact = { ...member(), sourceAmount: "3", pricePerGpuUnit: 3, exactApiHourlyAmount: "3.004" };
  assert.equal(preferMemberOffers([regular, higherExact]).length, 2);
  assert.equal(preferMemberOffers([regular, { ...higherExact, exactApiHourlyAmount: "3.000" }]).length, 1);
  for (const changes of [{ pricePerGpuUnit: Infinity }, { priceUsdPerGpuUnit: NaN }, { sourceAmount: "NaN" },
    { exactApiHourlyAmount: "Infinity" }, { sourceAmount: "8" }, { exactApiHourlyAmount: "9.006" },
    { priceSource: { field: "unverified", native_amount_milli_cny: 9000, native_currency: "CNY" } }]) {
    assert.equal(preferMemberOffers([ordinary(), { ...member(), ...changes }]).length, 2);
  }
});

test("verified native milli-CNY values preserve exact tariff ordering and source-field validation", () => {
  const native = (member: boolean, value: number) => ({ field: `machine_sku_info[0].level_config[${member ? "member_user" : "normal_user"}].discounted_price`, native_amount_milli_cny: value, native_currency: "CNY", conversion: "official display" });
  const regular = { ...ordinary(), priceSource: native(false, 10000), exactApiHourlyAmount: "10" };
  const discounted = { ...member(), priceSource: native(true, 9000), exactApiHourlyAmount: "9" };
  assert.equal(preferMemberOffers([regular, discounted]).length, 1);
  assert.equal(preferMemberOffers([regular, { ...discounted, priceSource: native(false, 9000) }]).length, 2);
  assert.equal(preferMemberOffers([regular, { ...discounted, priceSource: native(true, 9001) }]).length, 2);
});


test("captured AutoDL machine/list tariffs still prefer the verified discounted member rate", () => {
  const recorded: Offer[] = JSON.parse(readFileSync(new URL("./fixtures/autodl-member-tariffs-2026-10-23.json", import.meta.url), "utf8"));
  const before = JSON.stringify(recorded);
  const result = preferMemberOffers(recorded);
  assert.equal(result.length, 1);
  assert.equal(result[0].membershipRequired, true);
  assert.ok(recorded.every(row => row.exactApiHourlyAmount && row.priceSource?.native_currency === "CNY"));
  assert.equal(JSON.stringify(recorded), before);
});
