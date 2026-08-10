import { mulberry32, hashString, type Rng } from '../../lsystem/random';
import { COUNTRIES } from '../world/countries';
import type { Country } from '../world/types';
import type { Article, NewsSource } from './types';

/**
 * A world desk, generated.
 *
 * The proxy in this environment denies `feeds.bbci.co.uk` and
 * `aljazeera.com` alike, which is the same reason the league's season and the
 * market's tape are generated: the seam is the deliverable, and a live adapter
 * is a swap behind it. What matters is that everything above this file — the
 * extractor, the snapshot, the blights, the panel — is the real path, exercised
 * by real code, and does not learn that these articles were invented.
 *
 * ## Two choices that are about honesty rather than fidelity
 *
 * **The outlets are named as simulated, and the links do not resolve.** Putting
 * invented sentences under a masthead that belongs to a real newsroom would
 * attribute writing to people who did not write it, and a detail panel is
 * exactly where somebody would believe it. So the outlet is "Simulated Wire",
 * not "BBC", and every URL is on `.invalid`, a TLD reserved by the IETF
 * precisely so that it can never resolve. A live adapter supplies the real
 * masthead and the real link, and that is the moment those become true.
 *
 * **Which countries are given a conflict is decided by a hash, not by us.** The
 * alternative was to hand-pick, and hand-picking would mean this file taking a
 * position on which real places are at war — in generated data, with no
 * evidence, in a repository anybody can read. A hash has no view. It also
 * scatters conflicts somewhere implausible often enough that nobody could mistake
 * the output for reporting, which is a feature here rather than a defect: the
 * data is meant to be obviously synthetic, and only its *shape* is meant to be
 * realistic.
 *
 * ## Determinism, and why it is per country-day
 *
 * The generator is seeded per `(country, day)` rather than walked forward from
 * a start point, so `articles(a, b)` depends only on the window it is asked
 * about. Widening the window returns a superset and never a different world.
 * That is the same property `tape.ts` needed its anchor for, arrived at by
 * construction instead: this source can be re-asked, which is what lets the
 * world garden poll.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Named so nobody can mistake the copy below for somebody's journalism. */
const OUTLETS = ['Simulated Wire', 'Simulated World Desk', 'Simulated Regional Service'];

export interface FeedOptions {
  seed?: number;
  /** Roughly how many countries carry an ongoing conflict. */
  conflictCount?: number;
  /** Roughly how many countries report nothing at all. */
  silentCount?: number;
}

type Flavour = 'armed' | 'civil' | 'riot' | 'protest' | 'strike';

/**
 * Headline shapes, by flavour.
 *
 * Written to carry the vocabulary `extract.ts` classifies on, because a feed
 * whose copy the extractor cannot read would test nothing. They are deliberately
 * plain: the point is the shape of the pipeline, and florid invented copy about
 * real places would be worse the better it got.
 *
 * A template may name its country and no other. A second country name would
 * make the headline ambiguous, and the extractor would correctly refuse it —
 * which would be a fine test and a useless feed.
 */
const TEMPLATES: Record<Flavour, ReadonlyArray<(name: string) => [string, string]>> = {
  armed: [
    (n) => [`Air strikes reported in ${n}`, 'Residents describe a second night of bombardment in the north.'],
    (n) => [`Shelling continues along ${n}'s northern frontier`, 'Artillery exchanges were reported through the afternoon.'],
    (n) => [`Ceasefire talks stall as fighting resumes in ${n}`, 'Mediators say the two sides remain far apart.'],
    (n) => [`Military operation widens in ${n}`, 'Aid agencies warn access is now severely restricted.'],
  ],
  civil: [
    (n) => [`Rebels seize district in eastern ${n}`, 'Government forces are said to have withdrawn overnight.'],
    (n) => [`Insurgency spreads across northern ${n}`, 'Several villages have been abandoned in recent weeks.'],
    (n) => [`Junta in ${n} announces emergency measures`, 'A curfew has been extended for a further thirty days.'],
    (n) => [`Militia checkpoints multiply in ${n}`, 'Movement between provinces has become difficult.'],
  ],
  riot: [
    (n) => [`Rioting breaks out in ${n} after fuel price rise`, 'Shops were set alight in the commercial district.'],
    (n) => [`Looting reported across ${n} as curfew is imposed`, 'Police say order was restored by early morning.'],
    (n) => [`Unrest continues for a third day in ${n}`, 'Authorities have suspended public transport.'],
  ],
  protest: [
    (n) => [`Thousands join protests across ${n}`, 'Organisers say further marches are planned for the weekend.'],
    (n) => [`Demonstrators gather in ${n} over election result`, 'The electoral commission has promised a recount.'],
    (n) => [`Protests over water shortages continue in ${n}`, 'Supplies have been rationed for a month.'],
  ],
  strike: [
    (n) => [`General strike halts transport in ${n}`, 'Unions are demanding an inflation-linked pay settlement.'],
    (n) => [`Walkout by health workers enters second day in ${n}`, 'Emergency cover is being maintained at major hospitals.'],
    (n) => [`Strike action closes ports in ${n}`, 'Employers say talks will resume on Monday.'],
  ],
};

/** The quiet flavours, for a country with nothing worse going on. */
const CALM: readonly Flavour[] = ['protest', 'strike', 'riot'];

/**
 * How much a country is written about, from its size.
 *
 * A stand-in for the fact that coverage is wildly uneven, and the least
 * editorial one available: it says nothing about any country except how many
 * people live there. Ranges from roughly one article a fortnight for the
 * smallest states to one most days for the largest.
 */
function coverageRate(country: Country): number {
  return Math.min(0.28, 0.02 + Math.log10(country.populationM + 1) * 0.062);
}

/** The countries a given seed puts a conflict in, and the ones it silences. */
function pick(seed: number, salt: string, count: number): Set<string> {
  const scored = COUNTRIES.map((country) => ({
    iso3: country.iso3,
    score: mulberry32(seed ^ hashString(`${salt}:${country.iso3}`))(),
  })).sort((a, b) => a.score - b.score);
  return new Set(scored.slice(0, count).map((entry) => entry.iso3));
}

const DEFAULTS = { seed: 0x7e5701, conflictCount: 9, silentCount: 7 } as const;

/**
 * The countries this feed never reports on.
 *
 * Exported because the world adapter needs the *same* set: a country nothing is
 * written about but which still publishes quarterly statistics is not silent,
 * and would never reach the staleness state. Silence has to be one fact about
 * the generated world rather than two coincidences, so both halves ask here.
 */
export function silentCountries(options: FeedOptions = {}): Set<string> {
  const { seed = DEFAULTS.seed, silentCount = DEFAULTS.silentCount } = options;
  return pick(seed, 'silent', silentCount);
}

/** The countries this feed gives an ongoing conflict. Chosen by hash; see above. */
export function conflictCountries(options: FeedOptions = {}): Set<string> {
  const { seed = DEFAULTS.seed, conflictCount = DEFAULTS.conflictCount } = options;
  return pick(seed, 'conflict', conflictCount);
}

export function generateArticles(
  since: number,
  until: number,
  options: FeedOptions = {},
): Article[] {
  const { seed = DEFAULTS.seed } = options;
  if (!(until > since)) return [];

  const atWar = conflictCountries(options);
  const silent = silentCountries(options);

  const firstDay = Math.floor(since / DAY_MS);
  const lastDay = Math.floor(until / DAY_MS);
  const out: Article[] = [];

  for (const country of COUNTRIES) {
    if (silent.has(country.iso3)) continue;

    const rate = coverageRate(country);
    const fighting = atWar.has(country.iso3);

    for (let day = firstDay; day <= lastDay; day++) {
      const rng = mulberry32(seed ^ hashString(`${country.iso3}:${day}`));

      // A country at war is written about most days; everywhere else is
      // written about at its own rate.
      const chance = fighting ? Math.max(rate, 0.55) : rate;
      if (rng() > chance) continue;

      const flavour = fighting
        ? rng() < 0.72
          ? rng() < 0.5
            ? 'armed'
            : 'civil'
          : choose(CALM, rng)
        : choose(CALM, rng);

      const templates = TEMPLATES[flavour];
      const [title, summary] = templates[Math.floor(rng() * templates.length)](country.name);

      // Somewhere inside the day, so ordering within a day is stable but not
      // all-at-midnight.
      const at = day * DAY_MS + Math.floor(rng() * DAY_MS);
      if (at < since || at > until) continue;

      out.push({
        id: `sim-${country.iso3}-${day}`,
        outlet: OUTLETS[Math.floor(rng() * OUTLETS.length)],
        title,
        summary,
        url: `https://simulated.invalid/${country.iso3.toLowerCase()}/${day}`,
        publishedAt: at,
      });
    }
  }

  return out.sort((a, b) => a.publishedAt - b.publishedAt);
}

function choose<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
}

/**
 * The generated feed, behind the interface a live one implements.
 *
 * `live` is false and stays false. The one thing a synthetic source must never
 * do is claim otherwise, because everything downstream — the provenance line in
 * the panel, the simulated marker on every blight — is derived from this flag
 * rather than from a separate assertion somebody could forget to update.
 */
export function syntheticNewsSource(options: FeedOptions = {}): NewsSource {
  return {
    name: 'synthetic-news',
    live: false,
    articles: (since, until = Date.now()) => generateArticles(since, until, options),
  };
}
