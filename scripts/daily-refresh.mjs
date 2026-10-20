import { readFile, appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { REQUIRED_PROVIDERS } from "./lib/library.mjs";

export function collectionIsDue(snapshot, now = new Date()) {
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
} = {}) {
  const forced = eventName === "workflow_dispatch" && (forceRefresh === true || forceRefresh === "true");
  return ref !== "refs/heads/main" || forced || collectionIsDue(snapshot, now);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let snapshot;
  try { snapshot = JSON.parse(await readFile(new URL("../data/public-prices.json", import.meta.url), "utf8")); }
  catch { snapshot = null; }
  // Branch runs always exercise the real collectors before a change is merged.
  const due = shouldCollectPrices(snapshot, { ref: process.env.GITHUB_REF,
    eventName: process.env.GITHUB_EVENT_NAME, forceRefresh: process.env.GPU_PRICE_FORCE_REFRESH });
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `collect=${due}\n`);
  console.log(due ? "A new verified public collection is due." : "Today's post-10:30 China-time collection is already verified; skipping a duplicate fetch.");
}
