import type { EcosystemNode, EcosystemState } from './types';

/**
 * Silence looks like health.
 *
 * An adapter that dies leaves a thriving plant standing there, and a garden is
 * reassuring enough that people believe it. Staleness is therefore a first class
 * visual state rather than a footnote: grey, dusty, motionless, and faintly
 * unsettling.
 */

/**
 * How late a node is, as a multiple of what its garden considers normal.
 * 0 is fresh, 1 is exactly at the threshold, above 1 is stale.
 */
export function staleness(
  node: EcosystemNode,
  now: number,
  thresholdMs: number,
): number {
  if (thresholdMs <= 0) return 0;
  return Math.max(0, (now - node.updatedAt) / thresholdMs);
}

export function isStale(
  node: EcosystemNode,
  now: number,
  thresholdMs: number,
): boolean {
  return staleness(node, now, thresholdMs) > 1;
}

/**
 * Default lateness threshold per garden, in milliseconds.
 *
 * Deliberately per-garden rather than global. An hourly notes scrape and a
 * fifteen second Prometheus scrape mean entirely different things by late, and a
 * single number would either cry wolf on one or stay silent on the other.
 */
export const DEFAULT_STALE_AFTER_MS: Record<string, number> = {};
export const FALLBACK_STALE_AFTER_MS = 15 * 60_000;

export function staleThresholdFor(gardenId: string): number {
  return DEFAULT_STALE_AFTER_MS[gardenId] ?? FALLBACK_STALE_AFTER_MS;
}

/**
 * Register a garden's threshold. Whoever composes the ecosystem calls this,
 * because what counts as late is a fact about the source and this module has no
 * business knowing that a league plays weekly and a scrape runs every fifteen
 * seconds. Keeping it a function rather than a mutable export means the write
 * happens somewhere you can find it.
 */
export function setStaleThreshold(gardenId: string, thresholdMs: number): void {
  DEFAULT_STALE_AFTER_MS[gardenId] = thresholdMs;
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
