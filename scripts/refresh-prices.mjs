import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectRunpod } from "./lib/runpod.mjs";
import { collectHyperstack } from "./lib/hyperstack.mjs";
import { collectNebius } from "./lib/nebius.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = join(root, "data", "offers.json");
const tempPath = `${dataPath}.tmp`;
const current = JSON.parse(await readFile(dataPath, "utf8"));
const [runpod, hyperstack, nebius] = await Promise.all([collectRunpod(), collectHyperstack(), collectNebius()]);
const collected = [...runpod.offers, ...hyperstack.offers, ...nebius.offers];
const replacements = new Map(collected.map((offer) => [offer.id, offer]));
const offers = current.offers.map((offer) => replacements.get(offer.id) ?? offer);

for (const offer of collected) {
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
  generatedAt: [runpod.observedAt, hyperstack.observedAt, nebius.observedAt].sort().at(-1),
  sources: [
    ...current.sources.filter((source) => !["runpod", "hyperstack", "nebius"].includes(source.provider)),
    { provider: "runpod", url: runpod.url, status: "ok", fetchedAt: runpod.observedAt, offerCount: runpod.offers.length },
    { provider: "hyperstack", url: hyperstack.url, status: "ok", fetchedAt: hyperstack.observedAt, offerCount: hyperstack.offers.length },
    { provider: "nebius", url: nebius.url, status: "ok", fetchedAt: nebius.observedAt, offerCount: nebius.offers.length },
  ],
  offers: offers.sort((a, b) => a.id.localeCompare(b.id)),
};

await writeFile(tempPath, `${JSON.stringify(output, null, 2)}\n`);
await rename(tempPath, dataPath);
console.log(`Updated ${collected.length} official offers from RunPod, Hyperstack, and Nebius`);
