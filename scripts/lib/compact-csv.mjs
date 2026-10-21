import { convertAmountToUsd } from "./fx.mjs";
import { comparableCountryCodes, isComparableRegionalOffer } from "../../lib/offer-geography.mjs";

export const COMPACT_CSV_HEADERS = Object.freeze([
  "GPU型号/规格", "平台", "国家/地区", "美元参考价（USD/卡/小时）", "官网报价（原币）",
  "计费周期", "价格类型/条件", "可用状态", "官网链接", "采集时间（北京时间）",
]);

const regionalScopes = new Set(["zone_quote", "regional_quote", "requested_zone_quote", "requested_region_quote"]);
const countryNames = new Intl.DisplayNames(["zh-CN"], { type: "region" });
const natural = new Intl.Collator("en", { numeric: true });
const clock = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
const unique = (values) => [...new Set(values.filter((value) => typeof value === "string" && value.trim()))];
const countryCodes = (values) => unique(values).filter((code) => /^[A-Z]{2}$/.test(code) && !["EU", "GL"].includes(code));
const countryLabel = (code) => `${countryNames.of(code) ?? code} ${code}`;

function decimal(value, label) {
  if (typeof value !== "string" || value.length > 128 || !/^\d+(?:\.\d+)?$/.test(value)
      || !Number.isFinite(Number(value))) throw new Error(`Missing or invalid exact ${label}`);
  return value;
}

function configuration(offer, catalog) {
  const model = offer.gpuModel ?? catalog?.name ?? offer.rawGpuModel ?? offer.gpuSlug;
  const parts = [model];
  if (offer.gpuVariant && !String(model).toLowerCase().includes(offer.gpuVariant.toLowerCase())) parts.push(offer.gpuVariant);
  if (offer.vramGb != null) parts.push(`${offer.vramGb}GB显存`);
  if (offer.gpuCount != null) parts.push(`${offer.gpuCount}卡实例`);
  const resources = offer.resources ?? {};
  const cpu = resources.vcpus ?? resources.vcpu_count ?? resources.cpu_count ?? offer.vcpu;
  if (cpu != null) parts.push(`${cpu}CPU`);
  const perGpu = resources.allocation_scope === "per_gpu" ? "/卡" : "";
  const memory = [["memory_gib", "GiB"], ["ram_gib", "GiB"], ["ram_gb", "GB"], ["memory_gb", "GB"], ["memory_mb", "MB"], ["ram_mb", "MB"]]
    .find(([key]) => resources[key] != null);
  if (memory) parts.push(`${resources[memory[0]]}${memory[1]}内存${perGpu}`);
  else if (offer.ramGb != null) parts.push(`${offer.ramGb}GB内存${perGpu}`);
  const storage = resources.storage;
  if (storage?.amount != null) parts.push(`${storage.amount}${storage.unit ?? ""}${storage.type ? ` ${storage.type}` : ""}盘`);
  else if (resources.disk_gb != null) parts.push(`${resources.disk_gb}GB盘`);
  if (resources.bandwidth_mbps != null) parts.push(`${resources.bandwidth_mbps}Mbps`);
  return parts.filter((value) => value != null && value !== "").join(" / ");
}

function geography(offer) {
  const coverage = offer.priceScope === "platform_coverage" || (!offer.priceScope
    && offer.conditions?.some((condition) => /not a region-specific price quote/i.test(condition)));
  if (coverage) {
    const footprint = unique([
      ...countryCodes(offer.coverageCountries ?? []).map(countryLabel),
      ...(offer.coverageRegions ?? offer.regions ?? []),
    ]);
    return `价格适用地区未核实；平台覆盖：${footprint.join(" / ") || "未公布"}（非地区报价）`;
  }
  // The export makes no country inference from currency, headquarters, capacity
  // inventory or a generic catalogue. Unverified scopes stay unverified.
  if (!regionalScopes.has(offer.priceScope)) return "价格适用地区未核实";
  const countries = comparableCountryCodes(offer);
  const regions = unique([...(offer.regions ?? []), ...(offer.zones ?? [])]);
  if (!countries.length && !regions.length) return "价格适用地区未核实";
  return unique([countries.length ? countries.map(countryLabel).join("、") : "国家待核实", ...regions]).join(" / ");
}

function originalPrice(offer) {
  if (offer.sourceAmount == null) {
    if (offer.quoteStatus !== "contact_sales") throw new Error(`Unquoted offer is not contact sales: ${offer.id}`);
    return "需询价";
  }
  const unit = offer.billingUnit === "GPU-month" ? "月" : "小时";
  if (offer.priceBasis === "instance_total_allocated") {
    if (offer.instanceBillingUnit !== `instance-${offer.billingUnit === "GPU-month" ? "month" : "hour"}`) {
      throw new Error(`Instance billing period does not match per-GPU period: ${offer.id}`);
    }
    return `${decimal(offer.instanceSourceAmount, "instance source amount")} ${offer.instanceCurrency ?? offer.sourceCurrency}/整机/${unit}`;
  }
  return `${decimal(offer.sourceAmount, "source amount")} ${offer.sourceCurrency}/卡/${unit}${offer.quoteStatus === "starting_at" ? "起" : ""}`;
}

function usdPrice(offer, fx) {
  if (offer.sourceAmount == null) return "需询价";
  decimal(offer.sourceAmount, "source amount");
  if (offer.usdSourceAmount != null) return decimal(offer.usdSourceAmount, "USD amount");
  if (offer.sourceCurrency === "USD") return offer.sourceAmount;
  return convertAmountToUsd(offer.sourceAmount, offer.sourceCurrency, fx).decimal;
}

function sourceValue(value) {
  if (Array.isArray(value)) return value.map(sourceValue).join("、");
  if (value && typeof value === "object") return Object.entries(value)
    .filter(([, entry]) => entry != null && entry !== "")
    .map(([key, entry]) => `${key}: ${sourceValue(entry)}`).join("；");
  return String(value);
}

function conditions(offer, datasetFx) {
  const labels = [];
  const member = offer.membershipRequired === true || offer.pricingTier === "member";
  labels.push(member ? "会员价（会员资格未核验）" : "普通价");
  const mode = offer.billingMode ?? offer.rentalType;
  labels.push(({ on_demand: "按需", "On-demand": "按需", spot: "Spot竞价（可中断）", Spot: "Spot竞价（可中断）", monthly: "月包", Monthly: "月包", reserved: "预留", Reserved: "预留" })[mode] ?? mode);
  if (["spot", "Spot"].includes(mode)) {
    labels.push("动态价");
    if (offer.effectiveFrom) labels.push(`生效${observedAt(offer.effectiveFrom)}（北京时间）`);
    if (offer.sourceSnapshotAt) labels.push(`API最早采样${observedAt(offer.sourceSnapshotAt)}（北京时间）`);
  }
  if (offer.pricingTier && !["member", "regular"].includes(offer.pricingTier)) labels.push(`价格层级：${offer.pricingTier}`);
  if (offer.cloudTier) labels.push(({ secure: "Secure云", community: "Community云" })[offer.cloudTier] ?? `云层级：${offer.cloudTier}`);
  if (offer.priceBasis === "gpu_component") labels.push("仅GPU组件价，整机另计");
  if (offer.priceBasis === "instance_total_allocated") labels.push(`整机总价按${offer.gpuCount ?? "所含"}卡分摊`);
  if (offer.quoteStatus === "starting_at") labels.push("起步价");
  if (offer.quoteStatus === "contact_sales") labels.push("联系销售询价");
  const account = offer.accountScope;
  if (account && !["public_catalog", "unspecified"].includes(account)) labels.push(`账户适用范围：${account}`);
  labels.push("账户资格及最终结算未核验");
  labels.push(({ included: "含税", excluded: "不含税", unspecified: "税务待核实" })[offer.taxScope ?? "unspecified"] ?? `税务口径：${offer.taxScope}`);
  const promotion = offer.promotion;
  if (promotion) {
    labels.push("促销资格未核验");
    if (promotion.only_new_users) labels.push("仅新用户");
    if (promotion.duration != null) labels.push(`套餐期限${promotion.duration}${promotion.duration_unit === "month" ? "个月" : promotion.duration_unit ?? ""}`);
    if (promotion.purchase_limit != null) labels.push(`限购${promotion.purchase_limit}台`);
  }
  if (offer.minimumCommitment != null) labels.push(`最低承诺：${sourceValue(offer.minimumCommitment)}`);
  if (offer.sourceConditions) labels.push(`官网条件：${sourceValue(offer.sourceConditions)}`);
  // Keep published account, tax, regional eligibility and extra-charge caveats
  // rather than inventing provider-specific conditions in the application.
  for (const condition of offer.conditions ?? []) {
    if (/tax|vat|gst|israel|account|eligib|storage|disk|network|egress|transfer|windows|commitment|minimum|new.customer|promotion|purchase limit|reclaim|interrupt|charged separately|另计|税|资格|限购/i.test(condition)) labels.push(condition);
  }
  if (offer.sourceCurrency !== "USD" && offer.sourceAmount != null) {
    const fx = offer.fx ?? datasetFx;
    const rate = fx?.rateToUsdDecimal ?? fx?.ratesToUsd?.[offer.sourceCurrency];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fx?.rateDate ?? "") || !rate || !fx?.sourceUrl) {
      throw new Error(`Converted price requires dated FX provenance: ${offer.id}`);
    }
    labels.push(`美元为参考折算；汇率日期${fx.rateDate}；1 ${offer.sourceCurrency} = ${rate} USD；${fx.sourceName ?? "汇率来源"} ${fx.sourceUrl}`);
    if (fx.rounding) labels.push(`折算精度：${fx.rounding}`);
  }
  return unique(labels).join("；");
}

function observedAt(value) {
  // A date alone cannot establish a collection time in Beijing.
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)
      || !Number.isFinite(Date.parse(value))) throw new Error("Collection timestamp requires an explicit timezone");
  return clock.format(new Date(value));
}

/** Application projection only: eligible regional hourly quotes, exact decimal strings,
 * native instance/per-card basis, source period, and provenance in ten columns.
 * The collector's source CSV remains a separate, unmodified library export. */
export function buildCompactPriceTable(dataset) {
  if (!Array.isArray(dataset?.offers)) throw new Error("Compact CSV requires an offers dataset");
  const providers = new Map((dataset.generatedCatalog?.providers ?? []).map((provider) => [provider.slug, provider.name]));
  const gpus = new Map((dataset.generatedCatalog?.gpus ?? []).map((gpu) => [gpu.slug, gpu]));
  const offers = dataset.offers.filter(isComparableRegionalOffer).sort((a, b) => natural.compare(a.gpuModel ?? a.gpuSlug, b.gpuModel ?? b.gpuSlug)
    || natural.compare(a.billingUnit, b.billingUnit) || natural.compare(a.billingMode ?? a.rentalType, b.billingMode ?? b.rentalType)
    || (a.priceUsdPerGpuUnit ?? Infinity) - (b.priceUsdPerGpuUnit ?? Infinity)
    || natural.compare(a.providerSlug, b.providerSlug) || natural.compare(a.id, b.id));
  const rows = offers.map((offer) => {
    if (!["GPU-hour", "GPU-month"].includes(offer.billingUnit)) throw new Error(`Unsupported billing period: ${offer.billingUnit}`);
    const status = offer.sourceAvailability ?? offer.availability;
    return [
      configuration(offer, gpus.get(offer.gpuSlug)), providers.get(offer.providerSlug) ?? offer.providerSlug,
      geography(offer), usdPrice(offer, dataset.fx), originalPrice(offer),
      offer.billingUnit === "GPU-hour" ? "每小时" : "每月",
      conditions(offer, dataset.fx),
      ({ offline: "已下线", unavailable: "不可用", available: "可用", limited: "库存有限", unknown: "库存未核实" })[status] ?? "库存未核实",
      offer.sourceUrl, observedAt(offer.observedAt),
    ];
  });
  return { headers: [...COMPACT_CSV_HEADERS], rows };
}

function csvCell(value) {
  let text = value == null ? "" : String(value);
  // Leading whitespace/control characters can hide a spreadsheet formula.
  if (/^[\s\u0000-\u001f\u007f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function compactPricesToCsv(dataset) {
  const { headers, rows } = buildCompactPriceTable(dataset);
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
