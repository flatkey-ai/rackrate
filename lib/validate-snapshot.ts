import type { Offer, PricingDataset } from "./data";
import { sharedCatalogLocations } from "./catalog-applicability.ts";
import { isRunpodCatalogOffer } from "./runpod-catalog.ts";
import { isVastCatalogOffer } from "./vast-catalog.ts";

const FIVE_PROVIDERS = ["nebius", "crusoe", "lambda", "ucloud", "autodl"];
const NINE_PROVIDERS = [...FIVE_PROVIDERS, "runpod", "azure", "digitalocean", "verda"];
const CURRENT_PROVIDERS = [...NINE_PROVIDERS, "vast"];
const EXTENSION_PROVIDERS = ["azure", "digitalocean", "verda", "vast"];
const LEGACY_PROVIDERS = [...FIVE_PROVIDERS, "runpod", "digitalocean", "verda", "ebcloud", "azure", "suanli", "hyperstack"];
const ECB_PAGE = "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html";
const ECB_XML = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const FIVE_MINUTES = 300_000;
type Row = Record<string, unknown>;

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid pricing snapshot: ${message}`);
}
function row(value: unknown, label: string): Row {
  check(value !== null && typeof value === "object" && !Array.isArray(value), label);
  return value as Row;
}
function list(value: unknown, label: string): unknown[] {
  check(Array.isArray(value), label);
  return value;
}
function text(value: unknown, label: string): string {
  check(typeof value === "string" && value.trim().length > 0 && value.length <= 16_384, label);
  return value;
}
function url(value: unknown, label: string): string {
  const valueText = text(value, label);
  let parsed: URL;
  try { parsed = new URL(valueText); } catch { throw new Error(`Invalid pricing snapshot: ${label}`); }
  check(["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password, label);
  return valueText;
}
function time(value: unknown, ceiling: number, label: string): number {
  const valueText = text(value, label);
  check(/^\d{4}-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[+-]\d{2}:\d{2}))?$/.test(valueText), label);
  const day = Date.parse(`${valueText.slice(0, 10)}T00:00:00Z`);
  const timestamp = Date.parse(valueText);
  check(Number.isFinite(day) && new Date(day).toISOString().slice(0, 10) === valueText.slice(0, 10)
    && Number.isFinite(timestamp) && timestamp <= ceiling, label);
  return timestamp;
}
function strings(value: unknown, label: string): void {
  for (const entry of list(value, label)) text(entry, label);
}
function amount(value: unknown, label: string): number {
  check(typeof value === "number" && Number.isFinite(value) && value >= 0, label);
  return value;
}
function decimal(value: unknown, label: string): string {
  check(typeof value === "string" && value.length <= 192 && /^\d+(?:\.\d{1,160})?$/.test(value), label);
  check(Number.isFinite(Number(value)), label);
  return value;
}
// The ingestion module uses this same exact-decimal HALF_UP calculation. Keeping
// this small pure implementation here avoids importing collection/server scripts.
function ratio(a: string, n: string, d: string, places: number): string {
  const parts = (value: string) => { const [whole, fraction = ""] = value.split("."); return [BigInt(whole + fraction), fraction.length] as const; };
  const [ai, as] = parts(a), [ni, ns] = parts(n), [di, ds] = parts(d);
  check(di > BigInt(0), "positive FX denominator");
  const top = ai * ni * BigInt(10) ** BigInt(ds + places);
  const bottom = di * BigInt(10) ** BigInt(as + ns);
  let rounded = top / bottom;
  if ((top % bottom) * BigInt(2) >= bottom) rounded += BigInt(1);
  const digits = rounded.toString().padStart(places + 1, "0");
  return `${digits.slice(0, -places)}.${digits.slice(-places)}`.replace(/\.?0+$/, "");
}
function slug(value: unknown): string {
  check(typeof value === "string" && value.length <= 200 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value), "catalog slug");
  return value;
}

/** Validate an untrusted published snapshot before it can replace a good one.
 * Staleness is a loader concern: old snapshots remain valid against their own
 * collection time, including the original FX publication date.
 */
export function validatePricingDataset(value: unknown, nowMs = Date.now()): PricingDataset {
  check(Number.isFinite(nowMs), "validation clock");
  const data = row(value, "dataset object");
  check(data.schemaVersion === 2, "schemaVersion");
  const generatedAt = time(data.generatedAt, nowMs + FIVE_MINUTES, "generatedAt");
  const ceiling = Math.min(nowMs, generatedAt) + FIVE_MINUTES;
  const collector = row(data.collector, "collector");
  const authorized = collector.mode === "authorized";
  if (collector.execution !== undefined) check(["recorded-source-replay", "live-collection"].includes(String(collector.execution)), "collection execution");
  check(collector.name === "gpu-price-monitor" && ["public-only", "authorized"].includes(String(collector.mode))
    && typeof collector.version === "string" && /^\d+\.\d+\.\d+$/.test(collector.version)
    && typeof collector.commit === "string" && /^[a-f0-9]{40}$/.test(collector.commit), "public collector identity");
  // Pre-0.23 snapshots remain readable at their original observation time.
  // New collections declare ten sources; immutable older five/nine-source snapshots remain readable.
  const scoped = collector.providers !== undefined;
  const versionParts = String(collector.version).split(".").map(Number);
  const currentRelease = versionParts[0] > 0 || versionParts[1] >= 24;
  const nineRelease = versionParts[0] > 0 || versionParts[1] >= 23;
  check(scoped || !currentRelease, "declared collector scope");
  const declared = scoped ? list(collector.providers, "collector providers") : [];
  const tracked = declared.includes("vast") ? CURRENT_PROVIDERS : declared.includes("runpod") ? NINE_PROVIDERS : FIVE_PROVIDERS;
  if (scoped) {
    check((!currentRelease || tracked === CURRENT_PROVIDERS) && (!nineRelease || tracked !== FIVE_PROVIDERS)
      && declared.length === tracked.length && new Set(declared).size === tracked.length
      && tracked.every((provider) => declared.includes(provider)), "tracked-provider collector scope");
  }
  const REQUIRED = scoped ? tracked : LEGACY_PROVIDERS;
  if (authorized) check(scoped && collector.validationPolicy === "visible-catalog-v1", "authorized collection policy");

  const catalog = row(data.generatedCatalog, "generatedCatalog");
  const gpuSlugs = new Set<string>();
  const providerSlugs = new Set<string>();
  for (const entry of list(catalog.gpus, "GPU catalog")) {
    const gpu = row(entry, "GPU catalog entry"), id = slug(gpu.slug);
    check(!gpuSlugs.has(id), "duplicate GPU catalog slug");
    gpuSlugs.add(id); text(gpu.name, "GPU name"); text(gpu.shortName, "GPU short name");
    check(["NVIDIA", "AMD", "Unknown"].includes(String(gpu.vendor)), "GPU vendor");
    if (gpu.vramGb !== null && gpu.vramGb !== undefined) amount(gpu.vramGb, "catalog GPU memory");
  }
  check(gpuSlugs.size > 0, "empty GPU catalog");
  for (const entry of list(catalog.providers, "provider catalog")) {
    const provider = row(entry, "provider catalog entry"), id = slug(provider.slug);
    check(!providerSlugs.has(id) && REQUIRED.includes(id), "duplicate or unknown provider catalog slug");
    providerSlugs.add(id); text(provider.name, "provider name"); url(provider.website, "provider website");
  }
  if (!scoped) {
    // Compatibility for the immutable legacy fallback only. Current boards
    // project tracked competitors and never surface dated page-derived RunPod prices.
    gpuSlugs.add("nvidia-a100-80gb");
    for (const provider of ["aws", "vast-ai", "hyperstack"]) providerSlugs.add(provider);
  }
  for (const provider of REQUIRED) check(providerSlugs.has(provider), `missing provider catalog: ${provider}`);

  const fx = row(data.fx, "FX registry");
  check(fx.schemaVersion === 1 && fx.baseCurrency === "EUR" && fx.targetCurrency === "USD"
    && fx.sourceName === "European Central Bank reference rates" && fx.sourceUrl === ECB_PAGE
    && fx.rawSourceUrl === ECB_XML, "FX source identity");
  const fxObservedAt = time(fx.observedAt, ceiling, "FX observedAt");
  check(typeof fx.rateDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fx.rateDate), "FX rate date");
  const rateDay = time(fx.rateDate, generatedAt, "FX rate date");
  check(generatedAt - rateDay <= 7 * 86_400_000 && fxObservedAt >= rateDay, "FX age at collection");
  text(fx.formula, "FX formula"); text(fx.rounding, "FX rounding");
  const rates = row(fx.ratesPerEur, "FX original rates"), usdRates = row(fx.ratesToUsd, "FX USD rates");
  check(rates.EUR === "1", "EUR base rate");
  const usd = decimal(rates.USD, "USD reference rate");
  check(Number(usd) > 0 && Object.keys(rates).length === Object.keys(usdRates).length, "FX rate registry");
  for (const [currency, nativeRate] of Object.entries(rates)) {
    check(/^[A-Z]{3}$/.test(currency), "FX currency");
    const native = decimal(nativeRate, "FX original decimal");
    check(Number(native) > 0, "positive FX rate");
    check(usdRates[currency] === (currency === "USD" ? "1" : ratio("1", usd, native, 18)), "FX cross rate");
  }
  const toUsd = (source: string, currency: string) => {
    check(Object.hasOwn(rates, currency), `FX currency missing: ${currency}`);
    return currency === "USD" ? source : ratio(source, usd, rates[currency] as string, 12);
  };

  const offers = list(data.offers, "offers");
  check(offers.length > 0 && offers.length <= 100_000, "offer count");
  const ids = new Set<string>(), officialCounts = new Map<string, number>(), libraryIndices = new Map<number, Row>();
  let referenceCount = 0;
  for (const entry of offers) {
    const offer = row(entry, "offer");
    const id = text(offer.id, "offer ID"); check(!ids.has(id), "duplicate offer ID"); ids.add(id);
    check(gpuSlugs.has(slug(offer.gpuSlug)) && providerSlugs.has(slug(offer.providerSlug)), "unknown offer catalog reference");
    const provider = offer.providerSlug as string;
    if (scoped && provider === "runpod") check(isRunpodCatalogOffer(offer as unknown as Offer), "RunPod catalog source/scope");
    if (scoped && provider === "vast") check(isVastCatalogOffer(offer as unknown as Offer), "Vast catalog source/scope");
    check(["official-page", "seed"].includes(String(offer.dataStatus)), "offer provenance status");
    if (scoped) check(offer.dataStatus === "official-page", "current source-backed offer provenance");
    if (offer.dataStatus === "official-page") {
      check(REQUIRED.includes(provider), "unknown official provider");
      officialCounts.set(provider, (officialCounts.get(provider) ?? 0) + 1);
      strings(offer.regions, "offer regions"); strings(offer.zones, "offer zones");
      if (provider !== "hyperstack") {
        check(Number.isSafeInteger(offer.sourceQuoteIndex) && (offer.sourceQuoteIndex as number) >= 0
          && !libraryIndices.has(offer.sourceQuoteIndex as number), "library quote index");
        libraryIndices.set(offer.sourceQuoteIndex as number, offer);
      }
    } else {
      check(["aws", "vast-ai"].includes(provider) && offer.priceBasis === "reference", "dated reference provenance");
      referenceCount++;
      if (offer.regions !== undefined) strings(offer.regions, "reference regions");
      if (offer.zones !== undefined) strings(offer.zones, "reference zones");
    }
    strings(offer.conditions, "offer conditions"); url(offer.sourceUrl, "offer source URL");
    time(offer.observedAt, ceiling, "offer observedAt"); text(offer.region, "offer region label");
    check(typeof offer.countryCode === "string" && /^(?:[A-Z]{2})?$/.test(offer.countryCode), "offer country");
    if (offer.computeCountries !== undefined) {
      const countries = list(offer.computeCountries, "compute countries");
      check(countries.every((country) => typeof country === "string" && /^[A-Z]{2}$/.test(country)), "compute country code");
    }
    if (offer.priceScope !== undefined && offer.priceScope !== null) {
      check(["unlocated_catalog", "platform_coverage", "regional_quote", "country_quote", "zone_quote", "requested_region_quote", "requested_zone_quote"].includes(String(offer.priceScope)), "price location scope");
      if (["unlocated_catalog", "platform_coverage"].includes(String(offer.priceScope))) {
        check(offer.countryCode === "" && list(offer.computeCountries, "unlocated compute countries").length === 0,
          "catalog coverage is not a country price");
      }
    }
    if (Array.isArray(offer.applicableRegions) && offer.applicableRegions.length) {
      const locations = sharedCatalogLocations(offer as unknown as Offer);
      check(locations.length === offer.applicableRegions.length, "shared catalog applicability evidence");
    }
    if (offer.locationSource !== undefined && offer.locationSource !== null) {
      const locationSource = row(offer.locationSource, "location provenance");
      for (const key of ["source_url", "api_url"]) if (locationSource[key] !== undefined) url(locationSource[key], "location source URL");
    }
    check(offer.gpuCount === null || (Number.isSafeInteger(offer.gpuCount) && (offer.gpuCount as number) > 0), "GPU count");
    check(["available", "limited", "unavailable", "unknown"].includes(String(offer.availability)), "offer availability");
    check(offer.sourceAvailability !== "offline" || offer.availability === "unavailable", "offline availability");
    check(["GPU-hour", "GPU-month"].includes(String(offer.billingUnit)), "billing period");
    check(offer.billingUnit !== "GPU-month" || (offer.billingMode === "monthly" && offer.rentalType === "Monthly"), "monthly billing mode");
    check(offer.billingUnit !== "GPU-hour" || offer.rentalType !== "Monthly", "hourly billing mode");
    const currency = text(offer.sourceCurrency, "offer currency"); check(/^[A-Z]{3}$/.test(currency), "offer currency code");
    check(["quoted", "starting_at", "contact_sales"].includes(String(offer.quoteStatus)), "quote status");
    const contact = offer.quoteStatus === "contact_sales";
    if (contact) {
      check(offer.sourceAmount === null && offer.pricePerGpuUnit === null && offer.usdSourceAmount === null
        && offer.priceUsdPerGpuUnit === null && offer.pricePerGpuHour === null, "contact-sales amounts");
    } else {
      const sourceAmount = decimal(offer.sourceAmount, "source amount"), usdAmount = toUsd(sourceAmount, currency);
      check(amount(offer.pricePerGpuUnit, "native amount") === Number(sourceAmount), "native amount mismatch");
      check(offer.usdSourceAmount === usdAmount && amount(offer.priceUsdPerGpuUnit, "USD amount") === Number(usdAmount), "USD amount mismatch");
      check(offer.pricePerGpuHour === (offer.billingUnit === "GPU-hour" ? Number(usdAmount) : null), "USD hourly period mismatch");
    }
    if (offer.quoteStatus === "starting_at") check(offer.priceBasis === "starting_price", "starting price basis");
    text(offer.priceBasis, "price basis");
    const offerFx = row(offer.fx, "offer FX provenance");
    check(offerFx.sourceCurrency === currency && offerFx.targetCurrency === "USD"
      && offerFx.rateDate === fx.rateDate && offerFx.observedAt === fx.observedAt
      && offerFx.sourceUrl === fx.sourceUrl && offerFx.sourceName === fx.sourceName
      && offerFx.rateToUsdDecimal === usdRates[currency] && offerFx.rateToUsd === Number(usdRates[currency])
      && offerFx.converted === (currency !== "USD") && offerFx.formula === fx.formula && offerFx.rounding === fx.rounding,
    "offer FX provenance mismatch");
    if (offer.instancePrice !== null && offer.instancePrice !== undefined) {
      const instance = decimal(offer.instanceSourceAmount, "instance source amount");
      const instanceCurrency = text(offer.instanceCurrency, "instance currency");
      const instanceUsd = toUsd(instance, instanceCurrency);
      check(amount(offer.instancePrice, "instance amount") === Number(instance)
        && offer.instanceUsdSourceAmount === instanceUsd && offer.instancePriceUsd === Number(instanceUsd), "instance conversion mismatch");
      check(offer.instanceBillingUnit === (offer.billingUnit === "GPU-hour" ? "instance-hour" : "instance-month"), "instance billing period");
    } else check(offer.instancePriceUsd === null && offer.instanceUsdSourceAmount === null, "unquoted instance amount");
  }

  const seenSources = new Set<string>();
  let partialSources = 0, failedSources = 0;
  for (const entry of list(data.sources, "sources")) {
    const source = row(entry, "source result"), provider = text(source.provider, "source provider");
    check(!seenSources.has(provider), "duplicate source"); seenSources.add(provider);
    url(source.url, "source URL");
    if (provider === "reference" && !scoped) {
      check(source.status === "reference" && source.offerCount === referenceCount, "reference source count");
      if (source.fetchedAt !== null) time(source.fetchedAt, ceiling, "reference timestamp");
    } else {
      if (authorized && EXTENSION_PROVIDERS.includes(provider) && source.collectionStatus === "failed") {
        check(source.status === "failed" && source.failureCode === "extension_source_failed" && source.offerCount === 0
          && !officialCounts.get(provider) && list(source.sourceObservations, "failed extension observations").length === 0
          && list(source.sourceExclusions, "failed extension exclusions").length === 0, "failed extension has no current quotes");
        time(source.fetchedAt, ceiling, "extension attempt timestamp"); failedSources++;
        continue;
      }
      check(REQUIRED.includes(provider) && source.status === "ok" && source.offerCount === officialCounts.get(provider)
        && (source.offerCount as number) > 0, "required official source count/status");
      time(source.fetchedAt, ceiling, "source fetchedAt");
      if (authorized) {
        const observations = list(source.sourceObservations, "authorized source observations");
        const exclusions = list(source.sourceExclusions ?? [], "source exclusions");
        const excluded = exclusions.length === 1 ? row(exclusions[0], "source exclusion") : {};
        const publicNebius = provider === "nebius" && exclusions.length === 1 && Object.keys(excluded).length === 3
          && excluded.selection === "nebius_account" && excluded.reason === "billing_setup_required"
          && excluded.status === "excluded_by_configuration";
        check(exclusions.length === 0 || publicNebius, "authorized source exclusions");
        const expected = publicNebius ? ["nebius_public"] : provider === "nebius" ? ["nebius_public", "nebius_account"] : [provider];
        check(observations.length === expected.length, "authorized source plan");
        let count = 0, limited = publicNebius;
        observations.forEach((entry, index) => {
          const item = row(entry, "source observation");
          check(item.selection === expected[index] && Number.isSafeInteger(item.returned_count)
            && (item.returned_count as number) > 0, "authorized source selection");
          time(item.observed_at, ceiling, "source observation time"); url(item.source_url, "observation source URL");
          const limits = list(item.limitations, "source limitations");
          if (item.status === "partial") {
            check(["nebius_account", "autodl", "vast"].includes(String(item.selection)) && limits.length > 0, "partial source scope");
            const allowed = item.selection === "autodl" ? ["market_region_country:country_not_verified"]
              : item.selection === "vast" ? ["bounded_marketplace_search:complete_marketplace_not_verified"]
              : ["documented_public_region:no_accessible_project", "other_accounts_and_contracts:outside_authorized_account_scope", "regional_compute_tariff:compute_tariff_unavailable"];
            for (const entry of limits) {
              const limit = row(entry, "source limitation");
              check(allowed.includes(`${limit.scope}:${limit.status}`), "unaccepted source limitation");
            }
            limited = true;
          } else check(item.status === "success" && limits.length === 0, "authorized source completion");
          count += item.returned_count as number;
        });
        check(count === source.offerCount && source.collectionStatus === (limited ? "partial" : "success"), "authorized observation counts/status");
        if (limited) partialSources++;
      }
    }
  }
  for (const provider of REQUIRED) check(seenSources.has(provider), `missing required source: ${provider}`);
  check(referenceCount === 0 || seenSources.has("reference"), "missing reference source");

  const coverage = row(data.coverage, "coverage"), totals = row(coverage.totals, "coverage totals");
  check(coverage.schema_version === 1 && coverage.collection_status === (partialSources || failedSources ? "partial" : "success") && coverage.scope === "returned_quotes", "coverage status");
  const summary = row(coverage.source_summary, "coverage sources");
  const librarySourceCount = scoped ? tracked.length : 11;
  check(summary.requested_count === librarySourceCount && summary.success_count === librarySourceCount - partialSources - failedSources && summary.failed_count === failedSources
    && summary.unknown_count === partialSources && summary.no_matches_count === 0, "coverage source success");
  check(totals.returned_quotes === libraryIndices.size && totals.considered_quotes === libraryIndices.size
    && totals.excluded_quotes === 0 && list(coverage.excluded_quote_indices, "excluded quote indices").length === 0, "coverage quote counts");
  const covered = new Set<number>();
  for (const entry of [...list(coverage.models, "target models"), ...list(coverage.extra_models, "extra models")]) {
    const model = row(entry, "coverage model"), family = text(model.gpu_model, "coverage model name");
    const indices = list(model.quote_indices, "coverage model indices");
    check(model.quote_count === indices.length, "coverage model count");
    for (const index of indices) {
      check(Number.isSafeInteger(index) && libraryIndices.has(index as number) && !covered.has(index as number)
        && libraryIndices.get(index as number)?.gpuModel === family, "coverage model reference");
      covered.add(index as number);
    }
  }
  check(covered.size === libraryIndices.size, "incomplete model coverage");
  return value as PricingDataset;
}
