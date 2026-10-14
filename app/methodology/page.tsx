import type { Metadata } from "next";
import Link from "next/link";
import { absoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Pricing methodology",
  description: "How RackRate collects, normalizes, validates, and presents cloud GPU pricing.",
  alternates: { canonical: absoluteUrl("/methodology") },
  openGraph: { title: "Cloud GPU pricing methodology", description: "How RackRate collects, normalizes, validates, and presents GPU rental prices.", url: absoluteUrl("/methodology") },
};

export default function MethodologyPage() {
  return (
    <main className="method-page shell">
      <div className="breadcrumbs"><Link href="/">Home</Link><span>/</span><strong>Methodology</strong></div>
      <header className="method-header">
        <span className="eyebrow">Data contract / v1</span>
        <h1>Every number needs a receipt.</h1>
        <p>Our comparison is designed around reproducibility: preserve the original rate, attach a source, then normalize only the fields needed to make offers comparable.</p>
      </header>
      <div className="method-layout">
        <aside className="method-toc"><strong>On this page</strong><a href="#collection">01 · Collection</a><a href="#labels">02 · Source labels</a><a href="#normalization">03 · Normalization</a><a href="#availability">04 · Availability</a><a href="#ranking">05 · Ranking policy</a><a href="#limits">06 · Known limits</a></aside>
        <div className="method-sections">
          <section id="collection"><span>01</span><h2>Collection</h2><p>Automated collectors pull official public pricing pages on a six-hour schedule. Each record stores its source URL, observation time, source currency, billing unit, and normalized GPU identity. Providers without a reliable public machine-readable source remain explicitly marked as seed data until a collector is available.</p><div className="method-rule"><strong>Rule</strong><span>No source, no published price.</span></div></section>
          <section id="labels"><span>02</span><h2>Source labels</h2><p><strong>Verified official price</strong> means the record was collected from a provider-owned public pricing page during the latest successful run. <strong>Reference price</strong> means a dated public observation is retained for market context but is not covered by a reliable automated collector. Neither label proves that capacity is bookable right now.</p><div className="method-rule"><strong>Display rule</strong><span>Reference prices never masquerade as real-time provider inventory.</span></div></section>
          <section id="normalization"><span>03</span><h2>Normalization</h2><p>Hourly node prices are divided by the physical GPU count to produce a per-GPU hourly rate. Monthly commitments remain labeled as reserved; spot rates never compete silently with on-demand rates.</p><div className="formula"><code>per_gpu_hour = source_hourly_total / physical_gpu_count</code></div></section>
          <section id="availability"><span>04</span><h2>Availability</h2><p>Providers expose capacity differently. Records retain the freshest reported state and mark it available, limited, unavailable, or unknown. A published list price is not proof of current inventory, so the collector uses “check provider” unless the source exposes capacity.</p></section>
          <section id="ranking"><span>05</span><h2>Ranking and commercial policy</h2><p>Offer rows are sorted by the normalized price selected by the reader’s filters. Providers cannot pay to change that order or receive an “official” source label. Flatkey is a commercial affiliate of RackRate; its calls to action are visually separated from the comparison table and do not alter provider data, inclusion, or ranking.</p><div className="method-rule"><strong>Correction path</strong><span>Anyone can report a stale or incorrect record in the public <a href="https://github.com/flatkey-ai/rackrate/issues/new?labels=data-correction&amp;title=Data%20correction%3A%20" target="_blank" rel="nofollow noreferrer">data issue tracker ↗</a>.</span></div></section>
          <section id="limits"><span>06</span><h2>Known limits</h2><p>List prices can exclude tax, disks, data transfer, support, minimum terms, or negotiated discounts. Two nodes with the same GPU can differ significantly in CPU, memory, interconnect, storage, and delivered performance.</p><div className="method-warning"><strong>Coverage status</strong><span>RunPod, Hyperstack, Nebius, and Lambda prices are refreshed automatically from their official pricing pages. Lambda uses the lowest currently published per-GPU rate across its listed node sizes. Vast.ai and AWS remain labeled reference observations until authenticated or region-complete collectors are available.</span></div></section>
        </div>
      </div>
    </main>
  );
}
