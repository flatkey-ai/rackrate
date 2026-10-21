import test from "node:test";
import assert from "node:assert/strict";
import { collectionIsDue, shouldCollectPrices } from "./daily-refresh.mjs";
import { REQUIRED_PROVIDERS } from "./lib/library.mjs";

function snapshot(collectedAt) {
  return { status:"success", collected_at:collectedAt, provider_results:REQUIRED_PROVIDERS.map(provider=>({provider,status:"success",error:null,returned_count:1})) };
}
test("one verified post-10:30 Shanghai collection prevents scheduled/manual duplicates",()=>{
  const now=new Date("2026-10-20T02:45:00Z");
  assert.equal(collectionIsDue(snapshot("2026-10-20T02:30:00Z"),now),false);
  assert.equal(collectionIsDue(snapshot("2026-10-20T02:29:59Z"),now),true);
  assert.equal(collectionIsDue(snapshot("2026-10-19T03:00:00Z"),now),true);
});
test("failed, future or incomplete snapshots never suppress a fresh collection",()=>{
  const now=new Date("2026-10-20T02:45:00Z");
  assert.equal(collectionIsDue(null,now),true);
  assert.equal(collectionIsDue({...snapshot("2026-10-20T02:40:00Z"),status:"partial"},now),true);
  const incomplete=snapshot("2026-10-20T02:40:00Z");incomplete.provider_results.pop();
  assert.equal(collectionIsDue(incomplete,now),true);
  assert.equal(collectionIsDue(snapshot("2026-10-20T03:00:00Z"),now),true);
});

test("a prior successful five-source run cannot suppress the expanded nine-source collection", () => {
  const previous = snapshot("2026-10-20T02:40:00Z");
  previous.provider_results = previous.provider_results.slice(0, 5);
  assert.equal(collectionIsDue(previous, new Date("2026-10-20T02:45:00Z")), true);
});

test("force refresh only bypasses daily deduplication for explicit manual runs", () => {
  const options = { now: new Date("2026-10-20T02:45:00Z"), ref: "refs/heads/main" };
  const complete = snapshot("2026-10-20T02:40:00Z");
  assert.equal(shouldCollectPrices(complete, { ...options, eventName: "workflow_dispatch", forceRefresh: true }), true);
  assert.equal(shouldCollectPrices(complete, { ...options, eventName: "workflow_dispatch", forceRefresh: "true" }), true);
  assert.equal(shouldCollectPrices(complete, { ...options, eventName: "workflow_dispatch", forceRefresh: "false" }), false);
  assert.equal(shouldCollectPrices(complete, { ...options, eventName: "schedule", forceRefresh: true }), false);
  assert.equal(shouldCollectPrices(complete, { ...options, eventName: "push", forceRefresh: true }), false);
  assert.equal(shouldCollectPrices(complete, { ...options, ref: "refs/heads/codex/test", eventName: "workflow_dispatch" }), true);
});
