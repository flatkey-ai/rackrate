import test from "node:test";
import assert from "node:assert/strict";
import { createPricingData, type Offer, type PricingDataset } from "./data.ts";
import { getOfferCountryCodes, isRegionSpecificPrice, matchesCountryRegionSelection, offerMatchesRegion, publishedRegionLabel, publishedRegionsForCountry, publishedZonesForSelection, regionMappingSources } from "./region-matching.ts";
import { cheapestComparableOffer } from "./pricing.ts";

const quote = (overrides: Partial<Offer> = {}): Offer => ({
  id: "regional", gpuSlug: "nvidia-h100", providerSlug: "azure", gpuCount: 1, gpuVariant: "SXM", vramGb: 80,
  pricePerGpuUnit: 2, priceUsdPerGpuUnit: 2, pricePerGpuHour: 2, rentalType: "On-demand",
  region: "canadacentral", regions: ["canadacentral"], zones: [], countryCode: "", availability: "unknown",
  egress: "Not published", sourceUrl: "https://example.com/pricing", observedAt: "2026-10-21T03:00:00Z",
  sourceCurrency: "USD", billingUnit: "GPU-hour", quoteStatus: "quoted", priceBasis: "advertised_per_gpu", conditions: [], dataStatus: "official-page", ...overrides,
});

const dataset = (offers: Offer[]): PricingDataset => ({
  schemaVersion: 2, generatedAt: "2026-10-21T03:00:00Z", offers, sources: [],
});

test("a source cloud-region code is indexed only within its own provider", () => {
  const canada = { countryCodes: ["CA"], regionNames: ["Canada"] };
  assert.equal(offerMatchesRegion(quote(), canada), true);
  assert.equal(offerMatchesRegion(quote({ providerSlug: "other-cloud" }), canada), false);
  assert.deepEqual(getOfferCountryCodes(quote()), ["CA"]);
  assert.deepEqual(getOfferCountryCodes(quote({ providerSlug: "other-cloud" })), []);
});

test("multi-region quotes reach each documented market without changing source metadata", () => {
  const multi = quote({ providerSlug: "nebius", region: "eu-north1, us-central1", regions: ["eu-north1", "us-central1"] });
  const original = JSON.stringify(multi);
  const data = createPricingData(dataset([multi, quote({ id: "same-code-other-provider", providerSlug: "other-cloud", regions: ["eu-north1"], region: "eu-north1" })]));
  assert.deepEqual(data.getOffersForRegion("europe").map((offer) => offer.id), ["regional"]);
  assert.deepEqual(data.getOffersForRegion("united-states").map((offer) => offer.id), ["regional"]);
  assert.deepEqual(data.getOffersForRegion("canada"), []);
  assert.deepEqual(getOfferCountryCodes(multi), ["FI", "US"]);
  assert.equal(JSON.stringify(multi), original);
});

test("unknown catalog locations are never classified by headquarters, currency or a Global default", () => {
  const unknown = quote({ providerSlug: "lambda", region: "Not published", regions: [], sourceCurrency: "USD" });
  const data = createPricingData(dataset([unknown]));
  assert.deepEqual(getOfferCountryCodes(unknown), []);
  for (const region of data.regions) assert.deepEqual(data.getOffersForRegion(region.slug), []);
  assert.deepEqual(getOfferCountryCodes(quote({ regions: [], region: "Europe", countryCode: "EU" })), []);
  assert.deepEqual(getOfferCountryCodes(quote({ regions: [], region: "Global", countryCode: "GL" })), []);
  assert.deepEqual(data.getOffersForRegion("global"), []);
});

test("offline China records remain in the country board without becoming a rentable price floor", () => {
  const offline = quote({ providerSlug: "ucloud", region: "cn-wlcb", regions: ["cn-wlcb"], zones: ["cn-wlcb-01"], countryCode: "CN", availability: "unavailable", rentalType: "Monthly", billingUnit: "GPU-month", pricePerGpuHour: null });
  const data = createPricingData(dataset([offline]));
  assert.deepEqual(data.getOffersForRegion("china").map((offer) => offer.id), ["regional"]);
  assert.deepEqual(data.getRegionCoverage("china"), { offerCount: 1, officialCount: 1, referenceCount: 0, offlineCount: 1, regionalPriceCount: 1, coverageOnlyCount: 0 });
  assert.equal(data.getCheapestOffer(), undefined);
  assert.deepEqual(getOfferCountryCodes(offline), ["CN"]);
  assert.deepEqual(data.getOffersForRegion("china")[0].zones, ["cn-wlcb-01"]);
});

test("region coverage includes official code-only listings and keeps countries distinct", () => {
  const located = (id: string, region: string, countryCode: string) => quote({ id, providerSlug: "ucloud", region, regions: [region], countryCode });
  const data = createPricingData(dataset([
    located("ca-central", "test-ca-central", "CA"), located("ca-east", "test-ca-east", "CA"),
    { ...located("ca-central-spot", "test-ca-central", "CA"), rentalType: "Spot" },
    located("india", "test-in", "IN"), located("jp", "test-jp", "JP"),
    quote({ id: "il", providerSlug: "nebius", region: "me-west1", regions: ["me-west1"] }),
    located("br", "test-br", "BR"),
  ]));
  assert.equal(data.isRegionIndexable("canada"), true);
  assert.equal(data.getRegionCoverage("canada").officialCount, 3);
  assert.deepEqual(data.getOffersForRegion("india").map((offer) => offer.id), ["india"]);
  assert.deepEqual(data.getOffersForRegion("asia-pacific").map((offer) => offer.id), ["india", "jp"]);
  assert.deepEqual(data.getOffersForRegion("middle-east").map((offer) => offer.id), ["il"]);
  assert.deepEqual(data.getOffersForRegion("latin-america").map((offer) => offer.id), ["br"]);
});

test("readable labels retain raw codes and do not invent an unknown code's country", () => {
  const originalName = quote({ location: { region: "canadacentral", region_name: "CA Central" } });
  assert.equal(publishedRegionLabel(originalName, "canadacentral"), "CA Central (canadacentral)");
  assert.equal(publishedRegionLabel(quote({ providerSlug: "nebius" }), "eu-north1"), "Finland (eu-north1)");
  const extended = quote({ region: "sgxsingapore1", regions: ["sgxsingapore1"], location: { region: "sgxsingapore1", region_name: "SGX Singapore 1" } });
  assert.equal(publishedRegionLabel(extended, "sgxsingapore1"), "SGX Singapore 1 (sgxsingapore1)");
  assert.deepEqual(getOfferCountryCodes(extended), []);
  assert.deepEqual(regionMappingSources([extended]), []);
  assert.deepEqual(regionMappingSources([quote(), quote()]), ["https://learn.microsoft.com/en-us/azure/reliability/regions-list"]);
});

test("platform availability codes do not turn a generic catalog rate into a regional minimum", () => {
  const coverage = quote({
    id: "generic-platform-rate", providerSlug: "nebius", region: "eu-north1", regions: ["eu-north1"],
    pricePerGpuUnit: 0.5, priceUsdPerGpuUnit: 0.5, pricePerGpuHour: 0.5,
    conditions: ["Published platform availability is not a region-specific price quote."],
  });
  const regional = quote({ id: "regional-retail-rate", providerSlug: "ucloud", countryCode: "SE", region: "test-se", regions: ["test-se"] });
  const data = createPricingData(dataset([coverage, regional]));
  const europeanOffers = data.getOffersForRegion("europe");
  assert.equal(europeanOffers.length, 2);
  assert.equal(isRegionSpecificPrice(coverage), false);
  assert.equal(isRegionSpecificPrice(regional), true);
  assert.equal(isRegionSpecificPrice(quote({ region: "Not published", regions: [] })), false);
  assert.equal(isRegionSpecificPrice(quote({ region: "Global", regions: ["Global"] })), false);
  assert.equal(isRegionSpecificPrice(quote({ dataStatus: "seed" })), false);
  assert.equal(cheapestComparableOffer(europeanOffers)?.id, "generic-platform-rate");
  assert.equal(cheapestComparableOffer(europeanOffers.filter(isRegionSpecificPrice))?.id, "regional-retail-rate");
  assert.equal(data.getRegionCoverage("europe").regionalPriceCount, 1);
  assert.equal(data.getRegionCoverage("europe").coverageOnlyCount, 1);
  assert.deepEqual(getOfferCountryCodes(coverage), ["FI"]);
});

test("dated regional references are absent from the current regional comparison", () => {
  const reference = quote({ dataStatus: "seed", providerSlug: "vast-ai", region: "Europe", regions: ["Europe"], countryCode: "EU" });
  const data = createPricingData(dataset([reference]));
  assert.deepEqual(data.getRegionCoverage("europe"), { offerCount: 0, officialCount: 0, referenceCount: 0, offlineCount: 0, regionalPriceCount: 0, coverageOnlyCount: 0 });
});

test("explicit library price scope governs country and regional-price claims", () => {
  const coverage = quote({ providerSlug: "nebius", region: "eu-north1", regions: ["eu-north1"],
    countryCode: "FI", computeCountries: ["FI"], priceScope: "platform_coverage" });
  assert.equal(isRegionSpecificPrice(coverage), false);
  assert.deepEqual(getOfferCountryCodes(coverage), []);
  assert.equal(matchesCountryRegionSelection(coverage, "FI", "eu-north1"), false);
  assert.equal(offerMatchesRegion(coverage, { countryCodes: ["FI"], regionNames: ["eu-north1"] }), false);
  const regional = quote({ providerSlug: "ucloud", region: "cn-wlcb", regions: ["cn-wlcb"],
    countryCode: "", computeCountries: ["CN"], priceScope: "zone_quote",
    locationSource: { api_url: "https://api.ucloud.cn/", country_field: "CountryCode" } });
  assert.equal(isRegionSpecificPrice(regional), true);
  assert.deepEqual(getOfferCountryCodes(regional), ["CN"]);
  assert.deepEqual(publishedRegionsForCountry(regional, "CN"), ["cn-wlcb"]);
  assert.deepEqual(regionMappingSources([regional]), ["https://api.ucloud.cn/"]);
});

test("country and region selection joins the same code instead of crossing a multi-country catalog record", () => {
  const multi = quote({ providerSlug: "nebius", region: "eu-north1, us-central1", regions: ["eu-north1", "us-central1"] });
  const original = JSON.stringify(multi);
  assert.deepEqual(publishedRegionsForCountry(multi, "US"), ["us-central1"]);
  assert.deepEqual(publishedRegionsForCountry(multi, "FI"), ["eu-north1"]);
  assert.deepEqual(publishedRegionsForCountry(multi, "CA"), []);
  assert.equal(matchesCountryRegionSelection(multi, "US", "us-central1"), true);
  assert.equal(matchesCountryRegionSelection(multi, "US", "eu-north1"), false);
  assert.equal(matchesCountryRegionSelection(multi, "FI", "us-central1"), false);
  assert.equal(matchesCountryRegionSelection(multi, "all", "eu-north1"), true);
  assert.equal(matchesCountryRegionSelection(multi, "US", "all"), true);
  assert.equal(JSON.stringify(multi), original);
});

test("country-region linking uses the provider's mapping and supports an explicit whole-record country", () => {
  const unrelated = quote({ providerSlug: "other-cloud", countryCode: "US", region: "eu-north1", regions: ["eu-north1"] });
  assert.deepEqual(publishedRegionsForCountry(unrelated, "US"), ["eu-north1"]);
  assert.deepEqual(publishedRegionsForCountry(unrelated, "FI"), []);
  const offline = quote({ providerSlug: "ucloud", countryCode: "CN", region: "cn-wlcb", regions: ["cn-wlcb"], zones: ["cn-wlcb-01"] });
  assert.equal(matchesCountryRegionSelection(offline, "CN", "cn-wlcb"), true);
  assert.equal(matchesCountryRegionSelection(offline, "US", "cn-wlcb"), false);
  assert.deepEqual(publishedRegionsForCountry(offline, "CN"), ["cn-wlcb"]);
  assert.deepEqual(publishedZonesForSelection(offline, "CN", "cn-wlcb"), ["cn-wlcb-01"]);
  assert.deepEqual(publishedZonesForSelection(offline, "US", "cn-wlcb"), []);
});

test("a partial multi-region selection cannot borrow zones with no published region association", () => {
  const multi = quote({ providerSlug: "nebius", region: "eu-north1, us-central1", regions: ["eu-north1", "us-central1"], zones: ["zone-north", "zone-central"] });
  assert.deepEqual(publishedZonesForSelection(multi, "all", "all"), ["zone-north", "zone-central"]);
  assert.deepEqual(publishedZonesForSelection(multi, "US", "all"), []);
  assert.deepEqual(publishedZonesForSelection(multi, "US", "us-central1"), []);
  assert.deepEqual(publishedZonesForSelection(multi, "US", "eu-north1"), []);
  assert.deepEqual(multi.zones, ["zone-north", "zone-central"]);
});
