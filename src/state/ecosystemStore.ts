import { create } from 'zustand';
import type { EcosystemNode, EcosystemState } from '../ecosystem/types';
import { record } from '../ecosystem/history';
import { changedSince, type Change } from '../ecosystem/staleness';
import { generateMockEcosystem, tickMockEcosystem } from '../mock/mockEcosystemData';

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

const initial = generateMockEcosystem();

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
