const RETENTION_DAYS = 180;

export function appendPriceHistory(current, dataset, now = new Date(dataset.generatedAt)) {
  const snapshots = Array.isArray(current?.snapshots) ? current.snapshots : [];
  const cutoff = now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const snapshot = {
    observedAt: dataset.generatedAt,
    // One registry per observation; each offer's sourceCurrency selects its rate.
    // Repeating source URLs and formulas per SKU would exceed repository limits.
    ...(dataset.fx ? { fx: dataset.fx } : {}),
    offers: dataset.offers.map((offer) => ({
      id: offer.id,
      pricePerGpuHour: offer.pricePerGpuHour,
      ...(Object.hasOwn(offer, "pricePerGpuUnit") ? {
        pricePerGpuUnit: offer.pricePerGpuUnit,
        sourceAmount: offer.sourceAmount,
        sourceCurrency: offer.sourceCurrency,
        billingUnit: offer.billingUnit,
        quoteStatus: offer.quoteStatus,
        priceBasis: offer.priceBasis,
        pricingTier: offer.pricingTier ?? null,
        cloudTier: offer.cloudTier ?? null,
        ...(Object.hasOwn(offer, "priceUsdPerGpuUnit") ? {
          priceUsdPerGpuUnit: offer.priceUsdPerGpuUnit,
          usdSourceAmount: offer.usdSourceAmount,
        } : {}),
      } : {}),
      availability: offer.availability,
      dataStatus: offer.dataStatus,
    })),
  };
  const retained = snapshots.filter((entry) => {
    const timestamp = Date.parse(entry.observedAt);
    return Number.isFinite(timestamp) && timestamp >= cutoff && entry.observedAt !== snapshot.observedAt;
  });
  retained.push(snapshot);
  retained.sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  return { schemaVersion: 2, retentionDays: RETENTION_DAYS, snapshots: retained };
}

