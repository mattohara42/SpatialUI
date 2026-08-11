import { describe, expect, it } from 'vitest';
import { isKnownDomain, KNOWN_DOMAINS } from '../ecosystem/types';
import {
  declarativeBedId,
  declarativeNodeId,
  getPath,
  readRecord,
  translateDeclarative,
  type DeclarativeMapping,
} from './declarative';

const AS_OF = Date.UTC(2026, 7, 11, 12, 0, 0);

/**
 * A league-shaped source, standing in for `translation/nfl.ts` as the spec: a
 * flat list of teams, a win percentage as the level, divisions as beds. The
 * scale runs .25–.75 rather than 0–1 on purpose — half a league is below .500 by
 * construction, and mapping that straight onto vitality would wilt half the
 * garden, which is the "an axis endpoint is the worst case that can really occur"
 * rule the hand-written league already paid for.
 */
const LEAGUE: DeclarativeMapping = {
  gardenId: 'league',
  gardenLabel: 'League',
  domain: 'sports',
  idPath: 'abbr',
  labelPath: 'name',
  levelPath: 'winPct',
  vitality: { min: 0.25, max: 0.75 },
  bedPath: 'division',
  polarity: 'nurture',
  planting: 'orchard',
};

const LEAGUE_RECORDS = [
  { abbr: 'AAA', name: 'Alphas', winPct: 0.75, division: 'North' },
  { abbr: 'BBB', name: 'Bravos', winPct: 0.5, division: 'North' },
  { abbr: 'CCC', name: 'Charlies', winPct: 0.25, division: 'South' },
];

describe('translateDeclarative — the general case of the mapping-as-data source', () => {
  it('builds a garden, beds, and plants from a flat record list', () => {
    const { nodes } = translateDeclarative(LEAGUE_RECORDS, LEAGUE, { asOf: AS_OF });

    const garden = nodes['league'];
    expect(garden.kind).toBe('garden');
    expect(garden.parentId).toBeNull();

    const beds = Object.values(nodes).filter((n) => n.kind === 'bed');
    expect(beds.map((b) => b.label).sort()).toEqual(['North', 'South']);

    const plants = Object.values(nodes).filter((n) => n.kind === 'plant');
    expect(plants).toHaveLength(3);
    for (const plant of plants) {
      expect(plant.gardenId).toBe('league');
      expect(plant.domain).toBe('sports');
      expect(plant.polarity).toBe('nurture');
      expect(plant.emblem).toBeDefined();
    }
  });

  it('scales the level onto vitality by the config, not the raw number', () => {
    const { nodes } = translateDeclarative(LEAGUE_RECORDS, LEAGUE, { asOf: AS_OF });
    // .75 → 1, .50 → 0.5, .25 → 0 under a 0.25–0.75 scale.
    expect(nodes[declarativeNodeId('league', 'AAA')].vitality).toBeCloseTo(1);
    expect(nodes[declarativeNodeId('league', 'BBB')].vitality).toBeCloseTo(0.5);
    expect(nodes[declarativeNodeId('league', 'CCC')].vitality).toBeCloseTo(0);
  });

  it('parents each plant to its bed and each bed to the garden', () => {
    const { nodes } = translateDeclarative(LEAGUE_RECORDS, LEAGUE, { asOf: AS_OF });
    const alpha = nodes[declarativeNodeId('league', 'AAA')];
    expect(alpha.parentId).toBe(declarativeBedId('league', 'North'));
    expect(nodes[alpha.parentId!].parentId).toBe('league');
  });

  it('rolls a bed up to the mean of its plants, and the garden up to its beds', () => {
    const { nodes } = translateDeclarative(LEAGUE_RECORDS, LEAGUE, { asOf: AS_OF });
    // North holds AAA (1.0) and BBB (0.5) → 0.75.
    expect(nodes[declarativeBedId('league', 'North')].vitality).toBeCloseTo(0.75);
    // South holds CCC (0.0) → 0.0. Garden = mean of beds = 0.375.
    expect(nodes[declarativeBedId('league', 'South')].vitality).toBeCloseTo(0);
    expect(nodes['league'].vitality).toBeCloseTo(0.375);
  });

  it('records one observed sample per plant and no invented past', () => {
    const { history, archive } = translateDeclarative(LEAGUE_RECORDS, LEAGUE, {
      asOf: AS_OF,
    });
    expect(Object.keys(archive)).toHaveLength(0);
    const buffer = history[declarativeNodeId('league', 'AAA')];
    expect(buffer).toBeDefined();
  });
});

describe('the scale is a comparison, and the config states which way', () => {
  it('runs backwards when min > max (lower is better)', () => {
    // A market-shaped drawdown source: a loss deepens as the number rises, so a
    // small drawdown is healthy and a large one is dying. min > max says it.
    const mapping: DeclarativeMapping = {
      gardenId: 'risk',
      gardenLabel: 'Risk',
      labelPath: 'name',
      levelPath: 'drawdownPct',
      vitality: { min: 40, max: 0 }, // 0% drawdown → 1, 40%+ → 0
      polarity: 'nurture',
    };
    const { nodes } = translateDeclarative(
      [{ name: 'Fund A', drawdownPct: 0 }, { name: 'Fund B', drawdownPct: 40 }],
      mapping,
    );
    expect(nodes[declarativeNodeId('risk', 'Fund A')].vitality).toBeCloseTo(1);
    expect(nodes[declarativeNodeId('risk', 'Fund B')].vitality).toBeCloseTo(0);
  });
});

describe('polarity is mandatory and carried, never inferred', () => {
  it('carries suppress onto every node so a thriving weed reads as alarm', () => {
    const mapping: DeclarativeMapping = {
      gardenId: 'threats',
      gardenLabel: 'Threats',
      domain: 'security',
      labelPath: 'source',
      levelPath: 'failedLogins',
      vitality: { min: 0, max: 1000 },
      polarity: 'suppress',
    };
    const { nodes } = translateDeclarative(
      [{ source: 'bruteforcer', failedLogins: 900 }],
      mapping,
    );
    const plant = nodes[declarativeNodeId('threats', 'bruteforcer')];
    expect(plant.polarity).toBe('suppress');
    // High vitality on a suppress node — thriving as a plant, terrible as a signal.
    expect(plant.vitality).toBeGreaterThan(0.8);
  });
});

describe('activity is an optional second field, and trend is derived', () => {
  const mapping: DeclarativeMapping = {
    gardenId: 'mkt',
    gardenLabel: 'Markets',
    domain: 'markets',
    labelPath: 'ticker',
    levelPath: 'returnPct',
    vitality: { min: -20, max: 20 },
    activity: { path: 'volumeRatio', scale: { min: 0, max: 3 } },
    polarity: 'nurture',
  };

  it('scales a distinct field onto activity', () => {
    const { nodes } = translateDeclarative(
      [{ ticker: 'ACME', returnPct: 10, volumeRatio: 1.5 }],
      mapping,
    );
    expect(nodes[declarativeNodeId('mkt', 'ACME')].activity).toBeCloseTo(0.5);
  });

  it('leaves activity neutral when no field is mapped', () => {
    const bare: DeclarativeMapping = { ...mapping, activity: undefined };
    const { nodes } = translateDeclarative(
      [{ ticker: 'ACME', returnPct: 10 }],
      bare,
    );
    expect(nodes[declarativeNodeId('mkt', 'ACME')].activity).toBe(0.5);
  });

  it('derives trend from the previous poll, and is 0 with no past', () => {
    const record = [{ ticker: 'ACME', returnPct: 0, volumeRatio: 1 }];
    const first = translateDeclarative(record, mapping);
    const id = declarativeNodeId('mkt', 'ACME');
    expect(first.nodes[id].trend).toBe(0);

    // returnPct 0 scales to 0.5 vitality; a previous reading of 0.2 means it
    // climbed, so trend is positive.
    const climbed = readRecord(
      { ticker: 'ACME', returnPct: 0, volumeRatio: 1 },
      mapping,
      0.2,
    );
    expect(climbed.trend).toBeGreaterThan(0);
    const fell = readRecord(
      { ticker: 'ACME', returnPct: 0, volumeRatio: 1 },
      mapping,
      0.8,
    );
    expect(fell.trend).toBeLessThan(0);
  });
});

describe('a user-defined domain flows through untouched', () => {
  it('accepts a domain string outside the built-in set', () => {
    const mapping: DeclarativeMapping = {
      gardenId: 'campaign',
      gardenLabel: 'Fundraising',
      domain: 'fundraising', // not one of the seven shipped domains
      labelPath: 'committee',
      levelPath: 'raisedUsd',
      vitality: { min: 0, max: 5_000_000 },
      polarity: 'nurture',
    };
    const { nodes } = translateDeclarative(
      [{ committee: 'Friends of X', raisedUsd: 2_500_000 }],
      mapping,
    );
    const plant = nodes[declarativeNodeId('campaign', 'Friends of X')];
    expect(plant.domain).toBe('fundraising');
    expect(plant.vitality).toBeCloseTo(0.5);
  });

  it('defaults an unstated domain to the general fallback bucket', () => {
    const mapping: DeclarativeMapping = {
      gardenId: 'g',
      gardenLabel: 'G',
      labelPath: 'name',
      levelPath: 'v',
      vitality: { min: 0, max: 1 },
      polarity: 'nurture',
    };
    const { nodes } = translateDeclarative([{ name: 'thing', v: 0.5 }], mapping);
    expect(nodes[declarativeNodeId('g', 'thing')].domain).toBe('general');
  });
});

describe('payload shape and honest failure', () => {
  const mapping: DeclarativeMapping = {
    gardenId: 'g',
    gardenLabel: 'G',
    labelPath: 'name',
    levelPath: 'v',
    vitality: { min: 0, max: 1 },
    polarity: 'nurture',
  };

  it('reads the record array out of a nested path', () => {
    const wrapped = { data: { results: [{ name: 'a', v: 0.5 }] } };
    const { nodes } = translateDeclarative(wrapped, {
      ...mapping,
      recordsPath: 'data.results',
    });
    expect(nodes[declarativeNodeId('g', 'a')]).toBeDefined();
  });

  it('falls back to the label when no id path is given', () => {
    const { nodes } = translateDeclarative([{ name: 'Only Name', v: 1 }], mapping);
    expect(nodes[declarativeNodeId('g', 'Only Name')]).toBeDefined();
  });

  it('throws when the level path is not a finite number', () => {
    expect(() =>
      translateDeclarative([{ name: 'a', v: 'not-a-number' }], mapping),
    ).toThrow(/level path/);
  });

  it('throws when the payload is not an array and no recordsPath is given', () => {
    expect(() => translateDeclarative({ nope: true }, mapping)).toThrow(/not an array/);
  });

  it('throws when recordsPath misses', () => {
    expect(() =>
      translateDeclarative({ data: 5 }, { ...mapping, recordsPath: 'data' }),
    ).toThrow(/did not resolve to an array/);
  });
});

describe('getPath resolves dotted paths and misses safely', () => {
  it('walks nested objects', () => {
    expect(getPath({ a: { b: { c: 7 } } }, 'a.b.c')).toBe(7);
  });
  it('returns undefined off any miss rather than throwing', () => {
    expect(getPath({ a: 1 }, 'a.b.c')).toBeUndefined();
    expect(getPath(null, 'a')).toBeUndefined();
  });
});

describe('Domain is open, with a named fallback', () => {
  it('recognises the shipped domains, including general', () => {
    expect(isKnownDomain('markets')).toBe(true);
    expect(isKnownDomain('general')).toBe(true);
    expect(KNOWN_DOMAINS).toContain('general');
  });
  it('does not recognise a user domain, but does not forbid it', () => {
    expect(isKnownDomain('fundraising')).toBe(false);
  });
});
