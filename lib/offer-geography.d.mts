import type { Offer } from "./data";

export function comparableCountryCodes(offer: Partial<Offer>): string[];
export function isComparableRegionalOffer(offer: unknown): offer is Offer;
export function isMarketHourlyOffer(offer: unknown): offer is Offer;
export function isCatalogPriceOffer(offer: unknown): offer is Offer;
export function matchesHourlyPriceScope(offer: unknown, scope?: string): boolean;
export function offerProviderLabel(offer: Partial<Offer>, providerName?: string): string;
