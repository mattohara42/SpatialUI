import { describe, expect, it } from 'vitest';
import {
  MARKET_GARDEN_ID,
  MARKET_STALE_AFTER_MS,
  activityOf,
  bedIdFor,
  correlationOf,
  instrumentNodeId,
  maturityOf,
  translateMarketSnapshot,
  trendOf,
  vitalityOf,
} from './market';
import {
  INSTRUMENTS,
  LONGEST_CLOSURE_MS,
  SECTORS,
  barsBySymbol,
  generateMarketSnapshot,
  type Bar,
} from '../adapters/market';
import { isStale, staleness } from '../ecosystem/staleness';
import { signalHealth } from '../ecosystem/types';
import { vitalsAt } from '../ecosystem/history';

const NOW = Date.UTC(2026, 3, 15, 21, 0);
const snapshot = generateMarketSnapshot(NOW);
const translated = translateMarketSnapshot(snapshot, { asOf: NOW });

const plants = Object.values(translated.nodes).filter((n) => n.kind === 'plant');
const beds = Object.values(translated.nodes).filter((n) => n.kind === 'bed');

describe('the book as a garden', () => {
  it('is one garden, eight beds, thirty-two plants', () => {
    expect(translated.nodes[MARKET_GARDEN_ID]?.kind).toBe('garden');
    expect(beds).toHaveLength(8);
    expect(plants).toHaveLength(INSTRUMENTS.length);
  });

  it('parents every plant into its sector bed, in the same garden', () => {
    for (const plant of plants) {
      expect(plant.gardenId).toBe(MARKET_GARDEN_ID);
      const bed = translated.nodes[plant.parentId!];
      expect(bed?.kind).toBe('bed');
      expect(bed.gardenId).toBe(MARKET_GARDEN_ID);
    }
  });

  it('orders the beds by the book rather than by the alphabet', () => {
    // Layout sorts by id, so the prefix is what puts Technology first and
    // Materials last instead of Consumer leading because it begins with C.
    const ordered = [...beds].sort((a, b) => a.id.localeCompare(b.id));
    expect(ordered.map((b) => b.label)).toEqual([
      'Technology',
      'Financials',
      'Health Care',
      'Energy',
      'Consumer',
      'Industrials',
      'Utilities',
      'Materials',
    ]);
  });

  it('gives every bed a planting, and spreads the harsh forms across both rows', () => {
    // Beds wrap into two rows of four. Plantings differ in how brutally they
    // show ill health, so a row holding all the tree forms would read worse
    // than the other one for no reason at all.
    const trees = new Set(['orchard', 'grove', 'conifer-stand']);
    const ordered = [...beds].sort((a, b) => a.id.localeCompare(b.id));
    for (const bed of ordered) expect(bed.plantingType).toBeDefined();

    const front = ordered.slice(0, 4).filter((b) => trees.has(b.plantingType!)).length;
    const back = ordered.slice(4).filter((b) => trees.has(b.plantingType!)).length;
    expect(Math.abs(front - back)).toBeLessThanOrEqual(1);
  });

  it('grafts sector peers together, and never across sectors', () => {
    const edges = Object.values(translated.edges);
    // Four to a sector is six pairs, times eight.
    expect(edges).toHaveLength(48);
    for (const edge of edges) {
      expect(edge.kind).toBe('correlates');
      expect(edge.directed).toBe(false);
      const a = translated.nodes[edge.sourceId];
      const b = translated.nodes[edge.targetId];
      expect(a.parentId).toBe(b.parentId);
      expect(edge.strength).toBeGreaterThanOrEqual(0);
      expect(edge.strength).toBeLessThanOrEqual(1);
    }
  });
});

describe('polarity is the point', () => {
  it('renders a short as a weed and a long as a plant', () => {
    const shorts = plants.filter((p) => p.polarity === 'suppress');
    const longs = plants.filter((p) => p.polarity === 'nurture');
    expect(shorts.length).toBeGreaterThan(0);
    expect(longs.length).toBeGreaterThan(0);
  });

  it('makes a short that has run away the most alarming thing in the room', () => {
    // The reading the whole source was chosen to exercise. Vitality is the
    // instrument's move, unsigned; polarity decides what the move means.
    const up = vitalityOf(0.3, 0);
    expect(up).toBeGreaterThan(0.5);

    const asLong = signalHealth({ ...plants[0], polarity: 'nurture', vitality: up });
    const asShort = signalHealth({ ...plants[0], polarity: 'suppress', vitality: up });
    expect(asLong).toBeGreaterThan(0.5);
    expect(asShort).toBeLessThan(0.5);
    expect(asLong + asShort).toBeCloseTo(1, 10);
  });

  it('does not sign vitality by side, which would cancel polarity out', () => {
    // If translation pre-signed the return, a short would look healthy when it
    // was winning and polarity would then invert it back to alarming. The bug
    // is invisible in a screenshot and total in meaning.
    const shorts = plants.filter((p) => p.polarity === 'suppress');
    const bars = barsBySymbol(snapshot);
    for (const plant of shorts) {
      const symbol = (plant.raw as { symbol: string }).symbol;
      const ret = (plant.raw as { returnPct: number }).returnPct;
      expect(bars[symbol]).toBeDefined();
      // Vitality tracks the raw move: up on the tape means a bigger weed.
      if (ret > 5) expect(plant.vitality).toBeGreaterThan(0.5);
      if (ret < -5) expect(plant.vitality).toBeLessThan(0.62);
    }
  });
});

describe('the axes', () => {
  it('reads flat as the middle and saturates at a big move', () => {
    expect(vitalityOf(0, 0)).toBeCloseTo(0.5, 6);
    expect(vitalityOf(1.5, 0)).toBeCloseTo(1, 6);
    expect(vitalityOf(-1.5, 0.9)).toBeCloseTo(0, 6);
    // Monotonic in the return.
    expect(vitalityOf(0.2, 0)).toBeGreaterThan(vitalityOf(0.1, 0));
  });

  it('marks a holding well off its high as less healthy than one at it', () => {
    expect(vitalityOf(0.3, 0.4)).toBeLessThan(vitalityOf(0.3, 0));
  });

  it('puts an ordinary volume day mid-scale and keeps the axis bounded', () => {
    expect(activityOf(1)).toBeGreaterThan(0.4);
    expect(activityOf(1)).toBeLessThan(0.65);
    expect(activityOf(0)).toBe(0);
    expect(activityOf(50)).toBeLessThanOrEqual(1);
    expect(activityOf(3)).toBeGreaterThan(activityOf(1));
  });

  it('never lets age or tenure touch health', () => {
    // The load-bearing separation: an old company is a big tree, not a well one.
    const old = INSTRUMENTS.find((i) => i.listedYear < 1930)!;
    const young = INSTRUMENTS.find((i) => i.listedYear > 1990)!;
    const position = { side: 'long' as const, quantity: 1, costBasis: 10, openedAt: NOW };
    expect(maturityOf(old, position, NOW)).toBeGreaterThan(
      maturityOf(young, position, NOW),
    );
    // And maturity is bounded, so a 1891 listing does not overflow the axis.
    expect(maturityOf(old, position, NOW)).toBeLessThanOrEqual(1);
  });

  it('keeps every axis inside its range for every plant', () => {
    for (const plant of plants) {
      for (const axis of ['vitality', 'activity', 'maturity'] as const) {
        expect(plant[axis], `${plant.label} ${axis}`).toBeGreaterThanOrEqual(0);
        expect(plant[axis], `${plant.label} ${axis}`).toBeLessThanOrEqual(1);
      }
      expect(plant.trend).toBeGreaterThanOrEqual(-1);
      expect(plant.trend).toBeLessThanOrEqual(1);
    }
  });

  it('clamps trend rather than letting a spike leave the axis', () => {
    expect(trendOf(99)).toBe(1);
    expect(trendOf(-99)).toBe(-1);
    expect(trendOf(0)).toBe(0);
  });
});

describe('staleness, on a source that is shut most of the time', () => {
  it('clears the longest legitimate closure', () => {
    // A threshold under a holiday weekend would grey the entire garden every
    // time one came round, which is the failure that makes the state useless.
    expect(MARKET_STALE_AFTER_MS).toBeGreaterThan(LONGEST_CLOSURE_MS);
  });

  it('leaves the book fresh over an ordinary weekend', () => {
    // Saturday afternoon: every instrument last printed on Friday and none of
    // them is stale, because nothing is wrong.
    const saturday = Date.UTC(2026, 3, 18, 18, 0);
    const weekend = translateMarketSnapshot(generateMarketSnapshot(saturday), {
      asOf: saturday,
    });
    const live = Object.values(weekend.nodes).filter(
      (n) => n.kind === 'plant' && !n.blights.some((b) => b.id.endsWith('-halt')),
    );
    for (const plant of live) {
      expect(isStale(plant, saturday, MARKET_STALE_AFTER_MS), plant.label).toBe(false);
    }
  });

  it('greys the halted instrument, and only that one', () => {
    const haltedSymbol = snapshot.halts[0].symbol;
    const halted = translated.nodes[instrumentNodeId(haltedSymbol)];
    expect(isStale(halted, NOW, MARKET_STALE_AFTER_MS)).toBe(true);

    const others = plants.filter((p) => p.id !== halted.id);
    const stale = others.filter((p) => isStale(p, NOW, MARKET_STALE_AFTER_MS));
    expect(stale.map((p) => p.label)).toEqual([]);
  });

  it('reaches staleness by the bars stopping, not by an edited timestamp', () => {
    // The honesty check. `updatedAt` is the last close on the tape, so the halt
    // produces the state on its own.
    const haltedSymbol = snapshot.halts[0].symbol;
    const node = translated.nodes[instrumentNodeId(haltedSymbol)];
    const own = barsBySymbol(snapshot)[haltedSymbol];
    expect(node.updatedAt).toBe(own[own.length - 1].closeAt);
    expect(staleness(node, NOW, MARKET_STALE_AFTER_MS)).toBeGreaterThan(1);
  });

  it('names the halt as a blight so the reason is readable, not just the grey', () => {
    const haltedSymbol = snapshot.halts[0].symbol;
    const node = translated.nodes[instrumentNodeId(haltedSymbol)];
    expect(node.blights.some((b) => b.id.endsWith('-halt'))).toBe(true);
  });
});

describe('history', () => {
  it('backfills both grains for every instrument', () => {
    for (const plant of plants) {
      expect(translated.history[plant.id], plant.label).toBeDefined();
      expect(translated.archive[plant.id], plant.label).toBeDefined();
    }
  });

  it('reads a past cursor through the archive rather than falling back to live', () => {
    const plant = plants.find((p) => !p.blights.some((b) => b.id.endsWith('-halt')))!;
    const monthAgo = NOW - 30 * 24 * 60 * 60_000;
    const then = vitalsAt(plant, translated.history[plant.id], monthAgo, translated.archive[plant.id]);
    expect(then).toBeDefined();
    expect(then.vitality).toBeGreaterThanOrEqual(0);
    expect(then.vitality).toBeLessThanOrEqual(1);
  });

  it('leaves slots before the position existed unwritten', () => {
    // Never a plausible number for an unrecorded past: a flat line of those is
    // indistinguishable from data.
    for (const plant of plants) {
      const archive = translated.archive[plant.id];
      const written = [...archive.slots].filter((s) => s >= 0).length;
      expect(written).toBeGreaterThan(0);
      expect(written).toBeLessThanOrEqual(archive.capacity);
    }
  });

  it('does not move a plant that the market has not repriced', () => {
    // Two cursors inside the same overnight gap must read identically, or the
    // garden animates through a night when nothing traded.
    const plant = plants.find((p) => !p.blights.some((b) => b.id.endsWith('-halt')))!;
    const history = translated.history[plant.id];
    const archive = translated.archive[plant.id];
    const midnight = Date.UTC(2026, 3, 15, 3, 0);
    const a = vitalsAt(plant, history, midnight, archive);
    const b = vitalsAt(plant, history, midnight + 60 * 60_000, archive);
    expect(a.vitality).toBeCloseTo(b.vitality, 10);
  });
});

describe('correlation', () => {
  const at = NOW;
  const mk = (closes: number[]): Bar[] =>
    closes.map((close, i) => ({
      symbol: 'X',
      closeAt: at - (closes.length - i) * 86_400_000,
      open: close,
      high: close,
      low: close,
      close,
      volume: 1,
    }));

  it('is 1 for a series against itself and -1 against its mirror', () => {
    const a = mk([10, 11, 10.5, 12, 11.5, 13]);
    expect(correlationOf(a, a, at)).toBeCloseTo(1, 6);

    // Same close times, exactly opposing daily moves.
    const mirror = a.map((bar, i) => ({
      ...bar,
      close: i === 0 ? bar.close : 0,
    }));
    let price = 10;
    for (let i = 1; i < a.length; i++) {
      const move = a[i].close / a[i - 1].close - 1;
      price *= 1 - move;
      mirror[i].close = price;
    }
    expect(correlationOf(a, mirror, at)).toBeLessThan(-0.9);
  });

  it('pairs only bars that share a close time', () => {
    // An instrument that stopped must not be lined up against the wrong days,
    // which is how two unrelated things come out perfectly correlated.
    const a = mk([10, 11, 12, 13, 14, 15]);
    const short = a.slice(0, 3);
    expect(Math.abs(correlationOf(a, short, at))).toBeLessThanOrEqual(1);
  });

  it('says nothing rather than something wrong when there is too little overlap', () => {
    expect(correlationOf(mk([10, 11]), mk([10, 9]), at)).toBe(0);
    expect(correlationOf([], [], at)).toBe(0);
  });
});

describe('identity', () => {
  it('marks each plant with its ticker and names it with the company', () => {
    const apple = translated.nodes[instrumentNodeId('AAPL')];
    expect(apple.label).toBe('Apple');
    // Truncated to fit the roundel; the name beside it carries the identity.
    expect(apple.emblem?.mark).toBe('AAP');
    const gs = translated.nodes[instrumentNodeId('GS')];
    expect(gs.emblem?.mark).toBe('GS');
  });

  it('builds a bed id that sorts and a node id that is stable', () => {
    expect(bedIdFor(SECTORS[0])).toMatch(/^mkt-01-/);
    expect(instrumentNodeId('AAPL')).toBe('mkt-AAPL');
  });

  it('puts the numbers a person would ask for in raw, and nothing visual', () => {
    const raw = plants[0].raw as Record<string, unknown>;
    for (const key of ['symbol', 'side', 'quantity', 'costBasis', 'price', 'returnPct']) {
      expect(raw, `raw is missing ${key}`).toHaveProperty(key);
    }
  });
});
