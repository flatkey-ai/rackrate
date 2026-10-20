import { pricingDatasetStatus } from "@/lib/data";

export function GET() {
  return Response.json(pricingDatasetStatus, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
