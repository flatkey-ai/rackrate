import { readFile, appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { REQUIRED_PROVIDERS, authorizedSourceVerified, collectionMode } from "./lib/library.mjs";

export function collectionIsDue(snapshot, now = new Date(), mode = "public", nebiusAuthMode = null) {
  mode = collectionMode(mode);
  if (mode === "authorized" && nebiusAuthMode !== null && !["public", "token", "oidc"].includes(nebiusAuthMode)) throw new Error("Invalid Nebius authentication mode");
  // An offline assembly of real observations does not replace a cloud run.
  if (snapshot?.assembly?.method === "recorded-source-replay") return true;
  if ((snapshot?.collection_mode ?? "public") !== mode) return true;
  if (mode === "authorized" && snapshot?.validation_policy !== "visible-catalog-v1") return true;
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const scheduled = Date.parse(`${today}T10:30:00+08:00`);
  const observed = Date.parse(snapshot?.collected_at ?? "");
  const sources = snapshot?.provider_results;
  if (!(snapshot?.status === "success" || (mode === "authorized" && snapshot?.status === "partial")) || !Number.isFinite(observed)
      || observed < scheduled || observed > now.getTime() || !Array.isArray(sources)
      || sources.length !== REQUIRED_PROVIDERS.length) return true;
  if (mode === "authorized" && nebiusAuthMode !== null) {
    const excluded = sources.find(source => source.provider === "nebius")?.source_exclusions?.some(item => item?.selection === "nebius_account") ?? false;
    if (excluded !== (nebiusAuthMode === "public")) return true;
  }
  const successful = new Set(sources.filter((source) => mode === "authorized" ? authorizedSourceVerified(source) : source.status === "success" && !source.error && source.returned_count > 0).map((source) => source.provider));
  return REQUIRED_PROVIDERS.some((provider) => !successful.has(provider));
}

export function shouldCollectPrices(snapshot, {
  now = new Date(), ref = "refs/heads/main", eventName = "schedule", forceRefresh = false, mode = "public", nebiusAuthMode = null,
} = {}) {
  const forced = eventName === "workflow_dispatch" && (forceRefresh === true || forceRefresh === "true");
  return ref !== "refs/heads/main" || forced || collectionIsDue(snapshot, now, mode, nebiusAuthMode);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let snapshot;
  try { snapshot = JSON.parse(await readFile(new URL("../data/public-prices.json", import.meta.url), "utf8")); }
  catch { snapshot = null; }
  // Branch runs always exercise the real collectors before a change is merged.
  const due = shouldCollectPrices(snapshot, { ref: process.env.GITHUB_REF,
    eventName: process.env.GITHUB_EVENT_NAME, forceRefresh: process.env.GPU_PRICE_FORCE_REFRESH, mode: collectionMode(), nebiusAuthMode: process.env.RACKRATE_NEBIUS_AUTH_MODE || "token" });
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `collect=${due}\n`);
  console.log(due ? "A new verified collection is due." : "Today's post-10:30 China-time collection is already verified; skipping a duplicate fetch.");
}
