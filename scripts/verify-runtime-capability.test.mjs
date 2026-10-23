import test from "node:test";
import assert from "node:assert/strict";
import { verifyRuntimeCapability, checkProductionCapability } from "./verify-runtime-capability.mjs";
const data = { schemaVersion: 2, collector: { version: "0.24.0", providers: ["vast"] } };
const status = { runtimeCapabilities: { publicationContract: "regional-hourly-v2", snapshotSchemaVersion: 2,
  maxSnapshotBytes: 64 * 1024 * 1024, collectorVersions: ["0.24.0"], providers: ["vast"] } };
test("publication requires deployed runtime capability before changing GitHub data", () => {
  assert.equal(verifyRuntimeCapability(status, data, 500), true);
  for (const change of [{}, { runtimeCapabilities: {} }, { runtimeCapabilities: { ...status.runtimeCapabilities, collectorVersions: ["0.23.0"] } },
    { runtimeCapabilities: { ...status.runtimeCapabilities, providers: [] } }, { runtimeCapabilities: { ...status.runtimeCapabilities, maxSnapshotBytes: 100 } }]) {
    assert.throws(() => verifyRuntimeCapability(change, data, 500), /Existing GitHub data was preserved/);
  }
});
test("preflight uses an anonymous bounded status read, and failures cannot authorize publication", async () => {
  assert.equal(await checkProductionCapability(JSON.stringify(data), { fetchImpl: async (url, options) => {
    assert.equal(url, "https://rackrate.org/api/pricing/status"); assert.equal(options.credentials, "omit"); assert.equal(options.redirect, "error");
    return Response.json(status);
  } }), true);
  await assert.rejects(checkProductionCapability(JSON.stringify(data), { fetchImpl: async () => new Response("bad", { status: 500 }) }), /preserved/);
  await assert.rejects(checkProductionCapability(JSON.stringify(data), { fetchImpl: async () => new Response("x".repeat(262145)) }), /limit/);
});
