import { describe, expect, it } from 'vitest';
import { SOURCES, dueAt, dueSources } from './sources';
import { useEcosystem } from './ecosystemStore';
import {
  HOUR_MS,
  generateMarketSnapshot,
  hourlyCloses,
  nextBarClose,
  previousClose,
  sessionOn,
  syntheticMarketSource,
  type Bar,
  type MarketSnapshot,
} from '../adapters/market';
import {
  MARKET_GARDEN_ID,
  MARKET_STALE_SCHEDULE,
  translateMarketSnapshot,
} from '../translation/market';
import { NFL_GARDEN_ID, NFL_STALE_AFTER_MS } from '../translation/nfl';
import { isStale } from '../ecosystem/staleness';
import type { EcosystemNode } from '../ecosystem/types';

/** A Tuesday, mid-session. */
const NOON = Date.UTC(2026, 3, 14, 17, 0);

const plant = (id: string, updatedAt: number, gardenId = MARKET_GARDEN_ID) =>
  ({
    id,
    parentId: null,
    gardenId,
    label: id,
    domain: 'markets',
    kind: 'plant',
    polarity: 'nurture',
    vitality: 0.5,
    activity: 0.5,
    maturity: 0.5,
    trend: 0,
    blights: [],
    updatedAt,
  }) as EcosystemNode;

const asMap = (...nodes: EcosystemNode[]) =>
  Object.fromEntries(nodes.map((n) => [n.id, n]));

/**
 * The settled part of the record: bars old enough that no grain question hangs
 * over them.
 *
 * Comparing whole bar lists would be the wrong test twice over. The hourly grain
 * is a retention window — only the last few sessions carry intraday bars — so a
 * later snapshot legitimately holds fewer at the old end and more at the new.
 * And a session's closing hourly bar shares its `closeAt` with that session's
 * daily bar, so the pair cannot be told apart by symbol and time alone.
 *
 * Thirty days back is well clear of both: one bar per instrument per session,
 * and nothing about them may ever move.
 */
const settled = (snapshot: MarketSnapshot): Bar[] =>
  snapshot.bars.filter((b) => b.closeAt < NOON - 30 * 24 * HOUR_MS);

function expectPastUnchanged(first: MarketSnapshot, later: MarketSnapshot) {
  const before = settled(first);
  // Guard against the assertion passing vacuously.
  expect(before.length).toBeGreaterThan(1000);
  expect(settled(later)).toEqual(before);
}

describe('a source asked twice', () => {
  it('extends the record rather than re-rolling it', () => {
    // The property the poll rests on. A feed whose past changes when you ask it
    // a second time is not standing in for a feed: history already recorded
    // would disagree with the source it came from.
    const source = syntheticMarketSource();
    const first = source.snapshot(NOON);
    const later = source.snapshot(NOON + 3 * HOUR_MS);

    expect(later.bars.length).toBeGreaterThan(first.bars.length);
    expectPastUnchanged(first, later);
  });

  it('holds the record still across a day boundary, which is where it used to slide', () => {
    // The recorded caveat this was written to remove: counting the window back
    // from `now` moved every bar when the day rolled over, so a tab open past
    // midnight watched its whole history re-price.
    const source = syntheticMarketSource();
    const first = source.snapshot(NOON);
    const tomorrow = source.snapshot(NOON + 24 * HOUR_MS);

    expectPastUnchanged(first, tomorrow);
  });

  it('does not move its own halt forward under itself', () => {
    const source = syntheticMarketSource();
    const first = source.snapshot(NOON);
    const later = source.snapshot(NOON + 2 * 24 * HOUR_MS);

    expect(later.halts).toEqual(first.halts);

    // The halted symbol stays stopped rather than quietly resuming: two days on,
    // it has still printed nothing past the halt.
    const { symbol, since } = first.halts[0];
    const after = later.bars.filter((b) => b.symbol === symbol);
    expect(after.length).toBeGreaterThan(0);
    for (const bar of after) expect(bar.closeAt).toBeLessThan(since);
  });

  it('still answers a one-shot question the way it always did', () => {
    // An unanchored call is unchanged: the window is measured back from `now`,
    // which is right for a caller that asks once. Only a source instance anchors.
    expect(generateMarketSnapshot(NOON)).toEqual(generateMarketSnapshot(NOON));
  });
});

describe('when a source is due', () => {
  it('reads the due time off the freshest plant, not the stalest', () => {
    // A halted symbol is legitimately silent and permanently overdue. Taking the
    // stalest would have it demanding a poll on every beat, forever.
    const lastClose = previousClose(NOON)!;
    const nodes = asMap(
      plant('fresh', lastClose),
      plant('halted', lastClose - 5 * 24 * HOUR_MS),
    );
    expect(dueAt(nodes, MARKET_GARDEN_ID, MARKET_STALE_SCHEDULE)).toBe(
      nextBarClose(lastClose),
    );
  });

  it('asks again exactly when the calendar says a bar should have printed', () => {
    const lastClose = previousClose(NOON)!;
    const nodes = asMap(plant('fresh', lastClose));
    const due = nextBarClose(lastClose)!;

    expect(dueSources(nodes, due - 1)).toEqual([]);
    expect(dueSources(nodes, due).map((s) => s.gardenId)).toEqual([MARKET_GARDEN_ID]);
  });

  it('asks for nothing at all while the exchange is shut', () => {
    // Saturday. The whole weekend passes without a single poll, because the
    // source has not promised anything until Monday.
    const friday = sessionOn(Date.UTC(2026, 3, 17, 15, 0)).close;
    const nodes = asMap(plant('fresh', friday));
    for (const hours of [3, 12, 24, 40]) {
      expect(dueSources(nodes, friday + hours * HOUR_MS), `+${hours}h`).toEqual([]);
    }
    // And then does, on Monday's first bar.
    const monday = hourlyCloses(Date.UTC(2026, 3, 20, 15, 0))[0];
    expect(dueSources(nodes, monday).map((s) => s.gardenId)).toEqual([MARKET_GARDEN_ID]);
  });

  it('never polls a source whose fiction is anchored to when it was generated', () => {
    // The league's season slides rather than extends, so re-asking would move
    // every result the history already recorded. It costs nothing: its next
    // reading is a week out either way.
    const league = SOURCES.find((s) => s.gardenId === NFL_GARDEN_ID)!;
    expect(league.pollable).toBe(false);

    const nodes = asMap(plant('club', NOON - 30 * 24 * HOUR_MS, NFL_GARDEN_ID));
    expect(dueAt(nodes, NFL_GARDEN_ID, NFL_STALE_AFTER_MS)).toBe(
      NOON - 30 * 24 * HOUR_MS + NFL_STALE_AFTER_MS,
    );
    // Overdue by weeks, and still never asked.
    expect(dueSources(nodes, NOON)).toEqual([]);
  });

  it('has nothing to say about a garden it has no plants for', () => {
    expect(dueAt({}, MARKET_GARDEN_ID, MARKET_STALE_SCHEDULE)).toBeNull();
    expect(dueSources({}, NOON)).toEqual([]);
  });
});

describe('the store, polling for real', () => {
  // Against the composed ecosystem rather than a fixture, because the thing most
  // likely to break is the wiring: a poll that re-reads a source and then fails
  // to commit it looks exactly like a poll that was never due.
  const marketPlants = () =>
    Object.values(useEcosystem.getState().nodes).filter(
      (n) => n.gardenId === MARKET_GARDEN_ID && n.kind === 'plant',
    );

  it('asks for nothing on an ordinary beat', () => {
    // The common case, and the one that has to stay cheap: the sources were read
    // moments ago at composition, so nothing is owed yet.
    expect(useEcosystem.getState().poll()).toEqual([]);
  });

  it('refreshes the garden once the calendar has moved past due', () => {
    const before = new Map(marketPlants().map((n) => [n.id, n.updatedAt]));
    expect(before.size).toBeGreaterThan(0);

    // Far enough ahead that a bar is certainly owed whenever these tests happen
    // to run — including over a weekend, when nothing would be due for days.
    const later = Date.now() + 30 * 24 * HOUR_MS;
    expect(useEcosystem.getState().poll(later)).toEqual([MARKET_GARDEN_ID]);

    const after = marketPlants();
    expect(after).toHaveLength(before.size);
    const moved = after.filter((n) => n.updatedAt > (before.get(n.id) ?? Infinity));
    // Every instrument still printing has a newer last bar. The halted one does
    // not, and must not: nothing edits its timestamp.
    expect(moved.length).toBeGreaterThan(before.size - 3);

    const halted = after.filter((n) => n.blights.some((b) => b.id.endsWith('-halt')));
    for (const node of halted) {
      expect(node.updatedAt, node.label).toBe(before.get(node.id));
    }
  });

  it('leaves the history it already recorded alone', () => {
    // A re-read produces backfilled buffers; committing them over the live ones
    // would be the app overwriting a past it had watched happen.
    const plant = marketPlants()[0];
    const buffer = useEcosystem.getState().history[plant.id];
    expect(buffer).toBeDefined();

    const identity = useEcosystem.getState().history[plant.id];
    useEcosystem.getState().poll(Date.now() + 31 * 24 * HOUR_MS);
    expect(useEcosystem.getState().history[plant.id]).toBe(identity);
  });
});

describe('the poll closes the loop staleness opened', () => {
  it('keeps a polled garden fresh where an unpolled one goes stale', () => {
    // The whole point as one comparison, against a source instance of this
    // test's own so its anchor is not shared with the module-level registry.
    const source = syntheticMarketSource();
    const livePlants = (now: number) =>
      Object.values(translateMarketSnapshot(source.snapshot(now), { asOf: now }).nodes)
        .filter((n) => n.kind === 'plant')
        .filter((n) => !n.blights.some((b) => b.id.endsWith('-halt')));

    const atNoon = livePlants(NOON);
    const due = nextBarClose(Math.max(...atNoon.map((n) => n.updatedAt)))!;
    // Two bars past due: the grace is spent, and a feed nobody asked is dead.
    const late = due + 2 * HOUR_MS + 1;

    for (const node of atNoon) {
      expect(isStale(node, late, MARKET_STALE_SCHEDULE), `${node.label} unasked`).toBe(true);
    }
    for (const node of livePlants(late)) {
      expect(isStale(node, late, MARKET_STALE_SCHEDULE), `${node.label} asked`).toBe(false);
    }
  });
});
