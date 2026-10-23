import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { planPriceHistory } from "./lib/history-storage.mjs";
import { buildRackRateDataset, collectLibrary, validateOffers } from "./lib/library.mjs";
import { collectFxRates, convertDatasetToUsd } from "./lib/fx.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export async function refreshPrices({
  directory = root, collect = collectLibrary,
  collectRates = collectFxRates,
  read = readFile, write = writeFile, move = rename, remove = rm, makeDirectory = mkdir,
} = {}) {
  const dataPath = join(directory, "data", "offers.json");
  const rawPath = join(directory, "data", "public-prices.json");
  const historyPath = join(directory, "data", "price-history.json");
  const ratesPath = join(directory, "data", "fx-rates.json");
  const [current, currentHistory] = await Promise.all([
    read(dataPath, "utf8").then(JSON.parse), read(historyPath, "utf8").then(JSON.parse),
  ]);
  // A rejected source, malformed price or duplicate ID aborts before any write.
  const [rawResult, rates] = await Promise.all([collect(), collectRates()]);
  const nativeOutput = buildRackRateDataset(current, rawResult);
  const output = convertDatasetToUsd(nativeOutput, rates);
  validateOffers(output.offers, { requireUsd: true, rates });
  const history = await planPriceHistory(currentHistory, output, {
    readShard: (relativePath) => read(join(directory, "data", relativePath), "utf8"),
  });
  const pending = [[rawPath, rawResult], [ratesPath, rates],
    ...history.writes.map(({ path, value }) => [join(directory, "data", path), value]),
    [historyPath, history.index], [dataPath, output]];
  // Retain every observation, but fail before writes when a catalog/history
  // would exceed reviewed runtime or GitHub file bounds. Never trim old prices.
  const serialized = pending.map(([path, value]) => {
    const contents = `${JSON.stringify(value)}\n`;
    const maximum = (path === dataPath ? 64 : 80) * 1024 * 1024;
    if (Buffer.byteLength(contents) > maximum) throw new Error("Pricing publication exceeds the reviewed file limit; existing data was preserved");
    return [path, contents];
  });
  try {
    if (history.writes.length) await makeDirectory(join(directory, "data", "price-history"), { recursive: true });
    for (const [path, contents] of serialized) {
      await write(`${path}.tmp`, contents);
    }
    // offers.json is the publication marker: replace it after provenance/history exist.
    for (const [path] of pending) await move(`${path}.tmp`, path);
    // Only expire old shards after the new index and publication marker exist.
    for (const path of history.deletes) await remove(join(directory, "data", path), { force: true });
  } finally {
    await Promise.all(pending.map(([path]) => remove(`${path}.tmp`, { force: true })));
  }
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = await refreshPrices();
  const official = output.offers.filter((offer) => offer.dataStatus === "official-page");
  console.log(`Updated ${official.length} official offers from ${output.sources.filter((source) => source.status === "ok").length} tracked providers; earlier observations remain in dated history.`);
}
