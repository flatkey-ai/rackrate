const RETENTION_DAYS = 180;

export function appendPriceHistory(current, dataset, now = new Date(dataset.generatedAt)) {
  const snapshots = Array.isArray(current?.snapshots) ? current.snapshots : [];
  const cutoff = now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const snapshot = {
    observedAt: dataset.generatedAt,
    offers: dataset.offers.map((offer) => ({
      id: offer.id,
      pricePerGpuHour: offer.pricePerGpuHour,
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
  return { schemaVersion: 1, retentionDays: RETENTION_DAYS, snapshots: retained };
}

