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
        <aside className="method-toc"><strong>On this page</strong><a href="#collection">01 · Collection</a><a href="#normalization">02 · Normalization</a><a href="#availability">03 · Availability</a><a href="#limits">04 · Known limits</a></aside>
        <div className="method-sections">
          <section id="collection"><span>01</span><h2>Collection</h2><p>Automated collectors pull official public pricing pages on a six-hour schedule. Each record stores its source URL, observation time, source currency, billing unit, and normalized GPU identity. Providers without a reliable public machine-readable source remain explicitly marked as seed data until a collector is available.</p><div className="method-rule"><strong>Rule</strong><span>No source, no published price.</span></div></section>
          <section id="normalization"><span>02</span><h2>Normalization</h2><p>Hourly node prices are divided by the physical GPU count to produce a per-GPU hourly rate. Monthly commitments remain labeled as reserved; spot rates never compete silently with on-demand rates.</p><div className="formula"><code>per_gpu_hour = source_hourly_total / physical_gpu_count</code></div></section>
          <section id="availability"><span>03</span><h2>Availability</h2><p>Providers expose capacity differently. Records retain the freshest reported state and mark it available, limited, unavailable, or unknown. A published list price is not proof of current inventory, so the collector uses “check provider” unless the source exposes capacity.</p></section>
          <section id="limits"><span>04</span><h2>Known limits</h2><p>List prices can exclude tax, disks, data transfer, support, minimum terms, or negotiated discounts. Two nodes with the same GPU can differ significantly in CPU, memory, interconnect, storage, and delivered performance.</p><div className="method-warning"><strong>Coverage status</strong><span>RunPod and Hyperstack prices are refreshed automatically from their official pricing pages. Other providers remain labeled seed observations while their collectors are implemented and validated.</span></div></section>
        </div>
      </div>
    </main>
  );
}
