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

/** Hourly for a week. 3.4KB per node. */
export const DEFAULT_CAPACITY = 168;

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
 */
export function vitalsAt(
  node: EcosystemNode,
  history: VitalsHistory | undefined,
  cursor: number | null,
): Vitals {
  if (cursor === null || !history) return live(node);
  return sampleAt(history, cursor) ?? live(node);
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
