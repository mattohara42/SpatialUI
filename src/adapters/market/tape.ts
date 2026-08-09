import { mulberry32, hashString } from '../../lsystem/random';
import { INSTRUMENTS } from './instruments';
import {
  DAY_MS,
  HOUR_MS,
  hourlyCloses,
  previousClose,
  tradingDaysBack,
} from './session';
import type { Bar, Halt, Instrument, Lot, MarketSnapshot, MarketSource } from './types';

/**
 * The tape, generated.
 *
 * There is no outbound network access to a market data vendor from here, which
 * is the same reason the league's season is generated, so this stands in for a
 * feed the way `syntheticNflSource` does — behind the same one-method interface,
 * so a live adapter is a swap and nothing downstream learns of it.
 *
 * What it produces is deliberately feed-shaped and deliberately awkward:
 *
 * - **Only closed bars.** The forming bar is not a fact yet.
 * - **Bars only when the market was open.** Nights and weekends are gaps in the
 *   record rather than flat prints, because that is what they are, and a
 *   derivation that quietly filled them would be inventing trades.
 * - **A halted instrument.** One symbol stops printing partway through, which is
 *   how the staleness state is reached honestly here — no timestamp is edited,
 *   the bars simply stop and the last one recedes.
 *
 * The price process is a random walk with drift and per-instrument volatility,
 * seeded off the symbol. It is not a model of anything and does not pretend to
 * be; it exists so that the shapes downstream have something with the right
 * statistics to chew on — trends that persist, days that gap, and volume that
 * spikes when the move is large.
 */

/** Trading days of history generated. Enough to fill the daily archive. */
const SESSIONS = 130;

/** Hourly bars are only kept for the recent stretch the fine grain can hold. */
const INTRADAY_SESSIONS = 8;

export interface TapeOptions {
  seed?: number;
  sessions?: number;
  /** Symbol to halt partway through, or null for none. */
  halt?: string | null;
}

/**
 * The starting price of an instrument, and how violently it moves.
 *
 * Both are seeded off the symbol so a given ticker is the same instrument every
 * run — the garden must not reshuffle under a reload any more than it does under
 * a telemetry tick.
 */
function characterOf(symbol: string, seed: number) {
  const rng = mulberry32(seed ^ hashString(symbol));
  return {
    start: 18 + rng() * 320,
    /** Daily volatility, roughly 0.9% to 3.2%. */
    vol: 0.009 + rng() * 0.023,
    /**
     * Per-session drift, in **log space** — see the walk below for why that
     * matters. Centred slightly positive and spread wide enough that the book
     * holds real winners and real losers rather than one mood.
     */
    drift: (rng() - 0.35) * 0.0022,
    baseVolume: 1.2e6 + rng() * 9e6,
  };
}

export function generateMarketSnapshot(
  now: number = Date.now(),
  options: TapeOptions = {},
): MarketSnapshot {
  const { seed = 20_260_301, sessions = SESSIONS, halt = 'SLB' } = options;

  // Walk forward from the oldest session so the series compounds in the
  // direction time runs. `tradingDaysBack` hands them back newest first.
  const days = tradingDaysBack(now, sessions).reverse();

  const bars: Bar[] = [];
  const halts: Halt[] = [];

  // A halt lands two thirds of the way through the recent stretch, so the
  // instrument has plenty of history and then visibly stops.
  const haltAt = days.length
    ? days[Math.max(0, days.length - Math.floor(INTRADAY_SESSIONS * 0.6))]
    : now;

  for (const instrument of INSTRUMENTS) {
    const halted = halt === instrument.symbol;
    if (halted) {
      halts.push({
        symbol: instrument.symbol,
        since: haltAt,
        reason: 'Trading halted pending news',
      });
    }
    bars.push(
      ...seriesFor(instrument, days, seed, halted ? haltAt : Infinity, now),
    );
  }

  bars.sort((a, b) => a.closeAt - b.closeAt);

  return {
    fetchedAt: now,
    instruments: [...INSTRUMENTS],
    bars,
    lots: buildLots(bars, days, seed),
    halts,
    provenance: {
      source: 'synthetic-tape',
      live: false,
      note:
        'Symbols, names, sectors and listing years are real. Prices, volumes, ' +
        'fills and the halt are seeded fiction standing in for a live feed.',
    },
  };
}

/**
 * One instrument's series.
 *
 * Daily bars across the whole stretch, plus hourly bars for the last few
 * sessions — the two grains the history buffers keep, produced at the source
 * rather than resampled downstream, because a feed that only ever gave you
 * dailies genuinely cannot tell you what happened at eleven o'clock.
 */
function seriesFor(
  instrument: Instrument,
  days: number[],
  seed: number,
  haltAt: number,
  now: number,
): Bar[] {
  const { start, vol, drift, baseVolume } = characterOf(instrument.symbol, seed);
  const rng = mulberry32(seed ^ hashString(`${instrument.symbol}:walk`));
  const out: Bar[] = [];

  let price = start;
  const intradayFrom = days.length - INTRADAY_SESSIONS;

  days.forEach((day, index) => {
    const closes = hourlyCloses(day);
    if (closes.length === 0) return;

    const sessionOpen = price;
    // An overnight gap, because a market does not resume where it stopped.
    price *= Math.exp(gauss(rng) * vol * 0.35);

    const fine = index >= intradayFrom;
    let high = price;
    let low = price;
    let stepOpen = price;

    for (let i = 0; i < closes.length; i++) {
      const closeAt = closes[i];
      // Each hourly step carries its share of the day's variance, so the daily
      // bar built from them has the volatility the instrument was given rather
      // than an accidental multiple of it.
      //
      // The step compounds in log space, and that is a correction rather than a
      // flourish. Written as `price *= 1 + drift + vol*z`, the walk's expected
      // log growth is `drift - vol²/2`: the variance eats the drift, and with
      // these volatilities it eats more than all of it. Every instrument then
      // decays for no reason anybody chose, and the whole book reads sickly —
      // which it did, at a median of six percent down, until this line changed.
      const step = vol / Math.sqrt(closes.length);
      price *= Math.exp(drift / closes.length + gauss(rng) * step);
      high = Math.max(high, price);
      low = Math.min(low, price);

      if (fine && closeAt <= now && closeAt < haltAt) {
        const move = Math.abs(price / stepOpen - 1);
        out.push({
          symbol: instrument.symbol,
          closeAt,
          open: round2(stepOpen),
          high: round2(Math.max(stepOpen, price)),
          low: round2(Math.min(stepOpen, price)),
          close: round2(price),
          // Volume follows the size of the move, which is the one real
          // regularity worth having: a quiet hour is a thin one.
          volume: Math.round((baseVolume / closes.length) * (0.55 + move * 26 + rng() * 0.5)),
        });
      }
      stepOpen = price;
    }

    const dailyClose = closes[closes.length - 1];
    if (dailyClose <= now && dailyClose < haltAt) {
      const move = Math.abs(price / sessionOpen - 1);
      out.push({
        symbol: instrument.symbol,
        closeAt: dailyClose,
        open: round2(sessionOpen),
        high: round2(high),
        low: round2(low),
        close: round2(price),
        volume: Math.round(baseVolume * (0.55 + move * 26 + rng() * 0.5)),
      });
    }
  });

  return out;
}

/**
 * The fills.
 *
 * Every instrument is held, most of them long and a few short, because a short
 * is the only thing in any source so far that makes `polarity` mean what it was
 * written to mean: the plant you want *not* to thrive. Entry prices are taken
 * from a real bar rather than invented, so a position's return is a fact about
 * the tape instead of a second number that can drift out of step with it.
 */
function buildLots(bars: Bar[], days: number[], seed: number): Lot[] {
  const lots: Lot[] = [];
  const rng = mulberry32(seed ^ 0x10f5);

  for (const instrument of INSTRUMENTS) {
    const own = bars.filter((b) => b.symbol === instrument.symbol);
    if (own.length === 0) continue;

    // Opened somewhere in the first two thirds of the record, so every position
    // has a history behind it and the return means something.
    const entryIndex = Math.floor(rng() * own.length * 0.6);
    const entry = own[entryIndex];

    // Roughly one in five is a short.
    const side = rng() < 0.2 ? 'short' : 'long';

    lots.push({
      id: `${instrument.symbol}-1`,
      symbol: instrument.symbol,
      side,
      quantity: Math.max(5, Math.round((4_000 / entry.close) * (0.5 + rng()))),
      price: entry.close,
      openedAt: entry.closeAt,
    });

    // A second lot on some names, so `positionAt` has averaging to do rather
    // than being a lookup wearing a function's clothes.
    if (rng() < 0.35 && entryIndex + 12 < own.length) {
      const add = own[entryIndex + 12];
      lots.push({
        id: `${instrument.symbol}-2`,
        symbol: instrument.symbol,
        side,
        quantity: Math.max(3, Math.round((2_000 / add.close) * (0.5 + rng()))),
        price: add.close,
        openedAt: add.closeAt,
      });
    }
  }

  void days;
  return lots.sort((a, b) => a.openedAt - b.openedAt);
}

/** Box–Muller, one half of it. Normal enough for a walk. */
function gauss(rng: () => number): number {
  const u = Math.max(1e-9, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The generated source. `snapshot(now)` is pure in `now` and the seed, so two
 * calls with the same arguments produce the same tape.
 */
export function syntheticMarketSource(options: TapeOptions = {}): MarketSource {
  return {
    name: 'synthetic-tape',
    snapshot: (now = Date.now()) => generateMarketSnapshot(now, options),
  };
}

export { DAY_MS, HOUR_MS, previousClose };
