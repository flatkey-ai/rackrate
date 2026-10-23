import { RETENTION_DAYS, datasetSnapshots, mergeSnapshots, observationDay, observationTime } from "./history.mjs";

export const MAX_HISTORY_SHARD_BYTES = 80 * 1024 * 1024;
export const MAX_HISTORY_INDEX_BYTES = 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;
const pathForDay = (day) => `price-history/${day}.json`;
const encode = (value) => `${JSON.stringify(value)}\n`;

function validateDescriptor(entry) {
  if (!entry || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)
      || observationDay(`${entry.date}T00:00:00Z`) !== entry.date || entry.path !== pathForDay(entry.date)
      || !Number.isInteger(entry.snapshotCount) || entry.snapshotCount < 1
      || !Number.isInteger(entry.offerCount) || entry.offerCount < 0
      || !Number.isInteger(entry.bytes) || entry.bytes < 1
      || observationDay(entry.firstObservedAt) !== entry.date
      || observationDay(entry.lastObservedAt) !== entry.date
      || observationTime(entry.firstObservedAt) > observationTime(entry.lastObservedAt)) {
    throw new Error("Price history has an invalid shard descriptor");
  }
}

function shardDescriptor(value, contents) {
  return { date: value.date, path: pathForDay(value.date), snapshotCount: value.snapshots.length,
    offerCount: value.snapshots.reduce((count, entry) => count + entry.offers.length, 0),
    firstObservedAt: value.snapshots[0].observedAt,
    lastObservedAt: value.snapshots.at(-1).observedAt,
    bytes: Buffer.byteLength(contents) };
}

function groupByDay(snapshots) {
  const groups = new Map();
  for (const snapshot of snapshots) {
    const day = observationDay(snapshot.observedAt);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(snapshot);
  }
  return groups;
}

/**
 * Pure publication plan; no file is written or deleted here.
 * readShard receives a controlled path relative to data/. It returns JSON text
 * and may throw ENOENT for a missing new shard; missing indexed shards fail.
 * Callers stage every write, publish shards and index before offers.json, then
 * delete expired paths only after successful publication. Existing schema-2
 * timestamps/fields survive migration; lost historical source times are never
 * reconstructed from today's dataset.
 */
export async function planPriceHistory(current, dataset, {
  readShard, now = new Date(dataset.generatedAt), maxShardBytes = MAX_HISTORY_SHARD_BYTES,
} = {}) {
  const cutoff = now.getTime() - RETENTION_DAYS * DAY_MS;
  if (!Number.isFinite(cutoff) || !Number.isSafeInteger(maxShardBytes) || maxShardBytes < 1
      || maxShardBytes > MAX_HISTORY_SHARD_BYTES) throw new Error("Invalid price-history storage limits");
  const cutoffDay = new Date(cutoff).toISOString().slice(0, 10);
  const incoming = groupByDay(mergeSnapshots([], datasetSnapshots(dataset), cutoff));
  const descriptors = new Map();
  const legacyDays = new Map();
  const writes = [], deletes = [];
  if (current?.schemaVersion === 3) {
    if (current.retentionDays !== RETENTION_DAYS || !Array.isArray(current.shards)) {
      throw new Error("Price history has an invalid index");
    }
    for (const entry of current.shards) {
      validateDescriptor(entry);
      if (descriptors.has(entry.date)) throw new Error("Price history index has duplicate days");
      descriptors.set(entry.date, entry);
    }
  } else if ((current?.schemaVersion === 2 || current?.schemaVersion === undefined)
      && Array.isArray(current?.snapshots)) {
    for (const [day, entries] of groupByDay(mergeSnapshots(current.snapshots, [], cutoff))) legacyDays.set(day, entries);
  } else {
    throw new Error("Unsupported price-history schema");
  }
  const touched = new Set([...incoming.keys(), ...legacyDays.keys()]);
  for (const [day, descriptor] of descriptors) {
    if (observationTime(descriptor.lastObservedAt) < cutoff) {
      deletes.push(descriptor.path);
      descriptors.delete(day);
    } else if (day === cutoffDay && observationTime(descriptor.firstObservedAt) < cutoff) {
      touched.add(day);
    }
  }
  for (const day of [...touched].sort()) {
    const path = pathForDay(day);
    let previousText = null;
    let previous = legacyDays.get(day) ?? [];
    // Check an unindexed incoming day too: a prior interrupted publication may
    // have renamed its shard before the index. Recover it without losing rows.
    if (typeof readShard === "function") {
      try {
        previousText = await readShard(path);
      } catch (error) {
        if (error.code !== "ENOENT" || descriptors.has(day)) throw error;
      }
      if (previousText !== null) {
        if (typeof previousText !== "string" || Buffer.byteLength(previousText) > maxShardBytes) {
          throw new Error("Price-history day exceeds the reviewed file limit");
        }
        const shard = JSON.parse(previousText);
        if (shard.schemaVersion !== 3 || shard.date !== day || !Array.isArray(shard.snapshots)
            || shard.snapshots.some((entry) => observationDay(entry.observedAt) !== day)) {
          throw new Error("Price history has an invalid daily shard");
        }
        previous = [...shard.snapshots, ...previous];
      }
    } else if (descriptors.has(day)) {
      throw new Error("An existing history shard must be read before updating it");
    }
    const snapshots = mergeSnapshots(previous, incoming.get(day) ?? [], cutoff);
    if (!snapshots.length) {
      if (descriptors.has(day) || previousText !== null) deletes.push(path);
      descriptors.delete(day);
      continue;
    }
    const value = { schemaVersion: 3, date: day, snapshots };
    const contents = encode(value);
    if (Buffer.byteLength(contents) > maxShardBytes) throw new Error("Price-history day exceeds the reviewed file limit");
    descriptors.set(day, shardDescriptor(value, contents));
    if (previousText !== contents) writes.push({ path, value, contents });
  }
  const index = { schemaVersion: 3, retentionDays: RETENTION_DAYS,
    shards: [...descriptors.values()].sort((a, b) => a.date.localeCompare(b.date)) };
  if (Buffer.byteLength(encode(index)) > MAX_HISTORY_INDEX_BYTES) throw new Error("Price-history index exceeds the reviewed file limit");
  // A late observation can revive the cutoff day's otherwise-expired shard.
  // Never delete a path that the final index still references.
  const retainedPaths = new Set(index.shards.map((entry) => entry.path));
  return { index, writes, deletes: [...new Set(deletes)].filter((path) => !retainedPaths.has(path)).sort() };
}
