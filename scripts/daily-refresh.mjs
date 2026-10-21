import { readFile, appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { LIBRARY_VERSION, REQUIRED_PROVIDERS, publicCsvColumns, validatePublicLibraryBundle } from "./lib/library.mjs";
import { compactPricesToCsv } from "./lib/compact-csv.mjs";

function rawCsvMatchesBatch(csv, collectedAt, expectedRows) {
  const header = publicCsvColumns(csv);
  if (header.at(-2) !== "collected_at" || header.at(-1) !== "collection_status") return false;
  // Read records rather than physical lines: quoted notes may contain commas,
  // newlines, or even text resembling another batch's trailing metadata.
  const body = csv.slice(csv.indexOf("\r\n") + 2);
  let quoted = false, closedQuote = false, cell = "", row = [], rows = 0;
  for (let index = 0; index < body.length; index++) {
    const char = body[index];
    if (quoted) {
      if (char === '"' && body[index + 1] === '"') { cell += '"'; index++; }
      else if (char === '"') { quoted = false; closedQuote = true; }
      else cell += char;
    } else if (char === ",") {
      row.push(cell); cell = ""; closedQuote = false;
    } else if (char === "\r" && body[index + 1] === "\n") {
      row.push(cell);
      if (row.length !== header.length || row.at(-2) !== collectedAt || row.at(-1) !== "success") return false;
      rows++; row = []; cell = ""; closedQuote = false; index++;
    } else if (char === '"' && !cell && !closedQuote) {
      quoted = true;
    } else {
      if (closedQuote || char === '"' || char === "\r" || char === "\n") return false;
      cell += char;
    }
  }
  return !quoted && !closedQuote && !cell && !row.length && rows === expectedRows;
}

// Retain the raw CSV third argument for callers upgrading from the audit-only
// pipeline. Without both new publication artifacts, collection remains due.
export function collectionIsDue(snapshot, now = new Date(), csv, { compactCsv, dataset } = {}) {
  try {
    validatePublicLibraryBundle({ result: snapshot, csv });
    if (dataset?.collector?.version !== LIBRARY_VERSION || dataset.generatedAt !== snapshot.collected_at
        || !rawCsvMatchesBatch(csv, dataset.generatedAt, snapshot.prices.length)) return true;
    const expectedCsv = compactPricesToCsv(dataset);
    if (typeof compactCsv !== "string" || compactCsv !== expectedCsv
        || expectedCsv.indexOf("\r\n") + 2 === expectedCsv.length) return true;
  } catch {
    return true;
  }
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const scheduled = Date.parse(`${today}T10:30:00+08:00`);
  const observed = Date.parse(snapshot?.collected_at ?? "");
  const sources = snapshot?.provider_results;
  if (snapshot?.status !== "success" || !Number.isFinite(observed)
      || observed < scheduled || observed > now.getTime() || !Array.isArray(sources)
      || sources.length !== REQUIRED_PROVIDERS.length) return true;
  const successful = new Set(sources.filter((source) => source.status === "success" && !source.error && source.returned_count > 0).map((source) => source.provider));
  return REQUIRED_PROVIDERS.some((provider) => !successful.has(provider));
}

export function shouldCollectPrices(snapshot, {
  now = new Date(), ref = "refs/heads/main", eventName = "schedule", forceRefresh = false,
  csv, compactCsv, dataset,
} = {}) {
  const forced = eventName === "workflow_dispatch" && (forceRefresh === true || forceRefresh === "true");
  return ref !== "refs/heads/main" || forced || collectionIsDue(snapshot, now, csv, { compactCsv, dataset });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [snapshot, csv, compactCsv, dataset] = await Promise.all([
    readFile(new URL("../data/public-prices.json", import.meta.url), "utf8").then(JSON.parse).catch(() => null),
    readFile(new URL("../data/public-prices.csv", import.meta.url), "utf8").catch(() => null),
    readFile(new URL("../data/prices.csv", import.meta.url), "utf8").catch(() => null),
    readFile(new URL("../data/offers.json", import.meta.url), "utf8").then(JSON.parse).catch(() => null),
  ]);
  // Branch runs always exercise the real collectors before a change is merged.
  const due = shouldCollectPrices(snapshot, { csv, compactCsv, dataset, ref: process.env.GITHUB_REF,
    eventName: process.env.GITHUB_EVENT_NAME, forceRefresh: process.env.GPU_PRICE_FORCE_REFRESH });
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `collect=${due}\n`);
  console.log(due ? "A new verified public collection is due." : "Today's post-10:30 China-time collection is already verified; skipping a duplicate fetch.");
}
