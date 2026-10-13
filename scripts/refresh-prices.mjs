import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectRunpod } from "./lib/runpod.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = join(root, "data", "offers.json");
const tempPath = `${dataPath}.tmp`;
const current = JSON.parse(await readFile(dataPath, "utf8"));
const runpod = await collectRunpod();
const replacements = new Map(runpod.offers.map((offer) => [offer.id, offer]));
const offers = current.offers.map((offer) => replacements.get(offer.id) ?? offer);

for (const offer of runpod.offers) {
  if (!offers.some((entry) => entry.id === offer.id)) offers.push(offer);
}

const ids = new Set();
for (const offer of offers) {
  if (ids.has(offer.id)) throw new Error(`Duplicate offer id: ${offer.id}`);
  ids.add(offer.id);
  if (!Number.isFinite(offer.pricePerGpuHour) || offer.pricePerGpuHour <= 0) {
    throw new Error(`Invalid hourly price for ${offer.id}`);
  }
}

const output = {
  schemaVersion: 1,
  generatedAt: runpod.observedAt,
  sources: [
    ...current.sources.filter((source) => source.provider !== "runpod"),
    { provider: "runpod", url: runpod.url, status: "ok", fetchedAt: runpod.observedAt, offerCount: runpod.offers.length },
  ],
  offers: offers.sort((a, b) => a.id.localeCompare(b.id)),
};

await writeFile(tempPath, `${JSON.stringify(output, null, 2)}\n`);
await rename(tempPath, dataPath);
console.log(`Updated ${runpod.offers.length} RunPod offers at ${runpod.observedAt}`);
