import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout } from "node:timers/promises";

export const PRODUCTION_ORIGIN = "https://rackrate.org";

export function snapshotSha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function verificationUrl(baseUrl = PRODUCTION_ORIGIN) {
  const base = new URL(baseUrl);
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password
      || base.pathname !== "/" || base.search || base.hash) {
    throw new Error("Verification base URL must be an HTTP(S) origin without credentials, path or query");
  }
  return new URL("/api/pricing/status", base).href;
}

export function verifyLivePricing(actual, expected, expectedSha256) {
  if (!/^[a-f0-9]{64}$/.test(expectedSha256 ?? "")) throw new Error("An exact local snapshot SHA-256 is required");
  const publication = actual?.publication;
  if (publication?.mode !== "github-public-snapshot" || publication.status !== "current"
      || publication.stale !== false || publication.sha256 !== expectedSha256) {
    throw new Error("Live RackRate is not serving the exact verified GitHub snapshot in current mode");
  }
  if (actual.generatedAt !== expected.generatedAt) throw new Error("Live RackRate pricing timestamp does not match the verified main dataset");
  if (actual.collector?.commit !== expected.collector?.commit || actual.fx?.rateDate !== expected.fx?.rateDate) {
    throw new Error("Live collector or FX publication date does not match");
  }
  const expectedCounts = {
    offers: expected.offers.length,
    officialOffers: expected.offers.filter((quote) => quote.dataStatus === "official-page").length,
    referenceOffers: expected.offers.filter((quote) => quote.dataStatus === "seed").length,
    offlineOffers: expected.offers.filter((quote) => quote.availability === "unavailable").length,
    contactSalesOffers: expected.offers.filter((quote) => quote.quoteStatus === "contact_sales").length,
  };
  for (const [key, value] of Object.entries(expectedCounts)) {
    if (actual.counts?.[key] !== value) throw new Error(`Live ${key} count does not match`);
  }
  const sources = expected.sources.filter((source) => source.status === "ok");
  const liveSources = actual.sources?.filter((source) => source.status === "ok");
  if (!liveSources || liveSources.length !== sources.length
      || new Set(liveSources.map((source) => source.provider)).size !== sources.length) {
    throw new Error("Live successful source list does not match");
  }
  for (const source of sources) {
    if (!liveSources.some((live) => live.provider === source.provider && live.offerCount === source.offerCount)) {
      throw new Error(`Live ${source.provider} source was not verified`);
    }
  }
  return true;
}

export function verifyPageSnapshot(html, expectedSha256) {
  if (typeof html !== "string" || !/^[a-f0-9]{64}$/.test(expectedSha256 ?? "")) throw new Error("Invalid page snapshot verification input");
  const markup = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "");
  const matches = [];
  for (const tag of markup.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes = {};
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4];
    }
    if (attributes.name?.toLowerCase() === "rackrate-pricing-snapshot") matches.push(attributes.content);
  }
  if (matches.length !== 1 || matches[0] !== expectedSha256) throw new Error("Live page pricing snapshot does not match the verified main dataset");
  return true;
}

async function boundedText(response, maximumBytes) {
  if (!response.body) throw new Error("Live response has no body");
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) { await reader.cancel(); throw new Error("Live response exceeded its size limit"); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}

// Only public GETs are sent. No request selects an upstream, activates a commit,
// deploys an application, or changes credentials.
export async function waitForLivePricing(expectedBytes, {
  baseUrl = PRODUCTION_ORIGIN, fetchImpl = fetch, wait = setTimeout, now = Date.now,
  maxDurationMs = 360_000, intervalMs = 10_000, requestTimeoutMs = 10_000,
} = {}) {
  const statusUrl = verificationUrl(baseUrl);
  const pageUrl = new URL("/", statusUrl).href;
  for (const [name, value, limit] of [["maxDurationMs", maxDurationMs, 600_000], ["intervalMs", intervalMs, 60_000], ["requestTimeoutMs", requestTimeoutMs, 30_000]]) {
    if (!Number.isSafeInteger(value) || value < 1 || value > limit) throw new Error(`Invalid ${name}`);
  }
  const expected = JSON.parse(Buffer.from(expectedBytes).toString("utf8"));
  const sha256 = snapshotSha256(expectedBytes);
  const deadline = now() + maxDurationMs;
  const fetchText = async (url, limit) => {
    const remaining = deadline - now();
    if (remaining <= 0) throw new Error("Verification deadline elapsed");
    const response = await fetchImpl(url, {
      cache: "no-store", redirect: "error", headers: { "cache-control": "no-cache" },
      signal: AbortSignal.timeout(Math.max(1, Math.min(requestTimeoutMs, remaining))),
    });
    if (!response.ok) throw new Error(`Live response returned ${response.status}`);
    return boundedText(response, limit);
  };
  let lastError;
  while (now() < deadline) {
    try {
      verifyLivePricing(JSON.parse(await fetchText(statusUrl, 256 * 1024)), expected, sha256);
      verifyPageSnapshot(await fetchText(pageUrl, 64 * 1024 * 1024), sha256);
      return { generatedAt: expected.generatedAt, offerCount: expected.offers.length, rateDate: expected.fx.rateDate, sha256 };
    } catch (error) { lastError = error; }
    const remaining = deadline - now();
    if (remaining > 0) await wait(Math.min(intervalMs, remaining));
  }
  throw new Error(`Live publication did not match within ${maxDurationMs / 1000}s. ${lastError?.message ?? "No successful status response"}`);
}

export function verificationOptions(argv) {
  if (!argv.length) return {};
  if (argv.length !== 2 || argv[0] !== "--base-url") throw new Error("Usage: node scripts/verify-deployment.mjs [--base-url http://localhost:3000]");
  verificationUrl(argv[1]);
  return { baseUrl: argv[1] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bytes = await readFile(new URL("../data/offers.json", import.meta.url));
  const verified = await waitForLivePricing(bytes, verificationOptions(process.argv.slice(2)));
  console.log(`Verified cloud status and page ${verified.generatedAt}: ${verified.offerCount} offers, ECB ${verified.rateDate}, SHA-256 ${verified.sha256}`);
}
