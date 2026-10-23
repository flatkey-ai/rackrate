import test from "node:test";
import assert from "node:assert/strict";
import { snapshotSha256, verificationOptions, verificationUrl, verifyLivePricing, verifyPageSnapshot, waitForLivePricing } from "./verify-deployment.mjs";

const expected = {
  generatedAt: "2026-10-20T08:57:50Z", collector: { commit: "verified-library" }, fx: { rateDate: "2026-10-19" },
  sources: [{ provider: "example", status: "ok", offerCount: 1 }],
  offers: [{ dataStatus: "official-page", availability: "unavailable", quoteStatus: "quoted" }],
};
const bytes = Buffer.from(`${JSON.stringify(expected, null, 2)}\n`);
const sha256 = snapshotSha256(bytes);
const live = {
  generatedAt: expected.generatedAt, collector: expected.collector, fx: expected.fx, sources: expected.sources,
  publication: { mode: "github-public-snapshot", status: "current", stale: false, sha256 },
  counts: { offers: 1, officialOffers: 1, referenceOffers: 0, offlineOffers: 1, contactSalesOffers: 0 },
};
const page = `<html><head><meta name="rackrate-pricing-snapshot" content="${sha256}"/></head></html>`;

test("live verification requires exact source bytes, current publication and original status fields", () => {
  assert.equal(verifyLivePricing(live, expected, sha256), true);
  assert.notEqual(snapshotSha256(Buffer.from(JSON.stringify(expected))), sha256);
  for (const bad of [
    { ...live, generatedAt: "2026-10-19" }, { ...live, fx: { rateDate: "2026-10-20" } },
    { ...live, sources: [] }, { ...live, sources: [...live.sources, ...live.sources] },
    { ...live, counts: { ...live.counts, offlineOffers: 0 } },
    { ...live, publication: { ...live.publication, sha256: "0".repeat(64) } },
    { ...live, publication: { ...live.publication, status: "fallback" } },
    { ...live, publication: { ...live.publication, stale: true } },
    { ...live, publication: { ...live.publication, mode: "bundled" } }, { ...live, publication: undefined },
  ]) assert.throws(() => verifyLivePricing(bad, expected, sha256));
  assert.throws(() => verifyLivePricing(live, expected));
});

test("page proof accepts attribute order and quote variants but rejects stale or fake metadata", () => {
  assert.equal(verifyPageSnapshot(page, sha256), true);
  assert.equal(verifyPageSnapshot(`<META CONTENT='${sha256}' data-other="x" NAME='rackrate-pricing-snapshot'>`, sha256), true);
  for (const html of ["<html></html>", page.replace(sha256, "0".repeat(64)), page + page,
    `<!-- ${page} -->`, `<script>const fake = '${page}';</script>`]) {
    assert.throws(() => verifyPageSnapshot(html, sha256), /snapshot/);
  }
});

test("public polling retries fallback or stale pages and proves both endpoints use the local bytes", async () => {
  let clock = 0, statusCalls = 0, pageCalls = 0;
  const result = await waitForLivePricing(bytes, {
    now: () => clock, wait: async (ms) => { clock += ms; }, maxDurationMs: 40, intervalMs: 10,
    fetchImpl: async (url, options) => {
      assert.equal(options.cache, "no-store"); assert.equal(options.redirect, "error");
      assert.equal(options.headers["cache-control"], "no-cache"); assert.equal(new URL(url).search, "");
      if (url === "https://rackrate.org/api/pricing/status") {
        statusCalls++;
        return new Response(JSON.stringify(statusCalls === 1 ? { ...live, publication: { ...live.publication, status: "fallback" } } : live));
      }
      assert.equal(url, "https://rackrate.org/"); pageCalls++;
      return new Response(pageCalls === 1 ? page.replace(sha256, "0".repeat(64)) : page);
    },
  });
  assert.equal(statusCalls, 3); assert.equal(pageCalls, 2); assert.equal(clock, 20); assert.equal(result.sha256, sha256);
});

test("verification times out on stale snapshots and supports an explicit local test origin", async () => {
  let clock = 0, calls = 0;
  await assert.rejects(waitForLivePricing(bytes, {
    baseUrl: "http://localhost:3000", now: () => clock, wait: async (ms) => { clock += ms; },
    maxDurationMs: 25, intervalMs: 10,
    fetchImpl: async (url) => { assert.equal(url, "http://localhost:3000/api/pricing/status"); calls++; return new Response("{}", { status: 503 }); },
  }), /within 0\.025s.*503/);
  assert.equal(calls, 3); assert.equal(clock, 25);
  assert.deepEqual(verificationOptions([]), {});
  assert.deepEqual(verificationOptions(["--base-url", "http://localhost:3000"]), { baseUrl: "http://localhost:3000" });
  for (const url of ["file:///tmp", "https://user:password@example.com", "https://example.com/path", "https://example.com?source=other"]) {
    assert.throws(() => verificationUrl(url));
  }
  assert.throws(() => verificationOptions(["--source-url", "https://example.com"]));
});


test("publication verifies complete source counts separately from the strict comparison subset", () => {
  const projected = { ...live, sourceCounts: live.counts, counts: { ...live.counts, offers: 0, officialOffers: 0, offlineOffers: 0 } };
  assert.equal(verifyLivePricing(projected, expected, sha256), true);
  assert.throws(() => verifyLivePricing({ ...projected, sourceCounts: { ...live.counts, offers: 2 } }, expected, sha256));
  const withFailure = { ...expected, sources: [...expected.sources, { provider: "azure", status: "failed", offerCount: 0, failureCode: "extension_source_failed" }] };
  const withFailureLive = { ...projected, sources: withFailure.sources };
  assert.equal(verifyLivePricing(withFailureLive, withFailure, sha256), true);
  assert.throws(() => verifyLivePricing(projected, withFailure, sha256), /failure disclosure/);
});
