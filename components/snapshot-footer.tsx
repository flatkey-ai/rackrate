import type { Offer } from "@/lib/data";
import type { SnapshotPublication } from "@/lib/public-snapshot";
import { FxDisclosure } from "@/components/fx-disclosure";
import { PricingRefresh } from "@/components/pricing-refresh";

// This belongs to the page, rather than a persistent layout, so the FX
// disclosure, visible prices and publication status always share one snapshot.
export function SnapshotFooter({ offers, generatedAt, publication }: { offers: Offer[]; generatedAt: string; publication: SnapshotPublication }) {
  return <>
    {(publication.status === "fallback" || publication.stale) && <aside className="data-notice shell" role="status"><strong>{publication.status === "fallback" ? "Showing the last validated snapshot" : "Price refresh is overdue"}</strong><p>These prices were collected {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Shanghai" }).format(new Date(generatedAt))} China time. The latest cloud refresh has not been confirmed. Original source dates remain visible; verify the provider before purchasing.</p></aside>}
    <FxDisclosure offers={offers} />
    <PricingRefresh generatedAt={generatedAt} sha256={publication.sha256} publicationStatus={publication.status} stale={publication.stale} />
  </>;
}
