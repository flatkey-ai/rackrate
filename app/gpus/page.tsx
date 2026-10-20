import type { Metadata } from "next";
import Link from "next/link";
import { getCheapestOffer, getOffersForGpu, gpus, gpuMemoryLabel, providers } from "@/lib/data";
import { formatBenchmarkPrice } from "@/lib/pricing";
import { absoluteUrl, flatkeyWebsiteUrl } from "@/lib/site";


export const metadata: Metadata = {
  title: "GPU rental prices by model: H100, H200, A100 & more",
  description:
    "Compare sourced GPU rental prices per hour for NVIDIA H100, H200, B200, A100 80GB, L40S, and RTX 4090 cloud instances.",
  alternates: { canonical: absoluteUrl("/gpus") },
  openGraph: {
    title: "GPU rental prices by model",
    description: "Compare hourly cloud GPU rates, memory, architecture, providers, and available configurations.",
    url: absoluteUrl("/gpus"),
  },
};

const faqs = [
  {
    question: "How much does it cost to rent a GPU per hour?",
    answer:
      "The hourly cost depends on the accelerator, node configuration, region, and purchase model. The indexed offers range from budget single-GPU listings to multi-GPU datacenter nodes; use each model page for a normalized per-GPU comparison.",
  },
  {
    question: "Should I compare per-GPU price or total node price?",
    answer:
      "Use the per-GPU rate to compare accelerator cost, then check total node price before budgeting. A low normalized rate on an eight-GPU node can still require a much larger hourly commitment.",
  },
  {
    question: "Do you list a B300 GPU price?",
    answer:
      "Yes. B300 prices are collected from public provider sources. Each listing keeps its configuration, price basis and purchase conditions; published prices do not confirm stock.",
  },
];

export default function GpusIndexPage() {
  const marketFloor = getCheapestOffer();

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };

  return (
    <main className="directory-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <section className="directory-hero shell">
        <div className="breadcrumbs"><Link href="/">Home</Link><span>/</span><strong>GPUs</strong></div>
        <div className="directory-hero-grid">
          <div>
            <span className="eyebrow">GPU rental price index</span>
            <h1>Compare GPU prices by model.</h1>
            <p>Compare accelerators by memory, architecture and sourced hourly rates. Once you have a model in mind, ask Flatkey to match the GPU count, region and duration to your workload. Card benchmarks use on-demand GPU-hour quotes displayed in USD, with dated ECB conversions where needed. Offline, reference, starting, member and GPU-component rates are excluded. Original prices, periods and FX rates stay visible on each model page and in the exchange-rate disclosure below.</p>
          </div>
          <div className="directory-summary">
            <div><span>Models tracked</span><strong>{gpus.length}</strong></div>
            <div><span>Providers profiled</span><strong>{providers.length}</strong></div>
            <div><span>USD on-demand benchmark</span><strong>{formatBenchmarkPrice(marketFloor)}</strong><small>per GPU / hr</small></div>
          </div>
        </div>
      </section>

      <section className="directory-content shell">
        <div className="directory-intro">
          <div><span className="eyebrow">Hourly accelerator index</span><h2>From RTX 4090 experiments to H200 inference.</h2></div>
          <p>Sticker price is only the first filter. Open a model page to compare node size, CPU and RAM allocation, location, rental terms, availability, and the total hourly commitment.</p>
        </div>
        <div className="directory-card-grid gpu-directory-grid">
          {gpus.map((gpu) => {
            const gpuOffers = getOffersForGpu(gpu.slug);
            const cheapest = getCheapestOffer(gpu.slug);
            const providerCount = new Set(gpuOffers.map((offer) => offer.providerSlug)).size;
            return (
              <article className="directory-card" key={gpu.slug}>
                <div className="directory-card-meta"><span>{gpu.vendor}</span><span>{gpu.tier}</span></div>
                <Link href={`/gpus/${gpu.slug}`}><h2>{gpu.shortName}</h2></Link>
                <p>{gpu.summary}</p>
                <dl className="directory-facts">
                  <div><dt>Memory</dt><dd>{gpuMemoryLabel(gpu)}</dd></div>
                  <div><dt>Architecture</dt><dd>{gpu.architecture}</dd></div>
                  <div><dt>Indexed listings</dt><dd>{gpuOffers.length} across {providerCount} provider{providerCount === 1 ? "" : "s"}</dd></div>
                </dl>
                <div className="directory-card-foot">
                  <span>USD on-demand <strong>{formatBenchmarkPrice(cheapest)}</strong>/hr</span>
                  <Link href={`/gpus/${gpu.slug}`}>Compare {gpu.shortName} prices →</Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="selection-guide">
        <div className="shell">
          <div className="section-heading split-heading inverse">
            <div><span className="eyebrow">Selection framework</span><h2>Match memory first. Optimize price second.</h2></div>
            <p>Model weights, context length, batch size, optimizer state, and parallelism determine memory demand. Once the workload fits, compare the delivered node rather than the GPU label alone.</p>
          </div>
          <div className="selection-grid">
            <article><span>24–48 GB</span><h3>Prototyping and inference</h3><p>RTX 4090 and L40S listings can suit smaller models, image generation, development, and throughput-focused inference.</p></article>
            <article><span>80 GB</span><h3>Mature datacenter capacity</h3><p>A100 80GB and H100 are common comparison points for training, fine-tuning, and larger production inference.</p></article>
            <article><span>141–180 GB</span><h3>High-memory workloads</h3><p>H200 and B200 reduce memory pressure for large weights, long contexts, and memory-bound inference pipelines.</p></article>
          </div>
          <div className="selection-links">
            <Link href="/guides/gpu-rental-pricing">Read the GPU rental pricing guide →</Link>
            <Link href="/regions">Compare GPU cloud regions →</Link>
          </div>
        </div>
      </section>

      <section className="faq-section shell">
        <div className="faq-heading"><span className="eyebrow">Buyer questions</span><h2>GPU rental price FAQ</h2></div>
        <div className="faq-list">
          {faqs.map((faq) => <article key={faq.question}><h3>{faq.question}</h3><p>{faq.answer}</p></article>)}
        </div>
        <div className="conversion-band">
          <div><span className="eyebrow">Your GPU shortlist</span><h2>Turn the model choice into a quote.</h2><p>Share the GPU model, quantity, region and duration with Flatkey. Use the indexed rates to evaluate the quoted configuration and total cost.</p></div>
          <a className="button button-primary" href={flatkeyWebsiteUrl("gpu_directory_quote")} target="_blank" rel="sponsored nofollow noreferrer">Request a Flatkey quote <span>↗</span></a>
        </div>
      </section>
    </main>
  );
}
