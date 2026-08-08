import { create } from 'zustand';
import type { EcosystemNode, EcosystemState } from '../ecosystem/types';
import { record } from '../ecosystem/history';
import { changedSince, setStaleThreshold, type Change } from '../ecosystem/staleness';
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
    activeGardenId: NFL_GARDEN_ID,
  };
}

const initial = composeEcosystem();

export const useEcosystem = create<EcosystemStore>((set, get) => ({
  ...initial,
  lastViewedAt: {},

  enterGarden: (gardenId) =>
    set((state) => ({
      activeGardenId: gardenId,
      cursor: null,
      // Stamped on the way out rather than on the way in, so the first render
      // after entering still has the previous visit to compare against.
      lastViewedAt: { ...state.lastViewedAt },
    })),

  setCursor: (cursor) => set({ cursor }),

  commit: (nodes, at = Date.now()) => {
    const { history } = get();
    for (const node of Object.values(nodes)) {
      const buffer = history[node.id];
      if (buffer) record(buffer, at, node);
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
