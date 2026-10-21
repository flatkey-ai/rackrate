import type { Offer, RegionProfile } from "./data";
import { comparableCountryCodes } from "./offer-geography.mjs";

export const REGION_MAPPING_SOURCES = {
  azure: "https://learn.microsoft.com/en-us/azure/reliability/regions-list",
  azureGovernment: "https://learn.microsoft.com/en-us/azure/azure-government/documentation-government-welcome",
  nebius: "https://docs.nebius.com/overview/regions",
} as const;

type RegionMapping = { country: string; name: string; sourceUrl: string };
const azure = (country: string, name: string): RegionMapping => ({ country, name, sourceUrl: REGION_MAPPING_SOURCES.azure });
const nebius = (country: string, name: string): RegionMapping => ({ country, name, sourceUrl: REGION_MAPPING_SOURCES.nebius });

// These mappings identify only a region code already attached to the offer.
// They never turn a provider's headquarters or overall footprint into a price
// location. Codes are provider-scoped: eu-north1 on another cloud is unrelated.
const mappings: Record<string, Record<string, RegionMapping>> = {
  azure: {
    australiacentral: azure("AU", "Australia Central"), australiacentral2: azure("AU", "Australia Central 2"),
    australiaeast: azure("AU", "Australia East"), australiasoutheast: azure("AU", "Australia Southeast"),
    brazilsouth: azure("BR", "Brazil South"), canadacentral: azure("CA", "Canada Central"), canadaeast: azure("CA", "Canada East"),
    centralindia: azure("IN", "Central India"), southindia: azure("IN", "South India"), westindia: azure("IN", "West India"),
    centralus: azure("US", "Central US"), eastus: azure("US", "East US"), eastus2: azure("US", "East US 2"),
    northcentralus: azure("US", "North Central US"), southcentralus: azure("US", "South Central US"),
    westus: azure("US", "West US"), westus2: azure("US", "West US 2"), westus3: azure("US", "West US 3"),
    westcentralus: azure("US", "West Central US"),
    usgovvirginia: { country: "US", name: "US Gov Virginia", sourceUrl: REGION_MAPPING_SOURCES.azureGovernment },
    francecentral: azure("FR", "France Central"), germanywestcentral: azure("DE", "Germany West Central"),
    italynorth: azure("IT", "Italy North"), northeurope: azure("IE", "North Europe"),
    polandcentral: azure("PL", "Poland Central"), spaincentral: azure("ES", "Spain Central"),
    swedencentral: azure("SE", "Sweden Central"), uksouth: azure("GB", "UK South"), ukwest: azure("GB", "UK West"),
    westeurope: azure("NL", "West Europe"),
    indonesiacentral: azure("ID", "Indonesia Central"), japaneast: azure("JP", "Japan East"), japanwest: azure("JP", "Japan West"),
    koreacentral: azure("KR", "Korea Central"), koreasouth: azure("KR", "Korea South"),
    malaysiawest: azure("MY", "Malaysia West"), southeastasia: azure("SG", "Southeast Asia"),
    israelcentral: azure("IL", "Israel Central"), uaecentral: azure("AE", "UAE Central"), uaenorth: azure("AE", "UAE North"),
  },
  nebius: {
    "eu-north1": nebius("FI", "Finland"), "eu-north2": nebius("IS", "Iceland"),
    "eu-south1": nebius("ES", "Madrid, Spain"), "eu-west1": nebius("FR", "France"), "eu-west2": nebius("FR", "France"),
    "uk-south1": nebius("GB", "United Kingdom"), "uk-south2": nebius("GB", "United Kingdom"),
    "us-central1": nebius("US", "Kansas City, Missouri, US"), "us-north1": nebius("US", "Woodbury, Minnesota, US"),
    "me-west1": nebius("IL", "Israel"),
  },
};

type LocatedOffer = Pick<Offer, "providerSlug" | "region" | "regions" | "countryCode"> & {
  location?: Record<string, unknown> | null;
  computeCountries?: string[];
  locationSource?: Record<string, unknown> | null;
  priceScope?: string | null;
  coverageRegions?: string[];
  conditions?: string[];
  dataStatus?: Offer["dataStatus"];
};

const unpublished = /^(?:not published|unknown|unspecified|n\/?a)$/i;
const regionalScopes = new Set(["zone_quote", "regional_quote", "requested_zone_quote", "requested_region_quote"]);

export function isPlatformCoverage(offer: Pick<LocatedOffer, "priceScope" | "conditions">): boolean {
  return offer.priceScope === "platform_coverage" || (!offer.priceScope
    && Boolean(offer.conditions?.some((condition) => /\bnot a region-specific price quote\b/i.test(condition))));
}

function hasPriceLocationScope(offer: Pick<LocatedOffer, "priceScope" | "conditions" | "dataStatus">): boolean {
  return offer.dataStatus !== "seed" && (offer.priceScope ? regionalScopes.has(offer.priceScope) : !isPlatformCoverage(offer));
}

function mappingFor(provider: string, code: string): RegionMapping | undefined {
  const entries = Object.hasOwn(mappings, provider) ? mappings[provider] : undefined;
  return entries && Object.hasOwn(entries, code) ? entries[code] : undefined;
}

/** Preserve explicit source labels, including a deliberately published Global
 * label. An absent label is never promoted to Global. */
export function publishedRegionCodes(offer: Pick<Offer, "region" | "regions">): string[] {
  const labels = offer.regions ?? (offer.region ? [offer.region] : []);
  return [...new Set(labels.filter((entry) => entry.trim() && !unpublished.test(entry.trim())))];
}

/** Coverage labels describe the platform footprint, never the rate's location.
 * Older snapshots stored them in regions; scope still prevents a price claim. */
export function platformCoverageCodes(offer: LocatedOffer): string[] {
  if (!isPlatformCoverage(offer)) return [];
  return publishedRegionCodes({ region: "", regions: offer.coverageRegions ?? offer.regions });
}

export function publishedPriceRegionCodes(offer: Offer): string[] {
  return isRegionSpecificPrice(offer) ? publishedRegionCodes(offer) : [];
}

export function offerLocationLabel(offer: Offer, limit = Infinity): string {
  const coverage = isPlatformCoverage(offer);
  const codes = coverage ? platformCoverageCodes(offer) : publishedPriceRegionCodes(offer);
  if (!codes.length) return coverage ? "Platform coverage · price region unverified" : "Price region unverified";
  const names = codes.slice(0, limit).map((code) => publishedRegionLabel(offer, code)).join(" · ");
  const suffix = codes.length > limit ? ` +${codes.length - limit}` : "";
  const countryNames = new Intl.DisplayNames(["en"], { type: "region" });
  const countries = comparableCountryCodes(offer).map((code) => countryNames.of(code) ?? code).join(" · ");
  return coverage ? `Platform coverage: ${names}${suffix} · not a regional price` : `${countries ? `${countries} · ` : ""}${names}${suffix}`;
}

/** A platform's supported regions do not make its generic catalog rate a quote
 * for each of those regions. Keep coverage discoverable, but out of regional
 * price minima until the source actually binds the rate to a location. */
export function isRegionSpecificPrice(offer: Pick<Offer, "region" | "regions" | "conditions" | "dataStatus" | "priceScope">): boolean {
  return offer.dataStatus === "official-page"
    && hasPriceLocationScope(offer)
    && publishedRegionCodes(offer).some((code) => !/^global(?: listings)?$/i.test(code));
}

export function getOfferCountryCodes(offer: LocatedOffer): string[] {
  if (!hasPriceLocationScope(offer)) return [];
  const legacyGlobal = !offer.priceScope;
  const isCountry = (code: string) => /^[A-Z]{2}$/.test(code) && code !== "EU" && (!legacyGlobal || code !== "GL");
  const explicit = isCountry(offer.countryCode) ? [offer.countryCode] : [];
  const declared = (offer.computeCountries ?? []).filter(isCountry);
  const mapped = publishedRegionCodes(offer).flatMap((code) => {
    const country = mappingFor(offer.providerSlug, code)?.country;
    return country ? [country] : [];
  });
  return [...new Set([...explicit, ...declared, ...mapped])];
}

/** Narrow the codes on a multi-region record to the selected country. A known
 * code uses its own provider's mapping, never the union of the record's countries.
 * An explicitly published whole-record country can resolve unmapped codes only
 * when none of the record's documented codes contradict that country. */
export function publishedRegionsForCountry(offer: LocatedOffer, country: string): string[] {
  if (!hasPriceLocationScope(offer)) return [];
  const codes = publishedRegionCodes(offer);
  if (country === "all") return codes;
  const explicit = (offer.countryCode === country || (offer.computeCountries?.length === 1 && offer.computeCountries[0] === country))
    && country !== "EU" && (country !== "GL" || Boolean(offer.priceScope));
  const explicitIsConsistent = explicit && codes.every((code) => {
    const mapped = mappingFor(offer.providerSlug, code)?.country;
    return mapped === undefined || mapped === country;
  });
  return codes.filter((code) => {
    const mapped = mappingFor(offer.providerSlug, code)?.country;
    return mapped !== undefined ? mapped === country : explicitIsConsistent;
  });
}

/** Special region filters classify price provenance elsewhere. This helper
 * enforces the geographic join: a concrete region must belong to the selected
 * country on this same provider's source record. */
export function matchesCountryRegionSelection(offer: LocatedOffer, country: string, region: string): boolean {
  if (country !== "all" && !getOfferCountryCodes(offer).includes(country)) return false;
  if (["all", "__published", "__unpublished", "__coverage"].includes(region)) return true;
  return publishedRegionsForCountry(offer, country).includes(region);
}

/** A list of zones alone has no zone-to-region relation. It is safe to retain
 * the zones when the selection covers the record's whole location scope (as on
 * single-region UCloud records). Partial multi-region selections cannot borrow
 * the unassigned zones from another country or region. */
export function publishedZonesForSelection(offer: LocatedOffer & Pick<Offer, "zones">, country: string, region: string): string[] {
  if (!hasPriceLocationScope(offer)) return [];
  if (!matchesCountryRegionSelection(offer, country, region)) return [];
  const concreteRegion = !["all", "__published", "__unpublished", "__coverage"].includes(region);
  const selected = concreteRegion ? [region] : publishedRegionsForCountry(offer, country);
  return publishedRegionCodes(offer).every((code) => selected.includes(code)) ? [...offer.zones] : [];
}

export function offerMatchesRegion(offer: LocatedOffer, region: Pick<RegionProfile, "countryCodes" | "regionNames">): boolean {
  if (!hasPriceLocationScope(offer)) return false;
  if (offer.countryCode && region.countryCodes.includes(offer.countryCode)) return true;
  const codes = publishedRegionCodes(offer);
  if (region.regionNames.includes(offer.region) || codes.some((code) => region.regionNames.includes(code))) return true;
  return getOfferCountryCodes(offer).some((country) => region.countryCodes.includes(country));
}

/** A readable source name plus the original code. Unknown codes remain visible
 * without assigning a country or assuming they share another provider's region. */
export function publishedRegionLabel(offer: LocatedOffer, code: string): string {
  const location = offer.location;
  const sourceName = location?.region === code && typeof location.region_name === "string" ? location.region_name.trim() : "";
  const name = sourceName || mappingFor(offer.providerSlug, code)?.name;
  return name && name !== code ? `${name} (${code})` : code;
}

export function regionMappingSources(offers: readonly LocatedOffer[]): string[] {
  return [...new Set(offers.flatMap((offer) => {
    const direct = offer.locationSource?.source_url ?? offer.locationSource?.api_url;
    const source = typeof direct === "string" && /^https:\/\//.test(direct) ? [direct] : [];
    return [...source, ...publishedRegionCodes(offer).flatMap((code) => {
      const mapped = mappingFor(offer.providerSlug, code)?.sourceUrl;
      return mapped ? [mapped] : [];
    })];
  }))];
}
