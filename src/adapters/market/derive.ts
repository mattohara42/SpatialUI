import type { Bar, Lot, MarketSnapshot, Side } from './types';

/**
 * Everything anyone wants to know, answered *as of a timestamp*.
 *
 * This is the rule the league established and the reason both sources can be
 * scrubbed at all: the live view and the history are the same functions called
 * at different times, so they cannot disagree. Nothing in here reads a clock.
 *
 * Where this source differs from the league is what it costs. A club's numbers
 * only move when a game goes final, so backfilling a season memoizes down to
 * about fourteen real computations per club. A price moves every bar. The
 * derivations are therefore written to be cheap per call and to take a
 * pre-sliced bar list where the caller has one, rather than relying on a cache
 * that this domain cannot fill.
 */

/** Bars for one symbol, ascending. The shape every derivation below wants. */
export function barsBySymbol(snapshot: MarketSnapshot): Record<string, Bar[]> {
  const out: Record<string, Bar[]> = {};
  for (const bar of snapshot.bars) {
    (out[bar.symbol] ??= []).push(bar);
  }
  for (const list of Object.values(out)) list.sort((a, b) => a.closeAt - b.closeAt);
  return out;
}

export function lotsBySymbol(snapshot: MarketSnapshot): Record<string, Lot[]> {
  const out: Record<string, Lot[]> = {};
  for (const lot of snapshot.lots) (out[lot.symbol] ??= []).push(lot);
  return out;
}

/**
 * The bars that had closed by `asOf`.
 *
 * A binary search rather than a filter: the daily and hourly grains together run
 * to a few hundred bars per symbol and the history backfill asks this question
 * once per slot per instrument, which is the loop that actually costs something
 * in this adapter.
 */
export function barsThrough(bars: Bar[], asOf: number): Bar[] {
  return bars.slice(0, countThrough(bars, asOf));
}

/** How many bars had closed by `asOf`. */
export function countThrough(bars: Bar[], asOf: number): number {
  let lo = 0;
  let hi = bars.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].closeAt <= asOf) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The last bar to have closed by `asOf`, or null before the record starts. */
export function lastBarAt(bars: Bar[], asOf: number): Bar | null {
  const count = countThrough(bars, asOf);
  return count > 0 ? bars[count - 1] : null;
}

/**
 * Last traded price as of a moment.
 *
 * Null rather than a guess when nothing has printed yet. The history backfill
 * treats that as "leave the slot unwritten", which is the same contract the
 * league's pre-season slots have: an unrecorded past must never be filled with
 * a plausible number, because a flat line of those reads as data.
 */
export function priceAt(bars: Bar[], asOf: number): number | null {
  return lastBarAt(bars, asOf)?.close ?? null;
}

/** A position: the net of every lot opened by `asOf`. */
export interface Position {
  side: Side;
  /** Net shares. Zero when nothing has been opened yet. */
  quantity: number;
  /** Weighted average entry, or null with no position. */
  costBasis: number | null;
  openedAt: number | null;
}

/**
 * What was held at a moment, from the fills that had happened by then.
 *
 * Lots of one side only, in this book — a source that let you be long and short
 * the same name at once would have to decide what the *plant* means, and one
 * plant per instrument with a single polarity is the honest shape for a garden.
 */
export function positionAt(lots: Lot[], asOf: number): Position {
  let quantity = 0;
  let cost = 0;
  let openedAt: number | null = null;
  let side: Side = 'long';

  for (const lot of lots) {
    if (lot.openedAt > asOf) continue;
    quantity += lot.quantity;
    cost += lot.quantity * lot.price;
    side = lot.side;
    openedAt = openedAt === null ? lot.openedAt : Math.min(openedAt, lot.openedAt);
  }

  return {
    side,
    quantity,
    costBasis: quantity > 0 ? cost / quantity : null,
    openedAt,
  };
}

/**
 * Return against the position's own entry, as a fraction.
 *
 * Deliberately *not* signed by side. This is how far the instrument has moved
 * since you took it on, and whether that is good news is `polarity`'s job — a
 * short on a stock that has doubled is a thriving weed, which is exactly the
 * reading the polarity concept was written for and the first source to use it
 * for something real.
 */
export function returnSince(costBasis: number | null, price: number | null): number {
  if (costBasis === null || price === null || costBasis <= 0) return 0;
  return price / costBasis - 1;
}

/**
 * Peak close since a moment, and how far below it the price now sits.
 *
 * Drawdown is the one number here that behaves like a symptom rather than a
 * level: a holding 30% off its high is a different thing from one merely flat,
 * even when the return against entry is the same, so it drives blights.
 */
export function drawdownAt(bars: Bar[], asOf: number, since: number | null): number {
  const count = countThrough(bars, asOf);
  if (count === 0) return 0;

  let peak = 0;
  for (let i = 0; i < count; i++) {
    const bar = bars[i];
    if (since !== null && bar.closeAt < since) continue;
    if (bar.close > peak) peak = bar.close;
  }
  if (peak <= 0) return 0;

  const price = bars[count - 1].close;
  return Math.max(0, 1 - price / peak);
}

/**
 * How busy, against this instrument's own recent normal.
 *
 * Relative rather than absolute, because volume in shares says more about the
 * share price than about interest, and a garden that made a penny stock the
 * busiest plant every day would be reporting the denominator.
 */
export function volumeRatioAt(bars: Bar[], asOf: number, window = 20): number {
  const count = countThrough(bars, asOf);
  if (count === 0) return 0;

  const recent = bars[count - 1].volume;
  const from = Math.max(0, count - 1 - window);
  let total = 0;
  let n = 0;
  for (let i = from; i < count - 1; i++) {
    total += bars[i].volume;
    n++;
  }
  if (n === 0) return 1;
  const average = total / n;
  return average > 0 ? recent / average : 1;
}

/**
 * Recent move against the longer one, as a signed fraction.
 *
 * The same shape as the league's trend — short window measured against a long
 * one — because the question is identical: is this thing doing better or worse
 * than it has been, which is a different question from how it is doing.
 */
export function momentumAt(
  bars: Bar[],
  asOf: number,
  shortWindow = 5,
  longWindow = 20,
): number {
  const count = countThrough(bars, asOf);
  if (count < 2) return 0;

  const price = bars[count - 1].close;
  const shortAgo = bars[Math.max(0, count - 1 - shortWindow)].close;
  const longAgo = bars[Math.max(0, count - 1 - longWindow)].close;
  if (shortAgo <= 0 || longAgo <= 0) return 0;

  const fast = price / shortAgo - 1;
  const slow = price / longAgo - 1;
  return fast - slow / (longWindow / shortWindow);
}

/**
 * Realised volatility over the recent window, as a per-bar standard deviation.
 *
 * Feeds nothing visual on its own; it is in `raw` for the inspection panel,
 * because "why is this one thrashing" is the first question a moving plant
 * provokes and the answer should be in the payload rather than inferred.
 */
export function volatilityAt(bars: Bar[], asOf: number, window = 20): number {
  const count = countThrough(bars, asOf);
  const from = Math.max(1, count - window);
  const returns: number[] = [];
  for (let i = from; i < count; i++) {
    const prev = bars[i - 1].close;
    if (prev > 0) returns.push(bars[i].close / prev - 1);
  }
  if (returns.length < 2) return 0;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance);
}
