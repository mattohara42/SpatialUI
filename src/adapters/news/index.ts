/**
 * The news adapter's public face.
 *
 * Two things live here and they are worth telling apart. `NewsSource` is a feed
 * — swap `syntheticNewsSource` for one that reads RSS and everything above is
 * unchanged. `extract` is the layer that made this adapter necessary at all: the
 * step from a sentence to a record, which neither the league nor the book ever
 * needed because both are handed structure by their feeds.
 *
 * Extraction is deliberately not folded into the source. A live adapter should
 * be free to fetch and parse and nothing else; deciding what a headline is
 * *about* is a judgment, it belongs in one reviewable place, and it must be the
 * same judgment whether the article came off the wire or out of `feeds.ts`.
 */

export * from './types';
export { extract, extractAll, soleCountryIn, type ExtractedEvent, type ExtractedKind } from './extract';
export {
  conflictCountries,
  generateArticles,
  silentCountries,
  syntheticNewsSource,
  type FeedOptions,
} from './feeds';
