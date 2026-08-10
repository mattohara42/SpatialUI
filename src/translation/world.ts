import {
  BORDERS,
  COUNTRIES,
  SUBREGIONS,
  SUBREGION_ORDER,
  activeConflictsAt,
  indicatorAt,
  latestRelease,
  lastHeardFrom,
  previousVintage,
  recordFor,
  recordsByCountry,
  releasesThrough,
  unrestRateAt,
  unrestThrough,
  type ConflictEpisode,
  type Country,
  type CountryRecord,
  type SubregionKey,
  type WorldSnapshot,
} from '../adapters/world';
import type { Article } from '../adapters/news/types';
import {
  DAY_MS as HISTORY_DAY_MS,
  DEFAULT_ARCHIVE_CAPACITY,
  HOUR_MS,
  createHistory,
  record as recordVitals,
  type VitalsHistory,
} from '../ecosystem/history';
import { inkFor, type Emblem } from '../ecosystem/labels';
import type { PlantingType } from '../ecosystem/planting';
import type { StaleSchedule } from '../ecosystem/staleness';
import type {
  Blight,
  BlightSeverity,
  EcosystemEdge,
  EcosystemNode,
  Vitals,
} from '../ecosystem/types';

/**
 * The world as a garden.
 *
 * The third real source, and it was built because the first two had started to
 * agree with each other. Both are thirty-two things in eight even beds, both
 * take numbers off a feed that publishes on a clock, and between them they had
 * stopped testing the model. This one disagrees in four ways, and each one cost
 * something:
 *
 * **1. The beds are not the same size.** Twenty-two UN subregions holding
 * between two and eighteen countries. Nothing in the layout had ever been asked
 * what happens when one bed holds nine times what its neighbour does, and the
 * answer was that the two-row wrap which serves eight beds beautifully turns
 * twenty-two into a strip nobody can walk. See `layoutGarden`.
 *
 * **2. The numbers are revised.** This is the first source where a figure about
 * a period that has already ended can *change*, and it forced the distinction
 * the whole adapter is built on: a plant reads the figure that was **known** at
 * the cursor, not the figure now thought to be true. Scrub back past a release
 * and a country steps to its previous vintage. That is what makes the scrub
 * mean something in a garden whose underlying quantities move once a quarter.
 *
 * **3. A headline is not a record.** Both other adapters are handed structure by
 * their feeds. This one is handed sentences, and the layer that turns one into
 * the other (`adapters/news/extract.ts`) is the first place in the project where
 * the app forms a *judgment* about its input rather than a calculation. That is
 * why every event carries the article it came from, and why every blight built
 * from one says out loud that it was derived rather than measured.
 *
 * **4. Growth is not health, and neither is size.**
 *
 * The axes:
 *
 * | axis | world | why |
 * | --- | --- | --- |
 * | vitality | growth and life expectancy, as last published | two things that are unambiguously better up |
 * | activity | reported unrest, and whether anything was published lately | how much is going on here |
 * | maturity | years in the UN, population weight, and an ageing population | how big and long-established — never how well |
 * | trend | the newest figure against the one it replaced | a country whose growth was just revised up is not one still falling |
 *
 * **What conflict is not.** Conflict does not enter vitality. It was the
 * obvious thing to do — a country at war visibly wilting reads powerfully at a
 * glance — and it is the one thing this source must not do, because a vitality
 * score is a comparison and the app would then be ranking countries by war. So
 * conflict is a **blight**: named, dated, sourced, and attached to a plant that
 * is otherwise reporting whatever it is reporting. The garden shows that
 * something is wrong there without claiming to know how wrong.
 *
 * **What birth rate is not.** A high birth rate is a young population, not a
 * sick one, so it feeds maturity and never vitality. Putting it in health would
 * be the app asserting something the data cannot support — the same trap as
 * treating an old company as a healthy one, which is the rule the league wrote
 * and the book restated.
 */

export const WORLD_GARDEN_ID = 'world';

/**
 * How long a country may say nothing before the garden calls it silent.
 *
 * `dueAfter` is flat rather than calendar-driven, and the reason is worth
 * stating because the market next door does it the other way. An exchange
 * publishes a calendar: it can say exactly when the next bar closes, so
 * staleness there asks a sharp question and gets a sharp answer. There is no
 * equivalent here. A country is heard from when it publishes a figure *or* when
 * something happens that gets reported, and nothing can say in advance when the
 * second of those will be. So the honest schedule is a duration, and the
 * duration has to clear the slowest legitimate rhythm: quarterly growth plus
 * three annual series is roughly a release a month, and a country nobody writes
 * about has nothing else to offer.
 *
 * Sized from that, and deliberately generous. The failure this state exists to
 * prevent is silence reading as health; the failure it must not commit is
 * greying half the Pacific because small countries are covered less. Both are
 * real, and the second one is what makes the state get ignored.
 */
const REPORTING_INTERVAL_MS = 45 * HISTORY_DAY_MS;
const REPORTING_GRACE_MS = 21 * HISTORY_DAY_MS;

export const WORLD_STALE_SCHEDULE: StaleSchedule = {
  dueAfter: (lastUpdate) => lastUpdate + REPORTING_INTERVAL_MS,
  graceMs: REPORTING_GRACE_MS,
};

/** The window trailing activity is measured over. */
const ACTIVITY_WINDOW_MS = 30 * HISTORY_DAY_MS;

/** Hours of hourly history backfilled per country. A week, as elsewhere. */
const DEFAULT_HISTORY_HOURS = 168;

/**
 * A planting per subregion, assigned on botanical grounds.
 *
 * This is the one place where the rule that a planting is signal-free needed
 * more than restating. A planting is a container property everywhere else in the
 * project and it costs nothing, because a sector or a division has no character
 * for it to comment on. A world region does. Handing Sub-Saharan Africa a
 * thicket because a bed looked bare would read as an opinion about the place,
 * and nobody would be able to point at the line where the opinion was formed.
 *
 * Grounding the assignment in what actually grows there removes the judgment
 * entirely: date palms in Northern Africa, vines around the Mediterranean,
 * conifers in the north, savanna where there is savanna. It is descriptive of
 * the ground rather than evaluative of the country, which is what a container
 * property has to be to stay out of the reading budget.
 *
 * `thicket` appears nowhere here. It is the invasive planting, it renders as
 * weeds, and weeds mean suppress polarity — a meaning no country should carry.
 *
 * One assignment is a compromise and is marked as such. Southern Europe is
 * vine country and was given the vineyard first; a vineyard lays out as a
 * single row of any length, which is right for the four holdings in a market
 * sector and turns fourteen countries into a twenty-metre wall. It takes the
 * orchard instead — olives, citrus, and figs, so the ground is still described
 * truthfully — and the vineyard goes to Australia and New Zealand, which is
 * both apt and two plants wide.
 */
const SUBREGION_PLANTINGS: Record<SubregionKey, PlantingType> = {
  'northern-america': 'conifer-stand',
  'central-america': 'vegetable-rows',
  caribbean: 'palm-grove',
  'south-america': 'grove',
  'northern-europe': 'conifer-stand',
  'western-europe': 'hedge',
  'southern-europe': 'orchard',
  'eastern-europe': 'orchard',
  'northern-africa': 'palm-grove',
  'western-africa': 'savanna',
  'middle-africa': 'grove',
  'eastern-africa': 'savanna',
  'southern-africa': 'wildflower-meadow',
  'western-asia': 'orchard',
  'central-asia': 'wildflower-meadow',
  'southern-asia': 'vegetable-rows',
  'eastern-asia': 'topiary',
  'south-eastern-asia': 'palm-grove',
  'australia-new-zealand': 'vineyard',
  melanesia: 'palm-grove',
  micronesia: 'palm-grove',
  polynesia: 'flower-border',
};

/**
 * Bed ids carry their position in the world, west to east.
 *
 * The layout sorts beds by id, so the prefix is what keeps the Americas at one
 * end of the house and the Pacific at the other rather than leaving it to the
 * alphabet. Same device as the league's conference prefix and the book's sector
 * index, and the third source to need it — which is a reasonably strong hint
 * that the model is missing a container level rather than that three
 * translators independently wanted the same trick.
 */
export function bedIdFor(subregion: SubregionKey): string {
  const index = SUBREGION_ORDER.indexOf(subregion);
  return `wld-${String(index + 1).padStart(2, '0')}-${subregion}`;
}

export function countryNodeId(iso3: string): string {
  return `wld-${iso3}`;
}

export interface WorldTranslationOptions {
  asOf?: number;
  historyHours?: number;
}

export interface TranslatedWorld {
  nodes: Record<string, EcosystemNode>;
  edges: Record<string, EcosystemEdge>;
  history: Record<string, VitalsHistory>;
  archive: Record<string, VitalsHistory>;
}

/** Everything the world says about one country at one moment. */
export interface CountryReading {
  vitals: Vitals;
  growth: number | null;
  growthPeriod: string | null;
  growthPublishedAt: number | null;
  previousGrowth: number | null;
  lifeExpectancy: number | null;
  birthRate: number | null;
  population: number | null;
  unrest: number;
  conflicts: ConflictEpisode[];
  heardFrom: number | null;
}

export function translateWorldSnapshot(
  snapshot: WorldSnapshot,
  options: WorldTranslationOptions = {},
): TranslatedWorld {
  const { asOf = snapshot.fetchedAt, historyHours = DEFAULT_HISTORY_HOURS } = options;

  const records = recordsByCountry(snapshot);

  const nodes: Record<string, EcosystemNode> = {};
  const edges: Record<string, EcosystemEdge> = {};
  const history: Record<string, VitalsHistory> = {};
  const archive: Record<string, VitalsHistory> = {};

  nodes[WORLD_GARDEN_ID] = {
    id: WORLD_GARDEN_ID,
    parentId: null,
    gardenId: WORLD_GARDEN_ID,
    label: 'World',
    domain: 'geopolitics',
    kind: 'garden',
    polarity: 'nurture',
    vitality: 1,
    activity: 0.5,
    maturity: 1,
    trend: 0,
    blights: [],
    updatedAt: asOf,
    raw: {
      source: 'world',
      countries: snapshot.countries.length,
      releases: snapshot.releases.length,
      fetchedAt: snapshot.fetchedAt,
      provenance: snapshot.provenance,
    },
  };

  for (const subregion of SUBREGION_ORDER) {
    const members = COUNTRIES.filter((c) => c.subregion === subregion);
    if (members.length === 0) continue;

    const bedId = bedIdFor(subregion);
    nodes[bedId] = {
      id: bedId,
      parentId: WORLD_GARDEN_ID,
      gardenId: WORLD_GARDEN_ID,
      label: SUBREGIONS[subregion].label,
      domain: 'geopolitics',
      kind: 'bed',
      polarity: 'nurture',
      plantingType: SUBREGION_PLANTINGS[subregion],
      vitality: 0.5,
      activity: 0.5,
      maturity: 0.5,
      trend: 0,
      blights: [],
      updatedAt: asOf,
    };

    for (const country of members) {
      const record = recordFor(records, country.iso3);
      const reading = readCountry(country, record, asOf);
      const id = countryNodeId(country.iso3);

      nodes[id] = {
        id,
        parentId: bedId,
        gardenId: WORLD_GARDEN_ID,
        label: country.name,
        emblem: emblemFor(country),
        domain: 'geopolitics',
        kind: 'plant',
        // Always nurture. A country is not a thing you want less of, and the
        // trouble inside one is a blight rather than a change of archetype.
        polarity: 'nurture',
        ...reading.vitals,
        blights: blightsFor(country, reading, asOf, !snapshot.provenance.live),
        // The last time this country was heard from at all — a figure it
        // published or something reported about it. A country that stops doing
        // both has its last word recede on its own; nothing edits this.
        updatedAt: reading.heardFrom ?? snapshot.fetchedAt,
        raw: rawFor(country, reading, snapshot),
      };

      history[id] = backfill(country, record, asOf, HOUR_MS, historyHours);
      archive[id] = backfill(
        country,
        record,
        asOf,
        HISTORY_DAY_MS,
        DEFAULT_ARCHIVE_CAPACITY,
      );
    }
  }

  // Land borders, drawn as root grafts. `links` rather than `depends`: two
  // neighbours are not each other's dependency, they are simply adjacent, and
  // this is the first graft layer in the project describing something that is
  // true whether or not anybody is publishing data about it.
  for (const border of BORDERS) {
    const id = `${border.a}~${border.b}`;
    edges[id] = {
      id,
      gardenId: WORLD_GARDEN_ID,
      sourceId: countryNodeId(border.a),
      targetId: countryNodeId(border.b),
      kind: 'links',
      // Uniform, and that is the honest answer. Edge strength is a channel and
      // this source has nothing to spend it on: a border is a border, and
      // ranking them by trade or by size would be inventing a quantity to fill
      // a slot that was offered.
      strength: 0.45,
      directed: false,
    };
  }

  return { nodes, edges, history, archive };
}

/**
 * The mark on the tag.
 *
 * ISO alpha-3 is the one identifier in this project that fits the roundel
 * exactly — three characters, no truncation, already the standard way to write
 * a country short. The book's tickers lose their fourth letter and the label
 * beside them carries the name; here the mark is complete on its own.
 */
function emblemFor(country: Country): Emblem {
  return {
    mark: country.iso3,
    color: country.primary,
    ink: inkFor(country.primary),
  };
}

/** Everything about one country at one moment, from what had been published. */
export function readCountry(
  country: Country,
  record: CountryRecord,
  asOf: number,
): CountryReading {
  const growthRelease = latestRelease(record.releases, 'gdp-growth', asOf);
  const previous = previousVintage(record.releases, 'gdp-growth', asOf);
  const lifeExpectancy = indicatorAt(record.releases, 'life-expectancy', asOf);
  const birthRate = indicatorAt(record.releases, 'birth-rate', asOf);
  const population = indicatorAt(record.releases, 'population', asOf);
  const unrest = unrestRateAt(record.unrest, asOf, ACTIVITY_WINDOW_MS);
  const conflicts = activeConflictsAt(record.conflicts, asOf);
  const heardFrom = lastHeardFrom(record, asOf);

  const growth = growthRelease?.value ?? null;

  return {
    vitals: {
      vitality: vitalityOf(growth, lifeExpectancy),
      activity: activityOf(unrest, heardFrom, asOf),
      maturity: maturityOf(country, birthRate, population, asOf),
      trend: trendOf(growth, previous?.value ?? null),
    },
    growth,
    growthPeriod: growthRelease?.period ?? null,
    growthPublishedAt: growthRelease?.releasedAt ?? null,
    previousGrowth: previous?.value ?? null,
    lifeExpectancy,
    birthRate,
    population,
    unrest,
    conflicts,
    heardFrom,
  };
}

/**
 * Growth and life expectancy, as last published.
 *
 * The endpoints are the worst and best case that can really occur, not the
 * range of the inputs — the clause the league wrote into the adapter contract.
 * A deep recession is about eight percent and a boom about the same the other
 * way, so growth saturates there rather than at whatever the widest number in
 * the table happens to be. Life expectancy runs from the low fifties to the
 * mid eighties across the world today, and that is the scale it is read on.
 *
 * The weighting is argued rather than measured, and is stated here so somebody
 * can disagree with it out loud: growth carries slightly more because it is the
 * axis that *moves* — life expectancy shifts by tenths of a year and would make
 * a nearly static plant of every country if it led.
 *
 * A country that has published neither is not scored at all. Half the pair is
 * read on its own rather than filled in with a midpoint, because a midpoint is
 * a number nobody published and this garden's whole discipline is not writing
 * those down.
 */
const GROWTH_FLOOR = -8;
const GROWTH_CEILING = 8;
const LIFE_FLOOR = 50;
const LIFE_CEILING = 85;

export function vitalityOf(
  growth: number | null,
  lifeExpectancy: number | null,
): number {
  const growthScore =
    growth === null
      ? null
      : clamp01((growth - GROWTH_FLOOR) / (GROWTH_CEILING - GROWTH_FLOOR));
  const lifeScore =
    lifeExpectancy === null
      ? null
      : clamp01((lifeExpectancy - LIFE_FLOOR) / (LIFE_CEILING - LIFE_FLOOR));

  if (growthScore === null && lifeScore === null) return 0.5;
  if (growthScore === null) return lifeScore!;
  if (lifeScore === null) return growthScore;
  return clamp01(growthScore * 0.55 + lifeScore * 0.45);
}

/**
 * How much is going on: reported unrest, and whether anybody has published
 * anything lately.
 *
 * Unrest saturates rather than scaling, because the difference between a quiet
 * month and a busy one is worth a lot of the axis and the difference between a
 * busy month and a chaotic one is worth very little — both read as "a great
 * deal is happening here".
 *
 * The publication term is small and exists for one reason: a calm country that
 * reports on time should not be indistinguishable from one nobody has heard
 * from. Staleness carries the second case properly, but activity drives the
 * *motion* of a plant, and a well-run quiet country standing perfectly still
 * would read as the thing it is precisely not.
 */
export function activityOf(
  unrest: number,
  heardFrom: number | null,
  asOf: number,
): number {
  const unrestTerm = 1 - Math.exp(-unrest / 1.5);
  const recency =
    heardFrom === null
      ? 0
      : Math.exp(-Math.max(0, asOf - heardFrom) / (60 * HISTORY_DAY_MS));
  return clamp01(0.06 + 0.78 * unrestTerm + 0.16 * recency);
}

/**
 * How big and how long-established. Never how well.
 *
 * Three terms, and the middle one is the answer to a question this source
 * raised that neither other one did: a country is a thing with a *size*, and
 * the eye expects a big country to be a big plant. Maturity is where that
 * belongs, because maturity already owns structural size in the channel budget
 * — it drives trunk thickness and iteration count — and giving size its own
 * channel would mean taking one from a signal that has no other way to be seen.
 *
 * The trade is stated in `DESIGN.md`: size and age are one fact here rather
 * than two, and the load-bearing consequence is that **a small country must be
 * able to be the healthiest plant in its bed**. Nothing in this function
 * touches vitality, and nothing in `vitalityOf` touches population.
 *
 * Years are counted from UN accession, which is the uniform dated fact in the
 * table — see `Country.unMemberSince` for why not independence. Eighty years is
 * full marks because that is the age of the institution: a founding member is
 * as established as this measure can see.
 *
 * The birth-rate term is the one that is easy to misread. A high birth rate
 * makes a *young* country in the demographic sense, and that is all it does
 * here. It is not a health term and it is not a judgment; it is the reason a
 * populous young state and a populous old one do not grow the identical tree.
 */
export function maturityOf(
  country: Country,
  birthRate: number | null,
  population: number | null,
  asOf: number,
): number {
  const years = new Date(asOf).getUTCFullYear() - country.unMemberSince;
  const age = clamp01(years / 80);

  const people = population ?? country.populationM;
  const size = clamp01(Math.log10(people + 1) / 3.2);

  // No published birth rate means no demographic term rather than a guessed
  // one; the other two carry it.
  const youth = birthRate === null ? null : clamp01((40 - birthRate) / 34);

  if (youth === null) return clamp01(age * 0.53 + size * 0.47);
  return clamp01(age * 0.4 + size * 0.35 + youth * 0.25);
}

/**
 * The newest figure against the one it replaced.
 *
 * This is the axis the release calendar pays for. It moves on a publication
 * date and is flat between them, which is exactly right: a country's growth
 * does not improve on a Tuesday because a Tuesday happened, it improves when
 * somebody publishes a better number.
 *
 * **One percentage point saturates it, and that was measured rather than
 * guessed.** The first attempt used two and a half, reasoning from how far
 * growth can swing in a year; against the actual distribution that put nine
 * tenths of the world between -0.15 and +0.14 and left the fresh-growth channel
 * doing nothing at all. Successive figures move by about four tenths of a point
 * typically and rarely by more than one, so a point is where the axis has to
 * end for the middle of it to mean anything. Same fault, and the same fix, as
 * the market's drawdown deadband: a scale argued from the domain rather than
 * read off the data is usually too wide.
 */
const TREND_SATURATION_PP = 1;

export function trendOf(growth: number | null, previous: number | null): number {
  if (growth === null || previous === null) return 0;
  return Math.max(-1, Math.min(1, (growth - previous) / TREND_SATURATION_PP));
}

/**
 * What is wrong here.
 *
 * Three kinds, and all three say where they came from. **Conflict** is the
 * reason this source keeps its provenance rule: an episode is built from
 * reports, not from a measurement, and a panel that showed "armed conflict,
 * intensity 0.71" without the sentences behind it would be presenting a
 * judgment in the costume of a reading. **Unrest** is the same at lower stakes.
 * **Silence** is the one only this source could produce — in a garden fed partly
 * by news, a country nobody has written about and which has published nothing
 * is in a real state, and it deserves to be named rather than left to the dust
 * to imply.
 *
 * Every message carries the simulated marker while the data is generated. It is
 * derived from the snapshot's own provenance rather than hard-coded, so a live
 * adapter drops the marker by being live and nobody has to remember to remove
 * it.
 */
export function blightsFor(
  country: Country,
  reading: CountryReading,
  asOf: number,
  simulated = true,
): Blight[] {
  const blights: Blight[] = [];
  const mark = simulated ? ' (simulated)' : '';

  for (const episode of reading.conflicts) {
    const severity: BlightSeverity =
      episode.intensity >= 0.75 ? 'critical' : episode.intensity >= 0.55 ? 'error' : 'warn';
    const kind = episode.kind === 'armed-conflict' ? 'Armed conflict' : 'Civil conflict';
    blights.push({
      id: `${country.iso3}-${episode.id}`,
      severity,
      message: `${kind} reported in ${episode.articles.length} dispatches${mark}`,
      since: episode.since,
    });
  }

  if (reading.unrest >= 1.2) {
    blights.push({
      id: `${country.iso3}-unrest`,
      severity: reading.unrest >= 2.4 ? 'error' : 'warn',
      message: `Civil unrest reported through the last month${mark}`,
      since: asOf - ACTIVITY_WINDOW_MS,
    });
  }

  if (reading.heardFrom === null) {
    blights.push({
      id: `${country.iso3}-unheard`,
      severity: 'warn',
      message: `Nothing published and nothing reported${mark}`,
      since: asOf,
    });
  } else if (asOf - reading.heardFrom > REPORTING_INTERVAL_MS) {
    blights.push({
      id: `${country.iso3}-quiet`,
      severity: 'info',
      message: `No figures and no reports for ${Math.round(
        (asOf - reading.heardFrom) / HISTORY_DAY_MS,
      )} days${mark}`,
      since: reading.heardFrom,
    });
  }

  return blights;
}

/**
 * The payload the panel renders and the renderer never reads.
 *
 * `growthPeriod` and `growthPublishedAt` sit next to the value on purpose. They
 * are what turn a number into a fact somebody could check: 2.1% is not a
 * property of a country, it is what was said about a particular quarter on a
 * particular day, and this garden is the first one where the difference is
 * visible to the naked eye.
 *
 * `reports` is the provenance rule reaching the surface. Every derived blight
 * on this plant traces back to sentences somebody wrote, and they are here so
 * the panel answers "why is this plant blighted" with the dispatch rather than
 * with a severity level.
 */
function rawFor(
  country: Country,
  reading: CountryReading,
  snapshot: WorldSnapshot,
): unknown {
  const reports = reading.conflicts.flatMap((episode) => episode.articles);

  return {
    iso3: country.iso3,
    name: country.name,
    subregion: SUBREGIONS[country.subregion].label,
    unMemberSince: country.unMemberSince,
    gdpGrowthPct: reading.growth,
    gdpPeriod: reading.growthPeriod,
    gdpPublished: reading.growthPublishedAt,
    gdpPreviousPct: reading.previousGrowth,
    lifeExpectancy: reading.lifeExpectancy,
    birthRatePer1000: reading.birthRate,
    populationM: reading.population,
    unrestLast30Days: round2(reading.unrest),
    activeConflicts: reading.conflicts.length,
    lastHeardFrom: reading.heardFrom,
    reports: reports.slice(-6).map(describe),
    provenance: snapshot.provenance,
  };
}

/** A dispatch, as one line a person can read. */
function describe(article: Article): string {
  const when = new Date(article.publishedAt).toISOString().slice(0, 10);
  return `${article.title} — ${article.outlet}, ${when}`;
}

/**
 * Vitals over a walk backwards, at whatever grain is asked for.
 *
 * The same shape and the same memo as the market's, keyed on how many releases
 * had been published and how many events reported. What differs is how much it
 * earns: a price moves every bar and a country's figures move a dozen times a
 * year, so the key is unchanged across long stretches and the walk collapses
 * almost entirely. This is the cheapest backfill of the three sources by a wide
 * margin, and it is cheap for the same reason the garden needed the vintage
 * rule in the first place — the underlying quantities almost never move.
 *
 * Slots before the country's first publication are left unwritten rather than
 * filled. A country that had published nothing in March has no vitality in
 * March, and a plausible number in that slot would be indistinguishable from a
 * recorded one.
 */
function backfill(
  country: Country,
  record: CountryRecord,
  asOf: number,
  stepMs: number,
  steps: number,
): VitalsHistory {
  const buffer = createHistory(stepMs, Math.max(1, steps));

  const first = record.releases[0]?.releasedAt;
  const firstEvent = record.unrest[0]?.at;
  const start = Math.min(first ?? Infinity, firstEvent ?? Infinity);
  if (!Number.isFinite(start)) return buffer;

  const cache = new Map<string, Vitals>();

  for (let i = steps - 1; i >= 0; i--) {
    const at = asOf - i * stepMs;
    if (at < start) continue;

    const key = `${releasesThrough(record.releases, at)}:${unrestThrough(record.unrest, at)}`;
    let vitals = cache.get(key);
    if (!vitals) {
      vitals = readCountry(country, record, at).vitals;
      cache.set(key, vitals);
    }
    recordVitals(buffer, at, vitals);
  }

  return buffer;
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
