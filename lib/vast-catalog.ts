import type { Offer } from "./data";

const API = "https://console.vast.ai/api/v0/bundles";
const DOCUMENTATION = "https://docs.vast.ai/api-reference/search/search-offers";
// Match the collector's explicit ISO-country and US/CA subdivision evidence.
// A country name or arbitrary city is never promoted to a cloud region.
const countries = new Set("AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" "));
const subdivisions: Record<string, Set<string>> = {
  US: new Set("Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|District of Columbia|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming".split("|")),
  CA: new Set("Alberta|British Columbia|Manitoba|New Brunswick|Newfoundland and Labrador|Northwest Territories|Nova Scotia|Nunavut|Ontario|Prince Edward Island|Quebec|Saskatchewan|Yukon".split("|")),
};

type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => value !== null && typeof value === "object" && !Array.isArray(value);
const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
function decimal(value: unknown, zeroAllowed = false): number | null {
  if (typeof value !== "string" || value.length > 192 || !/^\d+(?:\.\d{1,160})?$/.test(value)) return null;
  const result = Number(value);
  return Number.isFinite(result) && result < 1e13 && (zeroAllowed ? result >= 0 : result > 0) ? result : null;
}
const single = (value: unknown, expected: string) => Array.isArray(value) && value.length === 1 && value[0] === expected;
const empty = (value: unknown) => Array.isArray(value) && value.length === 0;
const absentList = (value: unknown) => value === undefined || empty(value);

/** A bounded public search supplies concrete bundle prices, not a market-wide
 * rate. Country-only offers are valid source records; only verified US/CA
 * subdivisions may enter the region-based comparison board. */
export function isVastCatalogOffer(offer: Offer): boolean {
  const terms = offer.quoteConditions;
  const source = offer.locationSource;
  const resources = offer.resources;
  if (!record(terms) || !record(source) || !record(resources)) return false;
  if (offer.providerSlug !== "vast" || offer.dataStatus !== "official-page"
      || offer.sourceUrl !== API || offer.sourceType !== "official_public_api"
      || (offer.apiSourceUrl != null && offer.apiSourceUrl !== API)
      || offer.accountScope !== "public_catalog" || offer.productType !== "gpu_container"
      || offer.sourceCurrency !== "USD" || offer.billingUnit !== "GPU-hour"
      || offer.billingMode !== "on_demand" || offer.rentalType !== "On-demand"
      || offer.quoteStatus !== "quoted" || offer.priceBasis !== "instance_total_allocated"
      || offer.membershipRequired === true || offer.availability !== "available"
      || !Number.isSafeInteger(offer.gpuCount) || offer.gpuCount! < 1 || offer.gpuCount! > 1024
      || !Number.isSafeInteger(terms.offer_id) || Number(terms.offer_id) < 1 || Number(terms.offer_id) > 1e15
      || offer.rawSku !== String(terms.offer_id) || terms.rate_type !== "concrete_offer"
      || terms.verification !== "verified" || terms.allocated_storage !== 8 || resources.storage_gb !== 8
      || terms.storage_unit !== "GB_as_documented_by_API" || typeof terms.storage_unit_caveat !== "string"
      || !terms.storage_unit_caveat.length || terms.bandwidth_included !== false || terms.catalog_coverage !== "partial"
      || !positive(resources.vcpus) || !positive(resources.memory_gb) || !positive(offer.vramGb)
      || typeof resources.cpu_name !== "string" || !resources.cpu_name.trim()
      || !empty(offer.zones) || !absentList(offer.applicableRegions) || !absentList(offer.applicableCountries)
      || offer.priceApplicability != null || offer.location != null) return false;
  // These are original conditions retained by the normalizer as well as the
  // quote-specific evidence; neither copy may claim different billing terms.
  const originalTerms = offer.sourceConditions;
  if (!record(originalTerms) || Object.keys(terms).some((key) => originalTerms[key] !== terms[key])) return false;
  const perGpu = decimal(offer.sourceAmount), total = decimal(offer.instanceSourceAmount);
  const compute = decimal(terms.compute_per_instance_hour_usd), storage = decimal(terms.storage_per_instance_hour_usd, true);
  const fraction = decimal(terms.gpu_fraction_of_host);
  if (perGpu === null || total === null || compute === null || storage === null || fraction === null || fraction > 1
      || decimal(terms.storage_per_gb_month_usd, true) === null
      || offer.pricePerGpuUnit !== perGpu || offer.priceUsdPerGpuUnit !== perGpu || offer.pricePerGpuHour !== perGpu
      || offer.usdSourceAmount !== offer.sourceAmount || offer.instancePrice !== total || offer.instancePriceUsd !== total
      || offer.instanceUsdSourceAmount !== offer.instanceSourceAmount || offer.instanceCurrency !== "USD"
      || offer.instanceBillingUnit !== "instance-hour"
      || Math.abs(perGpu - total / offer.gpuCount!) > Math.max(perGpu, total / offer.gpuCount!) * Number.EPSILON * 4
      || Math.abs(total - compute - storage) > Math.max(1e-9, total * 1e-9)) return false;
  const memoryMb = decimal(resources.memory_mb), vramMb = decimal(resources.gpu_memory_mb_per_gpu);
  if (memoryMb === null || vramMb === null || resources.memory_gb !== memoryMb / 1000 || offer.vramGb !== vramMb / 1000) return false;
  const raw = source.raw_location;
  if (source.source_url !== API || source.documentation_url !== DOCUMENTATION
      || source.basis !== "offer_geolocation" || source.field !== "geolocation" || source.uniform_country_price !== false
      || typeof raw !== "string" || raw.length > 200 || !raw.trim() || /[\x00-\x1f\x7f]/.test(raw)) return false;
  const text = raw.trim(), comma = text.lastIndexOf(","), country = text.slice(comma + 1).trim();
  if (!countries.has(country) || (comma === -1 && text !== country)
      || source.country_code !== country || offer.countryCode !== country || !single(offer.computeCountries, country)) return false;
  const location = text.replace(/^[ ,]+|[ ,]+$/g, "") === country ? country : text;
  const subdivision = location.includes(",") ? location.slice(0, location.lastIndexOf(",")).trim() : "";
  const regional = Object.hasOwn(subdivisions, country) && subdivisions[country].has(subdivision);
  if (regional) return source.location_granularity === "subdivision"
    && offer.priceScope === "regional_quote" && offer.geographicScope === "offer_location"
    && (offer.regionScope === undefined || offer.regionScope === "offer_location")
    && single(offer.regions, location) && offer.region === location;
  return source.location_granularity === "country"
    && offer.priceScope === "country_quote" && offer.geographicScope === "offer_country"
    && (offer.regionScope === undefined || offer.regionScope === "offer_country")
    && empty(offer.regions) && offer.region === "Not published";
}
