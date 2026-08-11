import { describe, expect, it } from 'vitest';
import {
  WORLD_GARDEN_ID,
  WORLD_STALE_SCHEDULE,
  activityOf,
  bedIdFor,
  blightsFor,
  countryNodeId,
  maturityOf,
  readCountry,
  translateWorldSnapshot,
  trendOf,
  vitalityOf,
  type CountryReading,
} from './world';
import {
  COUNTRIES,
  SUBREGION_ORDER,
  countryOf,
  generateWorldSnapshot,
  recordFor,
  recordsByCountry,
} from '../adapters/world';
import { historyExtent } from '../ecosystem/history';
import { isStale } from '../ecosystem/staleness';
import { MARK_LIMIT } from '../ecosystem/labels';
import { PLANTINGS } from '../ecosystem/planting';
import type { Country, IndicatorRelease } from '../adapters/world';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 6, 1);

const snapshot = generateWorldSnapshot(NOW);
const world = translateWorldSnapshot(snapshot, { asOf: NOW });
const records = recordsByCountry(snapshot);

const plants = Object.values(world.nodes).filter((n) => n.kind === 'plant');
const beds = Object.values(world.nodes).filter((n) => n.kind === 'bed');

describe('the shape of the garden', () => {
  it('is one garden, twenty-two beds, and every UN member', () => {
    expect(world.nodes[WORLD_GARDEN_ID].kind).toBe('garden');
    expect(beds.length).toBe(SUBREGION_ORDER.length);
    expect(plants.length).toBe(193);
  });

  it('has beds of genuinely different sizes, which is the point of it', () => {
    const sizes = beds.map(
      (bed) => plants.filter((p) => p.parentId === bed.id).length,
    );
    expect(Math.min(...sizes)).toBe(2);
    expect(Math.max(...sizes)).toBe(18);
  });

  it('orders bed ids west to east, so the layout does not sort them alphabetically', () => {
    expect(bedIdFor('northern-america') < bedIdFor('polynesia')).toBe(true);
    expect(bedIdFor('northern-europe') < bedIdFor('eastern-asia')).toBe(true);
  });

  it('never plants a country as a weed', () => {
    // Suppress polarity renders as an invasive thicket, and no country should
    // be a thing you want less of.
    for (const plant of plants) expect(plant.polarity).toBe('nurture');
    for (const bed of beds) {
      expect(PLANTINGS[bed.plantingType!].invasive).toBe(false);
    }
  });

  it('draws land borders as grafts, and only within a bed', () => {
    const edges = Object.values(world.edges);
    expect(edges.length).toBeGreaterThan(150);
    const bedOf = new Map(plants.map((p) => [p.id, p.parentId]));
    for (const edge of edges) {
      expect(edge.kind).toBe('links');
      expect(edge.directed).toBe(false);
      expect(bedOf.get(edge.sourceId)).toBe(bedOf.get(edge.targetId));
    }
  });
});

describe('the tag', () => {
  it('wears the ISO code whole, which is the only mark in the project that fits', () => {
    for (const plant of plants) {
      expect(plant.emblem!.mark.length).toBe(3);
      expect(plant.emblem!.mark.length).toBeLessThanOrEqual(MARK_LIMIT);
    }
    expect(world.nodes[countryNodeId('BRA')].emblem!.mark).toBe('BRA');
  });

  it('takes its colour from the flag and never from the health axes', () => {
    const brazil = countryOf('BRA')!;
    expect(world.nodes[countryNodeId('BRA')].emblem!.color).toBe(brazil.primary);
  });
});

describe('the axes', () => {
  it('reads vitality from published figures alone', () => {
    // Structural, and the most important guarantee in this file: vitalityOf
    // cannot see a country, so it cannot see a war, a population, or an age.
    expect(vitalityOf(0, 67.5)).toBeCloseTo(0.5 * 0.55 + 0.5 * 0.45, 5);
    expect(vitalityOf(8, 85)).toBe(1);
    expect(vitalityOf(-8, 50)).toBe(0);
  });

  it('scores endpoints at the real-world worst and best, not at the data range', () => {
    // A country growing at 12% is not twice as healthy as one growing at 6%;
    // both are at the top of what the axis can express.
    expect(vitalityOf(12, 70)).toBe(vitalityOf(8, 70));
  });

  it('reads a single published figure rather than filling in the other', () => {
    // Half the pair is honest; a midpoint nobody published is not.
    expect(vitalityOf(null, 85)).toBe(1);
    expect(vitalityOf(2.4, null)).toBeCloseTo((2.4 + 8) / 16, 5);
  });

  it('puts size and age in maturity, and lets a small country be healthy', () => {
    const india = countryOf('IND')!;
    const tuvalu = countryOf('TUV')!;
    expect(maturityOf(india, 15, 1428, NOW)).toBeGreaterThan(
      maturityOf(tuvalu, 25, 0.011, NOW),
    );
    // And the load-bearing half of that trade: nothing about being small can
    // reach vitality, so Tuvalu can outscore India on health outright.
    const small = vitalityOf(6, 80);
    const large = vitalityOf(1, 68);
    expect(small).toBeGreaterThan(large);
  });

  it('reads a high birth rate as a young population, never as a sick one', () => {
    const country = countryOf('NER')!;
    const young = maturityOf(country, 44, 26, NOW);
    const old = maturityOf(country, 8, 26, NOW);
    expect(old).toBeGreaterThan(young);
  });

  it('moves trend when a figure is replaced, and not otherwise', () => {
    // A point of growth added between one figure and the next is the whole
    // axis — measured against the distribution, not argued from the domain.
    expect(trendOf(2.4, 1.4)).toBeCloseTo(1, 5);
    expect(trendOf(2.4, 2.0)).toBeCloseTo(0.4, 5);
    expect(trendOf(2.0, 2.4)).toBeCloseTo(-0.4, 5);
    // Nothing to compare against is no trend, not a guessed one.
    expect(trendOf(2.4, null)).toBe(0);
    expect(trendOf(null, 2.4)).toBe(0);
    // A large swing saturates rather than running off the axis.
    expect(trendOf(9, -9)).toBe(1);
  });

  it('spends the trend axis rather than hovering at zero', () => {
    // The fault the first calibration had: a scale wide enough to be safe left
    // nine tenths of the world within a tenth of nothing, and the fresh-growth
    // channel unspent. Asserted here so a future widening has to argue with it.
    const trends = plants.map((p) => Math.abs(p.trend)).sort((a, b) => a - b);
    const median = trends[Math.floor(trends.length / 2)];
    expect(median).toBeGreaterThan(0.1);
  });

  it('reads activity as how much is going on, saturating rather than scaling', () => {
    const quiet = activityOf(0, NOW - DAY, NOW);
    const busy = activityOf(2, NOW - DAY, NOW);
    const chaotic = activityOf(8, NOW - DAY, NOW);
    expect(busy).toBeGreaterThan(quiet);
    expect(chaotic).toBeGreaterThan(busy);
    expect(chaotic - busy).toBeLessThan(busy - quiet);
  });

  it('leaves a country nobody has heard from barely moving', () => {
    expect(activityOf(0, null, NOW)).toBeLessThan(activityOf(0, NOW, NOW));
  });
});

describe('what was known, not what was true', () => {
  /** Q1 at 2.1% on 15 May, revised to 1.4% on 14 June. */
  const releases: IndicatorRelease[] = [
    { iso3: 'BRA', indicator: 'gdp-growth', period: '2026-Q1', value: 2.1, releasedAt: Date.UTC(2026, 4, 15) },
    { iso3: 'BRA', indicator: 'gdp-growth', period: '2026-Q1', value: 1.4, releasedAt: Date.UTC(2026, 5, 14) },
  ];
  const record = { releases, unrest: [], conflicts: [] };
  const brazil = countryOf('BRA') as Country;

  it('steps on the publication date, not on the date the figure describes', () => {
    const before = readCountry(brazil, record, Date.UTC(2026, 4, 1));
    const after = readCountry(brazil, record, Date.UTC(2026, 4, 20));
    expect(before.growth).toBeNull();
    expect(after.growth).toBe(2.1);
    expect(after.growthPeriod).toBe('2026-Q1');
  });

  it('shows the vintage that was current, so a revision does not leak backwards', () => {
    expect(readCountry(brazil, record, Date.UTC(2026, 4, 20)).growth).toBe(2.1);
    expect(readCountry(brazil, record, Date.UTC(2026, 5, 20)).growth).toBe(1.4);
  });

  it('is flat between publications, which is what the scrub should show', () => {
    const a = readCountry(brazil, record, Date.UTC(2026, 4, 16)).vitals.vitality;
    const b = readCountry(brazil, record, Date.UTC(2026, 5, 10)).vitals.vitality;
    expect(a).toBe(b);
  });
});

describe('conflict is a blight, not a health score', () => {
  const reading = (over: Partial<CountryReading> = {}): CountryReading => ({
    vitals: { vitality: 0.6, activity: 0.5, maturity: 0.5, trend: 0 },
    growth: 2, growthPeriod: '2026-Q1', growthPublishedAt: NOW - DAY,
    previousGrowth: 1, lifeExpectancy: 70, birthRate: 20, population: 10,
    unrest: 0, conflicts: [], heardFrom: NOW - DAY,
    ...over,
  });

  const country = countryOf('SOM')!;

  it('names a conflict without touching the axes', () => {
    const withWar = reading({
      conflicts: [
        {
          id: 'c1', iso3: 'SOM', kind: 'armed-conflict', since: NOW - 60 * DAY,
          intensity: 0.8,
          articles: [
            {
              id: 'a1', outlet: 'Simulated Wire', title: 'Air strikes reported in Somalia',
              summary: '', url: 'https://simulated.invalid/x', publishedAt: NOW - DAY,
            },
          ],
        },
      ],
    });

    const blights = blightsFor(country, withWar, NOW);
    expect(blights[0].severity).toBe('critical');
    expect(blights[0].since).toBe(NOW - 60 * DAY);
    // And the axes are untouched — a war does not enter vitality.
    expect(withWar.vitals.vitality).toBe(reading().vitals.vitality);
  });

  it('says out loud that a generated blight was simulated', () => {
    const quiet = blightsFor(country, reading({ heardFrom: null }), NOW);
    expect(quiet[0].message).toContain('(simulated)');
    // A live source drops the marker by being live, rather than by anybody
    // remembering to take it out.
    const live = blightsFor(country, reading({ heardFrom: null }), NOW, false);
    expect(live[0].message).not.toContain('simulated');
  });

  it('names silence, which only a source fed by news could do', () => {
    const long = blightsFor(country, reading({ heardFrom: NOW - 90 * DAY }), NOW);
    expect(long.some((b) => b.message.includes('No figures and no reports'))).toBe(true);
  });
});

describe('provenance reaches the panel', () => {
  it('carries the originating dispatch onto a blighted country', () => {
    const blighted = plants.filter((p) =>
      p.blights.some((b) => b.message.includes('conflict')),
    );
    expect(blighted.length).toBeGreaterThan(0);

    for (const plant of blighted) {
      const raw = plant.raw as { reports: string[]; activeConflicts: number };
      expect(raw.activeConflicts).toBeGreaterThan(0);
      expect(raw.reports.length).toBeGreaterThan(0);
      // The sentence, the masthead, and the date — not just a severity level.
      expect(raw.reports[0]).toMatch(/ — .+, \d{4}-\d{2}-\d{2}$/);
    }
  });

  it('puts the figure next to the period and the day it was published', () => {
    const raw = world.nodes[countryNodeId('BRA')].raw as Record<string, unknown>;
    expect(raw.gdpPeriod).toMatch(/^\d{4}-Q[1-4]$/);
    expect(typeof raw.gdpPublished).toBe('number');
    expect(raw.provenance).toMatchObject({ live: false });
  });
});

describe('history', () => {
  it('records the archive at a daily grain across the season', () => {
    const archive = world.archive[countryNodeId('BRA')];
    const extent = historyExtent(archive)!;
    expect(NOW - extent.from).toBeGreaterThan(120 * DAY);
  });

  it('never writes a slot before the country had published anything', () => {
    // The rule the whole project turns on: an unrecorded past must not be given
    // a plausible number, because a flat line of those is indistinguishable
    // from data.
    const iso3 = COUNTRIES.find((c) => {
      const record = recordFor(records, c.iso3);
      const first = record.releases[0]?.releasedAt ?? Infinity;
      return first > NOW - 100 * DAY;
    })?.iso3;

    if (!iso3) return; // every country published early; nothing to assert.
    const archive = world.archive[countryNodeId(iso3)];
    const extent = historyExtent(archive);
    const first = recordFor(records, iso3).releases[0]?.releasedAt;
    if (extent && first) expect(extent.from).toBeGreaterThanOrEqual(first - DAY);
  });
});

describe('staleness', () => {
  it('greys the countries that stopped saying anything, and only those', () => {
    const stale = plants.filter((p) => isStale(p, NOW, WORLD_STALE_SCHEDULE));
    expect(stale.length).toBeGreaterThan(0);
    // But not half the world: a state that reads as normal stops being read.
    expect(stale.length).toBeLessThan(plants.length * 0.15);
  });

  it('tolerates the ordinary publication rhythm without crying wolf', () => {
    // A country heard from a month ago is publishing on time, not dying.
    const recent = { ...plants[0], updatedAt: NOW - 30 * DAY };
    expect(isStale(recent, NOW, WORLD_STALE_SCHEDULE)).toBe(false);
  });
});
