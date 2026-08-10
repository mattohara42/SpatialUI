import { describe, expect, it } from 'vitest';
import {
  activeConflictsAt,
  indicatorAt,
  lastHeardFrom,
  latestRelease,
  previousVintage,
  recordFor,
  recordsByCountry,
  releasesThrough,
  unrestRateAt,
} from './derive';
import { generateWorldSnapshot } from './world';
import type { Article } from '../news/types';
import type { ConflictEpisode, IndicatorRelease, UnrestEvent } from './types';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 6, 1);

function article(id: string, at: number): Article {
  return {
    id,
    outlet: 'Simulated Wire',
    title: 't',
    summary: '',
    url: 'https://simulated.invalid/x',
    publishedAt: at,
  };
}

/**
 * Q1 published on 15 May at 2.1%, then revised on 14 June to 1.4%. The whole
 * point of the vintage rule in four lines.
 */
const RELEASES: IndicatorRelease[] = [
  { iso3: 'TST', indicator: 'gdp-growth', period: '2026-Q1', value: 2.1, releasedAt: Date.UTC(2026, 4, 15) },
  { iso3: 'TST', indicator: 'gdp-growth', period: '2026-Q1', value: 1.4, releasedAt: Date.UTC(2026, 5, 14) },
  { iso3: 'TST', indicator: 'life-expectancy', period: '2025', value: 71.2, releasedAt: Date.UTC(2026, 5, 30) },
];

describe('the vintage rule', () => {
  it('returns nothing before the first publication', () => {
    expect(latestRelease(RELEASES, 'gdp-growth', Date.UTC(2026, 4, 14))).toBeNull();
    expect(indicatorAt(RELEASES, 'gdp-growth', Date.UTC(2026, 4, 14))).toBeNull();
  });

  it('returns what was known at the time, not what was later true', () => {
    // On 20 May the only figure anybody had for Q1 was 2.1%. The revision has
    // not happened yet and must not leak backwards.
    expect(indicatorAt(RELEASES, 'gdp-growth', Date.UTC(2026, 4, 20))).toBe(2.1);
    // After the revision, the same quarter reads differently.
    expect(indicatorAt(RELEASES, 'gdp-growth', Date.UTC(2026, 5, 20))).toBe(1.4);
  });

  it('is inclusive of the moment of publication', () => {
    expect(indicatorAt(RELEASES, 'gdp-growth', Date.UTC(2026, 4, 15))).toBe(2.1);
  });

  it('keeps indicators apart', () => {
    expect(indicatorAt(RELEASES, 'life-expectancy', Date.UTC(2026, 5, 20))).toBeNull();
    expect(indicatorAt(RELEASES, 'life-expectancy', NOW)).toBe(71.2);
  });

  it('reports the figure the current one replaced', () => {
    expect(previousVintage(RELEASES, 'gdp-growth', Date.UTC(2026, 5, 20))?.value).toBe(2.1);
    // Only one figure published: nothing was replaced.
    expect(previousVintage(RELEASES, 'gdp-growth', Date.UTC(2026, 4, 20))).toBeNull();
  });

  it('counts releases through a moment, for the backfill memo', () => {
    expect(releasesThrough(RELEASES, Date.UTC(2026, 4, 14))).toBe(0);
    expect(releasesThrough(RELEASES, Date.UTC(2026, 4, 15))).toBe(1);
    expect(releasesThrough(RELEASES, NOW)).toBe(3);
  });
});

describe('events as of a moment', () => {
  const unrest: UnrestEvent[] = [
    { id: 'a', iso3: 'TST', kind: 'protest', at: NOW - 60 * DAY, severity: 0.3, article: article('a', NOW - 60 * DAY) },
    { id: 'b', iso3: 'TST', kind: 'riot', at: NOW - 10 * DAY, severity: 0.5, article: article('b', NOW - 10 * DAY) },
    { id: 'c', iso3: 'TST', kind: 'riot', at: NOW - 2 * DAY, severity: 0.7, article: article('c', NOW - 2 * DAY) },
  ];

  it('weights the trailing window by how serious the reports read', () => {
    expect(unrestRateAt(unrest, NOW, 30 * DAY)).toBeCloseTo(1.2, 5);
    // The old protest is outside the window.
    expect(unrestRateAt(unrest, NOW, 5 * DAY)).toBeCloseTo(0.7, 5);
  });

  it('never counts an event that had not happened yet', () => {
    // Asked about a moment before anything was reported, the window is empty
    // however wide it is.
    expect(unrestRateAt(unrest, NOW - 61 * DAY, 365 * DAY)).toBe(0);
    // Asked about a moment between the protest and the riots, only the protest
    // exists to be counted.
    expect(unrestRateAt(unrest, NOW - 30 * DAY, 365 * DAY)).toBeCloseTo(0.3, 5);
  });

  it('drops a conflict once it has ended', () => {
    const conflicts: ConflictEpisode[] = [
      { id: 'x', iso3: 'TST', kind: 'armed-conflict', since: NOW - 90 * DAY, until: NOW - 30 * DAY, intensity: 0.6, articles: [] },
      { id: 'y', iso3: 'TST', kind: 'civil-conflict', since: NOW - 20 * DAY, intensity: 0.4, articles: [] },
    ];
    expect(activeConflictsAt(conflicts, NOW - 60 * DAY).map((c) => c.id)).toEqual(['x']);
    expect(activeConflictsAt(conflicts, NOW).map((c) => c.id)).toEqual(['y']);
    expect(activeConflictsAt(conflicts, NOW - 200 * DAY)).toEqual([]);
  });
});

describe('being heard from', () => {
  it('counts a news report, not only a statistical release', () => {
    // A country at war that has published nothing for years is not silent, and
    // greying it out would be the garden saying something false about a place
    // it can plainly see.
    const record = {
      releases: [] as IndicatorRelease[],
      unrest: [
        { id: 'b', iso3: 'TST', kind: 'riot' as const, at: NOW - DAY, severity: 0.5, article: article('b', NOW - DAY) },
      ],
      conflicts: [] as ConflictEpisode[],
    };
    expect(lastHeardFrom(record, NOW)).toBe(NOW - DAY);
  });

  it('is null for a country that has never said anything', () => {
    expect(lastHeardFrom({ releases: [], unrest: [], conflicts: [] }, NOW)).toBeNull();
  });

  it('never looks past the moment asked about', () => {
    const record = recordFor(
      recordsByCountry({
        fetchedAt: NOW,
        countries: [],
        releases: RELEASES,
        unrest: [],
        conflicts: [],
        provenance: { source: 'test', live: false },
      }),
      'TST',
    );
    expect(lastHeardFrom(record, Date.UTC(2026, 4, 20))).toBe(Date.UTC(2026, 4, 15));
  });
});

describe('the generated snapshot', () => {
  const snapshot = generateWorldSnapshot(NOW);

  it('never claims to be live', () => {
    expect(snapshot.provenance.live).toBe(false);
    expect(snapshot.provenance.note).toContain('simulated');
  });

  it('carries every UN member', () => {
    expect(snapshot.countries.length).toBe(193);
  });

  it('publishes nothing dated in the future', () => {
    for (const release of snapshot.releases) {
      expect(release.releasedAt).toBeLessThanOrEqual(NOW);
    }
  });

  it('arrives sorted, which every derivation relies on', () => {
    for (let i = 1; i < snapshot.releases.length; i++) {
      expect(snapshot.releases[i].releasedAt).toBeGreaterThanOrEqual(
        snapshot.releases[i - 1].releasedAt,
      );
    }
    for (let i = 1; i < snapshot.unrest.length; i++) {
      expect(snapshot.unrest[i].at).toBeGreaterThanOrEqual(snapshot.unrest[i - 1].at);
    }
  });

  it('revises figures, so a period can carry two values', () => {
    const revised = snapshot.releases.filter(
      (r) => r.iso3 === 'BRA' && r.indicator === 'gdp-growth',
    );
    const periods = revised.map((r) => r.period);
    expect(new Set(periods).size).toBeLessThan(periods.length);
  });

  it('agrees with itself when asked again later', () => {
    // The anchoring property. A poll must extend the record, never slide it:
    // every figure the earlier snapshot carried has to still be there, with the
    // same value, an hour on.
    const later = generateWorldSnapshot(NOW + 60 * 60 * 1000);
    const index = new Map(
      later.releases.map((r) => [`${r.iso3}|${r.indicator}|${r.period}|${r.releasedAt}`, r.value]),
    );
    for (const release of snapshot.releases) {
      const key = `${release.iso3}|${release.indicator}|${release.period}|${release.releasedAt}`;
      expect(index.get(key)).toBe(release.value);
    }
  });

  it('leaves some countries long unheard from, which is the staleness case', () => {
    // Reached honestly, the way the market's halt is: those countries stop
    // publishing and nothing is written about them, so their last word simply
    // recedes. No timestamp is edited to produce it.
    const records = recordsByCountry(snapshot);
    const quiet = snapshot.countries.filter((country) => {
      const heard = lastHeardFrom(recordFor(records, country.iso3), NOW);
      return heard !== null && NOW - heard > 40 * DAY;
    });
    expect(quiet.length).toBeGreaterThan(0);
  });

  it('gives every conflict episode the articles it was built from', () => {
    expect(snapshot.conflicts.length).toBeGreaterThan(0);
    for (const episode of snapshot.conflicts) {
      expect(episode.articles.length).toBeGreaterThan(0);
      expect(episode.since).toBe(episode.articles[0].publishedAt);
    }
  });

  it('gives every unrest event the article it was derived from', () => {
    expect(snapshot.unrest.length).toBeGreaterThan(0);
    for (const event of snapshot.unrest) {
      expect(event.article.publishedAt).toBe(event.at);
    }
  });
});
