import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout } from "node:timers/promises";

export function verifyLivePricing(actual, expected) {
  if (actual?.generatedAt !== expected.generatedAt) throw new Error("Live RackRate pricing timestamp does not match the verified main dataset");
  if (actual?.collector?.commit !== expected.collector?.commit || actual?.fx?.rateDate !== expected.fx?.rateDate) throw new Error("Live collector or FX publication date does not match");
  const expectedCounts={
    offers:expected.offers.length,
    officialOffers:expected.offers.filter(q=>q.dataStatus==='official-page').length,
    offlineOffers:expected.offers.filter(q=>q.availability==='unavailable').length,
    contactSalesOffers:expected.offers.filter(q=>q.quoteStatus==='contact_sales').length,
  };
  for(const [key,value] of Object.entries(expectedCounts)) if(actual.counts?.[key]!==value) throw new Error(`Live ${key} count does not match`);
  const sources=expected.sources.filter(s=>s.status==='ok');
  for(const source of sources) if(!actual.sources?.some(s=>s.provider===source.provider&&s.status==='ok'&&s.offerCount===source.offerCount)) throw new Error(`Live ${source.provider} source was not verified`);
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const expected=JSON.parse(await readFile(new URL('../data/offers.json',import.meta.url),'utf8'));
  let error;
  for(let attempt=0;attempt<18;attempt++) {
    try {
      const response=await fetch('https://rackrate.org/api/pricing/status',{cache:'no-store',signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw new Error(`Live status returned ${response.status}`);
      verifyLivePricing(await response.json(),expected);
      console.log(`Verified RackRate ${expected.generatedAt}: ${expected.offers.length} offers, ECB ${expected.fx.rateDate}`);
      process.exit(0);
    } catch(failure) {error=failure;}
    if(attempt<17)await setTimeout(10000);
  }
  throw error;
}
