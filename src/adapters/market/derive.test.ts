import { describe, expect, it } from 'vitest';
import {
  barsBySymbol,
  barsThrough,
  countThrough,
  drawdownAt,
  lastBarAt,
  momentumAt,
  positionAt,
  priceAt,
  returnSince,
  volatilityAt,
  volumeRatioAt,
} from './derive';
import { generateMarketSnapshot } from './tape';
import { isOpen, isTradingDay } from './session';
import type { Bar, Lot } from './types';

const T0 = Date.UTC(2026, 3, 15, 21, 0);
const H = 60 * 60_000;

function bar(closeAt: number, close: number, volume = 1000): Bar {
  return { symbol: 'TEST', closeAt, open: close, high: close, low: close, close, volume };
}

/** Closes 10, 12, 9, 11 an hour apart. */
const BARS: Bar[] = [
  bar(T0, 10),
  bar(T0 + H, 12),
  bar(T0 + 2 * H, 9),
  bar(T0 + 3 * H, 11),
];

describe('as-of derivation', () => {
  it('counts only the bars that had closed', () => {
    expect(countThrough(BARS, T0 - 1)).toBe(0);
    expect(countThrough(BARS, T0)).toBe(1);
    expect(countThrough(BARS, T0 + 2 * H)).toBe(3);
    expect(countThrough(BARS, T0 + 99 * H)).toBe(4);
  });

  it('never includes a bar that closes exactly after the cursor', () => {
    // The boundary is the whole contract: a bar closing at the cursor has
    // happened, one closing a millisecond later has not.
    expect(barsThrough(BARS, T0 + H)).toHaveLength(2);
    expect(barsThrough(BARS, T0 + H - 1)).toHaveLength(1);
  });

  it('reads the price as of any moment, and nothing before the record', () => {
    expect(priceAt(BARS, T0 - 1)).toBeNull();
    expect(priceAt(BARS, T0)).toBe(10);
    expect(priceAt(BARS, T0 + 2 * H + 59 * 60_000)).toBe(9);
    expect(lastBarAt(BARS, T0 + 3 * H)?.close).toBe(11);
  });

  it('answers the same for a past moment as it did when that was now', () => {
    // The property the whole scrub rests on: history and live are one function.
    for (const at of [T0, T0 + H, T0 + 2 * H, T0 + 3 * H]) {
      const thenSlice = barsThrough(BARS, at);
      expect(priceAt(thenSlice, at)).toBe(priceAt(BARS, at));
      expect(drawdownAt(thenSlice, at, null)).toBeCloseTo(drawdownAt(BARS, at, null), 12);
    }
  });
});

describe('positions from fills', () => {
  const lots: Lot[] = [
    { id: 'a', symbol: 'TEST', side: 'long', quantity: 10, price: 10, openedAt: T0 },
    { id: 'b', symbol: 'TEST', side: 'long', quantity: 30, price: 14, openedAt: T0 + 2 * H },
  ];

  it('holds nothing before the first fill', () => {
    const position = positionAt(lots, T0 - 1);
    expect(position.quantity).toBe(0);
    expect(position.costBasis).toBeNull();
    expect(position.openedAt).toBeNull();
  });

  it('averages the lots opened by then, and only those', () => {
    const first = positionAt(lots, T0 + H);
    expect(first.quantity).toBe(10);
    expect(first.costBasis).toBe(10);

    const both = positionAt(lots, T0 + 2 * H);
    expect(both.quantity).toBe(40);
    // (10*10 + 30*14) / 40
    expect(both.costBasis).toBeCloseTo(13, 10);
    expect(both.openedAt).toBe(T0);
  });

  it('returns against entry, unsigned by side', () => {
    // The reading that makes polarity mean something: this is the move, and
    // whether the move is good news is decided elsewhere.
    expect(returnSince(10, 11)).toBeCloseTo(0.1, 10);
    expect(returnSince(10, 9)).toBeCloseTo(-0.1, 10);
    expect(returnSince(null, 11)).toBe(0);
    expect(returnSince(10, null)).toBe(0);
  });
});

describe('drawdown', () => {
  it('measures from the peak since entry, not from the record start', () => {
    // Peak is 12 at T0+H; price is 9 at T0+2H. A quarter off the high.
    expect(drawdownAt(BARS, T0 + 2 * H, T0)).toBeCloseTo(0.25, 10);
    // Entering after the peak, the high is 9 and there is no drawdown at all.
    expect(drawdownAt(BARS, T0 + 2 * H, T0 + 2 * H)).toBe(0);
  });

  it('is zero at a new high and never negative', () => {
    const rising = [bar(T0, 10), bar(T0 + H, 11), bar(T0 + 2 * H, 12)];
    expect(drawdownAt(rising, T0 + 2 * H, null)).toBe(0);
  });

  it('is zero when nothing has printed', () => {
    expect(drawdownAt(BARS, T0 - 1, null)).toBe(0);
  });
});

describe('volume and momentum', () => {
  it('reads volume against the instrument own average, not in shares', () => {
    const quiet = [bar(T0, 10, 100), bar(T0 + H, 10, 100), bar(T0 + 2 * H, 10, 300)];
    expect(volumeRatioAt(quiet, T0 + 2 * H)).toBeCloseTo(3, 10);
    // A penny stock and a blue chip both sit at 1 on an ordinary day.
    const flat = [bar(T0, 10, 5), bar(T0 + H, 10, 5), bar(T0 + 2 * H, 10, 5)];
    expect(volumeRatioAt(flat, T0 + 2 * H)).toBeCloseTo(1, 10);
  });

  it('signs momentum by whether the recent move beats the longer one', () => {
    const turning = [
      bar(T0, 10), bar(T0 + H, 9), bar(T0 + 2 * H, 8), bar(T0 + 3 * H, 9), bar(T0 + 4 * H, 10),
    ];
    expect(momentumAt(turning, T0 + 4 * H, 2, 4)).toBeGreaterThan(0);

    const rolling = [
      bar(T0, 10), bar(T0 + H, 11), bar(T0 + 2 * H, 12), bar(T0 + 3 * H, 11), bar(T0 + 4 * H, 10),
    ];
    expect(momentumAt(rolling, T0 + 4 * H, 2, 4)).toBeLessThan(0);
  });

  it('is calm about too little data rather than dividing by nothing', () => {
    expect(momentumAt([], T0)).toBe(0);
    expect(momentumAt([bar(T0, 10)], T0)).toBe(0);
    expect(volatilityAt([bar(T0, 10)], T0)).toBe(0);
    expect(volumeRatioAt([], T0)).toBe(0);
  });
});

describe('the generated tape', () => {
  const now = Date.UTC(2026, 3, 15, 21, 0);
  const snapshot = generateMarketSnapshot(now);

  it('is deterministic for a seed and a moment', () => {
    const again = generateMarketSnapshot(now);
    expect(again.bars.length).toBe(snapshot.bars.length);
    expect(again.bars[0]).toEqual(snapshot.bars[0]);
    expect(again.lots[0]).toEqual(snapshot.lots[0]);
  });

  it('never prints a bar in the future', () => {
    for (const b of snapshot.bars) expect(b.closeAt).toBeLessThanOrEqual(now);
  });

  it('only prints bars the market was open for', () => {
    for (const b of snapshot.bars) {
      expect(isTradingDay(b.closeAt)).toBe(true);
      // A bar closes on the bell or inside the session, never overnight.
      expect(isOpen(b.closeAt) || isOpen(b.closeAt - 1)).toBe(true);
    }
  });

  it('keeps every bar internally consistent', () => {
    for (const b of snapshot.bars) {
      expect(b.high).toBeGreaterThanOrEqual(b.low);
      expect(b.high).toBeGreaterThanOrEqual(b.close);
      expect(b.low).toBeLessThanOrEqual(b.close);
      expect(b.close).toBeGreaterThan(0);
      expect(b.volume).toBeGreaterThan(0);
    }
  });

  it('never prints two bars for one symbol at one instant', () => {
    // The tape used to emit a session's hourly bars *and* its daily bar, which
    // close at the same moment, so the recent stretch carried a duplicate
    // `closeAt` with the whole day's volume on it. No real feed does that,
    // which is why nothing downstream defended against it.
    for (const [symbol, own] of Object.entries(barsBySymbol(snapshot))) {
      const seen = new Set<number>();
      for (const bar of own) {
        expect(seen.has(bar.closeAt), `${symbol} printed twice at ${bar.closeAt}`).toBe(false);
        seen.add(bar.closeAt);
      }
    }
  });

  it('keeps volume against its own average near one, so activity can read', () => {
    // The damage the duplicate did, asserted where it showed: `volumeRatioAt`
    // compares the latest bar against the mean of the previous twenty, so a day
    // measured against a window of hours read about 5.7. `activityOf` saturates
    // at 3, which pinned thirty-one of thirty-two holdings to exactly 1.00 and
    // left the axis driving every plant's animation rate with no information in
    // it. An ordinary bar should sit near its own recent normal.
    const bars = barsBySymbol(snapshot);
    const ratios = Object.values(bars)
      .filter((own) => own.length > 25)
      .map((own) => volumeRatioAt(own, snapshot.fetchedAt))
      .sort((a, b) => a - b);

    const median = ratios[Math.floor(ratios.length / 2)];
    expect(median).toBeGreaterThan(0.6);
    expect(median).toBeLessThan(1.8);
  });

  it('says in its provenance that it is not live', () => {
    expect(snapshot.provenance.live).toBe(false);
    expect(snapshot.provenance.note).toMatch(/fiction/i);
  });

  it('halts one instrument, and the halt really stops the bars', () => {
    expect(snapshot.halts).toHaveLength(1);
    const halt = snapshot.halts[0];
    const own = barsBySymbol(snapshot)[halt.symbol];
    for (const b of own) expect(b.closeAt).toBeLessThan(halt.since);

    // And the rest of the book kept printing after it, which is what makes this
    // a stale plant rather than a stale garden.
    const others = snapshot.bars.filter((b) => b.symbol !== halt.symbol);
    expect(others.some((b) => b.closeAt > halt.since)).toBe(true);
  });

  it('opens every position from a price that is actually on the tape', () => {
    const bars = barsBySymbol(snapshot);
    for (const lot of snapshot.lots) {
      const match = (bars[lot.symbol] ?? []).find((b) => b.closeAt === lot.openedAt);
      expect(match, `${lot.id} was opened off-tape`).toBeDefined();
      expect(match!.close).toBe(lot.price);
    }
  });

  it('holds a mix of longs and shorts, so polarity is exercised', () => {
    const sides = new Set(snapshot.lots.map((l) => l.side));
    expect(sides.has('long')).toBe(true);
    expect(sides.has('short')).toBe(true);
  });

  it('never has two lots of opposite sides in one symbol', () => {
    // One plant per instrument carries one polarity; a book that was long and
    // short the same name would have no honest way to render it.
    const bySymbol = new Map<string, Set<string>>();
    for (const lot of snapshot.lots) {
      (bySymbol.get(lot.symbol) ?? bySymbol.set(lot.symbol, new Set()).get(lot.symbol)!).add(
        lot.side,
      );
    }
    for (const [symbol, sides] of bySymbol) {
      expect(sides.size, `${symbol} is both long and short`).toBe(1);
    }
  });
});
