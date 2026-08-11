import { DAY_MS, HOUR_MS } from './history';
import type { Completion } from './types';

/**
 * What a plant is currently showing of what it finished, as arithmetic.
 *
 * Completions arrive on the node as-of a timestamp, the way blights do (see
 * `types.ts`), so this module never touches history or the store — it is handed a
 * list and a clock and answers what should be on the plant right now: which
 * completions are still young enough to show, how ripe or weathered each is, and
 * split into the fruit (`done`) and the deadwood (`failed`) the reading draws.
 *
 * Pure and separate for the reason `staleness`, `labels`, and `bonsai` are: the
 * durations are the design decision — how long a finished thing lingers before it
 * drops — and they should be arguable in a test without a renderer. See
 * `docs/completion.md`.
 */

/**
 * How long a completion stays on the plant before it drops or weathers away.
 *
 * Long enough that a day's work is still there the next morning, short enough
 * that a plant shows what it finished *lately* rather than its whole history —
 * the record of everything it ever did lives in the source, not hanging in the
 * canopy.
 */
export const COMPLETION_WINDOW_MS = 3 * DAY_MS;

/** How long a fresh fruit takes to ripen, for the reading to colour it in. A
 *  completion younger than this is still greening; past it, fully ripe. */
export const RIPEN_MS = 12 * HOUR_MS;

/**
 * The most fruit or deadwood a single plant will show. A pipeline that builds
 * every few minutes would otherwise hang hundreds of fruit and read as a solid
 * mass; capped, it reads as "lots, lately" — which is the honest glance. The
 * newest are kept, because the oldest are the ones about to drop anyway.
 */
export const MAX_SHOWN = 8;

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * The completions a plant should show at `now`: those that have happened and are
 * not yet aged out, newest first, capped at `MAX_SHOWN`.
 *
 * A completion in the future is excluded, which matters under a scrub — drag the
 * sun back before a build finished and its fruit is simply not there yet, the
 * same way an injury from later in the season unwinds. Undefined is none.
 */
export function shownCompletions(
  completions: Completion[] | undefined,
  now: number,
  window = COMPLETION_WINDOW_MS,
): Completion[] {
  if (!completions || completions.length === 0) return [];
  return completions
    .filter((c) => {
      const age = now - c.at;
      return age >= 0 && age <= window;
    })
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_SHOWN);
}

/**
 * How far through its visible life a completion is: 0 the instant it finished, 1
 * as it is about to drop. Drives the fall of a ripe fruit and the weathering of
 * deadwood, and is a pure function of the shown time so it reproduces under a
 * scrub.
 */
export function age01(at: number, now: number, window = COMPLETION_WINDOW_MS): number {
  if (window <= 0) return 1;
  return clamp01((now - at) / window);
}

/** How ripe a fruit is: 0 just-set and green, 1 fully ripe. A separate, faster
 *  clock than `age01` — a fruit ripens early in its life and then simply hangs. */
export function ripeness(at: number, now: number, ripen = RIPEN_MS): number {
  if (ripen <= 0) return 1;
  return clamp01((now - at) / ripen);
}

/** The shown completions that succeeded — the fruit. */
export function fruit(shown: Completion[]): Completion[] {
  return shown.filter((c) => c.outcome === 'done');
}

/** The shown completions that failed — the deadwood. */
export function deadwood(shown: Completion[]): Completion[] {
  return shown.filter((c) => c.outcome === 'failed');
}

/**
 * A tally of outcomes within the window, for a one-line summary (a detail panel,
 * a HUD): how much finished, and how much of it failed. Independent of the
 * `MAX_SHOWN` cap, because a count should be true even when the plant cannot
 * hang every fruit.
 */
export function tally(
  completions: Completion[] | undefined,
  now: number,
  window = COMPLETION_WINDOW_MS,
): { done: number; failed: number } {
  let done = 0;
  let failed = 0;
  for (const c of completions ?? []) {
    const age = now - c.at;
    if (age < 0 || age > window) continue;
    if (c.outcome === 'done') done++;
    else failed++;
  }
  return { done, failed };
}
