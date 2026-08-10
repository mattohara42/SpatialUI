import type { Article } from '../news/types';

/**
 * What a world feed hands over, in the shape a feed actually has.
 *
 * The rule the NFL adapter set and the market kept: **store events, not
 * summaries**. A feed that hands you "GDP growth: 2.1%" has thrown away the one
 * fact that makes the number interpretable — *when it became known* — and with
 * it every question about what anybody could have seen at the time.
 *
 * That matters more here than in either existing source, because this is the
 * first feed whose numbers are **revised**. A quarter's growth is published,
 * then restated twice over the following year. A garden built on the latest
 * value would quietly rewrite its own past every time a statistical office
 * changed its mind, and a scrub back through it would show a history that never
 * happened. So the record is releases, each stamped with `releasedAt`, and
 * every derivation asks what was known as of a timestamp.
 *
 * Nothing in this folder knows what a plant is.
 */

/** UN M49 top-level region. Grouping only; the bed is the subregion. */
export type Region = 'africa' | 'americas' | 'asia' | 'europe' | 'oceania';

/**
 * UN M49 subregion — the bed a country grows in.
 *
 * Twenty-two of them, holding between two and eighteen countries. That spread
 * is the point rather than an inconvenience: both existing gardens are eight
 * even beds, and nothing in the layout or the reading has ever been asked what
 * happens when one bed holds nine times what its neighbour does.
 */
export type SubregionKey =
  | 'northern-africa'
  | 'eastern-africa'
  | 'middle-africa'
  | 'southern-africa'
  | 'western-africa'
  | 'northern-america'
  | 'caribbean'
  | 'central-america'
  | 'south-america'
  | 'central-asia'
  | 'eastern-asia'
  | 'south-eastern-asia'
  | 'southern-asia'
  | 'western-asia'
  | 'eastern-europe'
  | 'northern-europe'
  | 'southern-europe'
  | 'western-europe'
  | 'australia-new-zealand'
  | 'melanesia'
  | 'micronesia'
  | 'polynesia';

/**
 * A sovereign state. Facts about the country, none of them indicators.
 *
 * Everything here is real and checkable, which is the same division the other
 * two adapters draw: `teams.ts` is the real alignment behind a generated
 * season, `instruments.ts` the real listings behind a generated tape.
 */
export interface Country {
  /** ISO 3166-1 alpha-3. Also the node id's stem, and the emblem's mark. */
  iso3: string;
  /** ISO 3166-1 alpha-2. Carried for a live adapter's benefit. */
  iso2: string;
  name: string;
  subregion: SubregionKey;
  region: Region;
  /**
   * Year this state joined the United Nations. Feeds maturity, never health.
   *
   * Chosen over "year of independence" deliberately. Independence is a judgment
   * call for half the table — France, China, and Egypt all have several
   * defensible dates and picking between them would be the adapter asserting a
   * view about their history. UN accession is a single dated administrative
   * fact, uniform across all 193, and it answers the question maturity actually
   * asks: how long has this thing existed as a state in the system we are
   * looking at. Founding members carry 1945.
   */
  unMemberSince: number;
  /**
   * Approximate population in millions, rounded.
   *
   * An anchor for the generated population series and an input to maturity, in
   * the same slot as `listedYear`. Deliberately coarse and deliberately not
   * presented as a current figure: it is the order of magnitude of the country,
   * which is all either use needs.
   */
  populationM: number;
  /** Flag colour, for the tag's roundel. Identity, never state. */
  primary: string;
  /** Second flag colour. Identity, never state. */
  secondary: string;
}

/** The indicators this source carries. */
export type IndicatorKey =
  | 'gdp-growth'
  | 'life-expectancy'
  | 'birth-rate'
  | 'population';

/**
 * One published figure, as published.
 *
 * `period` is what the number describes and `releasedAt` is when it became
 * known, and the gap between them is the whole reason this type exists — it
 * runs from weeks to the better part of a year. Two releases may carry the same
 * `period` and different values: that is a revision, not a bug, and the
 * derivations resolve it by release order rather than by pretending the earlier
 * one never existed.
 */
export interface IndicatorRelease {
  iso3: string;
  indicator: IndicatorKey;
  /** What the figure describes: '2026-Q2' for quarterly, '2025' for annual. */
  period: string;
  value: number;
  /** Epoch ms the figure was published. Every as-of query compares against this. */
  releasedAt: number;
}

export type UnrestKind = 'protest' | 'riot' | 'strike';

/**
 * A dated episode of civil unrest, derived from a report of one.
 *
 * `article` is required rather than optional, which is the provenance rule
 * expressed in the type system: an event of this kind is always somebody's
 * account of something, and a shape that let the account be dropped would let
 * a derived claim travel downstream looking like a measurement.
 */
export interface UnrestEvent {
  id: string;
  iso3: string;
  kind: UnrestKind;
  /** Epoch ms the episode was reported. */
  at: number;
  /** 0..1. How serious the report reads, not how serious the thing was. */
  severity: number;
  article: Article;
}

export type ConflictKind = 'armed-conflict' | 'civil-conflict';

/**
 * An ongoing armed conflict involving this state.
 *
 * An episode rather than an event: it has a start, it may have an end, and it
 * is the thing a blight's `since` is for. `articles` accumulates every report
 * that contributed, so the detail panel can show what the episode was built
 * from rather than asserting it.
 */
export interface ConflictEpisode {
  id: string;
  iso3: string;
  kind: ConflictKind;
  since: number;
  /** Absent while ongoing. */
  until?: number;
  /** 0..1, from how much is being reported and how consistently. */
  intensity: number;
  articles: Article[];
}

export interface Provenance {
  /** Where this came from, in words a person can check. */
  source: string;
  /** False when the numbers are generated. Never quietly true. */
  live: boolean;
  note?: string;
}

/** The whole state of the world at one instant, as this source understands it. */
export interface WorldSnapshot {
  /** Epoch ms the snapshot was taken. */
  fetchedAt: number;
  countries: Country[];
  /** Ascending by `releasedAt`. Derivations rely on this. */
  releases: IndicatorRelease[];
  /** Ascending by `at`. */
  unrest: UnrestEvent[];
  conflicts: ConflictEpisode[];
  provenance: Provenance;
}

/**
 * What a source has to provide.
 *
 * A live adapter — the World Bank's indicator API for releases, UCDP or ACLED
 * for conflict, a news feed for everything that moves faster than a statistical
 * office — implements this and nothing downstream changes.
 */
export interface WorldSource {
  readonly name: string;
  snapshot(now?: number): WorldSnapshot;
}
