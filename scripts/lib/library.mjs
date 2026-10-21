import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { convertAmountToUsd } from "./fx.mjs";

const execFile = promisify(execFileCallback);
export const LIBRARY_VERSION = "0.12.0";
export const LIBRARY_COMMIT = "e4ba7376495b48f18285f19e5d7731bc6d69c286";
const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export function collectionPython({ explicit = process.env.GPU_PRICE_MONITOR_PYTHON, root = repositoryRoot, exists = existsSync } = {}) {
  if (explicit) return explicit;
  const candidates = process.platform === "win32"
    ? [join(root, ".venv", "Scripts", "python.exe"), join(root, ".venv", "bin", "python")]
    : [join(root, ".venv", "bin", "python"), join(root, ".venv", "Scripts", "python.exe")];
  return candidates.find((candidate) => exists(candidate)) ?? "python3";
}
export const REQUIRED_PROVIDERS = Object.freeze([
  "nebius", "crusoe", "lambda", "ucloud", "autodl",
  "runpod", "digitalocean", "verda", "azure",
]);

const PROVIDERS = {
  nebius: ["Nebius", "GPU cloud", "https://nebius.com"],
  crusoe: ["Crusoe", "GPU cloud", "https://www.crusoe.ai"],
  lambda: ["Lambda", "GPU cloud", "https://lambda.ai"],
  ucloud: ["UCloud", "GPU cloud", "https://www.ucloud.cn"],
  autodl: ["AutoDL", "Marketplace", "https://www.autodl.com"],
  runpod: ["RunPod", "GPU cloud", "https://www.runpod.io"],
  digitalocean: ["DigitalOcean", "GPU cloud", "https://www.digitalocean.com"],
  verda: ["Verda", "GPU cloud", "https://verda.com"],
  azure: ["Microsoft Azure", "Hyperscaler", "https://azure.microsoft.com"],
};

// Explicit Settings deliberately bypasses .env and inherited credentials.
// The library owns collection only; RackRate owns persistence and publication.
const PYTHON_COLLECTION_SETUP = `
import json
from gpu_price_monitor import Settings, __version__, collect_prices
if __version__ != "${LIBRARY_VERSION}":
    raise RuntimeError("Install requirements-collector.txt before refreshing RackRate")
result = collect_prices(${JSON.stringify(REQUIRED_PROVIDERS)}, settings=Settings(source_policy="api_preferred"), include_coverage=True)
`;
export const PYTHON_COLLECTION_CODE = `${PYTHON_COLLECTION_SETUP}
print(json.dumps(result, ensure_ascii=False, allow_nan=False))
`;
export const PYTHON_BUNDLE_COLLECTION_CODE = `${PYTHON_COLLECTION_SETUP}
from gpu_price_monitor import prices_to_csv
print(json.dumps({"result": result, "csv": prices_to_csv(result, profile="full")}, ensure_ascii=False, allow_nan=False))
`;

async function readPublicPython(program, {
  python = collectionPython(),
  exec = execFile,
} = {}) {
  const { stdout } = await exec(python, ["-c", program], {
    encoding: "utf8", timeout: 12 * 60 * 1000, maxBuffer: 32 * 1024 * 1024,
  });
  let result;
  try { result = JSON.parse(stdout); }
  catch { throw new Error("gpu-price-monitor did not return valid JSON; existing data was preserved"); }
  return result;
}

export async function collectPublicLibrary(options = {}) {
  return validatePublicResult(await readPublicPython(PYTHON_COLLECTION_CODE, options));
}

export function publicCsvColumns(csv) {
  const headerEnd = typeof csv === "string" ? csv.indexOf("\r\n") : -1;
  if (headerEnd < 0 || !csv.startsWith("\uFEFF")) {
    throw new Error("Public CSV has an unexpected header; existing data was preserved");
  }
  return csv.slice(1, headerEnd).split(",").map((label) => {
    // The library preserves English column IDs and adds optional Chinese
    // labels in full-width parentheses. Never translate or rewrite CSV rows.
    const match = /^([a-z][a-z0-9_]*)(?:（[^（）,\r\n"]+）)?$/.exec(label);
    if (!match) throw new Error("Public CSV has an unexpected header; existing data was preserved");
    return match[1];
  });
}

export function validatePublicLibraryBundle(bundle) {
  validatePublicResult(bundle?.result);
  const csv = bundle.csv;
  if (typeof csv !== "string" || !csv.startsWith("\uFEFF") || !csv.endsWith("\r\n")) {
    throw new Error("Public CSV is missing its UTF-8 BOM or CRLF framing; existing data was preserved");
  }
  const headerEnd = csv.indexOf("\r\n");
  const columns = publicCsvColumns(csv);
  const required = ["provider", "gpu_model", "amount", "currency", "unit", "price_scope", "availability", "observed_at", "collected_at", "collection_status"];
  if (headerEnd < 0 || headerEnd + 2 === csv.length
      || new Set(columns).size !== columns.length
      || required.some((column) => !columns.includes(column))) {
    throw new Error("Public CSV has no quote rows or an unexpected header; existing data was preserved");
  }
  // CSV may contain quoted commas or newlines. Do not count physical lines or
  // serialize again in JavaScript: Python owns the exact quote projection.
  return bundle;
}

export async function collectPublicLibraryBundle(options = {}) {
  return validatePublicLibraryBundle(await readPublicPython(PYTHON_BUNDLE_COLLECTION_CODE, options));
}

function timestamp(value, label) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function monetaryAmount(value, label) {
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`Invalid ${label}`);
  return amount;
}

function strings(value, label) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry)) {
    throw new Error(`Invalid ${label}`);
  }
  return [...value];
}

export function validatePublicResult(result) {
  if (result?.schema_version !== 1 || result.status !== "success") {
    // Expose known source names and error codes, never arbitrary upstream text.
    const failures = Array.isArray(result?.provider_results) ? result.provider_results
      .filter((source) => REQUIRED_PROVIDERS.includes(source?.provider)
        && (source.status !== "success" || source.error || !(source.returned_count > 0)))
      .map((source) => `${source.provider}${/^[a-z_]{1,64}$/.test(source.error?.code ?? "") ? ` (${source.error.code})` : ""}`) : [];
    throw new Error(`Public collection was incomplete${failures.length ? `: ${failures.join(", ")}` : ""}; existing data was preserved`);
  }
  timestamp(result.collected_at, "collection timestamp");
  if (result.execution?.runtime !== "python" || result.execution?.parsing !== "deterministic_rules"
      || result.execution?.uses_llm !== false || result.execution?.source_policy !== "api_preferred") {
    throw new Error("Unexpected collector execution policy; existing data was preserved");
  }
  if (!Array.isArray(result.prices) || !result.prices.length || !Array.isArray(result.provider_results)) {
    throw new Error("Public collection has no prices or source results");
  }
  const sources = new Map();
  for (const source of result.provider_results) {
    if (sources.has(source.provider) || !REQUIRED_PROVIDERS.includes(source.provider)) {
      throw new Error(`Unexpected or duplicate source: ${source.provider}`);
    }
    if (source.status !== "success" || source.error || source.returned_count < 1) {
      throw new Error(`Required public source failed: ${source.provider}`);
    }
    timestamp(source.observed_at, `${source.provider} timestamp`);
    sources.set(source.provider, source);
  }
  for (const provider of REQUIRED_PROVIDERS) {
    if (!sources.has(provider)) throw new Error(`Missing required public source: ${provider}`);
    const count = result.prices.filter((quote) => quote.provider === provider).length;
    if (count !== sources.get(provider).returned_count) throw new Error(`Source count mismatch: ${provider}`);
  }
  const coverage = result.coverage;
  if (coverage?.collection_status !== "success" || coverage.scope !== "returned_quotes"
      || !Array.isArray(coverage.models) || !Array.isArray(coverage.extra_models)
      || !Array.isArray(coverage.excluded_quote_indices) || coverage.excluded_quote_indices.length) {
    throw new Error("Complete model coverage metadata is required");
  }
  const indices = new Set();
  for (const model of [...coverage.models, ...coverage.extra_models]) {
    if (typeof model.gpu_model !== "string" || !model.gpu_model || !Array.isArray(model.quote_indices)) {
      throw new Error("Invalid model coverage metadata");
    }
    for (const index of model.quote_indices) {
      if (!Number.isSafeInteger(index) || index < 0 || index >= result.prices.length || indices.has(index)) {
        throw new Error("Invalid or duplicated model coverage index");
      }
      indices.add(index);
    }
  }
  if (indices.size !== result.prices.length) throw new Error("Model coverage does not account for every quote");
  return result;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function stableId(quote) {
  // Neither the amount, observed date, availability nor effective date defines a SKU.
  // Keep package/configuration and tariff dimensions so different rates cannot collide.
  const identity = {
    provider: quote.provider, product: quote.product_type,
    model: quote.gpu_model, name: quote.raw_name, sku: quote.raw_sku,
    variant: quote.gpu_variant, vram: quote.vram_gb, count: quote.gpu_count,
    currency: quote.currency, unit: quote.unit, mode: quote.billing_mode,
    basis: quote.price_basis, tier: quote.pricing_tier, cloud: quote.cloud_tier,
    regions: [...(quote.regions ?? [])].sort(), zones: [...(quote.zones ?? [])].sort(),
    resources: quote.resources ?? {}, conditions: quote.conditions ?? {},
    selectedConfiguration: quote.selected_configuration ?? {},
    commitment: quote.minimum_commitment ?? null,
    promotionActivity: quote.promotion?.activity_id ?? null,
    promotionDuration: quote.promotion?.duration ?? null,
    promotionDurationUnit: quote.promotion?.duration_unit ?? null,
    accountScope: quote.account_scope, taxScope: quote.tax_scope,
    productScope: quote.pricing_product_scope ?? null,
    azureMeter: quote.azure_meter?.meter_id ?? null,
  };
  const digest = createHash("sha256").update(JSON.stringify(canonical(identity))).digest("hex").slice(0, 24);
  return `public-${quote.provider}-${digest}`;
}

function vendorFor(model, quote) {
  if (quote.gpu_vendor === "NVIDIA" || quote.gpu_vendor === "AMD") return quote.gpu_vendor;
  if (/^MI\d/.test(model)) return "AMD";
  if (/^(?:RTX|GTX|A\d|H\d|L\d|T\d|V\d|B\d|GB\d|GH\d|P\d)/.test(model)) return "NVIDIA";
  return "Unknown";
}

export function modelSlug(model, vendor) {
  let name = model.replace(/^RTXPRO/, "RTX PRO ").replace(/^RTX(?=[A-Z0-9])/, "RTX ");
  name = name.replace(/(?<=\d)ADA$/, " ADA");
  const slug = name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!slug) throw new Error(`GPU model has no usable slug: ${model}`);
  return `${vendor === "Unknown" ? "gpu" : vendor.toLowerCase()}-${slug}`;
}

function conditionsFor(quote) {
  return [
    ...(quote.notes ?? []),
    ...(quote.pricing_tier ? [`Pricing tier: ${quote.pricing_tier}`] : []),
    ...(quote.cloud_tier ? [`Cloud tier: ${quote.cloud_tier}`] : []),
    ...(quote.membership_required ? ["Membership required; eligibility not verified"] : []),
    ...(quote.minimum_commitment ? [`Minimum commitment: ${JSON.stringify(quote.minimum_commitment)}`] : []),
    ...(quote.promotion ? [`Promotion: ${quote.promotion.title ?? quote.promotion.activity_id}; ${quote.promotion.only_new_users ? "new customers only" : "eligibility must be verified"}${Number.isFinite(quote.promotion.purchase_limit) ? `; purchase limit ${quote.promotion.purchase_limit}` : ""}`] : []),
  ];
}

export function normalizeLibraryResult(result) {
  validatePublicResult(result);
  const models = new Map();
  for (const model of [...result.coverage.models, ...result.coverage.extra_models]) {
    for (const index of model.quote_indices) models.set(index, model.gpu_model);
  }
  const catalog = new Map();
  const offers = result.prices.map((quote, index) => {
    if (!REQUIRED_PROVIDERS.includes(quote.provider) || !["gpu_hour", "gpu_month"].includes(quote.unit)
        || !/^[A-Z]{3}$/.test(quote.currency ?? "")) throw new Error(`Unsupported quote dimensions at ${index}`);
    if (!["quoted", "starting_at", "contact_sales"].includes(quote.quote_status)) {
      throw new Error(`Unsupported quote status at ${index}`);
    }
    const amount = monetaryAmount(quote.amount, `${quote.provider} price`);
    if ((quote.quote_status === "contact_sales") !== (amount === null)) throw new Error(`Missing or unexpected quote amount at ${index}`);
    if (quote.gpu_count !== null && (!Number.isSafeInteger(quote.gpu_count) || quote.gpu_count < 1)) {
      throw new Error(`Invalid GPU count at ${index}`);
    }
    const family = models.get(index);
    const vendor = vendorFor(family, quote);
    const gpuSlug = modelSlug(family, vendor);
    if (!catalog.has(gpuSlug)) catalog.set(gpuSlug, {
      slug: gpuSlug, name: family, shortName: family, vendor,
      architecture: null, vramGb: null, memoryType: null, bandwidth: null,
      released: null, tier: null,
      summary: "Public rental listings grouped by source GPU family. Variant, memory and configuration remain specific to each offer.",
    });
    const regions = strings(quote.regions ?? [], "regions");
    const zones = strings(quote.zones ?? [], "zones");
    const rawAvailability = quote.availability ?? "unknown";
    const availability = ["offline", "unavailable"].includes(rawAvailability) ? "unavailable"
      : ["available", "limited"].includes(rawAvailability) ? rawAvailability : "unknown";
    const billingUnit = quote.unit === "gpu_hour" ? "GPU-hour" : "GPU-month";
    const instance = quote.instance_price;
    const instancePrice = instance ? monetaryAmount(instance.amount, "instance price") : null;
    if (instance && !["instance_hour", "instance_month"].includes(instance.unit)) throw new Error(`Unsupported instance unit at ${index}`);
    const resources = quote.resources ?? {};
    const declaredCountries = strings(quote.compute_countries ?? [], "compute countries");
    if (declaredCountries.some((code) => !/^[A-Z]{2}$/.test(code))) throw new Error(`Invalid compute country at ${index}`);
    const countryBoundScope = !quote.price_scope
      || ["zone_quote", "regional_quote", "requested_zone_quote", "requested_region_quote"].includes(quote.price_scope);
    const computeCountries = countryBoundScope ? declaredCountries : [];
    const countryCode = !countryBoundScope ? ""
      : /^[A-Z]{2}$/.test(quote.location?.country_code ?? "") ? quote.location.country_code
        : computeCountries.length === 1 ? computeCountries[0] : "";
    return {
      id: stableId(quote), gpuSlug, providerSlug: quote.provider, gpuModel: family,
      rawGpuModel: quote.gpu_model, rawName: quote.raw_name ?? null, rawSku: quote.raw_sku ?? null,
      providerSkuId: quote.provider_sku_id ?? quote.azure_meter?.sku_id ?? null,
      gpuVariant: quote.gpu_variant ?? null, vramGb: quote.vram_gb ?? null,
      gpuCount: quote.gpu_count,
      ...(Number.isFinite(resources.vcpus ?? resources.vcpu_count) ? { vcpu: resources.vcpus ?? resources.vcpu_count } : {}),
      ...(Number.isFinite(resources.ram_gb) ? { ramGb: resources.ram_gb } : {}),
      resources,
      sourceAmount: quote.amount, pricePerGpuUnit: amount,
      pricePerGpuHour: quote.currency === "USD" && billingUnit === "GPU-hour" ? amount : null,
      sourceCurrency: quote.currency, billingUnit,
      instancePrice, instanceSourceAmount: instance?.amount ?? null,
      instanceCurrency: instance?.currency ?? null,
      instanceBillingUnit: instance ? instance.unit.replace("_", "-") : null,
      rentalType: quote.billing_mode === "spot" ? "Spot" : quote.billing_mode === "reserved" ? "Reserved"
        : quote.billing_mode === "monthly" ? "Monthly" : quote.billing_mode === "on_demand" ? "On-demand" : "Other",
      billingMode: quote.billing_mode, quoteStatus: quote.quote_status, priceBasis: quote.price_basis,
      pricingTier: quote.pricing_tier ?? null, cloudTier: quote.cloud_tier ?? null,
      membershipRequired: quote.membership_required ?? null, membershipDiscount: quote.membership_discount ?? null,
      promotion: quote.promotion ?? null, selectedConfiguration: quote.selected_configuration ?? null,
      sourceConditions: quote.conditions ?? null, minimumCommitment: quote.minimum_commitment ?? null,
      pricingProductScope: quote.pricing_product_scope ?? null, billingMeter: quote.billing_meter ?? null,
      region: regions.length ? regions.join(", ") : "Not published", regions, zones,
      geographicScope: quote.geographic_scope ?? "unspecified", regionScope: quote.geographic_scope ?? "unspecified",
      countryCode, computeCountries, location: quote.location ?? null,
      priceScope: quote.price_scope ?? null, locationSource: quote.location_source ?? null,
      regionPriceVerified: quote.region_price_verified ?? null,
      coverageRegions: strings(quote.coverage_regions ?? [], "coverage regions"),
      coverageCountries: strings(quote.coverage_countries ?? [], "coverage countries"),
      availability, sourceAvailability: rawAvailability,
      egress: "Not published", sourceUrl: quote.public_url ?? quote.source_url,
      apiSourceUrl: quote.public_url ? quote.source_url : null,
      sourceType: quote.source_type, observedAt: timestamp(quote.observed_at, "quote timestamp"),
      effectiveFrom: quote.effective_from ?? null, effectiveUntil: quote.effective_until ?? null,
      sourceSnapshotAt: quote.source_snapshot_at ?? null,
      accountScope: quote.account_scope ?? "unspecified", taxScope: quote.tax_scope ?? "unspecified",
      productType: quote.product_type, conditions: conditionsFor(quote),
      dataStatus: "official-page", sourceQuoteIndex: index,
    };
  });
  validateOffers(offers);
  return {
    offers,
    generatedCatalog: {
      gpus: [...catalog.values()].sort((a, b) => a.slug.localeCompare(b.slug)),
      providers: REQUIRED_PROVIDERS.map((slug) => {
        const [name, type, website] = PROVIDERS[slug];
        return { slug, name, type, hq: null, billing: "As published", website,
          summary: "Official public rental prices collected by gpu-price-monitor. Check individual records for region, billing and availability conditions." };
      }),
    },
  };
}

export function validateOffers(offers, { requireUsd = false, rates } = {}) {
  const ids = new Set();
  for (const offer of offers) {
    if (ids.has(offer.id)) throw new Error(`Duplicate offer id: ${offer.id}`);
    ids.add(offer.id);
    const amount = offer.pricePerGpuUnit ?? offer.pricePerGpuHour;
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) throw new Error(`Invalid native price: ${offer.id}`);
    if (amount === null && offer.quoteStatus !== "contact_sales") throw new Error(`Unquoted offer is not contact-sales: ${offer.id}`);
    if (!requireUsd && offer.pricePerGpuHour !== null && (offer.sourceCurrency !== "USD" || offer.billingUnit !== "GPU-hour")) {
      throw new Error(`Mixed units in hourly comparison: ${offer.id}`);
    }
    if (requireUsd) {
      const expected = offer.sourceAmount === null ? null : convertAmountToUsd(offer.sourceAmount, offer.sourceCurrency, rates);
      if (offer.priceUsdPerGpuUnit !== (expected?.amount ?? null)
          || offer.usdSourceAmount !== (expected?.decimal ?? null)
          || offer.pricePerGpuHour !== (offer.billingUnit === "GPU-hour" ? expected?.amount ?? null : null)) {
        throw new Error(`USD amount does not match exact source conversion: ${offer.id}`);
      }
      const fx = offer.fx;
      if (!fx || fx.sourceCurrency !== offer.sourceCurrency || fx.targetCurrency !== "USD"
          || fx.rateDate !== rates.rateDate || fx.sourceUrl !== rates.sourceUrl || fx.sourceName !== rates.sourceName
          || fx.rateToUsdDecimal !== rates.ratesToUsd[offer.sourceCurrency]
          || fx.rateToUsd !== Number(rates.ratesToUsd[offer.sourceCurrency])
          || fx.converted !== (offer.sourceCurrency !== "USD")) {
        throw new Error(`USD conversion provenance is missing or inconsistent: ${offer.id}`);
      }
      const instance = offer.instancePrice == null ? null : convertAmountToUsd(offer.instanceSourceAmount, offer.instanceCurrency ?? offer.sourceCurrency, rates);
      if (offer.instancePriceUsd !== (instance?.amount ?? null) || offer.instanceUsdSourceAmount !== (instance?.decimal ?? null)) {
        throw new Error(`USD instance amount does not match exact source conversion: ${offer.id}`);
      }
    }
  }
}

export function buildRackRateDataset(_current, libraryResult) {
  const { offers: publicOffers, generatedCatalog } = normalizeLibraryResult(libraryResult);
  // Only this collection's nine source results define the current dataset.
  // Earlier references remain in dated history; they are never re-observed.
  const offers = publicOffers.sort((a, b) => a.id.localeCompare(b.id));
  validateOffers(offers);
  return {
    schemaVersion: 2,
    generatedAt: libraryResult.collected_at,
    collector: { name: "gpu-price-monitor", version: LIBRARY_VERSION, commit: LIBRARY_COMMIT, mode: "public-only", providers: [...REQUIRED_PROVIDERS], sourcePolicy: "api_preferred", runtime: "python", usesLlm: false },
    generatedCatalog, coverage: libraryResult.coverage,
    sources: [
      ...libraryResult.provider_results.map((source) => ({ provider: source.provider, url: source.source_url,
        additionalUrls: source.additional_source_urls ?? [],
        collectionMethod: source.collection_method ?? null, selectionReason: source.selection_reason ?? null,
        fallbackReason: source.fallback_reason ?? null, apiEndpoint: source.api_endpoint ?? null,
        status: "ok", fetchedAt: source.observed_at, offerCount: source.returned_count, sourceType: source.source_type })),
    ],
    offers,
  };
}
