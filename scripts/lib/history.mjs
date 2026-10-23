export const RETENTION_DAYS = 180;

export function observationTime(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error("Price history has an invalid observation timestamp");
  }
  return Date.parse(value);
}

export function observationDay(value) {
  return new Date(observationTime(value)).toISOString().slice(0, 10);
}

function compactOffer(offer) {
  return {
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
    };
}

export function datasetSnapshots(dataset) {
  observationTime(dataset.generatedAt);
  if (!Array.isArray(dataset.offers)) throw new Error("Price history requires offers");
  const groups = new Map();
  for (const offer of dataset.offers) {
    // New library rows carry the source observation time. Legacy callers that
    // never supplied one retain their original dataset-time behavior.
    const observedAt = Object.hasOwn(offer, "observedAt") ? offer.observedAt : dataset.generatedAt;
    observationTime(observedAt);
    if (!groups.has(observedAt)) groups.set(observedAt, {
      observedAt,
      ...(dataset.fx ? { fx: dataset.fx } : {}),
      offers: [],
    });
    groups.get(observedAt).offers.push(compactOffer(offer));
  }
  return [...groups.values()];
}

export function mergeSnapshots(existing, incoming, cutoff) {
  const snapshots = new Map();
  for (const entry of [...existing, ...incoming]) {
    if (!entry || !Array.isArray(entry.offers)) throw new Error("Price history has an invalid snapshot");
    if (observationTime(entry.observedAt) < cutoff) continue;
    const previous = snapshots.get(entry.observedAt);
    const offers = new Map();
    for (const offer of [...(previous?.offers ?? []), ...entry.offers]) {
      if (!offer || typeof offer.id !== "string" || !offer.id) throw new Error("Price history has an invalid offer identity");
      offers.set(offer.id, offer);
    }
    // A repeated timestamp is a replay, not another observation. Merge IDs so
    // separately collected sources with that timestamp do not erase each other.
    snapshots.set(entry.observedAt, { ...previous, ...entry, offers: [...offers.values()] });
  }
  return [...snapshots.values()].sort((a, b) => observationTime(a.observedAt) - observationTime(b.observedAt)
    || a.observedAt.localeCompare(b.observedAt));
}

// In-memory compatibility helper. Repository publication uses the bounded
// daily-shard planner in history-storage.mjs instead of a monolithic archive.
export function appendPriceHistory(current, dataset, now = new Date(dataset.generatedAt)) {
  const cutoff = now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(cutoff)) throw new Error("Price history has an invalid retention time");
  return {
    schemaVersion: 2, retentionDays: RETENTION_DAYS,
    snapshots: mergeSnapshots(current?.snapshots ?? [], datasetSnapshots(dataset), cutoff),
  };
}

