import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { loadBundledPricingDataset } from "@/lib/bundled-snapshot";
import { createPricingData, type PricingDataset } from "@/lib/data";
import { createSnapshotStore } from "@/lib/public-snapshot";

// Next can bundle routes separately. A process singleton shares both the last good
// snapshot and the in-flight request across the status API, metadata and all pages.
const processState = globalThis as typeof globalThis & {
  rackratePublicPricingV1?: ReturnType<typeof createSnapshotStore>;
};
const store = processState.rackratePublicPricingV1 ??= createSnapshotStore({
  fallback: loadBundledPricingDataset(),
});
const projections = new WeakMap<PricingDataset, ReturnType<typeof createPricingData>>();

export const getPricingSnapshot = cache(async () => {
  // Force request-time rendering, including helpers that do not themselves call fetch.
  // A production build must never freeze a daily pricing snapshot into the HTML.
  await connection();
  const { dataset, publication } = await store.load();
  let data = projections.get(dataset);
  if (!data) {
    data = createPricingData(dataset);
    projections.set(dataset, data);
  }
  return { ...data, publication };
});
