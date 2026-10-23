import { getPricingSnapshot } from "@/lib/pricing-snapshot";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getPricingSnapshot();
  return Response.json({ ...snapshot.pricingDatasetStatus, publication: snapshot.publication,
    runtimeCapabilities: { publicationContract: "regional-hourly-v2", collectorVersions: ["0.24.0"],
      providers: ["nebius", "crusoe", "lambda", "ucloud", "autodl", "runpod", "azure", "digitalocean", "verda", "vast"],
      snapshotSchemaVersion: 2, maxSnapshotBytes: 64 * 1024 * 1024 } }, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
