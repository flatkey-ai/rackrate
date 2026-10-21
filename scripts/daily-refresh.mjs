import { readFile, appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { REQUIRED_PROVIDERS, publicCsvColumns, validatePublicLibraryBundle } from "./lib/library.mjs";

export function collectionIsDue(snapshot, now = new Date(), csv) {
  try {
    validatePublicLibraryBundle({ result: snapshot, csv });
    // The pinned Python export ends each row with the batch metadata. Check
    // the exact collected_at cell without counting quoted multiline records
    // or introducing a second CSV parser/serializer in the application.
    const header = publicCsvColumns(csv);
    if (header.at(-2) !== "collected_at" || header.at(-1) !== "collection_status"
        || !csv.includes(`,${snapshot.collected_at},success\r\n`)) return true;
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
  csv,
} = {}) {
  const forced = eventName === "workflow_dispatch" && (forceRefresh === true || forceRefresh === "true");
  return ref !== "refs/heads/main" || forced || collectionIsDue(snapshot, now, csv);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [snapshot, csv] = await Promise.all([
    readFile(new URL("../data/public-prices.json", import.meta.url), "utf8").then(JSON.parse).catch(() => null),
    readFile(new URL("../data/public-prices.csv", import.meta.url), "utf8").catch(() => null),
  ]);
  // Branch runs always exercise the real collectors before a change is merged.
  const due = shouldCollectPrices(snapshot, { csv, ref: process.env.GITHUB_REF,
    eventName: process.env.GITHUB_EVENT_NAME, forceRefresh: process.env.GPU_PRICE_FORCE_REFRESH });
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `collect=${due}\n`);
  console.log(due ? "A new verified public collection is due." : "Today's post-10:30 China-time collection is already verified; skipping a duplicate fetch.");
}
