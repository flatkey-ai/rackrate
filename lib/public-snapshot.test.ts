import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { PricingDataset } from "./data";
import { createSnapshotStore, PUBLIC_PRICING_URL, snapshotHash } from "./public-snapshot.ts";

const raw = await readFile(new URL("../data/offers.json", import.meta.url), "utf8");
const fallback = JSON.parse(raw) as PricingDataset;
const initialTime = Date.parse(fallback.generatedAt) + 60_000;
const response = (text = raw, etag = "snapshot-one") => new Response(text, { headers: { etag } });

test("runtime download is anonymous, fixed to main and shared by concurrent requests", async () => {
  let calls = 0;
  let resolveFetch!: (value: Response) => void;
  const fetched = new Promise<Response>((resolve) => { resolveFetch = resolve; });
  const store = createSnapshotStore({ fallback, now: () => initialTime, fetchImpl: async (url, options) => {
    calls++;
    const requestUrl = new URL(String(url));
    assert.equal(requestUrl.origin + requestUrl.pathname, PUBLIC_PRICING_URL);
    assert.equal(options?.cache, "no-store");
    assert.equal(options?.credentials, "omit");
    assert.equal(options?.redirect, "error");
    assert.equal(new Headers(options?.headers).has("authorization"), false);
    assert.equal(new Headers(options?.headers).has("cookie"), false);
    return fetched;
  } });
  const first = store.load();
  const second = store.load();
  resolveFetch(response());
  const [one, two] = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(one.dataset, two.dataset);
  assert.equal(one.publication.sha256, snapshotHash(raw));
  assert.equal(one.publication.status, "current");
  assert.equal(one.publication.lastError, null);
  assert.equal(one.publication.stale, false);
  await store.load();
  assert.equal(calls, 1);
});

test("a newer verified cloud snapshot replaces prices without another build and supports ETag", async () => {
  let clock = initialTime;
  let calls = 0;
  const updated = { ...fallback, generatedAt: new Date(clock + 60_000).toISOString() };
  const updatedRaw = JSON.stringify(updated);
  const store = createSnapshotStore({ fallback, now: () => clock, fetchImpl: async (_url, options) => {
    calls++;
    if (calls === 1) return response();
    assert.equal(new Headers(options?.headers).get("if-none-match"), calls === 2 ? "snapshot-one" : "snapshot-two");
    if (calls === 2) return response(updatedRaw, "snapshot-two");
    return new Response(null, { status: 304 });
  } });
  await store.load();
  clock += 60_001;
  const fresh = await store.load();
  assert.equal(fresh.dataset.generatedAt, updated.generatedAt);
  assert.equal(fresh.publication.sha256, snapshotHash(updatedRaw));
  clock += 60_001;
  const unchanged = await store.load();
  assert.equal(unchanged.dataset, fresh.dataset);
  assert.equal(unchanged.publication.status, "current");
  assert.equal(calls, 3);
});

test("network failures, partial responses and invalid snapshots retain the entire last verified snapshot", async () => {
  let clock = initialTime;
  let calls = 0;
  const failures: (() => Response)[] = [
    () => { throw new Error("Network unavailable"); },
    () => new Response('{"schemaVersion":2,'),
    () => new Response(JSON.stringify({ ...fallback, sources: [] })),
    () => new Response("not found", { status: 404 }),
  ];
  const store = createSnapshotStore({ fallback, now: () => clock, fetchImpl: async () => {
    if (calls++ === 0) return response();
    return failures[calls - 2]();
  } });
  const accepted = await store.load();
  for (let index = 0; index < failures.length; index++) {
    clock += 60_001;
    const retained = await store.load();
    assert.equal(retained.dataset, accepted.dataset);
    assert.equal(retained.publication.sha256, accepted.publication.sha256);
    assert.equal(retained.publication.status, "fallback");
    assert.ok(retained.publication.lastError);
    assert.equal(retained.dataset.fx, accepted.dataset.fx);
  }
});

test("an old or rewritten publication cannot replace an accepted snapshot", async () => {
  let clock = initialTime;
  let calls = 0;
  const store = createSnapshotStore({ fallback, now: () => clock, fetchImpl: async () => {
    calls++;
    if (calls === 1) return response();
    if (calls === 2) return response(JSON.stringify({ ...fallback, generatedAt: new Date(Date.parse(fallback.generatedAt) - 1000).toISOString() }));
    if (calls === 3) return response(raw + "\n");
    return response(JSON.stringify({ ...fallback, generatedAt: new Date(fallback.generatedAt).toISOString() }));
  } });
  const accepted = await store.load();
  for (const expected of [/older GitHub snapshot/, /same collection timestamp/, /same collection timestamp/]) {
    clock += 60_001;
    const retained = await store.load();
    assert.equal(retained.publication.sha256, accepted.publication.sha256);
    assert.equal(retained.dataset, accepted.dataset);
    assert.equal(retained.publication.status, "fallback");
    assert.match(retained.publication.lastError!, expected);
  }
});

test("oversized bodies fail closed and old bundled prices are marked stale", async () => {
  const store = createSnapshotStore({ fallback, now: () => initialTime + 48 * 60 * 60 * 1000, maxBytes: 32,
    fetchImpl: async () => response() });
  const retained = await store.load();
  assert.equal(retained.dataset, fallback);
  assert.equal(retained.publication.status, "fallback");
  assert.equal(retained.publication.stale, true);
  assert.match(retained.publication.lastError!, /download limit/);
});
