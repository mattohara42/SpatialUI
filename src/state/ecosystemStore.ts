import { create } from 'zustand';
import type { EcosystemNode, EcosystemState } from '../ecosystem/types';
import { record } from '../ecosystem/history';
import { changedSince, setStaleThreshold, type Change } from '../ecosystem/staleness';
import { SCRUB_WINDOW_MS, windowFor } from '../ecosystem/scrub';
import { generateMockEcosystem, tickMockEcosystem } from '../mock/mockEcosystemData';
import { syntheticNflSource } from '../adapters/nfl';
import {
  NFL_GARDEN_ID,
  NFL_STALE_AFTER_MS,
  translateNflSnapshot,
} from '../translation/nfl';

/**
 * The store holds state and nothing derived. Geometry, layout, adjacency, and
 * change detection are all computed by pure functions the scene memoizes, so a
 * telemetry tick never invalidates anything it did not actually touch.
 */
interface EcosystemStore extends EcosystemState {
  /** Epoch ms the user last stood in each garden. */
  lastViewedAt: Record<string, number>;
  /**
   * How far back this garden's cursor may go, from what it has actually
   * archived. Held rather than derived per call because the scrub gesture asks
   * on every pointer move and the answer only changes when the garden does.
   */
  scrubWindowMs: number;

  enterGarden: (gardenId: string) => void;
  /** Null returns the scene to live. */
  setCursor: (cursor: number | null) => void;
  commit: (nodes: Record<string, EcosystemNode>, at?: number) => void;
  tick: () => void;
  /** What moved since the user last stood in the active garden. */
  changesSinceLastVisit: () => Change[];
}

/**
 * Where the gardens come from.
 *
 * This is the composition point, and the only place that knows more than one
 * source exists: the mock gardens, which are shapes to tune the renderer
 * against, and the NFL league, which comes through the real pipeline — an
 * adapter emitting feed-shaped records, a translator turning them into nodes.
 * Adding a source means adding a translator and a line here, which is the claim
 * the layering has been making since before either existed.
 *
 * The league opens the app because it is the one garden made of something that
 * happened, and because thirty-two clubs across eight beds is the first scene
 * with enough in it to judge the reading at a glance.
 */
function composeEcosystem(): EcosystemState {
  const mock = generateMockEcosystem();
  const league = translateNflSnapshot(syntheticNflSource().snapshot());

  // What counts as late is a fact about the source: a club plays weekly, so a
  // fifteen minute threshold would paint the entire league grey.
  setStaleThreshold(NFL_GARDEN_ID, NFL_STALE_AFTER_MS);

  return {
    ...mock,
    nodes: { ...mock.nodes, ...league.nodes },
    edges: { ...mock.edges, ...league.edges },
    history: { ...mock.history, ...league.history },
    archive: { ...mock.archive, ...league.archive },
    activeGardenId: NFL_GARDEN_ID,
  };
}

/**
 * The furthest back any node in this garden can honestly be shown. Taken as the
 * shortest reach among its archived nodes, not the longest: a window sized to
 * the best-recorded plant would leave the rest of the bed falling through to
 * live, which is the failure where the garden shows you today and lets you
 * believe it is March.
 */
function scrubWindowFor(state: EcosystemState, gardenId: string | null): number {
  if (!gardenId) return SCRUB_WINDOW_MS;
  const now = Date.now();
  let window = Infinity;
  for (const node of Object.values(state.nodes)) {
    if (node.gardenId !== gardenId || node.kind !== 'plant') continue;
    window = Math.min(window, windowFor(state.archive[node.id], now));
  }
  return Number.isFinite(window) ? window : SCRUB_WINDOW_MS;
}

const initial = composeEcosystem();

export const useEcosystem = create<EcosystemStore>((set, get) => ({
  ...initial,
  lastViewedAt: {},
  scrubWindowMs: scrubWindowFor(initial, initial.activeGardenId),

  enterGarden: (gardenId) =>
    set((state) => ({
      activeGardenId: gardenId,
      cursor: null,
      scrubWindowMs: scrubWindowFor(state, gardenId),
      // Stamped on the way out rather than on the way in, so the first render
      // after entering still has the previous visit to compare against.
      lastViewedAt: { ...state.lastViewedAt },
    })),

  setCursor: (cursor) => set({ cursor }),

  commit: (nodes, at = Date.now()) => {
    const { history, archive } = get();
    for (const node of Object.values(nodes)) {
      const buffer = history[node.id];
      if (buffer) record(buffer, at, node);
      // The archive's slot is a day wide and `record` keeps the last write, so
      // a live tick simply keeps today's sample current. That is what makes the
      // coarse tier stay true as days roll over, rather than being a backfill
      // that ages out from under the scrub.
      const coarse = archive[node.id];
      if (coarse) record(coarse, at, node);
    }
    set((state) => ({ nodes: { ...state.nodes, ...nodes }, revision: at }));
  },

  tick: () => set((state) => tickMockEcosystem(state)),

  changesSinceLastVisit: () => {
    const state = get();
    if (!state.activeGardenId) return [];
    const since = state.lastViewedAt[state.activeGardenId];
    if (since === undefined) return [];
    return changedSince(state, state.activeGardenId, since);
  },
}));

/**
 * Call when leaving a garden. Separate from `enterGarden` because the timestamp
 * has to survive the whole visit for the change summary to mean anything.
 */
export function markVisited(gardenId: string, at = Date.now()): void {
  useEcosystem.setState((state) => ({
    lastViewedAt: { ...state.lastViewedAt, [gardenId]: at },
  }));
}
