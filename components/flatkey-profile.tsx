import Link from "next/link";
import { flatkeyWebsiteUrl } from "@/lib/site";

export function FlatkeyProfile() {
  return (
    <main className="detail-main provider-detail">
      <section className="provider-hero shell">
        <div className="breadcrumbs"><Link href="/">Home</Link><span>/</span><Link href="/providers">Providers</Link><span>/</span><strong>Flatkey</strong></div>
        <div className="provider-hero-grid">
          <div>
            <span className="eyebrow">GPU cloud · United States</span>
            <h1>Flatkey Compute</h1>
            <p>GPU capacity matched to your workload, with configuration, region, price and delivery conditions confirmed in a formal quote.</p>
            <a className="button button-primary hero-flatkey-cta" href={flatkeyWebsiteUrl("flatkey_profile_quote", "gpu_quote")} target="_blank" rel="sponsored nofollow noreferrer">Request a GPU quote <span>↗</span></a>
          </div>
          <div className="provider-scorecard">
            <div><span>Pricing</span><strong className="text-value">By quote</strong><small>for the requested configuration</small></div>
            <div><span>Region</span><strong className="text-value">Per request</strong><small>confirmed before commitment</small></div>
            <div><span>Provisioning</span><strong className="text-value">Agreed plan</strong><small>timing set out in the quote</small></div>
            <div><span>Service</span><strong className="text-value">Request-based</strong><small>no instant self-service creation</small></div>
          </div>
        </div>
      </section>

      <section className="detail-content shell">
        <div className="directory-intro">
          <div><span className="eyebrow">Why consider Flatkey</span><h2>Scope the deployment alongside the price.</h2></div>
          <p>Consider Flatkey when you need a proposed configuration and delivery terms for a specific workload. Use RackRate’s sourced rates to assess the resulting quote under equivalent conditions.</p>
        </div>
        <div className="principle-grid">
          <article><span>01</span><h3>Workload-based matching</h3><p>Describe the model, GPU count and operating requirements so the proposed configuration can be checked against the job.</p></article>
          <article><span>02</span><h3>A quote with context</h3><p>Confirm the price alongside the region, configuration, delivery conditions and validity period.</p></article>
          <article><span>03</span><h3>Terms for the project</h3><p>Discuss flexible, reserved or dedicated capacity requests according to duration and deployment requirements.</p></article>
        </div>

        <div className="flatkey-profile-steps">
          <div className="detail-section-heading"><div><span className="eyebrow">Prepare your request</span><h2>Make the quote comparable.</h2></div></div>
          <ol className="quote-checklist">
            <li><span>01</span><p>Specify the GPU model or memory requirement, quantity and workload. Include acceptable alternatives.</p></li>
            <li><span>02</span><p>State the preferred region, start date, duration, storage and interconnect requirements.</p></li>
            <li><span>03</span><p>Review the proposed node, total cost, capacity confirmation, delivery schedule and contractual terms before committing.</p></li>
          </ol>
        </div>

        <aside className="data-notice">
          <strong>Service details and pricing basis</strong>
          <div>
            <p>Based on <a href={flatkeyWebsiteUrl("flatkey_profile_source")} target="_blank" rel="sponsored nofollow noreferrer">Flatkey’s official service overview ↗</a>, reviewed October 15, 2026. Requests lead to a scoped quote; online self-service deployment is not currently offered. RackRate does not list a verified Flatkey rental rate, and Flatkey’s public market references are not treated as bookable offers. Model, quantity, location, availability and price require confirmation.</p>
            <p>Flatkey is RackRate’s commercial partner. Directory placement does not imply a lower price or better performance than other providers.</p>
          </div>
          <Link href="/methodology#ranking">Read our commercial and ranking policy →</Link>
        </aside>
        <div className="detail-next-links"><Link href="/#prices"><span>Market context</span><strong>Compare sourced GPU rates →</strong></Link><Link href="/guides/gpu-rental-pricing"><span>Quote checklist</span><strong>Evaluate the complete deployment cost →</strong></Link></div>
      </section>
    </main>
  );
}
