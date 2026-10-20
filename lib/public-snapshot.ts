import { createHash } from "node:crypto";
import type { PricingDataset } from "./data";
import { validatePricingDataset } from "./validate-snapshot.ts";

export const PUBLIC_PRICING_URL = "https://raw.githubusercontent.com/flatkey-ai/rackrate/main/data/offers.json";
export const SNAPSHOT_CACHE_MS = 60_000;

export type SnapshotPublication = {
  mode: "github-public-snapshot";
  status: "current" | "fallback";
  sha256: string;
  sourceUrl: string;
  checkedAt: string | null;
  lastError: string | null;
  stale: boolean;
};

type SnapshotResult = { dataset: PricingDataset; publication: SnapshotPublication };
type SnapshotOptions = {
  fallback: PricingDataset;
  fetchImpl?: typeof fetch;
  now?: () => number;
  cacheMs?: number;
  timeoutMs?: number;
  maxBytes?: number;
};

export function snapshotHash(text: string) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

async function readBoundedBody(response: Response, maxBytes: number) {
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel();
    throw new Error("Public pricing snapshot exceeds the download limit");
  }
  if (!response.body) throw new Error("Public pricing snapshot is empty");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error("Public pricing snapshot exceeds the download limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

// One atomic, self-contained public file supplies offers, FX, catalogues and source status.
// This store is server-side only; it never accepts a URL or revision from an HTTP request.
export function createSnapshotStore({
  fallback,
  fetchImpl = fetch,
  now = Date.now,
  cacheMs = SNAPSHOT_CACHE_MS,
  timeoutMs = 10_000,
  maxBytes = 8 * 1024 * 1024,
}: SnapshotOptions) {
  let dataset = validatePricingDataset(fallback, now());
  let hash = snapshotHash(JSON.stringify(dataset));
  let downloaded = false;
  let etag: string | null = null;
  let lastAttempt = Number.NEGATIVE_INFINITY;
  let lastError: string | null = "Using the bundled verified snapshot until GitHub is checked";
  let pending: Promise<void> | null = null;

  const result = (): SnapshotResult => ({
    dataset,
    publication: {
      mode: "github-public-snapshot",
      status: downloaded && !lastError ? "current" : "fallback",
      sha256: hash,
      sourceUrl: PUBLIC_PRICING_URL,
      checkedAt: Number.isFinite(lastAttempt) ? new Date(lastAttempt).toISOString() : null,
      lastError,
      stale: now() - Date.parse(dataset.generatedAt) > 36 * 60 * 60 * 1000,
    },
  });

  async function refresh() {
    lastAttempt = now();
    const url = new URL(PUBLIC_PRICING_URL);
    // GitHub Raw caches branch URLs. A bounded minute bucket avoids pinning yesterday's
    // CDN response without introducing per-visitor cache keys or authenticated API calls.
    url.searchParams.set("snapshot", String(Math.floor(lastAttempt / cacheMs)));
    try {
      const response = await fetchImpl(url.href, {
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        headers: {
          Accept: "application/json",
          "User-Agent": "RackRate-Public-Pricing/1.0",
          ...(etag ? { "If-None-Match": etag } : {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status === 304 && downloaded && etag) {
        lastError = null;
        return;
      }
      if (!response.ok) throw new Error(`GitHub public pricing returned HTTP ${response.status}`);
      const text = await readBoundedBody(response, maxBytes);
      const incoming = validatePricingDataset(JSON.parse(text), now());
      const incomingHash = snapshotHash(text);
      const incomingTime = Date.parse(incoming.generatedAt);
      const currentTime = Date.parse(dataset.generatedAt);
      if (incomingTime < currentTime) {
        throw new Error("An older GitHub snapshot was rejected; the verified prices were retained");
      }
      if (downloaded && incomingTime === currentTime && incomingHash !== hash) {
        throw new Error("A changed snapshot with the same collection timestamp was rejected");
      }
      // Only validated complete snapshots replace the last good state.
      dataset = incoming;
      hash = incomingHash;
      etag = response.headers.get("etag");
      downloaded = true;
      lastError = null;
    } catch (error) {
      lastError = error instanceof Error ? error.message.slice(0, 220) : "Public pricing snapshot could not be verified";
    }
  }

  return {
    async load(): Promise<SnapshotResult> {
      // Await an existing refresh before consulting TTL; concurrent pages must not see
      // the previous snapshot while the first caller is validating a new publication.
      if (pending) {
        await pending;
      } else if (now() < lastAttempt || now() - lastAttempt >= cacheMs) {
        pending = refresh();
        try { await pending; }
        finally { pending = null; }
      }
      return result();
    },
  };
}
