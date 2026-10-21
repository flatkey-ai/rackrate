import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { appendPriceHistory } from "./lib/history.mjs";
import { buildRackRateDataset, collectPublicLibraryBundle, validatePublicLibraryBundle, validateOffers } from "./lib/library.mjs";
import { collectFxRates, convertDatasetToUsd } from "./lib/fx.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export async function refreshPrices({
  directory = root, collect = collectPublicLibraryBundle,
  collectRates = collectFxRates,
  read = readFile, write = writeFile, move = rename, remove = rm,
} = {}) {
  const dataPath = join(directory, "data", "offers.json");
  const rawPath = join(directory, "data", "public-prices.json");
  const csvPath = join(directory, "data", "public-prices.csv");
  const historyPath = join(directory, "data", "price-history.json");
  const ratesPath = join(directory, "data", "fx-rates.json");
  const [current, currentHistory] = await Promise.all([
    read(dataPath, "utf8").then(JSON.parse), read(historyPath, "utf8").then(JSON.parse),
  ]);
  // A rejected source, malformed price or duplicate ID aborts before any write.
  const [bundle, rates] = await Promise.all([collect(), collectRates()]);
  const { result: rawResult, csv } = validatePublicLibraryBundle(bundle);
  const nativeOutput = buildRackRateDataset(current, rawResult);
  const output = convertDatasetToUsd(nativeOutput, rates);
  validateOffers(output.offers, { requireUsd: true, rates });
  const history = appendPriceHistory(currentHistory, output);
  const pending = [[rawPath, rawResult], [csvPath, csv], [ratesPath, rates], [historyPath, history], [dataPath, output]];
  try {
    for (const [path, value] of pending) {
      const spacing = path === historyPath ? undefined : 2;
      await write(`${path}.tmp`, path === csvPath ? value : `${JSON.stringify(value, null, spacing)}\n`, "utf8");
    }
    // offers.json is the publication marker: replace it after provenance/history exist.
    for (const [path] of pending) await move(`${path}.tmp`, path);
  } finally {
    await Promise.all(pending.map(([path]) => remove(`${path}.tmp`, { force: true })));
  }
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = await refreshPrices();
  const official = output.offers.filter((offer) => offer.dataStatus === "official-page");
  console.log(`Updated ${official.length} public offers from ${output.sources.filter((source) => source.status === "ok").length} tracked providers; earlier observations remain in dated history.`);
}
