import type { Offer } from "./data";

export function comparableCountryCodes(offer: Partial<Offer>): string[];
export function isComparableRegionalOffer(offer: unknown): offer is Offer;
