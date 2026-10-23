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
  assert.equal(collectionIsDue({ ...snapshot("2026-10-20T02:30:00Z"), assembly: { method: "recorded-source-replay" } }, now), true);
});
test("failed, future or incomplete snapshots never suppress a fresh collection",()=>{
  const now=new Date("2026-10-20T02:45:00Z");
  assert.equal(collectionIsDue(null,now),true);
  assert.equal(collectionIsDue({...snapshot("2026-10-20T02:40:00Z"),status:"partial"},now),true);
  const incomplete=snapshot("2026-10-20T02:40:00Z");incomplete.provider_results.pop();
  assert.equal(collectionIsDue(incomplete,now),true);
  assert.equal(collectionIsDue(snapshot("2026-10-20T03:00:00Z"),now),true);
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


test("a public snapshot cannot suppress an authorized refresh and invalid modes fail early", () => {
  const now = new Date("2026-10-20T02:45:00Z");
  const data = snapshot("2026-10-20T02:40:00Z");
  assert.equal(collectionIsDue(data, now, "authorized"), true);
  assert.throws(() => collectionIsDue(data, now, "invalid"), /must be public or authorized/);
  data.collection_mode = "authorized";
  data.validation_policy = "visible-catalog-v1";
  assert.equal(collectionIsDue(data, now, "authorized"), true); // no verified sub-source plan
  assert.equal(collectionIsDue(data, now, "public"), true);
});


test("switching the explicit Nebius account/public profile requires a fresh collection", () => {
  const now = new Date("2026-10-20T02:45:00Z");
  const data = snapshot("2026-10-20T02:40:00Z");
  data.collection_mode = "authorized"; data.validation_policy = "visible-catalog-v1"; data.status = "partial";
  for (const source of data.provider_results) {
    source.source_observations = [{ selection: source.provider === "nebius" ? "nebius_public" : source.provider,
      status: "success", observed_at: data.collected_at, returned_count: 1, limitations: [] }];
  }
  const nebius = data.provider_results.find(source => source.provider === "nebius");
  nebius.status = "partial";
  nebius.source_exclusions = [{ selection: "nebius_account", reason: "billing_setup_required", status: "excluded_by_configuration" }];
  assert.equal(collectionIsDue(data, now, "authorized", "public"), false);
  assert.equal(collectionIsDue(data, now, "authorized", "oidc"), true);
  assert.equal(collectionIsDue(data, now, "authorized", "token"), true);
  assert.throws(() => collectionIsDue(data, now, "authorized", "unknown"), /Invalid Nebius/);
});
