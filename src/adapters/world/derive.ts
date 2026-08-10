import type {
  ConflictEpisode,
  IndicatorKey,
  IndicatorRelease,
  UnrestEvent,
  WorldSnapshot,
} from './types';

/**
 * Every question anybody wants answered, as of a timestamp.
 *
 * The league derives standings from games and the book derives value from bars.
 * This file derives what was *known* from what had been published, and that
 * distinction is the reason it exists rather than a summary field on a country.
 *
 * ## The vintage rule
 *
 * `latestRelease` returns the most recent figure **published at or before**
 * `asOf` — not the most recent figure describing a period at or before `asOf`,
 * which is a different query and the wrong one. The difference shows up the
 * moment a number is revised: on 30 April a country's Q1 growth is 2.1%, and on
 * 30 May the same quarter is restated at 1.4%. Ask "what was known on 15 May"
 * and the answer is 2.1%, permanently, because that is what anybody looking
 * could have seen.
 *
 * Doing it the other way would mean the garden quietly rewrote its own history
 * every time a statistical office changed its mind — scrub back three months
 * and you would see today's opinion of April rather than April. That is the
 * flat-line failure the history buffers already refuse to commit, arriving by a
 * different route.
 *
 * Nothing here knows what a plant is.
 */

/** Everything one country has ever said, and everything said about it. */
export interface CountryRecord {
  releases: IndicatorRelease[];
  unrest: UnrestEvent[];
  conflicts: ConflictEpisode[];
}

const EMPTY: CountryRecord = { releases: [], unrest: [], conflicts: [] };

/**
 * The snapshot, indexed by country.
 *
 * Built once per translation pass rather than filtered per country, because the
 * naive version is quadratic in a garden with 193 plants and several thousand
 * releases — which is a size neither existing source ever reached.
 */
export function recordsByCountry(
  snapshot: WorldSnapshot,
): Record<string, CountryRecord> {
  const out: Record<string, CountryRecord> = {};
  const get = (iso3: string): CountryRecord =>
    (out[iso3] ??= { releases: [], unrest: [], conflicts: [] });

  for (const release of snapshot.releases) get(release.iso3).releases.push(release);
  for (const event of snapshot.unrest) get(event.iso3).unrest.push(event);
  for (const episode of snapshot.conflicts) get(episode.iso3).conflicts.push(episode);

  return out;
}

export function recordFor(
  records: Record<string, CountryRecord>,
  iso3: string,
): CountryRecord {
  return records[iso3] ?? EMPTY;
}

/**
 * The figure that was current for this indicator at `asOf`.
 *
 * Releases arrive ascending by `releasedAt`, so this is the last one that had
 * been published. Null means nothing had been — a country before its first
 * publication has no figure, and inventing a plausible one for it is exactly
 * what the history buffers refuse to do.
 */
export function latestRelease(
  releases: readonly IndicatorRelease[],
  indicator: IndicatorKey,
  asOf: number,
): IndicatorRelease | null {
  let found: IndicatorRelease | null = null;
  for (const release of releases) {
    if (release.indicator !== indicator) continue;
    if (release.releasedAt > asOf) break;
    found = release;
  }
  return found;
}

/** The value that was current, or null if nothing had been published. */
export function indicatorAt(
  releases: readonly IndicatorRelease[],
  indicator: IndicatorKey,
  asOf: number,
): number | null {
  return latestRelease(releases, indicator, asOf)?.value ?? null;
}

/**
 * The figure that was current *before* the current one.
 *
 * What trend is computed against: did the newest number improve on the one it
 * replaced. Deliberately "the previous release" rather than "the same period a
 * year ago" — the axis is about the moment the news landed, and it is the
 * arrival of a figure that moves a plant, not the passage of a year.
 */
export function previousVintage(
  releases: readonly IndicatorRelease[],
  indicator: IndicatorKey,
  asOf: number,
): IndicatorRelease | null {
  let previous: IndicatorRelease | null = null;
  let current: IndicatorRelease | null = null;

  for (const release of releases) {
    if (release.indicator !== indicator) continue;
    if (release.releasedAt > asOf) break;
    previous = current;
    current = release;
  }
  return previous;
}

/**
 * How many releases had been published. The memo key for history backfill.
 *
 * The exact analogue of the market's `countThrough` and the league's games
 * played: a country's derived numbers cannot move between two moments with the
 * same count, so a backfill walking 140 daily slots recomputes only where a
 * figure actually landed. Releases are sparse, so this earns far more here than
 * it does on a tape that prints every hour.
 */
export function releasesThrough(
  releases: readonly IndicatorRelease[],
  asOf: number,
): number {
  let n = 0;
  for (const release of releases) {
    if (release.releasedAt > asOf) break;
    n++;
  }
  return n;
}

/** How many unrest events had been reported. The other half of the memo key. */
export function unrestThrough(
  events: readonly UnrestEvent[],
  asOf: number,
): number {
  let n = 0;
  for (const event of events) {
    if (event.at > asOf) break;
    n++;
  }
  return n;
}

/**
 * Reported unrest over the trailing window, weighted by how serious each report
 * read.
 *
 * A count would make a fortnight of small demonstrations look like a fortnight
 * of riots. Weighting by severity keeps the axis reading "how much is going on"
 * rather than "how many wires moved".
 */
export function unrestRateAt(
  events: readonly UnrestEvent[],
  asOf: number,
  windowMs: number,
): number {
  const from = asOf - windowMs;
  let total = 0;
  for (const event of events) {
    if (event.at > asOf) break;
    if (event.at >= from) total += event.severity;
  }
  return total;
}

/** The conflicts under way at `asOf`. Ended episodes drop out on their own. */
export function activeConflictsAt(
  conflicts: readonly ConflictEpisode[],
  asOf: number,
): ConflictEpisode[] {
  return conflicts.filter(
    (episode) =>
      episode.since <= asOf && (episode.until === undefined || episode.until > asOf),
  );
}

/**
 * The last time this source said anything at all about a country.
 *
 * What `updatedAt` is set from, and therefore what staleness measures against.
 * A release, a reported event, or a conflict beginning all count as the country
 * having been heard from; nothing else does. Null means it has never been heard
 * from, which is a real state and reads as the deepest silence there is.
 *
 * Note it takes the maximum across all three rather than the newest release
 * alone. A country in the middle of a war that has published no statistics for
 * two years is not silent — it is being reported on constantly — and greying it
 * out would be the garden saying something false about a place it can see.
 */
export function lastHeardFrom(record: CountryRecord, asOf: number): number | null {
  let latest = -Infinity;

  for (const release of record.releases) {
    if (release.releasedAt > asOf) break;
    if (release.releasedAt > latest) latest = release.releasedAt;
  }
  for (const event of record.unrest) {
    if (event.at > asOf) break;
    if (event.at > latest) latest = event.at;
  }
  for (const episode of record.conflicts) {
    if (episode.since <= asOf && episode.since > latest) latest = episode.since;
  }

  return Number.isFinite(latest) ? latest : null;
}
