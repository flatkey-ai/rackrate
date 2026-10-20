import type { Offer } from "@/lib/data";

export function FxDisclosure({ offers }: { offers: Offer[] }) {
  const rates = [...new Map(offers.filter((offer) => offer.sourceCurrency !== "USD" && offer.fx)
    .map((offer) => [`${offer.sourceCurrency}|${offer.fx!.rateDate}|${offer.fx!.rateToUsd}`, { currency: offer.sourceCurrency, ...offer.fx! }])).values()];
  return <aside className="fx-disclosure shell" aria-label="USD conversion methodology">
    <strong>All headline prices in USD</strong>
    <p>Native USD prices require no conversion. Other currencies use the dated reference rates below; original amounts remain visible in each listing. Monthly prices stay monthly. Reference rates exclude conversion fees and payment spreads.</p>
    {rates.length > 0 ? <ul>{rates.map((rate) => <li key={`${rate.currency}-${rate.rateDate}-${rate.rateToUsd}`}>1 {rate.currency} = {rate.rateToUsd.toLocaleString("en-US", { maximumFractionDigits: 8 })} USD · {rate.rateDate} · <a href={rate.sourceUrl} target="_blank" rel="nofollow noreferrer">{rate.sourceName} ↗</a></li>)}</ul> : <p>No currency-converted records in this snapshot.</p>}
  </aside>;
}
