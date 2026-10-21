// One eligibility rule is shared by the website projection and application CSV.
// Audit snapshots retain every collected record; presentation never repairs one.
const regionalScopes = new Set(["regional_quote", "zone_quote", "requested_region_quote", "requested_zone_quote"]);
const isoCountries = new Set(("AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW").split(" "));
const missingRegion = /^(?:global(?: listings)?|all(?: regions)?|worldwide|not (?:published|listed|available)|unknown|unverified|unspecified|unlocated|n\/?a|none|—|-)$/i;

export function comparableCountryCodes(offer) {
  const declared = [...(Array.isArray(offer?.computeCountries) ? offer.computeCountries : []), offer?.countryCode].filter(Boolean);
  return [...new Set(declared.filter((code) => typeof code === "string" && isoCountries.has(code)))];
}

export function isComparableRegionalOffer(offer) {
  if (!offer || offer.dataStatus !== "official-page" || offer.billingUnit !== "GPU-hour"
      || offer.quoteStatus !== "quoted" || !regionalScopes.has(offer.priceScope)
      || ["gpu_component", "starting_price"].includes(offer.priceBasis)
      || (offer.regionPriceVerified !== undefined && offer.regionPriceVerified !== true) || !comparableCountryCodes(offer).length
      || [offer.sourceAvailability, offer.availability].some((status) => ["offline", "ended", "upcoming", "unavailable"].includes(status))
      || !Array.isArray(offer.regions) || !offer.regions.length
      || offer.regions.some((region) => typeof region !== "string" || !region.trim() || missingRegion.test(region.trim()))
      || ["monthly", "Monthly"].includes(offer.billingMode ?? offer.rentalType)) return false;
  const amount = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
  if (!amount(offer.pricePerGpuUnit) || !amount(offer.priceUsdPerGpuUnit)) return false;
  if (!/^[A-Z]{3}$/.test(offer.sourceCurrency ?? "") || typeof offer.sourceAmount !== "string"
      || !/^\d+(?:\.\d+)?$/.test(offer.sourceAmount)
      || Number(offer.sourceAmount) !== offer.pricePerGpuUnit) return false;
  if (offer.instanceBillingUnit != null && offer.instanceBillingUnit !== "instance-hour") return false;
  if (offer.priceBasis === "instance_total_allocated" && (offer.instanceBillingUnit !== "instance-hour"
      || !amount(offer.instancePrice) || typeof offer.instanceSourceAmount !== "string"
      || !/^\d+(?:\.\d+)?$/.test(offer.instanceSourceAmount) || Number(offer.instanceSourceAmount) !== offer.instancePrice
      || !Number.isSafeInteger(offer.gpuCount) || offer.gpuCount < 1)) return false;
  return true;
}
