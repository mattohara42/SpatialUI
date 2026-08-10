import { create } from 'zustand';
import type { EcosystemNode, EcosystemState } from '../ecosystem/types';
import { record } from '../ecosystem/history';
import { changedSince, setStaleSchedule, type Change } from '../ecosystem/staleness';
import { SCRUB_WINDOW_MS, windowFor } from '../ecosystem/scrub';
import { reachOf } from '../ecosystem/timeline';
import type { VitalsHistory } from '../ecosystem/history';
import { generateMockEcosystem, tickMockEcosystem } from '../mock/mockEcosystemData';
import { NFL_GARDEN_ID } from '../translation/nfl';
import { SOURCES, dueSources } from './sources';

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
  /**
   * How much of that window the *fine* buffer covers — where hours become days.
   * Held for the same reason and computed in the same pass, because both are
   * answers about the same garden's record and walking it twice would be silly.
   */
  fineWindowMs: number;
  /**
   * The plant whose detail is open, or null.
   *
   * Selection is state rather than a component's business because two things
   * need it and they live at opposite ends of the scene: the tag that was
   * clicked, and the panel that opens. Keeping it here also means it survives a
   * telemetry tick — a panel that closed itself every two seconds because the
   * numbers moved would be unusable — while entering a garden clears it, since
   * the plant it was about is no longer in front of you.
   */
  selectedId: string | null;

  enterGarden: (gardenId: string) => void;
  /** Open the detail panel for a plant, or close it with null. */
  select: (nodeId: string | null) => void;
  /** Null returns the scene to live. */
  setCursor: (cursor: number | null) => void;
  commit: (nodes: Record<string, EcosystemNode>, at?: number) => void;
  tick: () => void;
  /**
   * Ask any source that owes a reading for one. Returns the gardens refreshed,
   * which is nothing on almost every call.
   */
  poll: (at?: number) => string[];
  /** What moved since the user last stood in the active garden. */
  changesSinceLastVisit: () => Change[];
}

/**
 * Where the gardens come from.
 *
 * This is the composition point, and the only place that knows more than one
 * source exists: the mock gardens, which are shapes to tune the renderer
 * against, and two real ones that come through the pipeline — an adapter
 * emitting feed-shaped records, a translator turning them into nodes. Adding a
 * source means adding a translator and a line here, which is the claim the
 * layering has been making since before any of them existed, and which the
 * market source is the first independent test of.
 *
 * The league opens the app because it is the one garden made of something that
 * happened, and because thirty-two clubs across eight beds is the first scene
 * with enough in it to judge the reading at a glance.
 */
function composeEcosystem(now = Date.now()): EcosystemState {
  const state: EcosystemState = {
    ...generateMockEcosystem(),
    activeGardenId: NFL_GARDEN_ID,
  };

  for (const source of SOURCES) {
    const garden = source.read(now);
    Object.assign(state.nodes, garden.nodes);
    Object.assign(state.edges, garden.edges);
    Object.assign(state.history, garden.history);
    Object.assign(state.archive, garden.archive);

    // When a source should next be heard from is a fact about the source, and
    // the two real ones disagree about it in kind rather than merely in size —
    // the exchange publishes a calendar, the league's feed carries only games
    // already played. Registered here rather than inside a translator because
    // this is the layer that has the whole picture.
    setStaleSchedule(source.gardenId, source.policy);
  }

  return state;
}

/**
 * The furthest back any node in this garden can honestly be shown. Taken as the
 * shortest reach among its archived nodes, not the longest: a window sized to
 * the best-recorded plant would leave the rest of the bed falling through to
 * live, which is the failure where the garden shows you today and lets you
 * believe it is March.
 */
function windowsFor(
  state: EcosystemState,
  gardenId: string | null,
  now = Date.now(),
): { scrubWindowMs: number; fineWindowMs: number } {
  if (!gardenId) return { scrubWindowMs: SCRUB_WINDOW_MS, fineWindowMs: 0 };

  let window = Infinity;
  const fine: Array<VitalsHistory | undefined> = [];
  for (const node of Object.values(state.nodes)) {
    if (node.gardenId !== gardenId || node.kind !== 'plant') continue;
    window = Math.min(window, windowFor(state.archive[node.id], now));
    fine.push(state.history[node.id]);
  }

  return {
    scrubWindowMs: Number.isFinite(window) ? window : SCRUB_WINDOW_MS,
    // Same shortest-reach rule, applied to the other tier. `reachOf` returns 0
    // for a garden where any plant keeps no hourly record, which is how the
    // timeline says "no fine grain here" rather than guessing one.
    fineWindowMs: fine.length ? reachOf(fine, now) : 0,
  };
}

const initial = composeEcosystem();

export const useEcosystem = create<EcosystemStore>((set, get) => ({
  ...initial,
  lastViewedAt: {},
  ...windowsFor(initial, initial.activeGardenId),
  selectedId: null,

  enterGarden: (gardenId) =>
    set((state) => ({
      activeGardenId: gardenId,
      cursor: null,
      selectedId: null,
      ...windowsFor(state, gardenId),
      // Stamped on the way out rather than on the way in, so the first render
      // after entering still has the previous visit to compare against.
      lastViewedAt: { ...state.lastViewedAt },
    })),

  select: (nodeId) => set({ selectedId: nodeId }),

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

  /**
   * The poll.
   *
   * Deliberately not a timer of its own. It runs on the same beat as everything
   * else and asks a cheap question first — `dueSources` is a scan of the garden's
   * plants against a due time — so the expensive part, re-reading a source and
   * translating it, happens only when the source's own calendar says something
   * should have arrived. For the market that is once an hour during a session and
   * never outside one.
   *
   * It commits nodes only. The history buffers a re-read produces are thrown
   * away, because the ones already in the store hold what was actually observed
   * and `commit` records the new reading into them — a backfill overwriting live
   * history would be the app inventing a past it had watched happen.
   */
  poll: (at = Date.now()) => {
    const due = dueSources(get().nodes, at);
    if (due.length === 0) return [];

    const nodes: Record<string, EcosystemNode> = {};
    for (const source of due) Object.assign(nodes, source.read(at).nodes);
    get().commit(nodes, at);
    return due.map((source) => source.gardenId);
  },

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
