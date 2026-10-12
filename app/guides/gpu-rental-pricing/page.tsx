import type { Metadata } from "next";
import Link from "next/link";
import { getCheapestOffer } from "@/lib/data";
import { absoluteUrl } from "@/lib/site";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export const metadata: Metadata = {
  title: "GPU rental pricing guide: compare cost per hour",
  description:
    "Learn how to compare GPU rental prices per hour, node costs, on-demand, spot, and reserved rates, egress, availability, and cloud configurations.",
  alternates: { canonical: absoluteUrl("/guides/gpu-rental-pricing") },
  openGraph: {
    title: "GPU rental pricing guide",
    description: "A practical framework for comparing cloud GPU cost per hour without losing the configuration and contract context.",
    url: absoluteUrl("/guides/gpu-rental-pricing"),
    type: "article",
  },
};

const faqItems = [
  {
    question: "Why do GPU rental prices keep falling?",
    answer:
      "They do not fall uniformly. Lower visible prices can come from newer supply, older accelerators moving down-market, spot inventory, marketplace competition, longer commitments, or a different node configuration. Compare like with like before calling a change a market trend.",
  },
  {
    question: "Is the cheapest price per GPU hour always the best deal?",
    answer:
      "No. A cheaper accelerator can take longer to finish a job, and a low per-GPU price can sit inside an expensive multi-GPU node. Time-to-result, utilization, memory fit, data transfer, reliability, and engineering effort all affect delivered cost.",
  },
  {
    question: "How should I track GPU rental prices over time?",
    answer:
      "Store the observation date, provider, exact GPU, GPU count, location, purchase model, availability state, and complete node specification. A historical series is useful only when the underlying offer remains comparable.",
  },
];

export default function GpuRentalPricingGuide() {
  const h100 = getCheapestOffer("nvidia-h100");
  const a100 = getCheapestOffer("nvidia-a100-80gb");

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };

  return (
    <main className="guide-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <section className="guide-hero shell">
        <div className="breadcrumbs"><Link href="/">Home</Link><span>/</span><span>Guides</span><span>/</span><strong>GPU rental pricing</strong></div>
        <div className="guide-hero-grid">
          <div>
            <span className="eyebrow">Procurement field guide · 12 min read</span>
            <h1>How to compare GPU rental prices per hour.</h1>
            <p>The number in the pricing table is the beginning of the analysis, not the answer. This guide explains how to normalize cloud GPU offers, expose hidden cost, and turn a cheap-looking listing into a defensible capacity decision.</p>
          </div>
          <aside className="guide-summary">
            <strong>Decision in one sentence</strong>
            <p>Choose the least expensive configuration that fits the workload, finishes within the required time, and can actually be delivered under acceptable terms.</p>
            <div><span>Compare</span><b>GPU · node · region · terms</b></div>
          </aside>
        </div>
      </section>

      <div className="guide-layout shell">
        <aside className="guide-toc">
          <strong>In this guide</strong>
          <a href="#unit">01 · Pick the right unit</a>
          <a href="#models">02 · Compare models</a>
          <a href="#purchase">03 · Purchase models</a>
          <a href="#hidden-cost">04 · Hidden cost</a>
          <a href="#trend">05 · Price trends</a>
          <a href="#checklist">06 · Quote checklist</a>
          <a href="#faq">07 · FAQ</a>
        </aside>

        <article className="guide-article">
          <div className="guide-lede">
            <p><strong>GPU rental pricing is unusually easy to misread.</strong> Providers may quote a physical GPU, a fraction of a GPU, a complete multi-GPU server, a preemptible instance, or a monthly commitment. The same accelerator name can sit beside different CPUs, RAM, storage, networking, support, and regional availability.</p>
            <p>RackRate keeps the original purchase model visible and normalizes sample listings to a per-physical-GPU hourly rate. You should still carry the total node rate and operational constraints into the final comparison.</p>
          </div>

          <section id="unit">
            <span className="guide-section-number">01</span>
            <h2>Start with two units: per GPU-hour and total node-hour.</h2>
            <p>A per-GPU rate lets you compare accelerator cost across differently sized machines. Divide the complete hourly server price by its physical GPU count. Then retain the node total because that is usually what the bill sees.</p>
            <div className="guide-formula"><code>normalized GPU price = hourly node price ÷ physical GPU count</code></div>
            <div className="guide-example">
              <div><span>Illustrative node</span><strong>8× H100</strong></div>
              <div><span>Node price</span><strong>$20.00/hr</strong></div>
              <div><span>Normalized</span><strong>$2.50/GPU/hr</strong></div>
            </div>
            <p>Do not compare that $2.50 figure with a one-GPU listing without noticing the minimum eight-GPU commitment. For a short single-GPU inference job, the nominally more expensive one-GPU machine may cost less in total.</p>
          </section>

          <section id="models">
            <span className="guide-section-number">02</span>
            <h2>Compare the GPU that fits, not every GPU on the market.</h2>
            <p>Filter by memory capacity and software compatibility before sorting by price. If weights, activations, KV cache, optimizer state, or batch size do not fit, the low hourly rate is irrelevant. If several accelerators fit, estimate time-to-result and expected utilization.</p>
            <div className="guide-model-links">
              <Link href="/gpus/nvidia-h100"><span>Training and inference</span><strong>H100 GPU rental prices</strong><small>Sample floor {h100 ? money.format(h100.pricePerGpuHour) : "—"}/GPU/hr →</small></Link>
              <Link href="/gpus/nvidia-h200"><span>High-memory inference</span><strong>H200 GPU price comparison</strong><small>141 GB HBM3e →</small></Link>
              <Link href="/gpus/nvidia-a100-80gb"><span>Mature cloud capacity</span><strong>A100 GPU rental prices</strong><small>Sample floor {a100 ? money.format(a100.pricePerGpuHour) : "—"}/GPU/hr →</small></Link>
              <Link href="/gpus/nvidia-b200"><span>Blackwell capacity</span><strong>NVIDIA B200 rental prices</strong><small>180 GB HBM3e →</small></Link>
            </div>
            <div className="guide-note"><strong>Looking for B300?</strong><p>This launch dataset does not contain a verifiable B300 cloud rental offer. We would rather show no number than invent a future GPU price.</p></div>
          </section>

          <section id="purchase">
            <span className="guide-section-number">03</span>
            <h2>Separate on-demand, spot, and reserved pricing.</h2>
            <div className="guide-three-col">
              <div><h3>On-demand</h3><p>Useful for flexible start and stop times. Check billing granularity, minimum charges, and whether listed capacity is immediately available.</p></div>
              <div><h3>Spot or preemptible</h3><p>Potentially cheaper, but interruption risk belongs in the cost model. Include checkpoint frequency, restart time, and lost work.</p></div>
              <div><h3>Reserved</h3><p>A lower effective rate may require a term, deposit, volume, or fixed schedule. Compare the committed spend, not only the displayed hourly equivalent.</p></div>
            </div>
            <p>A credible comparison never lets a spot price silently “win” against an on-demand rate. The purchase model changes both economics and operational risk.</p>
          </section>

          <section id="hidden-cost">
            <span className="guide-section-number">04</span>
            <h2>Add the costs that do not appear beside the GPU.</h2>
            <ul className="guide-cost-list">
              <li><strong>Idle and queue time</strong><span>Provisioning, environment setup, failed jobs, and unused reservations still consume budget.</span></li>
              <li><strong>Storage</strong><span>Persistent volumes, snapshots, high-throughput disks, and retained checkpoints may be billed separately.</span></li>
              <li><strong>Data transfer</strong><span>Internet egress, inter-region transfer, and cross-zone traffic can dominate data-heavy workflows.</span></li>
              <li><strong>Networking and interconnect</strong><span>Training scale depends on topology and bandwidth; identical GPU counts do not imply identical cluster performance.</span></li>
              <li><strong>Engineering and reliability</strong><span>Image support, orchestration, observability, replacement capacity, and support response affect delivered cost.</span></li>
            </ul>
            <p>Provider pages help surface these differences. Start with the indexed <Link href="/providers/vast-ai">Vast.ai GPU rental prices</Link> or <Link href="/providers/runpod">Runpod GPU rental prices</Link>, then verify current terms at the source.</p>
          </section>

          <section id="trend">
            <span className="guide-section-number">05</span>
            <h2>Track comparable offers before calling something a trend.</h2>
            <p>GPU rental prices over time can move because supply changes, a provider refreshes hardware, marketplace hosts enter or leave, or a listing switches purchase model. A chart that mixes regions, node sizes, or spot and on-demand rates can imply a trend that the underlying market does not support.</p>
            <div className="trend-fields">
              <strong>Minimum fields for a price history</strong>
              <span>Observation time</span><span>Provider</span><span>Exact GPU</span><span>GPU count</span><span>Region</span><span>Rental type</span><span>Node specification</span><span>Availability</span>
            </div>
            <p>The launch repository uses clearly labeled sample observations. It does not claim to measure a live decline, increase, or historical market average.</p>
          </section>

          <section id="checklist">
            <span className="guide-section-number">06</span>
            <h2>Turn the shortlist into a quote you can compare.</h2>
            <ol className="quote-checklist">
              <li><span>01</span><p>Name the exact GPU model, memory size, quantity, and acceptable equivalents.</p></li>
              <li><span>02</span><p>Specify deployment region, earliest start date, expected duration, and scale-up plan.</p></li>
              <li><span>03</span><p>Request CPU, RAM, storage, interconnect, network, and virtualization details.</p></li>
              <li><span>04</span><p>Separate usage rate, egress, disks, support, tax, and any commitment or setup charge.</p></li>
              <li><span>05</span><p>Confirm capacity hold, replacement policy, interruption terms, and quote expiration.</p></li>
            </ol>
            <div className="guide-cta">
              <div><span className="eyebrow">Put the framework to work</span><h2>Compare the sample price board.</h2><p>Apply the checklist to GPU, provider, region, configuration, and purchase-model records in one view.</p></div>
              <Link className="button button-primary" href="/#prices">Open the price comparison <span>→</span></Link>
            </div>
          </section>

          <section id="faq" className="guide-faq">
            <span className="guide-section-number">07</span>
            <h2>GPU rental pricing FAQ</h2>
            {faqItems.map((faq) => <div key={faq.question}><h3>{faq.question}</h3><p>{faq.answer}</p></div>)}
          </section>
        </article>
      </div>
    </main>
  );
}
