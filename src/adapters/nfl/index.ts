/**
 * The NFL adapter.
 *
 * One source is implemented — `syntheticNflSource`, a seeded season in the shape
 * a real feed returns — because this environment has no outbound network access
 * to a sports API. Anything that speaks `NflSource` can replace it: a live
 * adapter fetches a schedule with box scores, a roster, and an injury report,
 * fills in `NflSeasonSnapshot`, and stamps `provenance.kind = 'live'`. Nothing
 * in `derive.ts`, `translation/nfl.ts`, or the scene has to change, which is the
 * only claim the synthetic source is really making.
 */

export * from './types';
export { NFL_TEAMS, CONFERENCES, DIVISION_NAMES, divisionKey, divisionLabel } from './teams';
export { DEPTH_CHART, TOTAL_IMPORTANCE, importanceOf, type SlotSpec } from './roster';
export { GAME_DURATION_MS, generateNflSnapshot, seasonYear, syntheticNflSource } from './season';
export * from './derive';
