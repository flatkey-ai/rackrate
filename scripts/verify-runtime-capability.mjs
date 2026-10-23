import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verificationUrl } from "./verify-deployment.mjs";

export function verifyRuntimeCapability(status, dataset, bytes) {
  const capability = status?.runtimeCapabilities;
  if (capability?.publicationContract !== "regional-hourly-v2" || capability.snapshotSchemaVersion !== dataset.schemaVersion
      || !Number.isSafeInteger(capability.maxSnapshotBytes) || bytes > capability.maxSnapshotBytes
      || !Array.isArray(capability.collectorVersions) || !capability.collectorVersions.includes(dataset.collector.version)
      || !Array.isArray(capability.providers) || !dataset.collector.providers.every(provider => capability.providers.includes(provider))) {
    throw new Error("Production runtime does not support this dataset. Existing GitHub data was preserved; validated collection artifacts remain available.");
  }
  return true;
}

export async function checkProductionCapability(datasetBytes, { fetchImpl = fetch, baseUrl } = {}) {
  const response = await fetchImpl(verificationUrl(baseUrl), { cache: "no-store", redirect: "error", credentials: "omit",
    signal: AbortSignal.timeout(10_000), headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Production capability check failed; existing GitHub data was preserved");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Production capability response was empty");
  const parts = []; let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.length;
      if (length > 256 * 1024) { await reader.cancel(); throw new Error("Production capability response exceeded its limit"); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  return verifyRuntimeCapability(JSON.parse(Buffer.concat(parts).toString("utf8")), JSON.parse(datasetBytes), Buffer.byteLength(datasetBytes));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await checkProductionCapability(await readFile(new URL("../data/offers.json", import.meta.url), "utf8"));
  console.log("Production runtime supports the collected dataset; publication may proceed.");
}
