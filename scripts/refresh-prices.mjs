import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectRunpod } from "./lib/runpod.mjs";
import { collectHyperstack } from "./lib/hyperstack.mjs";
import { collectNebius } from "./lib/nebius.mjs";
import { collectLambda } from "./lib/lambda.mjs";
import { collectVast } from "./lib/vast.mjs";
import { appendPriceHistory } from "./lib/history.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = join(root, "data", "offers.json");
const tempPath = `${dataPath}.tmp`;
const historyPath = join(root, "data", "price-history.json");
const historyTempPath = `${historyPath}.tmp`;
const current = JSON.parse(await readFile(dataPath, "utf8"));
const currentHistory = JSON.parse(await readFile(historyPath, "utf8"));
const [runpod, hyperstack, nebius, lambda, vast] = await Promise.all([
  collectRunpod(), collectHyperstack(), collectNebius(), collectLambda(),
  collectVast(process.env.VAST_API_KEY),
]);
const results = [runpod, hyperstack, nebius, lambda, vast].filter(Boolean);
const collected = results.flatMap((result) => result.offers);
const refreshedProviders = new Set(["runpod", "hyperstack", "nebius", "lambda", ...(vast ? ["vast-ai"] : [])]);
const offers = current.offers.filter((offer) => !refreshedProviders.has(offer.providerSlug));
offers.push(...collected);

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
  generatedAt: results.map((result) => result.observedAt).sort().at(-1),
  sources: [
    {
      provider: "reference",
      url: "https://rackrate.org/methodology",
      status: "reference",
      fetchedAt: offers.filter((offer) => offer.dataStatus === "seed").map((offer) => offer.observedAt).sort().at(-1) ?? null,
      offerCount: offers.filter((offer) => offer.dataStatus === "seed").length,
    },
    ...results.map((result) => ({ provider: result.provider ?? result.offers[0]?.providerSlug, url: result.url, status: "ok", fetchedAt: result.observedAt, offerCount: result.offers.length })),
    ...(!vast ? [{ provider: "vast-ai", url: "https://docs.vast.ai/api-reference/search/search-offers", status: "requires-auth", fetchedAt: null, offerCount: current.offers.filter((offer) => offer.providerSlug === "vast-ai").length }] : []),
  ],
  offers: offers.sort((a, b) => a.id.localeCompare(b.id)),
};

const history = appendPriceHistory(currentHistory, output);
await writeFile(tempPath, `${JSON.stringify(output, null, 2)}\n`);
await writeFile(historyTempPath, `${JSON.stringify(history, null, 2)}\n`);
await rename(tempPath, dataPath);
await rename(historyTempPath, historyPath);
console.log(`Updated ${collected.length} official offers from ${results.map((result) => result.provider ?? result.offers[0]?.providerSlug).join(", ")}`);
