import type { EcosystemNode } from '../ecosystem/types';
import type { VitalsHistory } from '../ecosystem/history';
import {
  decodeRecord,
  emptyRecord,
  encodeRecord,
  mergeRecord,
  observe,
  peekSavedAt,
  pruneRecord,
  recordBytes,
  restoreRecord,
  shedRecord,
  type ObservedRecord,
} from './persist';

/**
 * The collector: the loop that keeps the record, moved somewhere it outlives a
 * page.
 *
 * The poll was half of this and is worth reading first (`sources.ts`). It keeps
 * the *live* reading true by asking a source again when the source's own
 * calendar says something is owed, and then it dies with the tab along with
 * everything it learned. What the handoff called the missing layer is the other
 * half: something that writes down what was seen, so that the next time the app
 * opens, the scrub goes back over a past that happened rather than over one the
 * source has just regenerated.
 *
 * This is as far as a browser-only app honestly goes, and the limit is worth
 * being exact about rather than glossing: it collects while a tab is open and
 * not while one is not. A collector that truly runs whether or not anyone is
 * looking is a process, and this project has no server to put one in. What this
 * does buy is real and is the thing that was missing — a season assembled from
 * sittings instead of discarded at every reload — and the seam is the same one a
 * server would sit behind, because `ObservedRecord` is already the wire format.
 *
 * Storage is injected rather than reached for. `persist.ts` is pure, this file
 * is the only one that knows `localStorage` exists, and the tests run in node.
 */

export interface CollectorStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const STORAGE_KEY = 'spatialui.observed.v1';

/**
 * The floor on how often the record is written out.
 *
 * The observation itself is a couple of array writes per plant and happens on
 * every commit; serializing a season is not, so it is thrown to a schedule
 * rather than done on the beat. Thirty seconds against a two-second beat means
 * one write in fifteen, and the worst a crash costs is half a minute of a
 * series whose finest grain is an hour.
 */
export const WRITE_INTERVAL_MS = 30_000;

/**
 * How much of the main thread a write is allowed to be, as a divisor.
 *
 * `localStorage` is synchronous and main-thread by definition, so a write is a
 * frame nobody gets. Measured in Chromium at the budget — 124 plants, a season
 * of days and a week of hours, 1.8MB — encoding and writing came to about 21ms
 * median and 28ms at worst. That is one dropped frame every thirty seconds at
 * the very top of the range, and unmeasurable for the first weeks of use, which
 * is the kind of cost a constant cannot express.
 *
 * So the interval is the measured cost times this, floored at
 * `WRITE_INTERVAL_MS` and capped at `MAX_WRITE_INTERVAL_MS`. At 1/2000 of the
 * main thread, a sub-millisecond write keeps the thirty-second floor and the
 * 21ms worst case above backs off to a little over forty seconds — deliberately
 * a mild correction on this hardware, because that is what the measurement
 * justifies. It earns its keep on hardware that is not this: a phone three to
 * five times slower lands at two or three minutes without anyone choosing a
 * number for it.
 *
 * Backing off costs nothing worth having. The finest grain in the record is an
 * hour, so a few minutes of "last seen inside the current hour" is not
 * information, and the page going away flushes regardless.
 */
export const WRITE_DUTY = 2000;
export const MAX_WRITE_INTERVAL_MS = 600_000;

/**
 * What the record is allowed to occupy.
 *
 * Two megabytes is a full season observed across every plant in every garden,
 * measured rather than guessed — see `collector.test.ts`, and the real record at
 * that size encodes to 1.84MB.
 *
 * It is a large share of what there is. The origin quota is about 5MB, and it
 * was confirmed the blunt way while benchmarking: three copies of a full record
 * would not fit. Nothing else lives on this origin, so taking 40% of it for the
 * one thing the app is for is the right trade — but it is a deliberate 40%, not
 * a rounding error, and a second consumer here would need this number revisited
 * rather than assumed to have headroom behind it. Going over sheds rather than
 * fails; see `shedRecord` for which end goes.
 */
export const RECORD_BUDGET_BYTES = 2_000_000;

export interface Collector {
  /** The record as it currently stands. Mutated in place by `note`. */
  readonly record: ObservedRecord;
  /** Note what these nodes were, and write out if the schedule says so. */
  note(nodes: Iterable<EcosystemNode>, at: number): void;
  /** Lay what was loaded into freshly built buffers. Call once, after compose. */
  restore(
    history: Record<string, VitalsHistory>,
    archive: Record<string, VitalsHistory>,
  ): { fine: number; coarse: number };
  /** Write out now, whatever the schedule thinks. Returns whether it stuck. */
  flush(at?: number): boolean;
  /** Bytes the last successful write occupied, or 0 if there has not been one. */
  readonly writtenBytes: number;
  /** The current gap between scheduled writes, grown from what one costs. */
  readonly intervalMs: number;
}

export interface CollectorOptions {
  /** Null disables persistence entirely; the collector still runs in memory. */
  storage?: CollectorStorage | null;
  key?: string;
  budgetBytes?: number;
  intervalMs?: number;
  now?: number;
}

/**
 * `localStorage`, when there is one and it works.
 *
 * Reached for defensively rather than optimistically because the failure modes
 * are all silent-until-used: there is no `window` under vitest or SSR, and
 * Safari's private mode hands back a `Storage` that throws on the first write
 * rather than on read. A probe write is the only way to tell those apart, and
 * finding out at startup is better than finding out thirty seconds in.
 */
export function browserStorage(): CollectorStorage | null {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return null;
    const probe = `${STORAGE_KEY}.probe`;
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

export function createCollector(options: CollectorOptions = {}): Collector {
  const {
    storage = null,
    key = STORAGE_KEY,
    budgetBytes = RECORD_BUDGET_BYTES,
    intervalMs = WRITE_INTERVAL_MS,
    now = Date.now(),
  } = options;

  const record = load(storage, key, now);
  let lastWriteAt = now;
  let writtenBytes = 0;
  /** Grown from the measured cost of the last write. See `WRITE_DUTY`. */
  let currentIntervalMs = intervalMs;
  /**
   * What this collector last put in the key, as `savedAt:length`. Its only job
   * is to answer "has anyone else written since I did" without parsing what is
   * there, which is the difference between a free check and a JSON.parse of a
   * megabyte every thirty seconds.
   */
  let lastWritten: string | null = null;

  /**
   * Take in whatever another tab has written since our last write.
   *
   * Skipped entirely when the stored value is the one we put there, which is
   * every write in the ordinary single-tab case.
   */
  const absorb = (at: number): void => {
    if (!storage) return;
    let text: string | null = null;
    try {
      text = storage.getItem(key);
    } catch {
      return;
    }
    if (!text) return;
    if (lastWritten !== null && `${peekSavedAt(text)}:${text.length}` === lastWritten) return;

    const theirs = decodeRecord(text);
    if (!theirs) return;
    pruneRecord(theirs, at);
    mergeRecord(record, theirs);
  };

  /**
   * Prune, shed, encode, store — and if the store refuses, halve the budget and
   * try once more.
   *
   * Quota is not a thing that can be checked in advance: the limit is per origin
   * and shared, so the write that fails is one this app's own arithmetic said
   * would fit. Halving is the coarse response, and it is the right one here
   * because the alternative — walking down in steps until something lands —
   * spends serialization passes on a session that has already been told it is
   * not welcome. Failing twice clears the key, so a garden's worth of
   * unwriteable record does not sit there blocking every future write.
   */
  const write = (at: number): boolean => {
    const started = clock();
    lastWriteAt = at;
    // Before pruning or shedding, so another tab's slots are subject to the same
    // budget as ours rather than arriving after the decision about what fits.
    absorb(at);
    pruneRecord(record, at);
    // Bounded even with nowhere to put it: without storage this is the only
    // thing standing between a long-lived tab and a record that grows all day.
    shedRecord(record, budgetBytes);
    if (!storage) return false;

    for (const budget of [budgetBytes, budgetBytes / 2]) {
      shedRecord(record, budget);
      const text = encodeRecord(record);
      try {
        storage.setItem(key, text);
        writtenBytes = text.length;
        lastWritten = `${record.savedAt}:${text.length}`;
        // Whole milliseconds. `clock()` is fractional, and a fractional
        // interval compared against `at - lastWriteAt` is a coin toss: `at` is
        // an epoch around 1.78e12, where a double's spacing is about 0.0002ms,
        // so `(lastWriteAt + interval) - lastWriteAt` can come back a hair under
        // `interval` and the write silently never fires. Which way it lands
        // depends on the fraction, which is to say on nothing. Sub-millisecond
        // precision was meaningless here anyway — the clock feeding `note` is
        // `Date.now()`.
        currentIntervalMs = Math.ceil(
          Math.min(
            MAX_WRITE_INTERVAL_MS,
            Math.max(intervalMs, (clock() - started) * WRITE_DUTY),
          ),
        );
        return true;
      } catch {
        // Fall through to the smaller budget, then give up.
      }
    }
    try {
      storage.removeItem(key);
    } catch {
      // Nothing left to try. The record stays in memory for this session.
    }
    writtenBytes = 0;
    lastWritten = null;
    return false;
  };

  return {
    record,

    note(nodes, at) {
      observe(record, nodes, at);
      if (at - lastWriteAt >= currentIntervalMs) write(at);
    },

    restore(history, archive) {
      return restoreRecord(record, history, archive);
    },

    flush(at = Date.now()) {
      return write(at);
    },

    get writtenBytes() {
      return writtenBytes;
    },

    get intervalMs() {
      return currentIntervalMs;
    },
  };
}

/**
 * A monotonic millisecond clock with sub-millisecond resolution, or `Date.now`
 * where there is none. Used only to measure how long a write took, so a coarse
 * fallback costs nothing but a duty cycle that reads zero and keeps the floor.
 */
function clock(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

/**
 * Reads the stored record, discarding anything unreadable.
 *
 * Pruned on the way in as well as on the way out, because the gap between the
 * two is the whole point of the thing: a record written in March and read in
 * June is mostly slots no buffer will accept, and carrying them to the first
 * write just to drop them there would mean a session's peak memory is set by
 * how long the tab was shut.
 */
function load(
  storage: CollectorStorage | null,
  key: string,
  now: number,
): ObservedRecord {
  if (!storage) return emptyRecord(now);

  let text: string | null = null;
  try {
    text = storage.getItem(key);
  } catch {
    return emptyRecord(now);
  }
  if (!text) return emptyRecord(now);

  const record = decodeRecord(text);
  if (!record) {
    // Not ours, or not this schema. Clearing rather than leaving it means the
    // next write is not competing with a dead record for the same quota.
    try {
      storage.removeItem(key);
    } catch {
      // Read-only storage. Nothing to do but ignore what is there.
    }
    return emptyRecord(now);
  }

  pruneRecord(record, now);
  return record;
}

/** What the record would occupy right now. Exposed for the memory budget check. */
export function collectorBytes(collector: Collector): number {
  return recordBytes(collector.record);
}
