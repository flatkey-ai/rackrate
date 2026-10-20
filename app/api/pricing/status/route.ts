import { getPricingSnapshot } from "@/lib/pricing-snapshot";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getPricingSnapshot();
  return Response.json({ ...snapshot.pricingDatasetStatus, publication: snapshot.publication }, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
