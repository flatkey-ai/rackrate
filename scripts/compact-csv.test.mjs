import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildCompactPriceTable, compactPricesToCsv, COMPACT_CSV_HEADERS } from "./lib/compact-csv.mjs";
import { isComparableRegionalOffer } from "../lib/offer-geography.mjs";

const quote = (overrides = {}) => ({
  id: "one", providerSlug: "example", gpuSlug: "nvidia-h100", gpuModel: "H100", gpuVariant: "SXM", vramGb: 80,
  gpuCount: 1, sourceAmount: "1.2300", sourceCurrency: "USD", usdSourceAmount: "1.2300", pricePerGpuUnit: 1.23, priceUsdPerGpuUnit: 1.23,
  priceBasis: "advertised_per_gpu", billingUnit: "GPU-hour", billingMode: "on_demand", quoteStatus: "quoted", dataStatus: "official-page",
  priceScope: "regional_quote", regions: ["cn-wlcb"], zones: [], computeCountries: ["CN"], accountScope: "public_catalog",
  taxScope: "excluded", sourceAvailability: "unknown", sourceUrl: "https://example.com/pricing",
  observedAt: "2026-10-21T23:01:02+00:00", ...overrides,
});
const dataset = (offers, extra = {}) => ({ offers, generatedCatalog: { providers: [{ slug: "example", name: "示例云" }] }, ...extra });
const tableRow = (offer, extra) => buildCompactPriceTable(dataset([offer], extra)).rows[0];
const rates = {
  rateDate: "2026-10-20", sourceName: "European Central Bank reference rates", sourceUrl: "https://example.com/ecb",
  ratesPerEur: { USD: "1.2", CNY: "8" }, ratesToUsd: { CNY: "0.15" }, rounding: "HALF_UP to 12 decimal places; source decimals preserved",
};

// An independent reader checks quoted newlines and formula safety after encoding.
function parse(csv) {
  const rows = []; let row = [], cell = "", quoted = false;
  const source = csv.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && char === ",") { row.push(cell); cell = ""; }
    else if (!quoted && char === "\r" && source[i + 1] === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i++; }
    else cell += char;
  }
  assert.equal(quoted, false);
  assert.equal(cell, "");
  return rows;
}

test("ten-column CSV uses the strict regional-hourly rule and leaves the complete source audit intact", () => {
  const offers = ["offline", "unavailable", "available", "limited", "unknown"].map((status, index) => quote({ id: String(index), sourceAvailability: status }));
  offers.push(...[
    { quoteStatus: "contact_sales", sourceAmount: null }, { quoteStatus: "starting_at" },
    { billingUnit: "GPU-month", billingMode: "monthly" }, { priceScope: "platform_coverage", coverageRegions: ["eu-north1"] },
    { priceScope: "unlocated_catalog" }, { computeCountries: [], countryCode: "" }, { regions: [] }, { regionPriceVerified: false },
    { priceBasis: "gpu_component" }, { instanceBillingUnit: "instance-month" },
  ].map((extra, index) => quote({ id: `excluded-${index}`, ...extra })));
  const input = dataset(offers), before = JSON.stringify(input), csv = compactPricesToCsv(input), rows = parse(csv);
  assert.ok(csv.startsWith("\uFEFF") && csv.endsWith("\r\n"));
  assert.deepEqual(rows[0], COMPACT_CSV_HEADERS);
  assert.equal(rows.length, 4);
  assert.ok(rows.every((row) => row.length === 10));
  assert.deepEqual(rows.slice(1).map((row) => row[7]).sort(), ["可用", "库存有限", "库存未核实"].sort());
  assert.ok(rows.slice(1).every((row) => row[5] === "每小时" && row[2] === "中国 CN / cn-wlcb" && row[3] === "1.2300"));
  assert.ok(!/价格适用地区未核实|平台覆盖|需询价|每月|非地区报价/.test(csv));
  assert.equal(JSON.stringify(input), before);
});

test("exact native and USD decimals including zero and tiny rates remain unrounded", () => {
  for (const amount of ["0", "0.000000000001", "123.456789012345678901234567", "1.2300"]) {
    const row = tableRow(quote({ sourceAmount: amount, pricePerGpuUnit: Number(amount), usdSourceAmount: amount }));
    assert.equal(row[3], amount);
    assert.equal(row[4], `${amount} USD/卡/小时`);
  }
});

test("whole-instance hourly totals retain native basis while USD remains per-card with dated FX", () => {
  const row = tableRow(quote({ sourceAmount: "20.0000", pricePerGpuUnit: 20, sourceCurrency: "CNY", usdSourceAmount: "3",
    gpuCount: 4, priceBasis: "instance_total_allocated", instancePrice: 80, instanceSourceAmount: "80.0000", instanceCurrency: "CNY", instanceBillingUnit: "instance-hour",
  }), { fx: rates });
  assert.equal(row[3], "3");
  assert.equal(row[4], "80.0000 CNY/整机/小时");
  assert.equal(row[5], "每小时");
  for (const label of ["整机总价按4卡分摊", "汇率日期2026-10-20", "1 CNY = 0.15 USD", "https://example.com/ecb"]) assert.ok(row[6].includes(label));
});

test("FX may use the input snapshot and missing conversion provenance fails explicitly", () => {
  assert.equal(tableRow(quote({ sourceCurrency: "CNY", usdSourceAmount: null }), { fx: rates })[3], "0.1845");
  assert.throws(() => tableRow(quote({ sourceCurrency: "CNY" })), /FX provenance/);
  assert.throws(() => tableRow(quote({ sourceCurrency: "CNY", usdSourceAmount: null })), /rate missing/);
});

test("member Spot cloud conditions, dynamic effective time and provider snapshot remain explicit", () => {
  const row = tableRow(quote({ membershipRequired: true, pricingTier: "member", cloudTier: "community", billingMode: "spot", rentalType: "Spot",
    accountScope: "authenticated_contract", taxScope: "included", effectiveFrom: "2026-10-21T08:00:00Z", sourceSnapshotAt: "2026-10-21T08:02:03Z",
    conditions: ["ILS prices apply to companies from Israel.", "Storage is charged separately."], sourceConditions: { account_type: "company" } }));
  for (const label of ["会员价", "Spot竞价（可中断）", "动态价", "生效2026-10-21 16:00:00（北京时间）", "API最早采样2026-10-21 16:02:03（北京时间）", "Community云", "authenticated_contract", "含税", "companies from Israel", "Storage is charged separately"]) assert.ok(row[6].includes(label));
});

test("Beijing observation timestamps cross dates correctly and require an explicit timezone", () => {
  assert.equal(tableRow(quote())[9], "2026-10-22 07:01:02");
  assert.equal(tableRow(quote({ observedAt: "2026-10-21T08:01:02+08:00" }))[9], "2026-10-21 08:01:02");
  for (const observedAt of ["2026-10-21", "2026-10-21T08:00:00", "invalid"]) assert.throws(() => tableRow(quote({ observedAt })), /timezone/);
});

test("CSV quoting round-trips multiline values and prevents spreadsheet formulas", () => {
  const name = '云,"示例"\n平台';
  let input = dataset([quote()], { generatedCatalog: { providers: [{ slug: "example", name }] } });
  assert.equal(parse(compactPricesToCsv(input))[1][1], name);
  for (const payload of ["=1+1", "+cmd", "-1+2", "@SUM(A1)", " \t=1+1", "\tcmd", "\rdata", "\n=cmd"]) {
    input = dataset([quote({ gpuModel: payload, sourceUrl: payload })], { generatedCatalog: { providers: [{ slug: "example", name: payload }] } });
    const row = parse(compactPricesToCsv(input))[1];
    assert.ok(row[0].startsWith("'"));
    assert.equal(row[1], `'${payload}`);
    assert.equal(row[8], `'${payload}`);
  }
});

test("bundled-data CSV agrees exactly with the website eligibility rule", async () => {
  const input = JSON.parse(await readFile(new URL("../data/offers.json", import.meta.url), "utf8"));
  const eligible = input.offers.filter(isComparableRegionalOffer), { rows } = buildCompactPriceTable(input);
  assert.equal(rows.length, eligible.length);
  assert.ok(rows.length > 0);
  assert.ok(rows.every((row) => row.length === 10 && row[5] === "每小时" && !/未核实|平台覆盖|国家待核实/.test(row[2]) && /^\d/.test(row[3])));
  assert.equal(rows.filter((row) => row[7] === "已下线").length, eligible.filter((offer) => offer.sourceAvailability === "offline").length);
});
