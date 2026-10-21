import type { Offer, RegionProfile } from "./data";

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
};

const unpublished = /^(?:not published|unknown|unspecified|n\/?a)$/i;

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

/** A platform's supported regions do not make its generic catalog rate a quote
 * for each of those regions. Keep coverage discoverable, but out of regional
 * price minima until the source actually binds the rate to a location. */
export function isRegionSpecificPrice(offer: Pick<Offer, "region" | "regions" | "conditions" | "dataStatus">): boolean {
  return offer.dataStatus === "official-page"
    && publishedRegionCodes(offer).some((code) => !/^global(?: listings)?$/i.test(code))
    && !offer.conditions.some((condition) => /\bnot a region-specific price quote\b/i.test(condition));
}

export function getOfferCountryCodes(offer: LocatedOffer): string[] {
  const explicit = /^[A-Z]{2}$/.test(offer.countryCode) && !["EU", "GL"].includes(offer.countryCode) ? [offer.countryCode] : [];
  const mapped = publishedRegionCodes(offer).flatMap((code) => {
    const country = mappingFor(offer.providerSlug, code)?.country;
    return country ? [country] : [];
  });
  return [...new Set([...explicit, ...mapped])];
}

export function offerMatchesRegion(offer: LocatedOffer, region: Pick<RegionProfile, "countryCodes" | "regionNames">): boolean {
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
  return [...new Set(offers.flatMap((offer) => publishedRegionCodes(offer).flatMap((code) => {
    const source = mappingFor(offer.providerSlug, code)?.sourceUrl;
    return source ? [source] : [];
  })))];
}
