import { readFile, writeFile } from "node:fs/promises";
import { buildCompactPriceTable, compactPricesToCsv } from "./lib/compact-csv.mjs";

const source = process.argv[2] ?? "data/offers.json";
const destination = process.argv[3] ?? "data/prices.csv";
const dataset = JSON.parse(await readFile(source, "utf8"));
await writeFile(destination, compactPricesToCsv(dataset), "utf8");
console.log(`Exported ${buildCompactPriceTable(dataset).rows.length} comparable regional GPU-hour quotes from ${dataset.offers.length} collected records in 10 columns to ${destination}`);
