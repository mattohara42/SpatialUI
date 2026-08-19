/**
 * The NFL adapter.
 *
 * Two sources now implement `NflSource`'s data, and the split is the whole point
 * the synthetic one was making:
 *
 * - `syntheticNflSource` — a seeded season in the exact shape a real feed
 *   returns, the offline default that needs no network.
 * - `liveNflSource` (`live.ts`, fetching through `espn.ts`) — the real thing:
 *   ESPN's public feed filling `NflSeasonSnapshot` with real results, rosters,
 *   and injuries, stamped `provenance.kind = 'live'`. Nothing in `derive.ts`,
 *   `translation/nfl.ts`, or the scene changed to add it, which is the claim the
 *   synthetic source was only ever standing in for. `state/sources.ts` selects it
 *   over the generator when `VITE_NFL_PROXY_URL` points at the backend proxy.
 */

export * from './types';
export { NFL_TEAMS, CONFERENCES, DIVISION_NAMES, divisionKey, divisionLabel } from './teams';
export { DEPTH_CHART, TOTAL_IMPORTANCE, importanceOf, type SlotSpec } from './roster';
export { GAME_DURATION_MS, generateNflSnapshot, seasonYear, syntheticNflSource } from './season';
export {
  fetchNflSnapshot,
  parseScoreboardMeta,
  parseScoreboardResults,
  parseSummaryGame,
  parseRoster,
  parseInjuries,
  teamIdFromAbbr,
  type EspnConfig,
  type FetchLike,
  type KnownState,
} from './espn';
export { liveNflSource, type LiveNflSource, type LiveNflConfig } from './live';
export * from './derive';
