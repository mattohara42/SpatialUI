import {
  INSTRUMENTS,
  LONGEST_CLOSURE_MS,
  SECTOR_LABELS,
  SECTORS,
  barsBySymbol,
  countThrough,
  drawdownAt,
  lastBarAt,
  lotsBySymbol,
  momentumAt,
  nextBarClose,
  positionAt,
  priceAt,
  returnSince,
  volatilityAt,
  volumeRatioAt,
  type Bar,
  type Instrument,
  type Lot,
  type MarketSnapshot,
  type Position,
  type SectorKey,
} from '../adapters/market';
import {
  DAY_MS as HISTORY_DAY_MS,
  DEFAULT_ARCHIVE_CAPACITY,
  HOUR_MS,
  createHistory,
  record as recordVitals,
  type VitalsHistory,
} from '../ecosystem/history';
import { inkFor, type Emblem } from '../ecosystem/labels';
import type { PlantingType } from '../ecosystem/planting';
import type { StaleSchedule } from '../ecosystem/staleness';
import type {
  Blight,
  BlightSeverity,
  EcosystemEdge,
  EcosystemNode,
  Vitals,
} from '../ecosystem/types';

/**
 * A book of positions as a garden.
 *
 * The second real source, and it was chosen because it disagrees with the first
 * one. The league satisfied every assumption the design had quietly been making;
 * a market breaks three of them, and what follows is mostly the record of what
 * broke and what it cost.
 *
 * **1. Polarity finally means something.** A short position is the first thing
 * in any source that is genuinely `suppress`: you own it and you want it to go
 * *down*. So `vitality` here is deliberately not "how is my P&L" — it is how far
 * the instrument has moved since you took it on, unsigned by side, and polarity
 * decides whether that reads as a healthy tree or a thriving weed. A short on a
 * stock that has run away from you grows into the most alarming thing in the
 * greenhouse, which is exactly what it is. Until now `suppress` was exercised
 * only by mock threat data.
 *
 * **2. The market is shut most of the time.** Staleness exists so that silence
 * never reads as health, and a market is silent every night and all weekend
 * without anything being wrong. The threshold is therefore sized to the longest
 * *legitimate* gap — a holiday weekend — exactly as the league's was sized to a
 * bye. What that costs is real and is stated in `session.ts` and ARCHITECTURE:
 * a feed that dies on Friday is not called stale until midweek. The genuine
 * staleness case here is a **trading halt**, which stops the bars on one symbol
 * while the rest of the book keeps printing.
 *
 * **3. Prices move constantly, so the history backfill does not collapse.** The
 * league memoizes a season down to about fourteen real computations per club
 * because a club's numbers only move when a game goes final. A price moves every
 * bar. The same memo is here, keyed on how many bars have closed, and it earns
 * far less — measured, and written down in ARCHITECTURE rather than guessed at.
 * That is the honest cost of a source with a real update rate.
 *
 * The axes:
 *
 * | axis | market | why |
 * | --- | --- | --- |
 * | vitality | move since entry, tempered by drawdown from the peak | where the holding stands *and* whether it is off its best |
 * | activity | volume against its own recent average | how busy, relative to itself, never in raw shares |
 * | maturity | years listed and how long held | how established — never how good |
 * | trend | recent move against the longer one | a stock down 20% that has turned is not one still falling |
 *
 * The load-bearing separation is the league's, restated: **an old company is a
 * big tree, not a healthy one**, and a position deep underwater is a wilting
 * tree, not a small one. Cross them and every blue chip looks well and every
 * recent buy looks like a seedling in trouble.
 */

export const MARKET_GARDEN_ID = 'markets';

/**
 * How many missed prints mean the vendor is gone rather than slow.
 *
 * One is not evidence: a bar can be published late, and a garden that greyed on
 * a single slow print would grey somewhere most days. Two in a row is a pattern
 * — the same reasoning, and roughly the same number, as the `for` duration on
 * any sane alerting rule. Held as a count of bars rather than a duration so it
 * tracks the source's own cadence instead of being a second thing to keep in
 * step with it.
 */
const GRACE_BARS = 2;

/**
 * When the book should next have spoken, and how late it may be before the
 * garden calls it silent.
 *
 * The exchange calendar answers the first part — `nextBarClose` is the adapter's
 * own function and the only thing that knows Friday's close is followed by
 * Monday's open — so a weekend costs nothing at all: nothing was due, so nothing
 * is late. That is what lets the second part be tight. The old single threshold
 * had to span the longest legitimate closure (`LONGEST_CLOSURE_MS`, very nearly
 * four days) and so could not flag a vendor that died on Friday evening until
 * the middle of the following week. This flags it two bars into Monday's
 * session, which is the first moment the silence means anything.
 *
 * `LONGEST_CLOSURE_MS` remains as the fallback, for the case where the calendar
 * cannot see a next session inside its horizon. That is unreachable with the
 * holidays above, and it is the old behaviour rather than a guess.
 */
export const MARKET_STALE_SCHEDULE: StaleSchedule = {
  dueAfter: (lastUpdate) => nextBarClose(lastUpdate) ?? lastUpdate + LONGEST_CLOSURE_MS,
  graceMs: GRACE_BARS * HOUR_MS,
};

/** Hours of hourly history backfilled per instrument. A week, as elsewhere. */
const DEFAULT_HISTORY_HOURS = 168;

/**
 * A planting per sector.
 *
 * Signal-free and fixed, like every planting. The constraint is the one the
 * league's assignment discovered: plantings do not show ill health equally
 * harshly — a struggling tree sheds to bare twigs, a struggling topiary merely
 * goes shaggy — and beds wrap into two rows, so loading one row with all the
 * tree forms would make that row look worse than the other for no reason at
 * all. Each row of four therefore gets two tree forms and two soft ones.
 */
const SECTOR_PLANTINGS: Record<SectorKey, PlantingType> = {
  // First row.
  technology: 'orchard',
  financials: 'topiary',
  'health-care': 'conifer-stand',
  energy: 'vegetable-rows',
  // Second row.
  consumer: 'vineyard',
  industrials: 'grove',
  utilities: 'hedge',
  materials: 'flower-border',
};

/**
 * Bed ids carry their position in the book.
 *
 * The layout sorts beds by id, so the prefix is what puts Technology at one end
 * and Materials at the other rather than leaving the order to the alphabet.
 * Same device as the league's conference prefix, and for the same reason: it
 * expresses an ordering the model has no container level for.
 */
export function bedIdFor(sector: SectorKey): string {
  const index = SECTORS.indexOf(sector);
  return `mkt-${String(index + 1).padStart(2, '0')}-${sector}`;
}

export function instrumentNodeId(symbol: string): string {
  return `mkt-${symbol}`;
}

export interface MarketTranslationOptions {
  asOf?: number;
  historyHours?: number;
}

export interface TranslatedMarket {
  nodes: Record<string, EcosystemNode>;
  edges: Record<string, EcosystemEdge>;
  history: Record<string, VitalsHistory>;
  archive: Record<string, VitalsHistory>;
}

/** Everything the book says about one instrument at one moment. */
export interface InstrumentReading {
  vitals: Vitals;
  price: number | null;
  position: Position;
  ret: number;
  drawdown: number;
  volumeRatio: number;
}

export function translateMarketSnapshot(
  snapshot: MarketSnapshot,
  options: MarketTranslationOptions = {},
): TranslatedMarket {
  const { asOf = snapshot.fetchedAt, historyHours = DEFAULT_HISTORY_HOURS } = options;

  const bars = barsBySymbol(snapshot);
  const lots = lotsBySymbol(snapshot);
  const halted = new Set(snapshot.halts.map((h) => h.symbol));

  const nodes: Record<string, EcosystemNode> = {};
  const edges: Record<string, EcosystemEdge> = {};
  const history: Record<string, VitalsHistory> = {};
  const archive: Record<string, VitalsHistory> = {};

  nodes[MARKET_GARDEN_ID] = {
    id: MARKET_GARDEN_ID,
    parentId: null,
    gardenId: MARKET_GARDEN_ID,
    label: 'Markets',
    domain: 'markets',
    kind: 'garden',
    polarity: 'nurture',
    vitality: 1,
    activity: 0.5,
    maturity: 1,
    trend: 0,
    blights: [],
    updatedAt: asOf,
    raw: {
      source: 'market',
      instruments: snapshot.instruments.length,
      fetchedAt: snapshot.fetchedAt,
      provenance: snapshot.provenance,
    },
  };

  for (const sector of SECTORS) {
    const members = INSTRUMENTS.filter((i) => i.sector === sector);
    if (members.length === 0) continue;

    const bedId = bedIdFor(sector);
    nodes[bedId] = {
      id: bedId,
      parentId: MARKET_GARDEN_ID,
      gardenId: MARKET_GARDEN_ID,
      label: SECTOR_LABELS[sector],
      domain: 'markets',
      kind: 'bed',
      polarity: 'nurture',
      plantingType: SECTOR_PLANTINGS[sector],
      vitality: 0.5,
      activity: 0.5,
      maturity: 0.5,
      trend: 0,
      blights: [],
      updatedAt: asOf,
    };

    for (const instrument of members) {
      const own = bars[instrument.symbol] ?? [];
      const ownLots = lots[instrument.symbol] ?? [];
      const reading = readInstrument(instrument, own, ownLots, asOf);
      const id = instrumentNodeId(instrument.symbol);
      const last = lastBarAt(own, asOf);

      nodes[id] = {
        id,
        parentId: bedId,
        gardenId: MARKET_GARDEN_ID,
        label: instrument.name,
        emblem: emblemFor(instrument),
        domain: 'markets',
        kind: 'plant',
        // The whole reason this source was worth building.
        polarity: reading.position.side === 'short' ? 'suppress' : 'nurture',
        ...reading.vitals,
        blights: blightsFor(instrument, reading, halted.has(instrument.symbol), snapshot, asOf),
        // The last time the market said anything about this instrument. A halted
        // symbol's recedes on its own; overnight every symbol shares the same
        // close, which is why the threshold has to clear a weekend.
        updatedAt: last?.closeAt ?? snapshot.fetchedAt,
        raw: rawFor(instrument, reading, own, asOf),
      };

      history[id] = backfill(own, ownLots, asOf, HOUR_MS, historyHours);
      archive[id] = backfill(
        own,
        ownLots,
        asOf,
        HISTORY_DAY_MS,
        DEFAULT_ARCHIVE_CAPACITY,
      );
    }

    // Sector peers, drawn as root grafts. `correlates` rather than `depends`:
    // two miners are not each other's dependency, they are tied together by the
    // thing they both sell. Strength is the real correlation of their daily
    // returns, so a graft is thick where the two genuinely move as one.
    for (const [a, b] of pairs(members)) {
      const strength = correlationOf(
        bars[a.symbol] ?? [],
        bars[b.symbol] ?? [],
        asOf,
      );
      const id = `${a.symbol}~${b.symbol}`;
      edges[id] = {
        id,
        gardenId: MARKET_GARDEN_ID,
        sourceId: instrumentNodeId(a.symbol),
        targetId: instrumentNodeId(b.symbol),
        kind: 'correlates',
        strength: Math.min(1, Math.abs(strength)),
        directed: false,
      };
    }
  }

  return { nodes, edges, history, archive };
}

/**
 * The mark on the tag.
 *
 * A ticker is the natural mark and four-letter ones do not fit: the roundel
 * holds three characters before it stops being readable at arm's length. The
 * mark is therefore truncated and the *label* carries the company's name in
 * full beside it, which is the division of work the tag was designed for — the
 * roundel is a glance, the line next to it is the identity.
 */
function emblemFor(instrument: Instrument): Emblem {
  return {
    mark: instrument.symbol.slice(0, 3),
    color: instrument.color,
    ink: inkFor(instrument.color),
  };
}

/** Everything about one instrument at one moment, from the events alone. */
export function readInstrument(
  instrument: Instrument,
  bars: Bar[],
  lots: Lot[],
  asOf: number,
): InstrumentReading {
  const position = positionAt(lots, asOf);
  const price = priceAt(bars, asOf);
  const ret = returnSince(position.costBasis, price);
  const drawdown = drawdownAt(bars, asOf, position.openedAt);
  const volumeRatio = volumeRatioAt(bars, asOf);

  return {
    vitals: {
      vitality: vitalityOf(ret, drawdown),
      activity: activityOf(volumeRatio),
      maturity: maturityOf(instrument, position, asOf),
      trend: trendOf(momentumAt(bars, asOf)),
    },
    price,
    position,
    ret,
    drawdown,
    volumeRatio,
  };
}

/**
 * How far the instrument has moved since it was taken on, less a penalty for
 * how far it sits below its own peak.
 *
 * Unsigned by side on purpose — see the note at the top of this file. A ±40%
 * move saturates the scale, which is wide enough that ordinary weeks live in
 * the readable middle and narrow enough that a genuine collapse bottoms out.
 *
 * Drawdown is **subtracted rather than averaged in**, and the difference is not
 * cosmetic. Averaging a "distance from the peak" term against the level means a
 * holding sitting exactly at its entry price — flat, untroubled, nothing to say
 * about it — scores 0.65 rather than 0.5, because being at its own high pays it
 * full marks on the second term. Every position in a calm market then reads
 * mildly healthy and the middle of the axis stops meaning anything. As a
 * deduction it does what it is for: it can only ever pull a plant down, and it
 * pulls hardest on the ones that have given back the most.
 *
 * The **deadband is the other half of that**, and it was measured rather than
 * guessed. A holding at 2% daily volatility is 10 to 20 percent off its high
 * most of the time simply from the walk; charging for that made the median
 * plant in the book read at 0.40 and turned the axis into a report on
 * volatility rather than on health. Nothing is deducted below the band, so
 * ordinary noise is free and only a genuine give-back registers.
 */
const DRAWDOWN_FREE = 0.1;
const DRAWDOWN_FULL = 0.45;

export function vitalityOf(ret: number, drawdown: number): number {
  const level = clamp01(0.5 + ret / 0.8);
  const excess = (drawdown - DRAWDOWN_FREE) / (DRAWDOWN_FULL - DRAWDOWN_FREE);
  return clamp01(level - 0.3 * clamp01(excess));
}

/**
 * Volume against its own recent average, squashed.
 *
 * A ratio of 1 is an ordinary day and lands mid-scale; three times normal
 * saturates. Relative because absolute share counts describe the share price,
 * not the interest.
 */
export function activityOf(volumeRatio: number): number {
  if (volumeRatio <= 0) return 0;
  return clamp01(Math.log(volumeRatio + 0.35) / Math.log(3.4) * 0.5 + 0.5);
}

/**
 * How established: how long the company has been listed, and how long this book
 * has held it. Never how well it is doing.
 */
export function maturityOf(
  instrument: Instrument,
  position: Position,
  asOf: number,
): number {
  const years = new Date(asOf).getUTCFullYear() - instrument.listedYear;
  const listed = clamp01(years / 70);
  const held =
    position.openedAt === null
      ? 0
      : clamp01((asOf - position.openedAt) / (120 * 24 * 60 * 60 * 1000));
  return clamp01(listed * 0.72 + held * 0.28);
}

/** Momentum, clamped into the axis. */
export function trendOf(momentum: number): number {
  return Math.max(-1, Math.min(1, momentum / 0.12));
}

/**
 * What is wrong with this holding.
 *
 * Drawdown is the symptom worth naming, because it is the one a level cannot
 * express: a position can be up on entry and still be in trouble. A halt is the
 * other, and it is the reason the staleness state is reachable in this garden at
 * all.
 */
export function blightsFor(
  instrument: Instrument,
  reading: InstrumentReading,
  halted: boolean,
  snapshot: MarketSnapshot,
  asOf: number,
): Blight[] {
  const blights: Blight[] = [];
  const { drawdown, position } = reading;

  if (position.quantity > 0 && drawdown >= 0.12) {
    const severity: BlightSeverity =
      drawdown >= 0.35 ? 'critical' : drawdown >= 0.22 ? 'error' : 'warn';
    blights.push({
      id: `${instrument.symbol}-drawdown`,
      severity,
      message: `${Math.round(drawdown * 100)}% below its peak since entry`,
      since: position.openedAt ?? asOf,
    });
  }

  if (halted) {
    const halt = snapshot.halts.find((h) => h.symbol === instrument.symbol);
    blights.push({
      id: `${instrument.symbol}-halt`,
      severity: 'error',
      message: halt?.reason ?? 'Trading halted',
      since: halt?.since ?? asOf,
    });
  }

  return blights;
}

/** The payload the inspection panel renders and the renderer never reads. */
function rawFor(
  instrument: Instrument,
  reading: InstrumentReading,
  bars: Bar[],
  asOf: number,
): unknown {
  const { position, price, ret, drawdown, volumeRatio } = reading;
  return {
    symbol: instrument.symbol,
    name: instrument.name,
    sector: SECTOR_LABELS[instrument.sector],
    listedYear: instrument.listedYear,
    side: position.side,
    quantity: position.quantity,
    costBasis: position.costBasis === null ? null : round2(position.costBasis),
    price: price === null ? null : round2(price),
    returnPct: round2(ret * 100),
    marketValue:
      price === null ? null : round2(price * position.quantity),
    drawdownPct: round2(drawdown * 100),
    volumeVsAverage: round2(volumeRatio),
    volatilityPct: round2(volatilityAt(bars, asOf) * 100),
    bars: countThrough(bars, asOf),
  };
}

/**
 * Vitals over a walk backwards, at whatever grain is asked for.
 *
 * The same shape as the league's backfill and the same memo, keyed on how many
 * bars have closed — the exact analogue of keying on games played. What differs
 * is how much it earns. A club's key changes a couple of times a week; an
 * instrument's changes every hour the market is open and not at all when it is
 * shut, so the cache absorbs the nights and weekends and pays full price for the
 * sessions. That is the honest cost of a source that actually updates, and the
 * measured numbers are in ARCHITECTURE.md.
 *
 * Slots before the first bar, or before the position was opened, are left
 * unwritten rather than filled: an unrecorded past must never be given a
 * plausible number, because a flat line of those is indistinguishable from data.
 */
function backfill(
  bars: Bar[],
  lots: Lot[],
  asOf: number,
  stepMs: number,
  steps: number,
): VitalsHistory {
  const buffer = createHistory(stepMs, Math.max(1, steps));
  if (bars.length === 0) return buffer;

  const cache = new Map<string, Vitals>();
  const instrument = INSTRUMENTS.find((i) => i.symbol === bars[0].symbol);
  if (!instrument) return buffer;

  const firstBar = bars[0].closeAt;
  const firstLot = lots.length > 0 ? lots[0].openedAt : Infinity;
  const start = Math.max(firstBar, firstLot);

  for (let h = steps - 1; h >= 0; h--) {
    const at = asOf - h * stepMs;
    if (at < start) continue;

    const closed = countThrough(bars, at);
    const opened = countOpened(lots, at);
    const key = `${closed}:${opened}`;

    let vitals = cache.get(key);
    if (!vitals) {
      vitals = readInstrument(instrument, bars, lots, at).vitals;
      cache.set(key, vitals);
    }
    recordVitals(buffer, at, vitals);
  }

  return buffer;
}

function countOpened(lots: Lot[], at: number): number {
  let n = 0;
  for (const lot of lots) if (lot.openedAt <= at) n++;
  return n;
}

/**
 * Pearson correlation of two instruments' daily returns up to `asOf`.
 *
 * Only bars that share a close time are paired, so an instrument that halted
 * contributes nothing after it stopped rather than being lined up against the
 * wrong days — which is the failure that makes two unrelated things look
 * perfectly correlated.
 */
export function correlationOf(a: Bar[], b: Bar[], asOf: number): number {
  const left = dailyReturns(a, asOf);
  const right = dailyReturns(b, asOf);

  const shared: Array<[number, number]> = [];
  for (const [at, value] of left) {
    const other = right.get(at);
    if (other !== undefined) shared.push([value, other]);
  }
  if (shared.length < 3) return 0;

  const n = shared.length;
  const meanA = shared.reduce((s, [x]) => s + x, 0) / n;
  const meanB = shared.reduce((s, [, y]) => s + y, 0) / n;

  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (const [x, y] of shared) {
    cov += (x - meanA) * (y - meanB);
    varA += (x - meanA) ** 2;
    varB += (y - meanB) ** 2;
  }
  if (varA <= 0 || varB <= 0) return 0;
  return cov / Math.sqrt(varA * varB);
}

/** Returns keyed by bar close, for the sessions that had closed by `asOf`. */
function dailyReturns(bars: Bar[], asOf: number): Map<number, number> {
  const out = new Map<number, number>();
  const count = countThrough(bars, asOf);
  for (let i = 1; i < count; i++) {
    const prev = bars[i - 1].close;
    if (prev > 0) out.set(bars[i].closeAt, bars[i].close / prev - 1);
  }
  return out;
}

function pairs<T>(items: readonly T[]): Array<[T, T]> {
  const out: Array<[T, T]> = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) out.push([items[i], items[j]]);
  }
  return out;
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
