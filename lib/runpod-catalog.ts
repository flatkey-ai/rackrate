import type { Offer } from "./data";

const locationCountries: Record<string, string> = { India: "IN", Japan: "JP", Canada: "CA", France: "FR",
  Australia: "AU", "United States": "US", Germany: "DE", Netherlands: "NL", Sweden: "SE", Norway: "NO",
  Iceland: "IS", Romania: "RO", "Czech Republic": "CZ", Czechia: "CZ", Denmark: "DK", Singapore: "SG", "United Kingdom": "GB" };
const directorySource = "https://github.com/runpod/runpodctl/blob/dd55bcff14ef1faadeb27c8f08edfeb8795e026f/internal/api/gpu.go";

// Older page-derived prices remain historical and must not re-enter the board.
export function isRunpodCatalogOffer(offer: Offer): boolean {
  const common = offer.providerSlug === "runpod" && offer.dataStatus === "official-page"
    && offer.sourceType === "official_public_api"
    && offer.sourceUrl === "https://www.runpod.io/pricing"
    && offer.apiSourceUrl === "https://api.runpod.io/graphql"
    && offer.accountScope === "public_catalog"
    && ["secure", "community"].includes(offer.cloudTier ?? "")
    && offer.billingMode === "on_demand" && offer.billingUnit === "GPU-hour"
    && offer.sourceCurrency === "USD"
    && typeof offer.pricePerGpuUnit === "number" && offer.pricePerGpuUnit > 0
    && offer.membershipRequired !== true;
  if (!common) return false;
  if (offer.quoteStatus === "quoted") return offer.gpuCount === null
    && offer.priceBasis === "advertised_per_gpu" && offer.countryCode === "" && !(offer.regions?.length) && !(offer.zones?.length)
    && !(offer.computeCountries?.length) && !(offer.applicableRegions?.length)
    && [null, undefined, "unlocated_catalog"].includes(offer.priceScope)
    && offer.geographicScope === "unspecified";
  const source = offer.locationSource;
  const conditions = offer.quoteConditions;
  if (!source || !conditions || Array.isArray(conditions)) return false;
  const request = conditions.quote_request as Record<string, unknown> | undefined;
  const code = source.data_center_id;
  return offer.quoteStatus === "starting_at" && offer.priceBasis === "starting_price" && offer.gpuCount === 1
    && offer.priceScope === "requested_zone_quote" && offer.geographicScope === "requested_zone"
    && source.source_url === offer.apiSourceUrl && source.documentation_url === directorySource
    && source.basis === "explicit_data_center_location_and_price_request"
    && typeof code === "string" && /^[A-Z0-9-]{2,40}$/.test(code)
    && typeof source.location === "string" && Object.hasOwn(locationCountries, source.location)
    && source.country_code === locationCountries[source.location] && offer.countryCode === source.country_code
    && offer.computeCountries?.length === 1 && offer.computeCountries[0] === source.country_code
    && offer.regions?.length === 1 && offer.regions[0] === code && offer.zones?.length === 1 && offer.zones[0] === code
    && conditions.cloud_type === `${offer.cloudTier}_cloud` && conditions.rate_type === "lowest_available"
    && request?.dataCenterId === code && request?.gpuCount === 1 && request?.secureCloud === (offer.cloudTier === "secure");
}
