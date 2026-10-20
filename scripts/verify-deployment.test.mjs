import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyLivePricing } from './verify-deployment.mjs';

const expected={generatedAt:'2026-10-20T08:57:50Z',collector:{commit:'verified-library'},fx:{rateDate:'2026-10-19'},sources:[{provider:'example',status:'ok',offerCount:1}],offers:[{dataStatus:'official-page',availability:'unavailable',quoteStatus:'quoted'}]};
const live={generatedAt:expected.generatedAt,collector:expected.collector,fx:expected.fx,sources:expected.sources,counts:{offers:1,officialOffers:1,offlineOffers:1,contactSalesOffers:0}};
test('live verification ties source, timestamp, FX date and status counts to verified data',()=>{
  assert.equal(verifyLivePricing(live,expected),true);
  for(const bad of [{...live,generatedAt:'2026-10-19'}, {...live,fx:{rateDate:'2026-10-20'}}, {...live,sources:[]}, {...live,counts:{...live.counts,offlineOffers:0}}])assert.throws(()=>verifyLivePricing(bad,expected));
});
