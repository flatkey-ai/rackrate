import type { Offer } from "./data";

type CatalogOffer = Partial<Pick<Offer, "providerSlug" | "sourceType" | "sourceUrl" | "accountScope" | "priceScope" | "dataStatus"
  | "regions" | "computeCountries" | "applicableRegions" | "applicableCountries" | "priceApplicability" | "capacityLocations">>;
type CatalogLocation = { region: string; country_code: string; description?: string };
const FRONTEND_URL = "https://cloud.lambda.ai/static/cloud-app/assets/main-BdOFEme8.js";
const FRONTEND_SHA = "becc45eec9df69c8089947297b2958c047a618fedf8dbb6787806c46c346fa6c";
const CATALOG_URLS = ["https://cloud.lambda.ai/api/internal/dashboard/v1/instance-types", "https://cloud.lambda.ai/api/internal/dashboard/v1/cluster-types/reserved"];

/** A shared SKU price applies only to the source-verified selectable locations.
 * Do not copy this list into regions/countries of an independent regional quote. */
export function sharedCatalogLocations(offer: CatalogOffer): CatalogLocation[] {
  const evidence = offer.priceApplicability;
  if (offer.providerSlug !== "lambda" || offer.sourceType !== "official_internal_api"
      || !CATALOG_URLS.includes(offer.sourceUrl ?? "") || offer.accountScope !== "authenticated_console_catalog"
      || offer.dataStatus !== "official-page" || offer.priceScope !== "unlocated_catalog"
      || offer.regions?.length !== 0 || offer.computeCountries?.length !== 0
      || evidence?.basis !== "official_console_shared_sku_catalog"
      || evidence.scope !== "currently_selectable_standard_regions"
      || !["reviewed_snapshot", "verified_current_frontend"].includes(String(evidence.verification_status))
      || evidence.independent_region_quotes !== false || evidence.final_checkout_verified !== false) return [];
  const proof = evidence.evidence as Record<string, unknown> | undefined;
  if (proof?.source_url !== FRONTEND_URL || proof.source_sha256 !== FRONTEND_SHA) return [];
  if (!Array.isArray(evidence.locations) || !Array.isArray(offer.capacityLocations)
      || !Array.isArray(offer.applicableRegions) || !Array.isArray(offer.applicableCountries)) return [];
  const locations: CatalogLocation[] = [];
  for (const entry of evidence.locations) {
    if (!entry || typeof entry !== "object" || typeof entry.region !== "string" || !entry.region
        || typeof entry.country_code !== "string" || !/^[A-Z]{2}$/.test(entry.country_code)
        || ["GL", "EU"].includes(entry.country_code)) return [];
    locations.push(entry as CatalogLocation);
  }
  const codes = locations.map((item) => item.region);
  const capacity = offer.capacityLocations.filter((item) => item.dedicated !== true).map((item) => item.name);
  const countries = [...new Set(locations.map((item) => item.country_code))].sort();
  if (new Set(codes).size !== codes.length || JSON.stringify(codes) !== JSON.stringify(offer.applicableRegions)
      || JSON.stringify(codes) !== JSON.stringify(capacity)
      || JSON.stringify(countries) !== JSON.stringify(offer.applicableCountries)) return [];
  return locations;
}

export function isSharedCatalogPrice(offer: CatalogOffer): boolean {
  return sharedCatalogLocations(offer).length > 0;
}
