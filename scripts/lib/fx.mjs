// Currency conversion belongs to RackRate; the public collector preserves native prices.
export const ECB_XML_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
export const ECB_SOURCE_URL = "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html";
const SOURCE_NAME = "European Central Bank reference rates";
const MAX_AGE_DAYS = 7;

function decimal(value) {
  if (typeof value !== "string" || value.length > 128 || !/^\d+(?:\.\d{1,24})?$/.test(value)) throw new Error("Invalid exact decimal for USD conversion");
  const [whole, fraction = ""] = value.split(".");
  return { integer: BigInt(whole + fraction), scale: fraction.length };
}

function multiplyRatio(amount, numerator, denominator, places = 12) {
  const a = decimal(amount), n = decimal(numerator), d = decimal(denominator);
  if (d.integer === 0n) throw new Error("Exchange-rate denominator must be positive");
  const top = a.integer * n.integer * 10n ** BigInt(d.scale + places);
  const bottom = d.integer * 10n ** BigInt(a.scale + n.scale);
  let rounded = top / bottom;
  if ((top % bottom) * 2n >= bottom) rounded += 1n;
  const digits = rounded.toString().padStart(places + 1, "0");
  return (digits.slice(0, -places) + "." + digits.slice(-places)).replace(/\.?0+$/, "");
}

export function parseEcbRates(xml, { observedAt = new Date().toISOString() } = {}) {
  const observed = Date.parse(observedAt);
  if (!Number.isFinite(observed) || typeof xml !== "string" || xml.length > 256 * 1024
      || /<!DOCTYPE|<!ENTITY/i.test(xml)
      || !xml.includes('http://www.ecb.int/vocabulary/2002-08-01/eurofxref')
      || !xml.includes("<gesmes:name>European Central Bank</gesmes:name>")) throw new Error("Unexpected ECB reference-rate document");
  const sections = [...xml.matchAll(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]\s*>([\s\S]*?)<\/Cube>/g)];
  if (sections.length !== 1) throw new Error("ECB must publish one reference-rate date");
  const [, rateDate, body] = sections[0];
  const dated = Date.parse(rateDate + "T00:00:00Z");
  if (!Number.isFinite(dated) || new Date(dated).toISOString().slice(0, 10) !== rateDate
      || dated > observed || observed - dated > MAX_AGE_DAYS * 86400000) throw new Error("ECB rate date is future, invalid or more than seven days old");
  const ratesPerEur = { EUR: "1" };
  const cubes = [...body.matchAll(/<Cube\s+([^<>]+?)\s*\/>/g)];
  if (!cubes.length || cubes.length !== (body.match(/<Cube\b/g) ?? []).length) throw new Error("Incomplete ECB currency rows");
  for (const [, attributes] of cubes) {
    const pairs = [...attributes.matchAll(/([a-zA-Z]+)\s*=\s*(['"])(.*?)\2/g)];
    const record = Object.fromEntries(pairs.map(([, key, , value]) => [key, value]));
    if (pairs.length !== 2 || Object.keys(record).length !== 2 || !/^[A-Z]{3}$/.test(record.currency ?? "")
        || Object.hasOwn(ratesPerEur, record.currency)) throw new Error("Duplicate or invalid ECB currency");
    const rate = decimal(record.rate);
    if (rate.integer === 0n || !Number.isFinite(Number(record.rate)) || Number(record.rate) > 1e9) throw new Error("Invalid ECB exchange rate");
    ratesPerEur[record.currency] = record.rate;
  }
  if (!ratesPerEur.USD) throw new Error("ECB USD reference rate is missing");
  return {
    schemaVersion: 1, sourceName: SOURCE_NAME, sourceUrl: ECB_SOURCE_URL, rawSourceUrl: ECB_XML_URL,
    rateDate, observedAt, baseCurrency: "EUR", targetCurrency: "USD", ratesPerEur,
    ratesToUsd: Object.fromEntries(Object.entries(ratesPerEur).map(([currency, rate]) => [currency,
      currency === "USD" ? "1" : multiplyRatio("1", ratesPerEur.USD, rate, 18)])),
    formula: "native amount × (USD per EUR ÷ source currency per EUR)",
    rounding: "HALF_UP to 12 decimal places; source decimals preserved",
    note: "ECB reference rates are informational, not transaction or card-settlement rates. Rate date is the publication date; collection time does not change it.",
  };
}

export async function collectFxRates({ fetchImpl = fetch, now = new Date() } = {}) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetchImpl(ECB_XML_URL, { signal: AbortSignal.timeout(30000), redirect: "error" });
      if (!response.ok) throw new Error(`ECB reference-rate request failed (${response.status})`);
      const reader = response.body.getReader();
      const chunks = []; let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 256 * 1024) { await reader.cancel(); throw new Error("ECB response exceeded size limit"); }
          chunks.push(Buffer.from(value));
        }
      } finally { reader.releaseLock(); }
      return parseEcbRates(Buffer.concat(chunks).toString("utf8"), { observedAt: now.toISOString() });
    } catch (error) { lastError = error; }
  }
  throw new Error(`USD conversion requires verified ECB rates; existing dataset was preserved. ${lastError?.message ?? "Request failed"}`);
}

export function convertAmountToUsd(sourceAmount, currency, rates) {
  const sourceRate = rates?.ratesPerEur?.[currency];
  if (!sourceRate || !rates.ratesPerEur.USD) throw new Error(`ECB rate missing for ${currency}; no USD value was invented`);
  decimal(sourceAmount);
  const converted = currency === "USD" ? sourceAmount : multiplyRatio(sourceAmount, rates.ratesPerEur.USD, sourceRate);
  const amount = Number(converted);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Converted USD amount is invalid");
  return { amount, decimal: converted };
}

export function convertDatasetToUsd(dataset, rates) {
  const offers = dataset.offers.map((offer) => {
    const rate = rates.ratesToUsd[offer.sourceCurrency];
    if (!rate) throw new Error(`ECB reference currency missing: ${offer.sourceCurrency}`);
    const converted = offer.sourceAmount === null ? null : convertAmountToUsd(offer.sourceAmount, offer.sourceCurrency, rates);
    const instance = offer.instancePrice == null ? null : convertAmountToUsd(offer.instanceSourceAmount ?? String(offer.instancePrice), offer.instanceCurrency ?? offer.sourceCurrency, rates);
    return {
      ...offer,
      priceUsdPerGpuUnit: converted?.amount ?? null, usdSourceAmount: converted?.decimal ?? null,
      pricePerGpuHour: offer.billingUnit === "GPU-hour" ? converted?.amount ?? null : null,
      instancePriceUsd: instance?.amount ?? null, instanceUsdSourceAmount: instance?.decimal ?? null,
      fx: { sourceCurrency: offer.sourceCurrency, targetCurrency: "USD", rateToUsd: Number(rate),
        rateToUsdDecimal: rate, rateDate: rates.rateDate, sourceName: rates.sourceName,
        sourceUrl: rates.sourceUrl, observedAt: rates.observedAt,
        converted: offer.sourceCurrency !== "USD", formula: rates.formula, rounding: rates.rounding },
    };
  });
  return { ...dataset, fx: rates, offers };
}
