import type { EcosystemNode, EcosystemState } from './types';

/**
 * Silence looks like health.
 *
 * An adapter that dies leaves a thriving plant standing there, and a garden is
 * reassuring enough that people believe it. Staleness is therefore a first class
 * visual state rather than a footnote: grey, dusty, motionless, and faintly
 * unsettling.
 *
 * The hard part is that not all silence is a fault. An exchange is shut every
 * night and all weekend, a club is idle on its bye, and a garden that greyed for
 * either would spend most of its life crying wolf — at which point the state
 * stops being read at all, which is the same failure by a longer route. So the
 * question the state actually asks is not "how long has this been quiet" but
 * **"should I have heard something by now"**, and only the source can answer it.
 * That answer is `StaleSchedule`.
 */

/**
 * When a source expects to speak next, and how long past that it may be quiet
 * before the silence counts as a fault.
 *
 * This is the shape the old flat threshold could not express. A duration has one
 * lever, so a source that is legitimately silent for long stretches — an
 * exchange overnight, a league between weeks — forces that one lever wide, and a
 * wide lever cannot tell a shut source from a dead one. The market's threshold
 * came out at nearly four days, which meant a feed dying on Friday evening was
 * not flagged until midweek: the precise failure the state exists to prevent,
 * arrived at honestly.
 *
 * Splitting it in two fixes that, because the two halves answer different
 * questions. `dueAfter` is a fact about the source's calendar — the adapter is
 * the only layer that knows it — and it may be arbitrarily far out without
 * costing anything. `graceMs` is the tolerance once the source is genuinely
 * late, and it can be tight, because by then the source has missed something it
 * said it would produce.
 */
export interface StaleSchedule {
  /**
   * Given the moment a node last spoke, the moment by which it should have
   * spoken again. Absolute epoch ms.
   */
  dueAfter(lastUpdate: number): number;
  /** How long past due before silence reads as a fault. */
  graceMs: number;
}

/**
 * A schedule, or the flat duration that is the degenerate case of one.
 *
 * A bare number means "this source publishes no calendar": nothing is ever
 * scheduled, so the whole duration is tolerance. That is exactly the old model,
 * which is why it survives as a value of the new type rather than as a second
 * code path — and it remains the right answer for a source whose feed genuinely
 * carries no forward schedule. See `NFL_STALE_AFTER_MS`.
 */
export type StalePolicy = StaleSchedule | number;

/** Due immediately, tolerating `ms` of quiet. The flat threshold, as a schedule. */
export function afterQuietFor(ms: number): StaleSchedule {
  return { dueAfter: (lastUpdate) => lastUpdate, graceMs: ms };
}

function asSchedule(policy: StalePolicy): StaleSchedule {
  return typeof policy === 'number' ? afterQuietFor(policy) : policy;
}

/**
 * How late a node is, as a multiple of the grace its source allows.
 * 0 is fresh — including every moment the source is legitimately quiet — 1 is
 * exactly at the limit, and above 1 is stale.
 */
export function staleness(
  node: EcosystemNode,
  now: number,
  policy: StalePolicy,
): number {
  const { dueAfter, graceMs } = asSchedule(policy);
  if (graceMs <= 0) return 0;
  return Math.max(0, (now - dueAfter(node.updatedAt)) / graceMs);
}

export function isStale(
  node: EcosystemNode,
  now: number,
  policy: StalePolicy,
): boolean {
  return staleness(node, now, policy) > 1;
}

/**
 * Lateness policy per garden.
 *
 * Deliberately per-garden rather than global. An hourly notes scrape and a
 * fifteen second Prometheus scrape mean entirely different things by late, and a
 * single number would either cry wolf on one or stay silent on the other.
 */
const SCHEDULES: Record<string, StaleSchedule> = {};
export const FALLBACK_STALE_AFTER_MS = 15 * 60_000;

export function scheduleFor(gardenId: string): StaleSchedule {
  return SCHEDULES[gardenId] ?? afterQuietFor(FALLBACK_STALE_AFTER_MS);
}

/**
 * Register a garden's policy. Whoever composes the ecosystem calls this, because
 * when a source next expects to speak is a fact about the source and this module
 * has no business knowing that an exchange shuts at four or that a league plays
 * weekly. Keeping it a function rather than a mutable export means the write
 * happens somewhere you can find it.
 */
export function setStaleSchedule(gardenId: string, policy: StalePolicy): void {
  SCHEDULES[gardenId] = asSchedule(policy);
}

export interface Change {
  nodeId: string;
  /** Vitality then and now. */
  from: number;
  to: number;
  /** Signed, so callers can sort by direction as well as size. */
  delta: number;
  /** Blights that appeared since the reference time. */
  newBlights: number;
  /** True when the node did not exist at the reference time. */
  isNew: boolean;
}

/**
 * What moved since the user last stood in this garden.
 *
 * "What changed since I last looked" is a different question from "what does
 * this look like now", and it is closer to what the product promises. A service
 * that crashed and recovered overnight is invisible to a live view and obvious
 * here.
 */
export function changedSince(
  state: EcosystemState,
  gardenId: string,
  since: number,
  minDelta = 0.05,
): Change[] {
  const changes: Change[] = [];

  for (const node of Object.values(state.nodes)) {
    if (node.gardenId !== gardenId || node.kind !== 'plant') continue;

    const history = state.history[node.id];
    const before = history ? sampleNearest(state, node.id, since) : null;
    const isNew = before === null && node.updatedAt >= since;
    const from = before ?? node.vitality;
    const delta = node.vitality - from;
    const newBlights = node.blights.filter((b) => b.since >= since).length;

    if (!isNew && Math.abs(delta) < minDelta && newBlights === 0) continue;

    changes.push({
      nodeId: node.id,
      from,
      to: node.vitality,
      delta,
      newBlights,
      isNew,
    });
  }

  // Biggest movers first, with new arrivals and new problems weighted up.
  return changes.sort(
    (a, b) =>
      score(b) - score(a) || Math.abs(b.delta) - Math.abs(a.delta),
  );
}

function score(change: Change): number {
  return (change.isNew ? 2 : 0) + change.newBlights + Math.abs(change.delta);
}

/**
 * Vitality at or just before a timestamp, walking back through the buffer to
 * skip gaps. Returns null when nothing was recorded at or before that point,
 * which is how a genuinely new node is distinguished from a quiet one.
 */
function sampleNearest(
  state: EcosystemState,
  nodeId: string,
  timestamp: number,
): number | null {
  const history = state.history[nodeId];
  if (!history) return null;

  const step = history.stepMs;
  for (let back = 0; back < history.capacity; back++) {
    const at = timestamp - back * step;
    const slot = Math.floor(at / step);
    const i = ((slot % history.capacity) + history.capacity) % history.capacity;
    if (history.slots[i] === slot) return history.vitality[i];
  }
  return null;
}
