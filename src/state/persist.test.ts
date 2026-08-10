import { describe, expect, it } from 'vitest';
import {
  COARSE_RETAINED_SLOTS,
  FINE_RETAINED_SLOTS,
  RECORD_SCHEMA,
  decodeRecord,
  emptyRecord,
  encodeRecord,
  observe,
  pruneRecord,
  recordBytes,
  restoreRecord,
  shedRecord,
  slotAt,
  type ObservedRecord,
} from './persist';
import { RECORD_BUDGET_BYTES } from './collector';
import {
  DAY_MS,
  HOUR_MS,
  createHistory,
  record,
  sampleAt,
  type VitalsHistory,
} from '../ecosystem/history';
import type { EcosystemNode } from '../ecosystem/types';

/** A Wednesday, mid-morning. */
const NOW = Date.UTC(2026, 5, 10, 14, 30);

const plant = (id: string, vitality = 0.6): EcosystemNode =>
  ({
    id,
    parentId: null,
    gardenId: 'g',
    label: id,
    domain: 'markets',
    kind: 'plant',
    polarity: 'nurture',
    vitality,
    activity: 0.4,
    maturity: 0.7,
    trend: -0.25,
    blights: [],
    updatedAt: NOW,
  }) as EcosystemNode;

const bed = (id: string): EcosystemNode => ({ ...plant(id), kind: 'bed' });

/**
 * A plant whose vitals do not land on round numbers, so that four decimals
 * actually cost four decimals. Sizing anything against `plant` above would be
 * sizing it against `0.5`.
 */
const varied = (id: string, i: number): EcosystemNode => ({
  ...plant(id),
  vitality: 0.5 + ((i * 37) % 97) / 313,
  activity: 0.5 + ((i * 53) % 89) / 311,
  maturity: 0.5 + ((i * 11) % 83) / 307,
  trend: -0.5 + ((i * 17) % 79) / 301,
});

describe('observe', () => {
  it('opens a slot per tier the first time and none after, inside the same hour', () => {
    const rec = emptyRecord(NOW);
    expect(observe(rec, [plant('a')], NOW)).toBe(2);
    expect(observe(rec, [plant('a')], NOW + 60_000)).toBe(0);
    expect(rec.fine['a'].slots).toHaveLength(1);
    expect(rec.coarse['a'].slots).toHaveLength(1);
  });

  it('keeps the last sample in a slot rather than averaging', () => {
    const rec = emptyRecord(NOW);
    observe(rec, [plant('a', 0.2)], NOW);
    observe(rec, [plant('a', 0.9)], NOW + 60_000);
    expect(rec.fine['a'].vitality).toEqual([0.9]);
  });

  it('opens the fine slot on the hour and the coarse one on the day', () => {
    const rec = emptyRecord(NOW);
    observe(rec, [plant('a')], NOW);
    expect(observe(rec, [plant('a')], NOW + HOUR_MS)).toBe(1);
    expect(rec.fine['a'].slots).toHaveLength(2);
    expect(rec.coarse['a'].slots).toHaveLength(1);
    expect(observe(rec, [plant('a')], NOW + DAY_MS)).toBe(2);
  });

  it('stores plants only, because beds are rolled up rather than observed', () => {
    const rec = emptyRecord(NOW);
    observe(rec, [plant('a'), bed('b')], NOW);
    expect(Object.keys(rec.fine)).toEqual(['a']);
  });

  it('keeps slots ascending when observations arrive out of order', () => {
    const rec = emptyRecord(NOW);
    observe(rec, [plant('a')], NOW);
    observe(rec, [plant('a')], NOW - 3 * HOUR_MS);
    observe(rec, [plant('a')], NOW - HOUR_MS);
    const { slots } = rec.fine['a'];
    expect(slots).toEqual([...slots].sort((x, y) => x - y));
    expect(slots).toHaveLength(3);
  });

  it('overwrites rather than duplicating a slot reached out of order', () => {
    const rec = emptyRecord(NOW);
    observe(rec, [plant('a', 0.1)], NOW - HOUR_MS);
    observe(rec, [plant('a')], NOW);
    observe(rec, [plant('a', 0.8)], NOW - HOUR_MS);
    expect(rec.fine['a'].slots).toHaveLength(2);
    expect(rec.fine['a'].vitality[0]).toBeCloseTo(0.8);
  });
});

describe('pruneRecord', () => {
  it('drops what the ring it restores into would refuse', () => {
    const rec = emptyRecord(NOW);
    observe(rec, [plant('a')], NOW - (FINE_RETAINED_SLOTS + 5) * HOUR_MS);
    observe(rec, [plant('a')], NOW);
    pruneRecord(rec, NOW);
    expect(rec.fine['a'].slots).toEqual([slotAt(NOW, HOUR_MS)]);
  });

  /**
   * The reason prune measures from `now` and not from the series' own newest
   * slot. A node that stopped reporting in the spring would otherwise hold its
   * spring for as long as the app is ever opened again.
   */
  it('ages out a node that stopped reporting, not just the tail of a live one', () => {
    const rec = emptyRecord(NOW);
    observe(rec, [plant('dead')], NOW - (COARSE_RETAINED_SLOTS + 10) * DAY_MS);
    observe(rec, [plant('live')], NOW);
    pruneRecord(rec, NOW);
    expect(rec.coarse['dead']).toBeUndefined();
    expect(rec.coarse['live']).toBeDefined();
  });

  it('drops slots ahead of now, which a clock correction can leave behind', () => {
    const rec = emptyRecord(NOW);
    observe(rec, [plant('a')], NOW + 5 * DAY_MS);
    pruneRecord(rec, NOW);
    expect(rec.fine['a']).toBeUndefined();
  });
});

describe('restoreRecord', () => {
  const backfilled = (stepMs: number, capacity: number, upTo: number) => {
    const buffer = createHistory(stepMs, capacity);
    for (let i = 0; i < 3; i++) {
      record(buffer, upTo - i * stepMs, {
        vitality: 0.5,
        activity: 0.5,
        maturity: 0.5,
        trend: 0,
      });
    }
    return buffer;
  };

  /**
   * The rule the whole thing turns on. A backfill is the source's current
   * account of its own past; the record is only worth something where the
   * source has gone quiet.
   */
  it('fills the gaps a source left and never overwrites what it said', () => {
    const history: Record<string, VitalsHistory> = {
      a: backfilled(HOUR_MS, FINE_RETAINED_SLOTS, NOW),
    };
    const rec = emptyRecord(NOW);
    observe(rec, [plant('a', 0.05)], NOW); // covered by the backfill
    observe(rec, [plant('a', 0.95)], NOW - 20 * HOUR_MS); // long past its window

    const filled = restoreRecord(rec, history, {});
    expect(filled.fine).toBe(1);
    expect(sampleAt(history['a'], NOW)!.vitality).toBeCloseTo(0.5);
    expect(sampleAt(history['a'], NOW - 20 * HOUR_MS)!.vitality).toBeCloseTo(0.95);
  });

  it('restores the coarse tier into the archive, which is the tier that pays', () => {
    const archive: Record<string, VitalsHistory> = {
      a: backfilled(DAY_MS, COARSE_RETAINED_SLOTS, NOW),
    };
    const rec = emptyRecord(NOW);
    observe(rec, [plant('a', 0.31)], NOW - 40 * DAY_MS);

    expect(restoreRecord(rec, {}, archive).coarse).toBe(1);
    expect(sampleAt(archive['a'], NOW - 40 * DAY_MS)!.vitality).toBeCloseTo(0.31);
  });

  it('skips a node with no buffer rather than inventing one for it', () => {
    const rec = emptyRecord(NOW);
    observe(rec, [plant('gone')], NOW - 5 * HOUR_MS);
    expect(restoreRecord(rec, {}, {})).toEqual({ fine: 0, coarse: 0 });
  });

  it('skips a series whose grain disagrees with the buffer', () => {
    const rec = emptyRecord(NOW);
    observe(rec, [plant('a')], NOW - 5 * HOUR_MS);
    const history = { a: createHistory(DAY_MS, 10) };
    expect(restoreRecord(rec, history, {}).fine).toBe(0);
  });
});

describe('encode and decode', () => {
  const populated = (): ObservedRecord => {
    const rec = emptyRecord(NOW);
    for (let i = 0; i < 8; i++) {
      observe(rec, [plant('markets/Energy/XOM'), plant('markets/Tech/MSFT')], NOW - i * DAY_MS);
    }
    return rec;
  };

  it('round-trips', () => {
    const rec = populated();
    const back = decodeRecord(encodeRecord(rec));
    expect(back).not.toBeNull();
    expect(back!.fine).toEqual(rec.fine);
    expect(back!.coarse).toEqual(rec.coarse);
  });

  it('rounds values to four decimals and no further', () => {
    const rec = emptyRecord(NOW);
    observe(rec, [plant('a', 0.123456789)], NOW);
    const back = decodeRecord(encodeRecord(rec))!;
    expect(back.fine['a'].vitality[0]).toBe(0.1235);
  });

  it.each([
    ['not json', '{'],
    ['not an object', '42'],
    ['another schema', JSON.stringify({ schema: 99, savedAt: NOW, fine: {}, coarse: {} })],
    ['no timestamp', JSON.stringify({ schema: RECORD_SCHEMA, fine: {}, coarse: {} })],
  ])('discards %s', (_label, text) => {
    expect(decodeRecord(text)).toBeNull();
  });

  /**
   * Storage is shared with everything else on the origin and outlives every
   * version of this app that ever ran, so one bad series has to cost that
   * series and not the season.
   */
  it.each([
    ['ragged arrays', { stepMs: HOUR_MS, slots: [1, 2], vitality: [0.5], activity: [0.5, 0.5], maturity: [0.5, 0.5], trend: [0, 0] }],
    ['a shuffled slot list', { stepMs: HOUR_MS, slots: [2, 1], vitality: [0.5, 0.5], activity: [0.5, 0.5], maturity: [0.5, 0.5], trend: [0, 0] }],
    ['a non-numeric value', { stepMs: HOUR_MS, slots: [1], vitality: ['x'], activity: [0.5], maturity: [0.5], trend: [0] }],
    ['the wrong grain', { stepMs: DAY_MS, slots: [1], vitality: [0.5], activity: [0.5], maturity: [0.5], trend: [0] }],
  ])('drops a series with %s and keeps the rest', (_label, broken) => {
    const good = emptyRecord(NOW);
    observe(good, [plant('good')], NOW);
    const text = JSON.stringify({
      schema: RECORD_SCHEMA,
      savedAt: NOW,
      fine: { ...good.fine, bad: broken },
      coarse: good.coarse,
    });
    const back = decodeRecord(text)!;
    expect(Object.keys(back.fine)).toEqual(['good']);
  });
});

describe('recordBytes', () => {
  /**
   * The estimate exists so a budget check and a shed pass do not each serialize
   * a megabyte to find out how big it is. It only has to be close, and it has to
   * stay close if the encoding changes, which is what this is for.
   *
   * Values are varied rather than round, because a garden of plants all sitting
   * on 0.5 encodes to three characters a sample and would flatter the estimate
   * into a constant that is wrong about real data.
   */
  it('lands within 5% of the encoded length across a range of shapes', () => {
    const shapes: Array<[string, number, number]> = [
      ['a garden, an hour', 32, 1],
      ['a garden, a day', 32, 24],
      ['a garden, a season', 32, COARSE_RETAINED_SLOTS],
      ['every garden, a week', 124, FINE_RETAINED_SLOTS],
    ];

    for (const [label, nodes, slots] of shapes) {
      const rec = emptyRecord(NOW);
      const ids = Array.from({ length: nodes }, (_, i) =>
        varied(`markets/Sector ${i}/TICK${i}`, i),
      );
      for (let s = 0; s < slots; s++) {
        observe(rec, ids.map((node, i) => varied(node.id, i + s)), NOW - s * HOUR_MS);
      }

      const actual = encodeRecord(rec).length;
      const estimated = recordBytes(rec);
      expect(Math.abs(estimated - actual) / actual, label).toBeLessThan(0.05);
    }
  });

  /**
   * A series carries five commas per slot that a one-slot series does not, and
   * they are folded into the per-slot constant. The error is a rounding
   * artefact at the very bottom of the range and it goes the safe way, which is
   * the only thing a budget needs from it.
   */
  it('over-estimates a nearly-empty record rather than under-estimating it', () => {
    const rec = emptyRecord(NOW);
    observe(rec, [varied('markets/Sector 0/TICK0', 1)], NOW);
    expect(recordBytes(rec)).toBeGreaterThanOrEqual(encodeRecord(rec).length);
  });

  /** Two megabytes has to be a season of every garden, or the budget is a lie. */
  it('puts a full season of every garden inside the budget', () => {
    const rec = emptyRecord(NOW);
    const ids = Array.from({ length: 124 }, (_, i) =>
      varied(`markets/Sector ${i}/TICKER${i}`, i),
    );
    for (let s = 0; s < COARSE_RETAINED_SLOTS; s++) observe(rec, ids, NOW - s * DAY_MS);
    for (let s = 0; s < FINE_RETAINED_SLOTS; s++) observe(rec, ids, NOW - s * HOUR_MS);

    expect(recordBytes(rec)).toBeLessThan(RECORD_BUDGET_BYTES);
  });
});

describe('shedRecord', () => {
  const twoTiers = (slots: number) => {
    const rec = emptyRecord(NOW);
    const ids = Array.from({ length: 20 }, (_, i) => plant(`n${i}`));
    for (let s = 0; s < slots; s++) observe(rec, ids, NOW - s * DAY_MS);
    return rec;
  };

  it('does nothing when the record is inside the budget', () => {
    const rec = twoTiers(3);
    expect(shedRecord(rec, 10_000_000)).toBe(0);
  });

  it('brings the record inside the budget', () => {
    const rec = twoTiers(60);
    const budget = Math.round(recordBytes(rec) / 3);
    shedRecord(rec, budget);
    expect(recordBytes(rec)).toBeLessThanOrEqual(budget);
  });

  /**
   * The order is the point. A live feed can usually still be asked about the
   * last week; past its window, the coarse tier is the only place those days
   * exist.
   */
  it('spends the fine tier before touching the coarse one', () => {
    const rec = twoTiers(60);
    const coarseBefore = rec.coarse['n0'].slots.length;
    const fineBefore = rec.fine['n0'].slots.length;
    shedRecord(rec, Math.round(recordBytes(rec) * 0.8));
    expect(rec.fine['n0'].slots.length).toBeLessThan(fineBefore);
    expect(rec.coarse['n0'].slots).toHaveLength(coarseBefore);
  });

  it('gives up the fine tier entirely before spending a coarse slot', () => {
    const rec = twoTiers(60);
    const coarseBefore = rec.coarse['n0'].slots.length;
    // Exactly enough room for the season and nothing else, so the fine tier has
    // to go and the coarse one must survive whole.
    const seasonOnly = { ...rec, fine: {} };
    shedRecord(rec, recordBytes(seasonOnly));
    expect(Object.keys(rec.fine)).toHaveLength(0);
    expect(rec.coarse['n0'].slots).toHaveLength(coarseBefore);
  });

  it('drops the oldest, and the same span from every node', () => {
    const rec = emptyRecord(NOW);
    const chatty = plant('chatty');
    const quiet = plant('quiet');
    for (let s = 0; s < 40; s++) observe(rec, [chatty], NOW - s * DAY_MS);
    observe(rec, [quiet], NOW - 39 * DAY_MS);
    observe(rec, [quiet], NOW);
    delete rec.fine['chatty'];
    delete rec.fine['quiet'];

    shedRecord(rec, Math.round(recordBytes(rec) * 0.5));

    const oldest = Math.min(...rec.coarse['chatty'].slots);
    // The quiet node loses its old sample too, rather than being spared because
    // it has few: the cutoff is a moment in time, not a count per node.
    expect(rec.coarse['quiet']?.slots ?? []).not.toContain(slotAt(NOW - 39 * DAY_MS, DAY_MS));
    expect(rec.coarse['chatty'].slots).toContain(slotAt(NOW, DAY_MS));
    expect(oldest).toBeGreaterThan(slotAt(NOW - 39 * DAY_MS, DAY_MS));
  });
});
