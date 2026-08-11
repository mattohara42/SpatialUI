/**
 * The world adapter's public face.
 *
 * What a live adapter replaces: `syntheticWorldSource`, and the `NewsSource`
 * handed to it, and nothing else. The World Bank's indicator API fills in
 * releases, a conflict dataset or a wire fills in events, and the derivations,
 * the translation, and the scene are unchanged — they only ever see figures
 * stamped with when they were published and events stamped with when they were
 * reported.
 *
 * What a live adapter would *not* have to supply is the country table. That is
 * here because it is real and fixed, in the same way `session.ts` is in the
 * market adapter: a fact about the domain rather than a fact about the feed.
 */

export * from './types';
export {
  COUNTRIES,
  SUBREGIONS,
  SUBREGION_ORDER,
  countriesIn,
  countryOf,
} from './countries';
export { BORDERS, neighboursOf, type Border } from './borders';
export {
  generateWorldSnapshot,
  syntheticWorldSource,
  type WorldOptions,
} from './world';
export * from './derive';
