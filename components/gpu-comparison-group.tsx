import Link from "next/link";
import { Fragment, useState } from "react";
import type { Gpu, Offer, Provider } from "@/lib/data";
import type { OfferComparisonGroup, OfferComparisonBucket } from "@/lib/offer-comparison";
import { offerAudience, hasAdditionalEligibility } from "@/lib/offer-comparison";
import { availabilityLabel, billingUnitLabel, formatAmount, formatOfferPrice, priceBasisLabel } from "@/lib/pricing";
import { OfferDetails } from "./offer-details";
import styles from "./price-explorer.module.css";

function Chevron({ open = false }: { open?: boolean }) {
  return <svg viewBox="0 0 20 20" aria-hidden="true" data-open={open}><path d="m6 8 4 4 4-4" /></svg>;
}

function RateLabel({ offer }: { offer: Offer }) {
  const audience = offerAudience(offer);
  return <><span className={`${styles.rateLabel} ${audience === "member" ? styles.memberRate : audience === "conditional" ? styles.conditional : styles.regularRate}`}>{audience === "member" ? "Member rate" : audience === "conditional" ? "Eligibility rate" : "Regular rate"}</span>{audience === "member" && hasAdditionalEligibility(offer) && <span className={styles.conditional}>Conditions apply</span>}</>;
}

function OfferTerms({ offer }: { offer: Offer }) {
  return <div className={styles.terms}>
    <div className={styles.badges}><RateLabel offer={offer} /></div>
    <div className={styles.badges}>
      <span className={`${styles.status} ${offer.availability === "unavailable" ? styles.offline : ""}`} data-availability={offer.dataStatus === "seed" ? "unknown" : offer.availability}><i />{offer.dataStatus === "seed" ? "Historical reference" : availabilityLabel[offer.availability]}</span>
      {offer.priceBasis === "gpu_component" && <span className={styles.conditional}>GPU component</span>}
      {offer.quoteStatus === "starting_at" && <span className={styles.conditional}>Starting price</span>}
    </div>
  </div>;
}

function OfferPrice({ offer, bucket }: { offer: Offer; bucket: OfferComparisonBucket }) {
  const regular = bucket.lowestRegularIds.includes(offer.id);
  const member = bucket.lowestMemberIds.includes(offer.id);
  return <div className={`${styles.price} ${regular ? styles.lowestPrice : member ? styles.lowestMemberPrice : ""}`}>
    {(regular || member) && <span className={`${styles.lowestBadge} ${member ? styles.lowestMemberBadge : ""}`}>{regular ? "Lowest regular" : "Lowest member"}</span>}
    <strong>{formatOfferPrice(offer)}</strong><span>per {billingUnitLabel(offer)}</span>
    {offer.sourceCurrency !== "USD" && offer.pricePerGpuUnit !== null && <small>{formatAmount(offer.pricePerGpuUnit, offer.sourceCurrency)} original · FX {offer.fx?.rateDate ?? "unavailable"}</small>}
  </div>;
}

function BucketHeading({ bucket }: { bucket: OfferComparisonBucket }) {
  const memory = bucket.vramGb == null ? "Memory not published" : `${bucket.vramGb} GB`;
  const variant = bucket.gpuVariant || "Variant not published";
  const basis = bucket.priceBasis === "full_price" ? "Full configuration price" : priceBasisLabel({ priceBasis: bucket.priceBasis } as Offer);
  return <div className={styles.bucketHeading}>
    <h4>{memory}<span> / </span>{variant}</h4>
    <p>{bucket.rentalType} · per {bucket.billingUnit === "GPU-month" ? "GPU-month" : "GPU-hour"} · {basis}<span className={styles.sortHint}>USD low → high</span></p>
  </div>;
}

export function GpuComparisonGroup({ group, gpu, providers, id }: { group: OfferComparisonGroup; gpu: Gpu; providers: Map<string, Provider>; id: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const platformCount = new Set(group.offers.map((offer) => offer.providerSlug)).size;
  const configuration = (offer: Offer) => [offer.gpuCount !== null ? `${offer.gpuCount}× GPU` : null, offer.cloudTier, offer.vcpu ? `${offer.vcpu} vCPU` : null, offer.ramGb ? `${offer.ramGb} GB RAM` : null].filter(Boolean).join(" · ") || "See configuration details";
  const toggle = (offerId: string) => setExpanded(expanded === offerId ? null : offerId);
  return <section className={styles.modelGroup} aria-label={`${gpu.shortName} price comparison`}>
    <header className={styles.modelHeading}><div><span className={styles.modelIcon} aria-hidden="true">▦</span><h3><Link href={`/gpus/${gpu.slug}`}>{gpu.shortName}</Link></h3></div><p>{platformCount} {platformCount === 1 ? "platform" : "platforms"}<span>·</span>{group.offers.length} offers</p></header>
    {group.buckets.map((bucket, index) => <div className={styles.comparisonBucket} key={bucket.key}>
      <BucketHeading bucket={bucket} />
      <div className={styles.desktopResults}>
        <table className={styles.table}><caption className="sr-only">{gpu.shortName}, {bucket.vramGb ?? "unpublished"} GB, {bucket.gpuVariant ?? "unpublished variant"}, {bucket.rentalType}, {bucket.billingUnit}. USD prices ascending. Lowest labels apply within this configuration.</caption><thead><tr><th scope="col">Platform / Configuration</th><th scope="col">Region / Zone</th><th scope="col">Rate / Availability</th><th scope="col" className={styles.priceHeading}>Price in USD</th><th scope="col"><span className="sr-only">Offer details</span></th></tr></thead><tbody>{bucket.offers.map((offer) => {
          const provider = providers.get(offer.providerSlug)!;
          const open = expanded === offer.id;
          const low = bucket.lowestRegularIds.includes(offer.id);
          return <Fragment key={offer.id}><tr className={`${low ? styles.lowestRow : ""} ${open ? styles.selectedRow : ""}`}>
            <td><Link className={styles.platformName} href={`/providers/${provider.slug}`}>{provider.name}</Link><div className={styles.modelMeta}>{configuration(offer)}</div></td>
            <td><span className={styles.location}>{offer.regions.length ? offer.regions.join(" · ") : "Not published"}</span>{offer.zones.length > 0 && <small className={styles.zone}>{offer.zones.join(" · ")}</small>}</td>
            <td><OfferTerms offer={offer} /></td><td><OfferPrice offer={offer} bucket={bucket} /></td>
            <td><button className={styles.detailsButton} type="button" aria-label={`${open ? "Hide" : "View"} ${gpu.shortName} on ${provider.name} details`} aria-expanded={open} aria-controls={open ? `${id}-desktop-${offer.id}` : undefined} onClick={() => toggle(offer.id)}>Details<Chevron open={open} /></button></td>
          </tr>{open && <tr className={styles.expandedRow} id={`${id}-desktop-${offer.id}`}><td colSpan={5}><div className={styles.details}><OfferDetails offer={offer} /></div></td></tr>}</Fragment>;
        })}</tbody></table>
      </div>
      <div className={styles.mobileResults} aria-label={`${gpu.shortName} ${index + 1} configuration offers`}>{bucket.offers.map((offer) => {
        const provider = providers.get(offer.providerSlug)!;
        const open = expanded === offer.id;
        const low = bucket.lowestRegularIds.includes(offer.id);
        return <article key={offer.id} className={`${styles.offerCard} ${low ? styles.lowestCard : ""}`}>
          <div className={styles.cardTop}><div><Link className={styles.platformName} href={`/providers/${provider.slug}`}>{provider.name}</Link></div><OfferPrice offer={offer} bucket={bucket} /></div>
          <div className={styles.cardConfiguration}>{configuration(offer)}</div><OfferTerms offer={offer} />
          <div className={styles.cardBottom}><span className={styles.location}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16 8c0 4-6 9-6 9S4 12 4 8a6 6 0 1 1 12 0Z" /><circle cx="10" cy="8" r="2" /></svg><span>{offer.regions.length ? offer.regions.join(" · ") : "Region not published"}{offer.zones.length > 0 && <small>{offer.zones.join(" · ")}</small>}</span></span><button className={styles.detailsButton} type="button" aria-label={`${open ? "Hide" : "View"} ${gpu.shortName} on ${provider.name} details`} aria-expanded={open} aria-controls={open ? `${id}-mobile-${offer.id}` : undefined} onClick={() => toggle(offer.id)}>Details<Chevron open={open} /></button></div>
          {open && <div className={styles.details} id={`${id}-mobile-${offer.id}`}><OfferDetails offer={offer} /></div>}
        </article>;
      })}</div>
    </div>)}
  </section>;
}
