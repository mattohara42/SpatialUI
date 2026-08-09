/**
 * What a market feed hands over, in the shape a feed actually has.
 *
 * The rule the NFL adapter set and this one keeps: **store events, not
 * summaries**. A feed that hands you "up 3.2% today" has already thrown away
 * when the number changed and made the history unrecoverable. So the record here
 * is bars and fills — each stamped with the moment it happened — and every
 * question anybody wants answered (what is this worth, how far off its high, how
 * busy has it been) is derived from them as of a timestamp.
 *
 * Nothing in this folder knows what a plant is.
 */

/** A tradeable thing. Facts about the instrument, none of them prices. */
export interface Instrument {
  /** Ticker. Also the node id's stem, so it must be stable. */
  symbol: string;
  name: string;
  /** The bed it grows in. */
  sector: SectorKey;
  /** Year the company listed. Feeds maturity, never health. */
  listedYear: number;
  /** Brand colour, for the tag's roundel. Identity, never state. */
  color: string;
}

export type SectorKey =
  | 'technology'
  | 'financials'
  | 'health-care'
  | 'energy'
  | 'consumer'
  | 'industrials'
  | 'utilities'
  | 'materials';

export const SECTOR_LABELS: Record<SectorKey, string> = {
  technology: 'Technology',
  financials: 'Financials',
  'health-care': 'Health Care',
  energy: 'Energy',
  consumer: 'Consumer',
  industrials: 'Industrials',
  utilities: 'Utilities',
  materials: 'Materials',
};

/**
 * One period of trading, closed.
 *
 * Only completed bars are ever in the feed — the current, still-forming bar is
 * not a fact yet, and including it would mean a derivation's answer changed
 * without any event having occurred. `closeAt` is when the period ended, which
 * is what every as-of query compares against.
 */
export interface Bar {
  symbol: string;
  /** Epoch ms at which this period closed. */
  closeAt: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Shares traded in the period. */
  volume: number;
}

/** Which way a position leans. Decides polarity, and nothing else. */
export type Side = 'long' | 'short';

/**
 * A fill: the event of taking on part of a position.
 *
 * Lots rather than a net position, for the same reason bars rather than a price.
 * A position is the sum of the lots opened before the moment you are asking
 * about, so "what did I own in March" is a filter rather than a second record
 * that has to be kept in step.
 */
export interface Lot {
  id: string;
  symbol: string;
  side: Side;
  /** Always positive. `side` carries the direction. */
  quantity: number;
  /** Price paid (long) or received (short), per share. */
  price: number;
  openedAt: number;
}

/**
 * A halt: the exchange stopping trade in one instrument.
 *
 * This is the market's own version of the NFL's bye week, and it is why this
 * adapter can reach the staleness state honestly. A halted instrument prints no
 * bars, so its last bar recedes into the past on its own and the garden greys it
 * without anybody editing a timestamp.
 */
export interface Halt {
  symbol: string;
  since: number;
  reason: string;
}

export interface Provenance {
  /** Where this came from, in words a person can check. */
  source: string;
  /** False when the numbers are generated. Never quietly true. */
  live: boolean;
  note?: string;
}

/**
 * The whole state of the book at one instant.
 *
 * One method on the source, for the reason the league has one: a snapshot is the
 * entire thing, and there is no slice of it a caller could usefully ask for
 * without also needing the rest to interpret it.
 */
export interface MarketSnapshot {
  /** Epoch ms the snapshot was taken. */
  fetchedAt: number;
  instruments: Instrument[];
  /** Ascending by `closeAt`. Derivations rely on this. */
  bars: Bar[];
  /** Ascending by `openedAt`. */
  lots: Lot[];
  halts: Halt[];
  provenance: Provenance;
}

/**
 * What a source has to provide.
 *
 * A live adapter — a broker API, a market data vendor, a CSV of your own fills —
 * implements this and nothing downstream changes. That is the entire reason the
 * shapes above are feed-shaped rather than convenient.
 */
export interface MarketSource {
  readonly name: string;
  snapshot(now?: number): MarketSnapshot;
}
