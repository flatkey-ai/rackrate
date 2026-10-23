import test from "node:test";
import assert from "node:assert/strict";
import { parseEcbRates, convertAmountToUsd, convertDatasetToUsd, collectFxRates } from "./lib/fx.mjs";

const observedAt = "2026-10-20T02:30:00.000Z";
const xml = `<gesmes:Envelope xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref"><gesmes:name>European Central Bank</gesmes:name><Cube><Cube time='2026-10-19'><Cube currency='USD' rate='1.1225'/><Cube currency='CNY' rate='7.4991'/><Cube currency='ILS' rate='3.4890'/></Cube></Cube></gesmes:Envelope>`;
const rates = parseEcbRates(xml, { observedAt });

test("ECB EUR-base cross rates preserve publication date and exact originals", () => {
  assert.equal(rates.rateDate, "2026-10-19");
  assert.equal(rates.ratesPerEur.USD, "1.1225");
  assert.equal(rates.ratesPerEur.CNY, "7.4991");
  assert.equal(rates.ratesToUsd.USD, "1");
  assert.deepEqual(convertAmountToUsd("7.4991", "CNY", rates), { amount: 1.1225, decimal: "1.1225" });
  assert.deepEqual(convertAmountToUsd("3.4890", "ILS", rates), { amount: 1.1225, decimal: "1.1225" });
  assert.deepEqual(convertAmountToUsd("1", "EUR", rates), { amount: 1.1225, decimal: "1.1225" });
  assert.deepEqual(convertAmountToUsd("0", "CNY", rates), { amount: 0, decimal: "0" });
  assert.deepEqual(convertAmountToUsd("0.526", "USD", rates), { amount: .526, decimal: "0.526" });
});

test("monthly currency conversion keeps month period, offline state and instance totals", () => {
  const original = { id:"month", sourceCurrency:"CNY", sourceAmount:"7.4991", pricePerGpuUnit:7.4991,
    billingUnit:"GPU-month", availability:"unavailable", instancePrice:14.9982, instanceSourceAmount:"14.9982", instanceCurrency:"CNY", instanceBillingUnit:"instance-month" };
  const [offer] = convertDatasetToUsd({ offers:[original] }, rates).offers;
  assert.equal(offer.priceUsdPerGpuUnit,1.1225); assert.equal(offer.instancePriceUsd,2.245);
  assert.equal(offer.pricePerGpuHour,null); assert.equal(offer.billingUnit,"GPU-month");
  assert.equal(offer.sourceAmount,"7.4991"); assert.equal(offer.availability,"unavailable");
  assert.equal(offer.fx.converted,true); assert.equal(offer.fx.rateDate,"2026-10-19");
});

test("hourly conversion and contact-sales nulls are explicit, without zero substitution", () => {
  const offers = convertDatasetToUsd({offers:[
    {sourceAmount:"7.4991",sourceCurrency:"CNY",billingUnit:"GPU-hour"},
    {sourceAmount:null,sourceCurrency:"USD",billingUnit:"GPU-hour"},
  ]},rates).offers;
  assert.equal(offers[0].pricePerGpuHour,1.1225);
  assert.equal(offers[1].priceUsdPerGpuUnit,null); assert.equal(offers[1].pricePerGpuHour,null);
  assert.throws(()=>convertAmountToUsd("1","XYZ",rates),/missing/);
});

test("future, stale, malformed, duplicate and missing USD rates fail closed", () => {
  for (const invalid of [xml.replace("2026-10-19","2026-10-21"),xml.replace("2026-10-19","2026-10-01"),
    xml.replace("rate='7.4991'","rate='0'"),xml.replace("rate='7.4991'","rate='NaN'"),
    xml.replace("currency='CNY'","currency='USD'"),xml.replace("currency='USD'","currency='GBP'"),
    xml.replace("2026-10-19","2026-02-30")]) assert.throws(()=>parseEcbRates(invalid,{observedAt}));
});

test("FX download is anonymous, bounded, and uses the supplied observation time", async () => {
  let calls=0;
  const result=await collectFxRates({now:new Date(observedAt),fetchImpl:async (url,options)=>{
    calls++; assert.match(url,/www\.ecb\.europa\.eu/); assert.equal(options.redirect,"error");
    assert.equal(options.headers,undefined); return new Response(xml);
  }});
  assert.equal(calls,1); assert.equal(result.observedAt,observedAt);
  await assert.rejects(collectFxRates({now:new Date(observedAt),fetchImpl:async()=>new Response("no",{status:503})}),/preserved/);
});


test("bounded native decimals retain 80 significant digits even for tiny divided GPU prices", () => {
  const tiny = "0." + "0".repeat(50) + "3".repeat(80);
  assert.equal(convertAmountToUsd(tiny, "USD", rates).decimal, tiny);
  assert.equal(convertAmountToUsd("0." + "3".repeat(80), "CNY", rates, 6).decimal, "0.049895");
  for (const value of ["0." + "1".repeat(161), "1".repeat(193)]) assert.throws(() => convertAmountToUsd(value, "USD", rates), /Invalid exact decimal/);
});
