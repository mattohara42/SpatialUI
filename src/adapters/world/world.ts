import { mulberry32, hashString } from '../../lsystem/random';
import { extractAll, silentCountries, syntheticNewsSource } from '../news';
import type { Article, NewsSource } from '../news/types';
import type { ExtractedEvent } from '../news/extract';
import { COUNTRIES } from './countries';
import type {
  ConflictEpisode,
  ConflictKind,
  Country,
  IndicatorRelease,
  UnrestEvent,
  UnrestKind,
  WorldSnapshot,
  WorldSource,
} from './types';

/**
 * The world, generated — except for the part that comes through the news layer.
 *
 * The split matters and is the point of the whole arrangement. **Indicator
 * releases are invented here.** **Unrest and conflict are not**: they are asked
 * for from a `NewsSource`, run through `extract`, and arrive as records the same
 * way they would from a live wire. So the path from a sentence to a blight is
 * real code doing real work today, and swapping `syntheticNewsSource` for one
 * that reads RSS changes nothing above this file.
 *
 * ## The release calendar, and why it is the interesting part
 *
 * Growth is published quarterly, about seventy-five days after the quarter it
 * describes, and **revised** a month later. Life expectancy, births, and
 * population are annual and land the following summer. That schedule is the
 * source of everything this garden does that neither other one can:
 *
 * - A plant's vitality steps on a **release date**, not on the date the figure
 *   describes, so scrubbing shows what was known rather than what was true.
 * - A revision means the same quarter has two different values, and which one
 *   you see depends on where the cursor is. That is not a wrinkle to smooth
 *   over; it is the honest behaviour of every economic series there is.
 * - A country that stops publishing goes quiet on a schedule the adapter can
 *   state, which is what `StaleSchedule` was built to express.
 *
 * ## Anchoring
 *
 * The value walk starts at a fixed year and always has, regardless of when it
 * is asked. That is what makes this source safe to re-ask: `snapshot(t)` and
 * `snapshot(t + an hour)` agree about every figure they both contain, so a poll
 * extends the record instead of sliding it. `tape.ts` needed an explicit anchor
 * for the same reason; here it falls out of walking the calendar.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Where the value walk begins. Fixed, never relative to now — see anchoring
 * above. Far enough back that every archive slot has published figures behind
 * it and the first vintage is never in view.
 */
const ANCHOR_YEAR = 2015;

/** How long after a quarter ends its growth figure is published, and revised. */
const FIRST_ESTIMATE_DAYS = 75;
const REVISION_DAYS = 105;

/** Offsets from year end for the annual series, staggered so they do not clash. */
const ANNUAL_OFFSET_DAYS = {
  population: 166,
  'life-expectancy': 181,
  'birth-rate': 196,
} as const;

export interface WorldOptions {
  seed?: number;
  /** Where unrest and conflict come from. Defaults to the generated feed. */
  news?: NewsSource;
  /** Years of release history kept in the snapshot. The walk always starts at the anchor. */
  years?: number;
  /** Days of news read. Must cover the daily archive plus the activity window. */
  newsDays?: number;
}

/**
 * How a country's series behave. Seeded off the ISO code, so a country is the
 * same country every run — the garden must not reshuffle under a reload.
 *
 * These are numbers with the right *shape*, not a model of any economy. Growth
 * persists and occasionally shocks; life expectancy drifts up; births drift
 * down. Nothing here is a claim about anywhere, which is why the provenance
 * says so and the panel repeats it.
 */
function characterOf(country: Country, seed: number) {
  const rng = mulberry32(seed ^ hashString(country.iso3));
  const development = rng();

  return {
    rng,
    /** Long-run growth rate this country reverts to, roughly -1% to +7%. */
    growthMean: -0.01 + rng() * 0.08,
    /** How violently growth moves quarter to quarter. */
    growthVol: 0.004 + rng() * 0.022,
    /** Persistence of the growth process. */
    growthRho: 0.45 + rng() * 0.35,
    /** Life expectancy at the anchor year, 52 to 84. */
    lifeBase: 52 + development * 32,
    /** Births per thousand at the anchor year. Inverse of development, loosely. */
    birthBase: 44 - development * 36,
  };
}

/** Quarter ends, from the anchor year to the quarter containing `to`. */
function quarterEnds(to: number): Array<{ label: string; endsAt: number }> {
  const out: Array<{ label: string; endsAt: number }> = [];
  const lastYear = new Date(to).getUTCFullYear();

  for (let year = ANCHOR_YEAR; year <= lastYear; year++) {
    out.push({ label: `${year}-Q1`, endsAt: Date.UTC(year, 2, 31) });
    out.push({ label: `${year}-Q2`, endsAt: Date.UTC(year, 5, 30) });
    out.push({ label: `${year}-Q3`, endsAt: Date.UTC(year, 8, 30) });
    out.push({ label: `${year}-Q4`, endsAt: Date.UTC(year, 11, 31) });
  }
  return out;
}

/**
 * Every figure this country has published, in publication order.
 *
 * Walked from the anchor in full and trimmed on the way out, so a figure's
 * value never depends on when the question was asked.
 */
function releasesFor(
  country: Country,
  now: number,
  from: number,
  seed: number,
  stopsReporting: boolean,
): IndicatorRelease[] {
  const character = characterOf(country, seed);
  const { rng } = character;
  const out: IndicatorRelease[] = [];

  /**
   * A country that has stopped publishing, and when. The staleness case, reached
   * the way the market's halt is: the releases simply stop and the last one
   * recedes into the past on its own. No timestamp is ever edited.
   */
  const stoppedAt = stopsReporting ? now - (40 + rng() * 120) * DAY_MS : Infinity;

  const push = (
    indicator: IndicatorRelease['indicator'],
    period: string,
    value: number,
    releasedAt: number,
  ) => {
    if (releasedAt > now || releasedAt < from || releasedAt > stoppedAt) return;
    out.push({ iso3: country.iso3, indicator, period, value, releasedAt });
  };

  // Growth: an AR(1) walk around the country's own mean, published twice —
  // a first estimate and a revision that moves it a little.
  let growth = character.growthMean;
  for (const quarter of quarterEnds(now)) {
    growth =
      character.growthMean +
      character.growthRho * (growth - character.growthMean) +
      (rng() - 0.5) * 2 * character.growthVol;

    const estimate = round(growth * 100, 2);
    const revised = round(estimate + (rng() - 0.5) * 0.9, 2);

    push('gdp-growth', quarter.label, estimate, quarter.endsAt + FIRST_ESTIMATE_DAYS * DAY_MS);
    push('gdp-growth', quarter.label, revised, quarter.endsAt + REVISION_DAYS * DAY_MS);
  }

  // The annual series. Slower, and published the following summer.
  const lastYear = new Date(now).getUTCFullYear();
  let life = character.lifeBase;
  let births = character.birthBase;
  let population = country.populationM;

  // Wind the population back to the anchor so it grows *into* the stated figure
  // rather than away from it.
  const yearsSinceAnchor = lastYear - ANCHOR_YEAR;
  population = country.populationM / Math.pow(1 + births / 1000 / 2.4, yearsSinceAnchor);

  for (let year = ANCHOR_YEAR; year <= lastYear; year++) {
    life = Math.min(88, life + 0.18 + (rng() - 0.5) * 0.5);
    births = Math.max(6, births - 0.35 + (rng() - 0.5) * 0.6);
    population = population * (1 + births / 1000 / 2.4);

    const yearEnd = Date.UTC(year, 11, 31);
    push('life-expectancy', `${year}`, round(life, 1), yearEnd + ANNUAL_OFFSET_DAYS['life-expectancy'] * DAY_MS);
    push('birth-rate', `${year}`, round(births, 1), yearEnd + ANNUAL_OFFSET_DAYS['birth-rate'] * DAY_MS);
    push('population', `${year}`, round(population, 2), yearEnd + ANNUAL_OFFSET_DAYS.population * DAY_MS);
  }

  return out.sort((a, b) => a.releasedAt - b.releasedAt);
}

const UNREST_KINDS = new Set<string>(['protest', 'riot', 'strike']);

/** How long a conflict may go unreported before it counts as a separate episode. */
const EPISODE_GAP_MS = 21 * DAY_MS;

/**
 * Extracted events, sorted into the two shapes the snapshot carries.
 *
 * Unrest is one report, one event. Conflict is not: a war is not a sequence of
 * unrelated incidents, and a blight that appeared and vanished with each wire
 * would be unreadable. So consecutive conflict reports about the same country
 * are gathered into an **episode** with a start, an intensity, and every article
 * that contributed to it — which is also what gives the blight its `since`, the
 * one thing a plant needs to say how long this has been going on.
 */
function sortEvents(events: readonly ExtractedEvent[], now: number): {
  unrest: UnrestEvent[];
  conflicts: ConflictEpisode[];
} {
  const unrest: UnrestEvent[] = [];
  const byCountry = new Map<string, ExtractedEvent[]>();

  for (const event of events) {
    if (UNREST_KINDS.has(event.kind)) {
      unrest.push({
        id: `${event.article.id}-${event.kind}`,
        iso3: event.iso3,
        kind: event.kind as UnrestKind,
        at: event.at,
        severity: event.severity,
        article: event.article,
      });
      continue;
    }
    const list = byCountry.get(event.iso3);
    if (list) list.push(event);
    else byCountry.set(event.iso3, [event]);
  }

  const conflicts: ConflictEpisode[] = [];
  for (const [iso3, reports] of byCountry) {
    let run: ExtractedEvent[] = [];

    const flush = () => {
      if (run.length === 0) return;
      const first = run[0];
      const last = run[run.length - 1];
      const ended = now - last.at > EPISODE_GAP_MS;

      conflicts.push({
        id: `${iso3}-conflict-${first.at}`,
        iso3,
        kind: majorityKind(run),
        since: first.at,
        // Ongoing while reports are still arriving. An episode ends a gap after
        // the last one, which is the only honest reading available: a wire that
        // stops does not say a war stopped, and this says exactly that much.
        ...(ended ? { until: last.at + EPISODE_GAP_MS } : {}),
        intensity: intensityOf(run),
        articles: run.map((event) => event.article),
      });
      run = [];
    };

    for (const report of reports) {
      if (run.length > 0 && report.at - run[run.length - 1].at > EPISODE_GAP_MS) flush();
      run.push(report);
    }
    flush();
  }

  return {
    unrest: unrest.sort((a, b) => a.at - b.at),
    conflicts: conflicts.sort((a, b) => a.since - b.since),
  };
}

function majorityKind(run: readonly ExtractedEvent[]): ConflictKind {
  let armed = 0;
  for (const event of run) if (event.kind === 'armed-conflict') armed++;
  return armed * 2 >= run.length ? 'armed-conflict' : 'civil-conflict';
}

/**
 * How intense an episode reads: how consistently it is being reported, tempered
 * by how serious the individual reports are.
 *
 * Reports per week saturates at one a day, which is about as much coverage as a
 * conflict gets before the number stops distinguishing anything.
 */
function intensityOf(run: readonly ExtractedEvent[]): number {
  const span = Math.max(DAY_MS, run[run.length - 1].at - run[0].at);
  const perWeek = (run.length / span) * 7 * DAY_MS;
  const cadence = Math.min(1, perWeek / 7);
  const meanSeverity =
    run.reduce((sum, event) => sum + event.severity, 0) / run.length;
  return round(Math.min(1, cadence * 0.55 + meanSeverity * 0.45), 2);
}

export function generateWorldSnapshot(
  now: number,
  options: WorldOptions = {},
): WorldSnapshot {
  const {
    seed = 0x000_1e5,
    years = 3,
    newsDays = 200,
    news = syntheticNewsSource({ seed }),
  } = options;

  const from = now - years * 365 * DAY_MS;
  const silent = silentCountries({ seed });

  const releases: IndicatorRelease[] = [];
  for (const country of COUNTRIES) {
    releases.push(
      ...releasesFor(country, now, from, seed, silent.has(country.iso3)),
    );
  }
  releases.sort((a, b) => a.releasedAt - b.releasedAt);

  const articles: Article[] = news.articles(now - newsDays * DAY_MS, now);
  const { unrest, conflicts } = sortEvents(extractAll(articles), now);

  return {
    fetchedAt: now,
    countries: [...COUNTRIES],
    releases,
    unrest,
    conflicts,
    provenance: {
      source: `generated indicators; events extracted from ${news.name}`,
      // Never quietly true, and never true while either half is generated.
      live: false,
      note:
        'Countries, ISO codes, UN subregions, UN accession years, land borders and ' +
        'approximate populations are real. Every indicator value, and every unrest ' +
        'and conflict event, is simulated — including which countries are shown as ' +
        'being in conflict, which is decided by a hash rather than by anybody.',
    },
  };
}

/**
 * The generated world, behind the interface a live one implements.
 *
 * A live adapter reads the World Bank's indicator API for releases and a
 * conflict dataset or a news wire for events, fills in the same shapes, and
 * stamps `provenance.live = true`. Nothing in `derive.ts`, `translation/world.ts`,
 * or the scene changes, which is the only claim this source is making.
 */
export function syntheticWorldSource(options: WorldOptions = {}): WorldSource {
  return {
    name: 'synthetic-world',
    snapshot: (now = Date.now()) => generateWorldSnapshot(now, options),
  };
}

function round(value: number, places: number): number {
  const factor = Math.pow(10, places);
  return Math.round(value * factor) / factor;
}
