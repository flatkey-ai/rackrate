import test from "node:test";
import assert from "node:assert/strict";
import type { Offer } from "./data";

const { cheapestComparableOffer, compareOffers, formatOfferPrice, formatInstancePrice, formatOriginalPrice, isComparableUsdHourly, hasEligibilityConditions } = await import(new URL("./pricing.ts", import.meta.url).href);
const quote = (overrides: Partial<Offer> = {}): Offer => ({
  id: "ordinary", gpuSlug: "nvidia-h100", providerSlug: "example", gpuCount: null, gpuVariant: null, vramGb: null,
  pricePerGpuUnit: 2, priceUsdPerGpuUnit: 2, pricePerGpuHour: 2, rentalType: "On-demand", region: "Not published", regions: [], zones: [], countryCode: "",
  availability: "unknown", egress: "Not published", sourceUrl: "https://example.com/prices", observedAt: "2026-10-20T08:00:00Z",
  sourceCurrency: "USD", billingUnit: "GPU-hour", quoteStatus: "quoted", priceBasis: "advertised_per_gpu", conditions: [], dataStatus: "official-page", ...overrides,
});
test("eligibility badges and filtering retain regional and membership restrictions", () => {
  const regional = quote({ sourceCurrency: "ILS", conditions: ["ILS prices apply to companies from Israel"] });
  const member = quote({ membershipRequired: true });
  assert.equal(hasEligibilityConditions(regional), true);
  assert.equal(hasEligibilityConditions(member), true);
  assert.equal(hasEligibilityConditions(quote()), false);
  assert.equal(isComparableUsdHourly(member), false);
});

test("USD on-demand benchmarks exclude incompatible and ineligible cheaper quotes", () => {
  const ordinary = quote();
  const incompatible = [
    { sourceCurrency: "CNY", pricePerGpuHour: null }, { sourceCurrency: "EUR", pricePerGpuHour: null },
    { billingUnit: "GPU-month", pricePerGpuHour: null }, { availability: "unavailable" }, { rentalType: "Spot" },
    { quoteStatus: "contact_sales", pricePerGpuHour: null }, { quoteStatus: "starting_at" }, { dataStatus: "seed" },
    { priceBasis: "gpu_component" }, { conditions: ["Member-only price"] }, { conditions: ["仅新客户可享"] }, { conditions: ["ILS prices apply to companies from Israel"] },
  ].map((override, index) => quote({ id: `low-${index}`, pricePerGpuUnit: .01, pricePerGpuHour: .01, ...override } as Partial<Offer>));
  for (const record of incompatible) assert.equal(isComparableUsdHourly(record), false, record.id);
  assert.equal(cheapestComparableOffer([...incompatible, ordinary])?.id, "ordinary");
  assert.equal(cheapestComparableOffer(incompatible), undefined);
});
test("missing, contact-sales and original-currency prices do not become zero-dollar offers", () => {
  assert.equal(formatOfferPrice(quote({ quoteStatus: "contact_sales", pricePerGpuUnit: null })), "Contact sales");
  assert.match(formatOriginalPrice(quote({ sourceCurrency: "CNY", billingUnit: "GPU-month", pricePerGpuUnit: 467.79 })), /CNY.*467\.79/);
  assert.match(formatOfferPrice(quote({ quoteStatus: "starting_at" })), /^From USD/);
  assert.equal(formatInstancePrice(quote({ gpuCount: 8 })), "Node total not published");
  assert.match(formatInstancePrice(quote({ instancePrice: 16, instanceCurrency: "USD", instanceBillingUnit: "instance-hour" })), /USD.*16\.00.*node \/ hour/);
});
test("dated USD conversion permits original CNY hourly quotes without mixing month rates", () => {
  const converted = quote({ sourceCurrency: "CNY", pricePerGpuUnit: 10, priceUsdPerGpuUnit: 1.4, pricePerGpuHour: 1.4, fx: { rateToUsd: .14, rateDate: "2026-10-19", sourceName: "ECB", sourceUrl: "https://www.ecb.europa.eu/" } });
  assert.equal(isComparableUsdHourly(converted), true);
  assert.match(formatOfferPrice(converted), /USD.*1\.40/);
  assert.match(formatOriginalPrice(converted), /CNY.*10\.00/);
  assert.equal(isComparableUsdHourly({ ...converted, fx: null }), false);
  assert.equal(isComparableUsdHourly({ ...converted, billingUnit: "GPU-month", pricePerGpuHour: null }), false);
});
test("sorting keeps monthly periods separate while ordering converted hourly amounts", () => {
  const input = [quote({ id: "usd", priceUsdPerGpuUnit: .01 }), quote({ id: "cny-month", sourceCurrency: "CNY", billingUnit: "GPU-month", priceUsdPerGpuUnit: .001 }), quote({ id: "cny-hour", sourceCurrency: "CNY", priceUsdPerGpuUnit: 14 })];
  assert.deepEqual(input.sort(compareOffers).map((entry) => entry.id), ["usd", "cny-hour", "cny-month"]);
});
