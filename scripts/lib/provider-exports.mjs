import { createHash } from "node:crypto";
import { convertAmountToUsd } from "./fx.mjs";

const COUNTS = ["source_quote_count", "exported_quote_count", "row_count", "shared_catalog_quote_count", "ordinary_member_pairs_hidden", "excluded_quote_count"];
const REASONS = new Set(["not_exact_hourly_rental", "country_region_not_verified"]);
function check(value) { if (!value) throw new Error("Invalid provider CSV export; existing data was preserved"); }

// RFC 4180 records, including quoted commas/newlines and doubled quotes. Reject
// malformed output instead of changing boundaries or publishing shifted prices.
export function parseCsv(value) {
  check(typeof value === "string" && value.startsWith("\ufeff") && value.length < 32 * 1024 * 1024);
  const rows = [], row = []; let cell = "", state = "plain";
  const input = value.slice(1);
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (state === "quoted") {
      if (c === '"') {
        if (input[i + 1] === '"') { cell += '"'; i++; } else state = "closed";
      } else cell += c;
      continue;
    }
    if (c === '"') { check(state === "plain" && cell === ""); state = "quoted"; continue; }
    if (c === ",") { row.push(cell); cell = ""; state = "plain"; continue; }
    if (c === "\r" || c === "\n") {
      check(c === "\r" && input[++i] === "\n"); row.push(cell); rows.push([...row]); row.length = 0; cell = ""; state = "plain"; continue;
    }
    check(state !== "closed"); cell += c;
  }
  check(state !== "quoted" && !row.length && !cell && rows.length > 0);
  check(rows[0].length >= 16 && rows[0].length <= 20 && rows.every(r => r.length === rows[0].length));
  return rows;
}
function csv(rows) {
  const cell = value => /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  return "\ufeff" + rows.map(row => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** The library chooses eligible configurations/member tariffs in native money.
 * RackRate adds USD columns from this publication's verified ECB rates only.
 * Tables remain separate files and are never nested in the raw quote snapshot.
 */
export function planProviderExports(raw, rates, providers, collector = null) {
  const bundle = raw.provider_exports;
  check(bundle?.schema_version === 1 && bundle.tables && bundle.coverage);
  check(Object.keys(bundle.tables).length === providers.length && Object.keys(bundle.coverage).length === providers.length);
  const manifest = { schemaVersion: 1, generatedAt: raw.collected_at, collectionStatus: raw.status, collector, collectionMode: raw.collection_mode ?? "public",
    pricingUnit: "per GPU-hour; per-instance values only when explicitly quoted",
    membership: "Verified same-configuration AutoDL member tariffs preferred; membership eligibility is not verified",
    geography: "Verified country and region only; Lambda shared catalog prices are repeated for explicitly applicable regions, not independent regional queries",
    fx: rates, providers: {} };
  const writes = [];
  for (const provider of providers) {
    check(/^[a-z][a-z0-9_]{0,63}$/.test(provider) && Object.hasOwn(bundle.tables, provider) && Object.hasOwn(bundle.coverage, provider));
    const summary = bundle.coverage[provider], source = raw.provider_results.find(item => item.provider === provider);
    check(source && summary && COUNTS.every(key => Number.isSafeInteger(summary[key]) && summary[key] >= 0));
    check(summary.source_quote_count === source.returned_count
      && summary.source_quote_count === summary.exported_quote_count + summary.excluded_quote_count + summary.ordinary_member_pairs_hidden
      && summary.shared_catalog_quote_count <= summary.exported_quote_count && summary.row_count >= summary.exported_quote_count);
    const reasons = summary.excluded_reasons;
    check(reasons && Object.entries(reasons).every(([key, value]) => REASONS.has(key) && Number.isSafeInteger(value) && value >= 0)
      && Object.values(reasons).reduce((a, b) => a + b, 0) === summary.excluded_quote_count);
    const rows = parseCsv(bundle.tables[provider]);
    check(rows.length - 1 === summary.row_count);
    const headers = rows[0].map(value => value.split("（", 1)[0]);
    const indices = Object.fromEntries(["provider", "gpu_hour_amount", "instance_hour_amount", "currency", "country", "region", "observed_at", "pricing_conditions"].map(key => [key, headers.indexOf(key)]));
    check(new Set(headers).size === headers.length && Object.values(indices).every(index => index >= 0));
    rows[0].push("usd_gpu_hour_amount（美元单GPU每小时价格）", "usd_instance_hour_amount（美元实例每小时价格）");
    for (const row of rows.slice(1)) {
      check(row[indices.provider] === provider && /^[A-Z]{2}$/.test(row[indices.country]) && row[indices.region].trim()
        && !/^(unknown|not published|global|unspecified)$/i.test(row[indices.region])
        && /^[A-Z]{3}$/.test(row[indices.currency]) && Number.isFinite(Date.parse(row[indices.observed_at])));
      const hourly = row[indices.gpu_hour_amount], instance = row[indices.instance_hour_amount];
      check(/^\d+(?:\.\d+)?$/.test(hourly) && Number(hourly) >= 0 && Number.isFinite(Number(hourly))
        && (instance === "" || /^\d+(?:\.\d+)?$/.test(instance) && Number(instance) >= 0 && Number.isFinite(Number(instance))));
      const currency = row[indices.currency];
      const explanation = currency === "USD" ? "原币USD，无需换汇" : `美元换算：1 ${currency} = ${rates.ratesToUsd[currency]} USD；ECB ${rates.rateDate}；原币金额保留，USD按HALF_UP保留最多6位小数`;
      row[indices.pricing_conditions] = [row[indices.pricing_conditions], explanation].filter(Boolean).join("；");
      row.push(convertAmountToUsd(hourly, row[indices.currency], rates, 6).decimal,
        instance === "" ? "" : convertAmountToUsd(instance, row[indices.currency], rates, 6).decimal);
    }
    const contents = csv(rows), path = `exports/${provider}.csv`;
    const times = (raw.prices ?? []).filter(quote => quote.provider === provider).map(quote => quote.observed_at).sort();
    manifest.providers[provider] = { path, ...summary, collection_status: source.status,
      observed_at: source.observed_at ?? null, first_observed_at: times[0] ?? null, last_observed_at: times.at(-1) ?? null,
      source_exclusions: source.source_exclusions ?? [], source_observations: source.source_observations ?? [],
      failure_code: source.status === "failed" ? "extension_source_failed" : null,
      sha256: createHash("sha256").update(contents).digest("hex") };
    writes.push({ path, contents });
  }
  writes.push({ path: "exports/manifest.json", contents: JSON.stringify(manifest) + "\n" });
  return { manifest, writes };
}
