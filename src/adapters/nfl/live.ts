import type { LiveSource, TranslatedGarden } from '../../state/sources';
import {
  NFL_GARDEN_ID,
  NFL_STALE_AFTER_MS,
  translateNflSnapshot,
} from '../../translation/nfl';
import {
  fetchNflSnapshot,
  type EspnConfig,
  type FetchLike,
  type KnownState,
} from './espn';
import type { NflGame, NflSeasonSnapshot, RosterSlot } from './types';

/**
 * A *live* NFL `LiveSource`, and the same honest resolution of the seam friction
 * `promSource` met.
 *
 * `LiveSource.read(now)` is synchronous, because the whole store is; a network
 * fetch is not. So this separates the two exactly as Prometheus does: `read`
 * translates the **last snapshot it holds**, synchronously, and `refresh` is the
 * async call that fetches a fresh one from ESPN and adopts it. `adopt` takes a
 * snapshot without fetching — the seam a test drives, and the seam a backend that
 * already fetched hands results back through.
 *
 * Two things it adds over `promSource`, both because the NFL feed is many
 * endpoints rather than one query:
 *
 * - **It accumulates.** A season's box scores do not change once final, so the
 *   source remembers the games and rosters it has seen and `refresh` passes them
 *   back as `KnownState` — a mid-season poll fetches the new week's finals, not
 *   the whole season. This is what keeps a per-minute collector from re-pulling
 *   two-hundred-odd box scores every tick.
 * - **Its trend is intra-snapshot.** Football trend is last-five form against
 *   season form (`derive.ts`), computed inside one snapshot, so unlike Prometheus
 *   there is no previous-poll vitality to thread across refreshes.
 *
 * The gap this leaves is the same one, named the same way: something has to
 * *call* `refresh` on the club's cadence, and a shut tab cannot. That caller is
 * the unattended collector loop (`docs/backend.md`); this source is the whole of
 * the part that lives in the client, and `state/sources.ts` selects it over the
 * synthetic generator when `VITE_NFL_PROXY_URL` is set.
 */
export interface LiveNflSource extends LiveSource {
  /** Fetch a fresh snapshot from ESPN and adopt it. The async half `read` cannot be. */
  refresh(now?: number): Promise<void>;
  /** Adopt a snapshot without fetching — the tests' seam, and a backend's. */
  adopt(snapshot: NflSeasonSnapshot): void;
  /** The snapshot `read` is currently translating, or null before the first. */
  readonly snapshot: NflSeasonSnapshot | null;
}

export interface LiveNflConfig extends EspnConfig {
  /** Injected for tests and the proxy; defaults to the platform `fetch`. */
  fetchImpl?: FetchLike;
}

export function liveNflSource(config: LiveNflConfig = {}): LiveNflSource {
  const fetchImpl =
    config.fetchImpl ?? (globalThis.fetch as unknown as FetchLike | undefined);

  let held: NflSeasonSnapshot | null = null;

  const translate = (now: number): TranslatedGarden => {
    if (!held) {
      // No snapshot yet: only the garden's root would exist, so return nothing
      // and let the store show a source declared but not yet heard from — the
      // honest picture of a live feed that has not answered its first fetch.
      return { nodes: {}, edges: {}, history: {}, archive: {} };
    }
    return translateNflSnapshot(held, { asOf: now });
  };

  /** What the held snapshot already knows, so a refresh only fetches the new. */
  const knownFrom = (snapshot: NflSeasonSnapshot | null): KnownState => {
    if (!snapshot) return {};
    const games: Record<string, NflGame> = {};
    for (const game of snapshot.games) games[game.id] = game;
    const rosters: Record<string, RosterSlot[]> = {};
    for (const team of snapshot.teams) {
      if (team.roster.length > 0) rosters[team.team.id] = team.roster;
    }
    return { games, rosters };
  };

  return {
    gardenId: NFL_GARDEN_ID,
    policy: NFL_STALE_AFTER_MS,
    pollable: true,
    read: (now) => translate(now),
    adopt(snapshot) {
      held = snapshot;
    },
    async refresh(now = Date.now()) {
      if (!fetchImpl) throw new Error('liveNflSource: no fetch available in this runtime');
      held = await fetchNflSnapshot(config, fetchImpl, now, knownFrom(held));
    },
    get snapshot() {
      return held;
    },
  };
}
