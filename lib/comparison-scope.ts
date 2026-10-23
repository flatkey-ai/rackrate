import type { Offer } from "./data";
import { getOfferCountryCodes, hasVerifiedPriceLocation } from "./region-matching.ts";

/** The formal board requires a fixed hourly rate tied to verified geography.
 * Source-only catalogs, regional floors, sales enquiries and monthly records
 * remain in the unchanged source dataset for audit.
 */
export function isFormalComparisonOffer(offer: Offer): boolean {
  return offer.dataStatus === "official-page" && offer.quoteStatus === "quoted"
    && offer.billingUnit === "GPU-hour"
    && ["advertised_per_gpu", "instance_total_allocated"].includes(offer.priceBasis)
    && typeof offer.pricePerGpuUnit === "number" && Number.isFinite(offer.pricePerGpuUnit) && offer.pricePerGpuUnit > 0
    && hasVerifiedPriceLocation(offer) && getOfferCountryCodes(offer).length > 0;
}
