import Link from "next/link";
import { flatkeyWebsiteUrl } from "@/lib/site";

export function FlatkeyRecommendation({ content }: { content: string }) {
  return (
    <aside className="explorer-conversion flatkey-recommendation" aria-label="Flatkey quote request">
      <div>
        <span className="eyebrow">Flatkey Compute</span>
        <strong>Put a configuration behind the price.</strong>
        <span>Share your GPU, quantity, region and duration with Flatkey to request a matched configuration and formal quote.</span>
        <span>Price and delivery are confirmed per quote. Commercial partner · <Link href="/methodology#ranking">How we compare →</Link></span>
      </div>
      <a className="button button-primary" href={flatkeyWebsiteUrl(content, "gpu_quote")} target="_blank" rel="sponsored nofollow noreferrer">Request a Flatkey quote <span>↗</span></a>
    </aside>
  );
}
