import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBundledPricingDataset } from "./bundled-snapshot.ts";

const { convertDatasetToUsd, parseEcbRates } = await import(new URL("../scripts/lib/fx.mjs", import.meta.url).href);
const original = JSON.parse(readFileSync(new URL("../data/offers.json", import.meta.url), "utf8"));

test("the fallback preserves FX numeric precision from original JSON bytes", () => {
  // Reuse the precision-triggering rates with the fixture's own date so this
  // regression remains valid when the checked-in daily snapshot advances.
  const ratesPerEur = { ...original.fx.ratesPerEur, USD: "1.1215", CNY: "7.4894", ILS: "3.4853" };
  const currencyRows = Object.entries(ratesPerEur).filter(([currency]) => currency !== "EUR")
    .map(([currency, rate]) => `<Cube currency='${currency}' rate='${rate}'/>`).join("");
  const rates = parseEcbRates(`<gesmes:Envelope xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref"><gesmes:name>European Central Bank</gesmes:name><Cube><Cube time='${original.generatedAt.slice(0, 10)}'>${currencyRows}</Cube></Cube></gesmes:Envelope>`, {
    observedAt: original.generatedAt,
  });
  const expected = convertDatasetToUsd(original, rates);
  const directory = mkdtempSync(join(tmpdir(), "rackrate-snapshot-precision-"));
  try {
    const path = join(directory, "offers.json");
    writeFileSync(path, JSON.stringify(expected));
    const actual = loadBundledPricingDataset(path);
    assert.deepEqual(actual, expected);
    const cnyOffers = actual.offers.filter((offer) => offer.sourceCurrency === "CNY");
    assert.ok(cnyOffers.length > 0);
    for (const offer of cnyOffers) {
      assert.equal(offer.fx?.rateToUsd, 0.14974497289502497);
      assert.equal(offer.fx?.rateToUsdDecimal, "0.149744972895024969");
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a fallback with mismatched FX provenance is rejected rather than repaired", () => {
  const invalid = structuredClone(original);
  const offer = invalid.offers.find((entry: { sourceCurrency: string }) => entry.sourceCurrency === "CNY");
  assert.ok(offer);
  offer.fx.rateToUsd = 0.14974497289502495;
  const directory = mkdtempSync(join(tmpdir(), "rackrate-snapshot-invalid-"));
  try {
    const path = join(directory, "offers.json");
    writeFileSync(path, JSON.stringify(invalid));
    assert.throws(() => loadBundledPricingDataset(path), /offer FX provenance mismatch/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
