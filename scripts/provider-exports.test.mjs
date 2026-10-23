import test from "node:test";
import assert from "node:assert/strict";
import { planProviderExports, parseCsv } from "./lib/provider-exports.mjs";
import { parseEcbRates } from "./lib/fx.mjs";

const rates = parseEcbRates(`<gesmes:Envelope xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref"><gesmes:name>European Central Bank</gesmes:name><Cube><Cube time='2026-10-22'><Cube currency='USD' rate='1.2'/><Cube currency='CNY' rate='8'/></Cube></Cube></gesmes:Envelope>`, { observedAt: "2026-10-23T06:00:00Z" });
const header = "provider,gpu_model,gpu_count,country,region,zone,gpu_hour_amount,instance_hour_amount,currency,billing_mode,pricing_conditions,availability,source_url,observed_at,machine_id,membership\r\n";
const body = 'autodl,H100,1,CN,west,zone,8,8,CNY,on_demand,"会员资格；comma, and ""quoted""\nnext",available,https://www.autodl.com,2026-10-23T06:00:00Z,123,member\r\n';
function fixture() {
  return { status: "partial", collected_at: "2026-10-23T06:00:00Z", provider_results: [
    { provider: "autodl", returned_count: 2, status: "partial", source_observations: [], source_exclusions: [] },
    { provider: "vast", returned_count: 0, status: "failed", source_observations: [], source_exclusions: [] }],
    provider_exports: { schema_version: 1, tables: { autodl: "\ufeff" + header + body, vast: "\ufeff" + header }, coverage: {
      autodl: { source_quote_count: 2, exported_quote_count: 1, row_count: 1, shared_catalog_quote_count: 0, ordinary_member_pairs_hidden: 1, excluded_quote_count: 0, excluded_reasons: {} },
      vast: { source_quote_count: 0, exported_quote_count: 0, row_count: 0, shared_catalog_quote_count: 0, ordinary_member_pairs_hidden: 0, excluded_quote_count: 0, excluded_reasons: {} },
    } } };
}

test("provider CSV publication retains native amounts, distinct schemas and exact USD conversion", () => {
  const input = fixture(), before = JSON.stringify(input);
  const plan = planProviderExports(input, rates, ["autodl", "vast"]);
  const csv = parseCsv(plan.writes.find(file => file.path === "exports/autodl.csv").contents);
  assert.equal(csv[1][6], "8"); assert.equal(csv[1][8], "CNY");
  assert.equal(csv[1].at(-2), "1.2"); assert.equal(csv[1].at(-1), "1.2");
  assert.ok(csv[1][10].startsWith('会员资格；comma, and "quoted"\nnext；'));
  assert.match(csv[1][10], /1 CNY = 0.15 USD；ECB 2026-10-22/);
  assert.equal(plan.manifest.providers.autodl.ordinary_member_pairs_hidden, 1);
  assert.equal(plan.manifest.providers.vast.failure_code, "extension_source_failed");
  assert.equal(parseCsv(plan.writes.find(file => file.path === "exports/vast.csv").contents).length, 1);
  assert.equal(plan.manifest.fx.rateDate, rates.rateDate);
  assert.equal(JSON.stringify(input), before);
});

test("provider CSV count, path, geographic and monetary corruption abort before publication", () => {
  for (const mutate of [
    raw => { raw.provider_exports.tables["../unsafe"] = ""; },
    raw => { raw.provider_exports.coverage.autodl.row_count = 2; },
    raw => { raw.provider_exports.coverage.autodl.excluded_reasons.unknown = 1; },
    raw => { raw.provider_exports.tables.autodl = raw.provider_exports.tables.autodl.replace(",west,", ",Global,"); },
    raw => { raw.provider_exports.tables.autodl = raw.provider_exports.tables.autodl.replace(",8,8,CNY,", ",NaN,8,CNY,"); },
    raw => { raw.provider_exports.tables.autodl = raw.provider_exports.tables.autodl.replace(/\r\n$/, '"'); },
  ]) {
    const raw = fixture(); mutate(raw);
    assert.throws(() => planProviderExports(raw, rates, ["autodl", "vast"]), /Invalid provider CSV/);
  }
});

test("shared catalog rows can exceed quote count without claiming independent regional queries", () => {
  const raw = fixture(); raw.provider_exports.tables.autodl += body;
  Object.assign(raw.provider_exports.coverage.autodl, { row_count: 2, shared_catalog_quote_count: 1 });
  assert.equal(planProviderExports(raw, rates, ["autodl", "vast"]).manifest.providers.autodl.exported_quote_count, 1);
});


test("provider CSV preserves zero and bounded 80-significant-digit native decimals", () => {
  for (const amount of ["0", "0." + "0".repeat(50) + "3".repeat(80)]) {
    const raw = fixture(); raw.provider_exports.tables.autodl = raw.provider_exports.tables.autodl.replace(",8,8,CNY,", `,${amount},${amount},USD,`);
    const plan = planProviderExports(raw, rates, ["autodl", "vast"]);
    const rows = parseCsv(plan.writes[0].contents);
    assert.equal(rows[1][6], amount); assert.equal(rows[1].at(-2), amount);
    assert.match(rows[1][10], /原币USD，无需换汇/);
  }
  const raw = fixture(); raw.provider_exports.tables.autodl = raw.provider_exports.tables.autodl.replace(",8,8,CNY,", `,0.${"1".repeat(161)},8,USD,`);
  assert.throws(() => planProviderExports(raw, rates, ["autodl", "vast"]), /Invalid exact decimal/);
});
