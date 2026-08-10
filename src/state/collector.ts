import type { EcosystemNode } from '../ecosystem/types';
import type { VitalsHistory } from '../ecosystem/history';
import {
  decodeRecord,
  emptyRecord,
  encodeRecord,
  observe,
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
 * How often the record is written out.
 *
 * The observation itself is a couple of array writes per plant and happens on
 * every commit; serializing a season is not, so it is thrown to a schedule
 * rather than done on the beat. Thirty seconds against a two-second beat means
 * one write in fifteen, and the worst a crash costs is half a minute of a
 * series whose finest grain is an hour.
 */
export const WRITE_INTERVAL_MS = 30_000;

/**
 * What the record is allowed to occupy.
 *
 * `localStorage` is about 5MB for the whole origin and this app is not the only
 * thing entitled to it. Two megabytes is roughly a full season observed across
 * every plant in every garden — measured in `collector.test.ts` — and leaves
 * most of the quota alone. Going over sheds rather than fails; see `shedRecord`
 * for which end goes.
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
    pruneRecord(record, at);
    lastWriteAt = at;
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
    return false;
  };

  return {
    record,

    note(nodes, at) {
      observe(record, nodes, at);
      if (at - lastWriteAt >= intervalMs) write(at);
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
  };
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
