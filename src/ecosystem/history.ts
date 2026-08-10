import type { EcosystemNode, Vitals } from './types';

/**
 * Vitals over time, as a fixed-size ring buffer per node.
 *
 * Slots are absolute: slot = floor(timestamp / stepMs), indexed physically by
 * slot % capacity. That makes gaps explicit rather than silently shifting older
 * samples forward, which matters because adapters miss scrapes constantly and a
 * quietly interpolated gap is a lie about history.
 *
 * Four parallel typed arrays rather than an array of objects. At hourly
 * resolution over months this is the difference between a few megabytes and a
 * few hundred, and it uploads to a shader without a transform.
 */
export interface VitalsHistory {
  /** Milliseconds per slot. 3_600_000 for hourly. */
  stepMs: number;
  capacity: number;
  /** Highest absolute slot written, or -1 when empty. */
  latestSlot: number;
  /** Absolute slot number held by each physical index. -1 means empty. */
  slots: Int32Array;
  vitality: Float32Array;
  activity: Float32Array;
  maturity: Float32Array;
  /**
   * Stored rather than derived from the vitality series, because translation
   * computes it with domain meaning we cannot reconstruct. A stock's daily
   * percentage change is not the delta of its health score. The redundancy is
   * deliberate and worth revisiting if it ever drifts.
   */
  trend: Float32Array;
}

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

/** Hourly for a week. 3.4KB per node. */
export const DEFAULT_CAPACITY = 168;

/**
 * Daily for twenty weeks — the archive tier.
 *
 * History is kept at two grains rather than one long fine buffer, which is the
 * downsampling the storage note always said this would need: hourly for a year
 * is 350MB at two thousand nodes, and daily for a season is 2.9KB a node. The
 * grains are not a compromise but a match to the questions. Inside a day you
 * want the hour a thing broke; across a season you want the week it started
 * sliding, and a hundred and sixty-eight hourly samples of that would be a
 * needle nobody asked for.
 *
 * Twenty weeks because that is a sports season with room either side, and
 * because it is the span the seasonal sun can actually show: the arc moves
 * visibly over months and imperceptibly over days.
 */
export const DEFAULT_ARCHIVE_CAPACITY = 140;

export function createHistory(
  stepMs: number = HOUR_MS,
  capacity: number = DEFAULT_CAPACITY,
): VitalsHistory {
  return {
    stepMs,
    capacity,
    latestSlot: -1,
    slots: new Int32Array(capacity).fill(-1),
    vitality: new Float32Array(capacity),
    activity: new Float32Array(capacity),
    maturity: new Float32Array(capacity),
    trend: new Float32Array(capacity),
  };
}

export function slotFor(history: VitalsHistory, timestamp: number): number {
  return Math.floor(timestamp / history.stepMs);
}

/**
 * Writes vitals into the slot containing `timestamp`. Repeated writes inside
 * one hour overwrite, so the stored value is last-seen rather than an average.
 * Averaging is the adapter's job if it wants it.
 */
export function record(
  history: VitalsHistory,
  timestamp: number,
  vitals: Vitals,
): void {
  const slot = slotFor(history, timestamp);
  if (slot < history.latestSlot - history.capacity) return; // older than we keep

  const i = ((slot % history.capacity) + history.capacity) % history.capacity;
  history.slots[i] = slot;
  history.vitality[i] = vitals.vitality;
  history.activity[i] = vitals.activity;
  history.maturity[i] = vitals.maturity;
  history.trend[i] = vitals.trend;
  if (slot > history.latestSlot) history.latestSlot = slot;
}

/**
 * Writes only into a slot nothing has written yet, and reports whether it wrote.
 *
 * This is the collector's rule, and it is a separate function rather than a flag
 * on `record` because it is a claim about whose account of the past wins. A
 * backfill is the source's *current* account of its own history and may carry
 * corrections; a restored observation is only what this app happened to see. So
 * the source wins wherever it still speaks, and the record we kept is worth
 * something exactly where it has gone quiet — the days beyond its window, the
 * plants it has stopped mentioning. Filling silence is the whole job.
 *
 * The physical index is the test rather than the slot number, because a ring
 * index that already holds a different absolute slot holds one from inside the
 * retained window, and overwriting it would drop a sample to add an older one.
 */
export function recordIfAbsent(
  history: VitalsHistory,
  timestamp: number,
  vitals: Vitals,
): boolean {
  const slot = slotFor(history, timestamp);
  if (slot < history.latestSlot - history.capacity) return false;

  const i = ((slot % history.capacity) + history.capacity) % history.capacity;
  if (history.slots[i] !== -1) return false;

  history.slots[i] = slot;
  history.vitality[i] = vitals.vitality;
  history.activity[i] = vitals.activity;
  history.maturity[i] = vitals.maturity;
  history.trend[i] = vitals.trend;
  if (slot > history.latestSlot) history.latestSlot = slot;
  return true;
}

/** Vitals at a point in time, or null when that slot was never written. */
export function sampleAt(
  history: VitalsHistory,
  timestamp: number,
): Vitals | null {
  const slot = slotFor(history, timestamp);
  const i = ((slot % history.capacity) + history.capacity) % history.capacity;
  if (history.slots[i] !== slot) return null;
  return {
    vitality: history.vitality[i],
    activity: history.activity[i],
    maturity: history.maturity[i],
    trend: history.trend[i],
  };
}

/**
 * The accessor the scene must use instead of reading `node.vitality` directly.
 *
 * A null cursor means live. This indirection is the whole reason time is cheap
 * to add now and a rewrite later: every read already goes through one function,
 * so scrubbing, comparison, and playback are changes to what it returns rather
 * than changes to every component that touches a plant.
 *
 * Seasons proved that out. Reaching back months meant a second, coarser buffer,
 * and the whole of teaching the scene to read it is the `archive` argument here:
 * ask the fine grain first, fall back to the coarse one when the cursor is
 * older than the week that is kept in detail, and fall back to live when
 * neither has it. No component that draws a plant changed at all.
 */
export function vitalsAt(
  node: EcosystemNode,
  history: VitalsHistory | undefined,
  cursor: number | null,
  archive?: VitalsHistory,
): Vitals {
  if (cursor === null) return live(node);
  const fine = history ? sampleAt(history, cursor) : null;
  if (fine) return fine;
  const coarse = archive ? sampleAt(archive, cursor) : null;
  return coarse ?? live(node);
}

function live(node: EcosystemNode): Vitals {
  return {
    vitality: node.vitality,
    activity: node.activity,
    maturity: node.maturity,
    trend: node.trend,
  };
}

/**
 * Oldest and newest timestamps actually present, for sizing a scrub control.
 * Returns null when the buffer is empty.
 */
export function historyExtent(
  history: VitalsHistory,
): { from: number; to: number } | null {
  if (history.latestSlot < 0) return null;
  let oldest = history.latestSlot;
  for (const slot of history.slots) {
    if (slot >= 0 && slot < oldest) oldest = slot;
  }
  return {
    from: oldest * history.stepMs,
    to: (history.latestSlot + 1) * history.stepMs - 1,
  };
}

/** Bytes held by one buffer. Used by the memory budget check in tests. */
export function historyBytes(history: VitalsHistory): number {
  return history.capacity * (4 * 4 + 4); // four Float32 plus one Int32
}
