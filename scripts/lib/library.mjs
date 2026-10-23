import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { convertAmountToUsd } from "./fx.mjs";

const execFile = promisify(execFileCallback);
export const LIBRARY_VERSION = "0.24.0";
export const LIBRARY_COMMIT = "d9406e4f80febac332a25899ef1b390adb832576";
const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export function collectionPython({ explicit = process.env.GPU_PRICE_MONITOR_PYTHON, root = repositoryRoot, exists = existsSync } = {}) {
  if (explicit) return explicit;
  const candidates = process.platform === "win32"
    ? [join(root, ".venv", "Scripts", "python.exe"), join(root, ".venv", "bin", "python")]
    : [join(root, ".venv", "bin", "python"), join(root, ".venv", "Scripts", "python.exe")];
  return candidates.find((candidate) => exists(candidate)) ?? "python3";
}
export const REQUIRED_PROVIDERS = Object.freeze([
  "nebius", "crusoe", "lambda", "ucloud", "autodl", "runpod", "azure", "digitalocean", "verda", "vast",
]);
export const EXTENSION_PROVIDERS = Object.freeze(["azure", "digitalocean", "verda", "vast"]);

const PROVIDERS = {
  nebius: ["Nebius", "GPU cloud", "https://nebius.com"],
  crusoe: ["Crusoe", "GPU cloud", "https://www.crusoe.ai"],
  lambda: ["Lambda", "GPU cloud", "https://lambda.ai"],
  ucloud: ["UCloud", "GPU cloud", "https://www.ucloud.cn"],
  autodl: ["AutoDL", "Marketplace", "https://www.autodl.com"],
  runpod: ["RunPod", "GPU cloud", "https://www.runpod.io"],
  azure: ["Microsoft Azure", "Hyperscaler", "https://azure.microsoft.com"],
  digitalocean: ["DigitalOcean", "Cloud", "https://www.digitalocean.com"],
  verda: ["Verda", "GPU cloud", "https://verda.com"],
  vast: ["Vast.ai", "Marketplace", "https://vast.ai"],
};

// Settings() deliberately bypasses .env and credentials inherited by this process.
// The library owns collection only; RackRate owns persistence and publication.
export const PYTHON_COLLECTION_CODE = `
import json
from gpu_price_monitor import Settings, __version__, collect_prices, prices_to_provider_csvs, provider_csv_coverage
if __version__ != "${LIBRARY_VERSION}":
    raise RuntimeError("Install requirements-collector.txt before refreshing RackRate")
result = collect_prices(${JSON.stringify(REQUIRED_PROVIDERS)}, settings=Settings(), include_coverage=True)
result["provider_exports"] = {"schema_version": 1, "tables": prices_to_provider_csvs(result), "coverage": provider_csv_coverage(result)}
print(json.dumps(result, ensure_ascii=False, allow_nan=False))
`;

export function collectionMode(value = process.env.RACKRATE_COLLECTION_MODE) {
  const mode = value || "public";
  if (!["public", "authorized"].includes(mode)) throw new Error("RACKRATE_COLLECTION_MODE must be public or authorized");
  return mode;
}

export const AUTHORIZED_SECRET_NAMES = Object.freeze([
  "RACKRATE_LAMBDA_STORAGE_STATE_JSON", "RACKRATE_AUTODL_STORAGE_STATE_JSON",
  "RACKRATE_UCLOUD_CONSOLE_SESSION_JSON", "RACKRATE_NEBIUS_ACCESS_TOKEN",
]);

export function collectionEnvironment(mode, env = process.env) {
  // No unrelated application/API credentials, dotenv selectors or source overrides
  // enter the child. PYTHONPATH supports an explicit local source test checkout.
  const allowed = ["PATH", "HOME", "LANG", "LC_ALL", "TZ", "TMPDIR", "TEMP", "TMP", "SystemRoot", "PYTHONPATH"];
  const output = Object.fromEntries(allowed.filter((key) => typeof env[key] === "string").map((key) => [key, env[key]]));
  if (collectionMode(mode) === "authorized") {
    const authMode = env.RACKRATE_NEBIUS_AUTH_MODE || "token";
    if (!["token", "oidc", "public"].includes(authMode)) throw new Error("RACKRATE_NEBIUS_AUTH_MODE must be token, oidc or public");
    output.RACKRATE_NEBIUS_AUTH_MODE = authMode;
    const required = authMode === "public" ? AUTHORIZED_SECRET_NAMES.slice(0, 3) : authMode === "token" ? AUTHORIZED_SECRET_NAMES : [
      ...AUTHORIZED_SECRET_NAMES.slice(0, 3), "ACTIONS_ID_TOKEN_REQUEST_URL", "ACTIONS_ID_TOKEN_REQUEST_TOKEN",
      "GITHUB_REPOSITORY", "GITHUB_REF", "RACKRATE_NEBIUS_SERVICE_ACCOUNT_ID", "RACKRATE_NEBIUS_OIDC_AUDIENCE",
    ];
    for (const key of required) {
      if (typeof env[key] !== "string" || !env[key].trim()) throw new Error("Authorized collection requires all configured credentials; existing data was preserved");
      output[key] = env[key];
    }
  }
  return output;
}

const DIAGNOSTIC_CODES = new Set([
  "authentication_error", "configuration_error", "rate_limited", "http_error", "timeout", "network_error", "invalid_json", "invalid_response", "response_incomplete", "response_too_large", "redirect_rejected",
    "authorized_collection_failed", "invalid_nebius_auth_mode", "missing_required_credential", "invalid_credential_file",
  "collector_version_mismatch", "source_incomplete", "source_count_mismatch", "source_coverage_mismatch",
  "sensitive_output_rejected", "unreviewed_publication_field", "authentication_failed", "request_failed", "parse_failed",
  "oidc_redirect_rejected", "oidc_request_failed", "oidc_response_invalid", "oidc_configuration_missing",
  "oidc_subject_not_allowed", "oidc_configuration_invalid", "oidc_endpoint_rejected", "oidc_identity_invalid",
  "oidc_access_token_invalid", "oidc_exchange_failed",
]);
const DIAGNOSTIC_STAGES = new Set(["library", "credentials", "publication", "oidc_configuration", "oidc_github_identity",
  "oidc_exchange", "nebius_public", "nebius_account", "lambda", "crusoe", "autodl", "ucloud", "runpod", "azure", "digitalocean", "verda", "vast"]);

export function authorizedFailureDiagnostic(error) {
  // Never interpolate arbitrary stderr/message/URL. Only an exact, bounded
  // protocol line and two independently allowlisted constants cross this boundary.
  const stderr = error?.stderr;
  if (typeof stderr !== "string" || stderr.length > 512) return "library/authorized_collection_failed";
  const match = /^RACKRATE_DIAGNOSTIC (\{[^\r\n]+\})\n?$/.exec(stderr);
  if (!match) return "library/authorized_collection_failed";
  try {
    const value = JSON.parse(match[1]);
    if (Object.keys(value).length === 2 && DIAGNOSTIC_STAGES.has(value.stage) && DIAGNOSTIC_CODES.has(value.code)) {
      return `${value.stage}/${value.code}`;
    }
  } catch { /* Ignore malformed diagnostics without echoing them. */ }
  return "library/authorized_collection_failed";
}

export async function collectAuthorizedLibrary({ python = collectionPython(), exec = execFile, env = process.env } = {}) {
  const childEnv = collectionEnvironment("authorized", env);
  let stdout;
  try {
    ({ stdout } = await exec(python, [join(repositoryRoot, "scripts", "collect-authorized.py"), LIBRARY_VERSION], {
      encoding: "utf8", timeout: 35 * 60 * 1000, maxBuffer: 64 * 1024 * 1024, env: childEnv,
    }));
  } catch (error) {
    // child_process errors can contain stdout/stderr, command and environment.
    throw new Error(`Authorized collection failed [${authorizedFailureDiagnostic(error)}]. Existing data was preserved`);
  }
  let result;
  try { result = JSON.parse(stdout); }
  catch { throw new Error("gpu-price-monitor did not return valid JSON; existing data was preserved"); }
  if (result.collection_mode !== "authorized") throw new Error("Authorized collection mode mismatch");
  validatePublicResult(result);
  return result;
}

export function collectLibrary(options = {}) {
  return collectionMode(options.mode) === "authorized" ? collectAuthorizedLibrary(options) : collectPublicLibrary(options);
}

export async function collectPublicLibrary({
  python = collectionPython(),
  exec = execFile,
} = {}) {
  let stdout;
  try {
    ({ stdout } = await exec(python, ["-c", PYTHON_COLLECTION_CODE], {
      encoding: "utf8", timeout: 12 * 60 * 1000, maxBuffer: 32 * 1024 * 1024,
      env: collectionEnvironment("public"),
    }));
  } catch { throw new Error("Public collection failed; existing data was preserved"); }
  let result;
  try { result = JSON.parse(stdout); }
  catch { throw new Error("gpu-price-monitor did not return valid JSON; existing data was preserved"); }
  validatePublicResult(result);
  return result;
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

const AUTHORIZED_PLAN = {
  nebius: ["nebius_public", "nebius_account"], crusoe: ["crusoe"],
  lambda: ["lambda"], ucloud: ["ucloud"], autodl: ["autodl"], runpod: ["runpod"], azure: ["azure"], digitalocean: ["digitalocean"], verda: ["verda"], vast: ["vast"],
};
const SAFE_NEBIUS_LIMITS = new Set([
  "documented_public_region:no_accessible_project",
  "other_accounts_and_contracts:outside_authorized_account_scope",
  "regional_compute_tariff:compute_tariff_unavailable",
]);

export function authorizedSourceVerified(source) {
  if (EXTENSION_PROVIDERS.includes(source?.provider) && source.status === "failed") {
    return source.returned_count === 0 && source.error?.code === "extension_source_failed"
      && Object.keys(source.error).length === 1 && Array.isArray(source.source_observations) && source.source_observations.length === 0
      && Array.isArray(source.source_exclusions) && source.source_exclusions.length === 0;
  }
  const exclusions = source?.source_exclusions ?? [];
  const publicNebius = source?.provider === "nebius" && Array.isArray(exclusions) && exclusions.length === 1 && exclusions[0] && typeof exclusions[0] === "object"
    && Object.keys(exclusions[0]).length === 3 && exclusions[0].selection === "nebius_account"
    && exclusions[0].reason === "billing_setup_required" && exclusions[0].status === "excluded_by_configuration";
  if (!Array.isArray(exclusions) || (exclusions.length && !publicNebius)) return false;
  const expected = publicNebius ? ["nebius_public"] : AUTHORIZED_PLAN[source?.provider];
  const observations = source?.source_observations;
  if (!expected || !Array.isArray(observations) || observations.length !== expected.length || source.error) return false;
  let count = 0, partial = publicNebius;
  for (let index = 0; index < expected.length; index++) {
    const item = observations[index];
    if (item.selection !== expected[index] || !Number.isSafeInteger(item.returned_count) || item.returned_count < 1
        || !Number.isFinite(Date.parse(item.observed_at)) || !Array.isArray(item.limitations)) return false;
    if (item.status === "partial") {
      const allowed = item.selection === "nebius_account" ? SAFE_NEBIUS_LIMITS
        : item.selection === "autodl" ? new Set(["market_region_country:country_not_verified"])
        : item.selection === "vast" ? new Set(["bounded_marketplace_search:complete_marketplace_not_verified"]) : new Set();
      if (!item.limitations.length || item.limitations.some((gap) => !allowed.has(`${gap.scope}:${gap.status}`))) return false;
      partial = true;
    } else if (item.status !== "success" || item.limitations.length) return false;
    count += item.returned_count;
  }
  return source.returned_count === count && source.status === (partial ? "partial" : "success");
}

export function validatePublicResult(result) {
  const authorized = result?.collection_mode === "authorized";
  const validMode = !result?.collection_mode || ["public", "authorized"].includes(result.collection_mode);
  const statusValid = result?.status === "success" || (authorized && result?.status === "partial");
  if (result?.schema_version !== 1 || !validMode || !statusValid
      || (authorized && result.validation_policy !== "visible-catalog-v1")) {
    // Expose known source names and error codes, never arbitrary upstream text.
    const failures = Array.isArray(result?.provider_results) ? result.provider_results
      .filter((source) => REQUIRED_PROVIDERS.includes(source?.provider)
        && (source.status !== "success" || source.error || !(source.returned_count > 0)))
      .map((source) => `${source.provider}${/^[a-z_]{1,64}$/.test(source.error?.code ?? "") ? ` (${source.error.code})` : ""}`) : [];
    throw new Error(`Public collection was incomplete${failures.length ? `: ${failures.join(", ")}` : ""}; existing data was preserved`);
  }
  timestamp(result.collected_at, "collection timestamp");
  if (!Array.isArray(result.prices) || !result.prices.length || !Array.isArray(result.provider_results)) {
    throw new Error("Public collection has no prices or source results");
  }
  const sources = new Map();
  for (const source of result.provider_results) {
    if (sources.has(source.provider) || !REQUIRED_PROVIDERS.includes(source.provider)) {
      throw new Error(`Unexpected or duplicate source: ${source.provider}`);
    }
    if ((authorized ? !authorizedSourceVerified(source) : source.status !== "success" || source.error) || (source.returned_count < 1 && !(authorized && EXTENSION_PROVIDERS.includes(source.provider) && source.status === "failed"))) {
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
  if (authorized && result.status !== (result.provider_results.some((source) => source.status !== "success") ? "partial" : "success")) {
    throw new Error("Authorized collection status does not match its source observations");
  }
  const coverage = result.coverage;
  if (coverage?.collection_status !== result.status || coverage.scope !== "returned_quotes"
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
    ...(quote.collection_source ? { collectionSource: quote.collection_source, sourceType: quote.source_type, sourceUrl: quote.source_url } : {}),
    ...(quote.source_partition ? { sourcePartition: quote.source_partition } : {}),
    ...(quote.visible_source ? { visibleSource: quote.visible_source } : {}),
    ...(quote.source_conditions ? { sourceConditions: quote.source_conditions } : {}),
    ...(quote.configuration_id ? { configurationId: quote.configuration_id } : {}),
    ...(quote.requested_configuration ? { requestedConfiguration: quote.requested_configuration } : {}),
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
    ...(Array.isArray(quote.conditions) ? quote.conditions : []),
    ...(Array.isArray(quote.source_conditions) ? quote.source_conditions : []),
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
      || ["zone_quote", "regional_quote", "country_quote", "requested_zone_quote", "requested_region_quote"].includes(quote.price_scope);
    const computeCountries = countryBoundScope ? declaredCountries : [];
    const countryCode = !countryBoundScope ? ""
      : /^[A-Z]{2}$/.test(quote.location?.country_code ?? "") ? quote.location.country_code
        : computeCountries.length === 1 ? computeCountries[0] : "";
    return {
      id: stableId(quote), gpuSlug, providerSlug: quote.provider, gpuModel: family,
      rawGpuModel: quote.gpu_model, rawName: quote.raw_name ?? null, rawSku: quote.raw_sku ?? null,
      gpuVariant: quote.gpu_variant ?? null, vramGb: quote.vram_gb ?? null,
      gpuCount: quote.gpu_count,
      ...(Number.isFinite(resources.vcpus ?? resources.vcpu_count) ? { vcpu: resources.vcpus ?? resources.vcpu_count } : {}),
      ...(Number.isFinite(resources.ram_gb) ? { ramGb: resources.ram_gb } : {}),
      resources,
      sourceAmount: quote.amount, pricePerGpuUnit: amount,
      exactApiHourlyAmount: quote.exact_api_hourly_amount ?? null, priceSource: quote.price_source ?? null,
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
      sourceConditions: quote.source_conditions ?? quote.conditions ?? null, minimumCommitment: quote.minimum_commitment ?? null,
      quoteConditions: quote.conditions ?? null, requestedConfiguration: quote.requested_configuration ?? null,
      configurationId: quote.configuration_id ?? null, imageSelection: quote.image_selection ?? null,
      networkSelection: quote.network_selection ?? null, normalization: quote.normalization ?? null,
      storageQuote: quote.storage_quote ?? null, fullConfigurationPrice: quote.full_configuration_price ?? null,
      applicableRegions: quote.applicable_regions ?? [], applicableCountries: quote.applicable_countries ?? [],
      priceApplicability: quote.price_applicability ?? null, capacityLocations: quote.capacity_locations ?? [],
      collectionSource: quote.collection_source ?? null, visibleSource: quote.visible_source ?? null,
      sourcePartition: quote.source_partition ?? null,
      pricingProductScope: quote.pricing_product_scope ?? null, billingMeter: quote.billing_meter ?? null,
      region: regions.length ? regions.join(", ") : "Not published", regions, zones,
      geographicScope: quote.geographic_scope ?? "unspecified", regionScope: quote.geographic_scope ?? "unspecified",
      countryCode, computeCountries, location: quote.location ?? null,
      priceScope: quote.price_scope ?? null, locationSource: quote.location_source ?? null,
      availability, sourceAvailability: rawAvailability,
      egress: "Not published", sourceUrl: quote.source_url,
      apiSourceUrl: quote.api_source_url ?? null, priceBasisSourceUrl: quote.price_basis_source_url ?? null,
      sourceType: quote.source_type, observedAt: timestamp(quote.observed_at, "quote timestamp"),
      effectiveFrom: quote.effective_from ?? null, effectiveUntil: quote.effective_until ?? null,
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
          summary: "Official public and selected signed-in prices collected by gpu-price-monitor. Check individual records for region, billing and availability conditions." };
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
  // Only this collection's ten source results define the current dataset.
  // Earlier references remain in dated history; they are never re-observed.
  const offers = publicOffers.sort((a, b) => a.id.localeCompare(b.id));
  validateOffers(offers);
  return {
    schemaVersion: 2,
    generatedAt: libraryResult.collected_at,
    collector: { name: "gpu-price-monitor", version: LIBRARY_VERSION, commit: LIBRARY_COMMIT, mode: libraryResult.collection_mode === "authorized" ? "authorized" : "public-only", validationPolicy: libraryResult.validation_policy ?? null, providers: [...REQUIRED_PROVIDERS],
      execution: libraryResult.assembly?.method === "recorded-source-replay" ? "recorded-source-replay" : "live-collection" },
    generatedCatalog, coverage: libraryResult.coverage,
    sources: [
      ...libraryResult.provider_results.map((source) => ({ provider: source.provider, url: source.source_url,
        status: source.status === "failed" ? "failed" : "ok", failureCode: source.status === "failed" ? "extension_source_failed" : null, collectionStatus: source.status, sourceObservations: source.source_observations ?? null, sourceExclusions: source.source_exclusions ?? [], fetchedAt: source.observed_at, offerCount: source.returned_count, sourceType: source.source_type })),
    ],
    offers,
  };
}
