import {
  DAY_MS,
  DEFAULT_ARCHIVE_CAPACITY,
  DEFAULT_CAPACITY,
  HOUR_MS,
  recordIfAbsent,
  type VitalsHistory,
} from '../ecosystem/history';
import type { EcosystemNode, Vitals } from '../ecosystem/types';

/**
 * The record: what this app actually watched happen, in a form that outlives
 * the tab.
 *
 * The archive tier can hold twenty weeks and, until this existed, nothing was
 * writing them. History was backfilled at module load from whatever the source
 * could still tell about its own past, and then thrown away on reload. Scrubbing
 * back a month showed the source's account of a month, regenerated; it did not
 * show a month.
 *
 * What is stored here is deliberately *not* a copy of those buffers. A backfill
 * fills every slot it covers, so persisting it would be storing the source's
 * story back to itself at some expense and no gain. This holds observations
 * only — one sample per node per slot, written when a node reported — which is
 * the part no source can re-tell. Over a week of use the fine tier is largely
 * redundant with what the market tape still carries; over a season the coarse
 * tier is the only place those days exist at all. That asymmetry is why shedding
 * drops the fine tier first.
 *
 * Everything here is pure and knows nothing about a browser. `collector.ts` is
 * the half that touches storage, for the reason `lsystem/` has no React in it.
 */

/** Bumped when the shape changes. A record from another schema is discarded. */
export const RECORD_SCHEMA = 1;

/**
 * Sparse vitals for one node at one grain: absolute slots ascending, parallel
 * to four value arrays.
 *
 * Sparse rather than the dense ring `VitalsHistory` uses, because the two are
 * shaped by opposite pressures. The ring is dense so a scrub is an index; this
 * is sparse because a record of what was seen is mostly gaps, and a dense
 * encoding of a season observed in two sittings would be 140 slots to store
 * three. Absolute slots keep the gaps explicit across the reload, which is the
 * same reason the ring uses them.
 */
export interface ObservedSeries {
  stepMs: number;
  slots: number[];
  vitality: number[];
  activity: number[];
  maturity: number[];
  trend: number[];
}

export interface ObservedRecord {
  schema: number;
  /** Epoch ms this record was last written. Diagnostic, and a staleness check. */
  savedAt: number;
  /** Hourly, keyed by node id. Restored into `state.history`. */
  fine: Record<string, ObservedSeries>;
  /** Daily, keyed by node id. Restored into `state.archive`. */
  coarse: Record<string, ObservedSeries>;
}

/**
 * How far back each tier is kept, matching the buffers it will be restored
 * into. Holding a slot the ring would refuse is storage spent on a sample that
 * can never be read back.
 */
export const FINE_RETAINED_SLOTS = DEFAULT_CAPACITY;
export const COARSE_RETAINED_SLOTS = DEFAULT_ARCHIVE_CAPACITY;

/**
 * Four decimals. Vitals are 0..1 and trend is -1..1, so this is finer than the
 * 20 steps the geometry quantizes to and roughly a third of the bytes of a raw
 * float's decimal expansion. The rounding is the only lossy thing here and it is
 * below the resolution of anything that reads it.
 */
const PRECISION = 1e4;

export function emptyRecord(savedAt = Date.now()): ObservedRecord {
  return { schema: RECORD_SCHEMA, savedAt, fine: {}, coarse: {} };
}

export function slotAt(timestamp: number, stepMs: number): number {
  return Math.floor(timestamp / stepMs);
}

/**
 * Note what these nodes were, at `at`.
 *
 * The caller decides what counts as having reported — this writes everything it
 * is handed — because the store already knows: `commit` receives exactly the
 * nodes a source spoke about, and the mock tick stamps the ones it drifted. A
 * freshness heuristic here would be this module guessing at something two
 * callers above it already have exactly right, and would quietly start
 * recording a silent plant as reporting the same number every hour, which is
 * the failure the whole design keeps trying not to commit.
 *
 * Repeated calls inside one slot overwrite, matching `record`: the stored
 * sample is last-seen, not an average.
 *
 * Returns the number of slots newly opened, not the number of samples written:
 * a call that only refreshes the hour and the day already in progress returns
 * zero, which is what almost every call does.
 */
export function observe(
  record: ObservedRecord,
  nodes: Iterable<EcosystemNode>,
  at: number,
): number {
  let written = 0;
  for (const node of nodes) {
    // Only plants keep buffers; beds and gardens are rolled up from them, so a
    // stored bed would be a derived value pretending to be an observation.
    if (node.kind !== 'plant') continue;
    written += upsert(seriesFor(record.fine, node.id, HOUR_MS), at, node) ? 1 : 0;
    written += upsert(seriesFor(record.coarse, node.id, DAY_MS), at, node) ? 1 : 0;
  }
  record.savedAt = at;
  return written;
}

function seriesFor(
  tier: Record<string, ObservedSeries>,
  id: string,
  stepMs: number,
): ObservedSeries {
  let series = tier[id];
  if (!series) {
    series = { stepMs, slots: [], vitality: [], activity: [], maturity: [], trend: [] };
    tier[id] = series;
  }
  return series;
}

/** Writes one sample. Returns true when it added a slot rather than updating one. */
function upsert(series: ObservedSeries, at: number, vitals: Vitals): boolean {
  const slot = slotAt(at, series.stepMs);
  const n = series.slots.length;

  // Observations arrive in time order almost always, so the common case is the
  // last slot again, or one past it.
  if (n > 0 && slot === series.slots[n - 1]) {
    write(series, n - 1, vitals);
    return false;
  }
  if (n === 0 || slot > series.slots[n - 1]) {
    series.slots.push(slot);
    series.vitality.push(vitals.vitality);
    series.activity.push(vitals.activity);
    series.maturity.push(vitals.maturity);
    series.trend.push(vitals.trend);
    return true;
  }

  // Out of order. Reachable through a clock correction, and through any test
  // that walks a series backwards, so it is handled rather than assumed away.
  const at_ = lowerBound(series.slots, slot);
  if (series.slots[at_] === slot) {
    write(series, at_, vitals);
    return false;
  }
  series.slots.splice(at_, 0, slot);
  series.vitality.splice(at_, 0, vitals.vitality);
  series.activity.splice(at_, 0, vitals.activity);
  series.maturity.splice(at_, 0, vitals.maturity);
  series.trend.splice(at_, 0, vitals.trend);
  return true;
}

function write(series: ObservedSeries, i: number, vitals: Vitals): void {
  series.vitality[i] = vitals.vitality;
  series.activity[i] = vitals.activity;
  series.maturity[i] = vitals.maturity;
  series.trend[i] = vitals.trend;
}

/** First index whose slot is >= `slot`, or the length. */
function lowerBound(slots: number[], slot: number): number {
  let lo = 0;
  let hi = slots.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (slots[mid] < slot) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Drops what can no longer be read back: slots older than the ring they would
 * be restored into, and slots in the future.
 *
 * Measured from `now` rather than from each series' own newest slot, so a node
 * that stopped reporting in March does not keep its March forever while
 * everything around it rolls over. Returns the number of slots dropped.
 */
export function pruneRecord(record: ObservedRecord, now: number): number {
  return (
    pruneTier(record.fine, now, HOUR_MS, FINE_RETAINED_SLOTS) +
    pruneTier(record.coarse, now, DAY_MS, COARSE_RETAINED_SLOTS)
  );
}

function pruneTier(
  tier: Record<string, ObservedSeries>,
  now: number,
  stepMs: number,
  retained: number,
): number {
  const newest = slotAt(now, stepMs);
  const oldest = newest - retained + 1;
  let dropped = 0;

  for (const [id, series] of Object.entries(tier)) {
    const from = lowerBound(series.slots, oldest);
    const to = lowerBound(series.slots, newest + 1);
    if (from === 0 && to === series.slots.length) continue;
    dropped += series.slots.length - (to - from);
    sliceSeries(series, from, to);
    if (series.slots.length === 0) delete tier[id];
  }
  return dropped;
}

function sliceSeries(series: ObservedSeries, from: number, to: number): void {
  series.slots = series.slots.slice(from, to);
  series.vitality = series.vitality.slice(from, to);
  series.activity = series.activity.slice(from, to);
  series.maturity = series.maturity.slice(from, to);
  series.trend = series.trend.slice(from, to);
}

/**
 * Lays the record into freshly built buffers, filling only slots the source
 * left empty. See `recordIfAbsent` for why that direction and not the other.
 *
 * A series whose grain disagrees with the buffer's is skipped rather than
 * resampled, and a node with no buffer is skipped rather than given one: an
 * adapter that keeps no archive is saying it cannot speak to that span, and
 * conjuring a buffer for it out of an old record would make the app the source.
 */
export function restoreRecord(
  record: ObservedRecord,
  history: Record<string, VitalsHistory>,
  archive: Record<string, VitalsHistory>,
): { fine: number; coarse: number } {
  return {
    fine: restoreTier(record.fine, history),
    coarse: restoreTier(record.coarse, archive),
  };
}

function restoreTier(
  tier: Record<string, ObservedSeries>,
  buffers: Record<string, VitalsHistory>,
): number {
  let filled = 0;
  for (const [id, series] of Object.entries(tier)) {
    const buffer = buffers[id];
    if (!buffer || buffer.stepMs !== series.stepMs) continue;

    for (let i = 0; i < series.slots.length; i++) {
      const at = series.slots[i] * series.stepMs;
      const wrote = recordIfAbsent(buffer, at, {
        vitality: series.vitality[i],
        activity: series.activity[i],
        maturity: series.maturity[i],
        trend: series.trend[i],
      });
      if (wrote) filled++;
    }
  }
  return filled;
}

/**
 * Encoded size in bytes, without encoding.
 *
 * A budget has to be checked on every write and shedding has to check it once
 * per pass, so measuring by `JSON.stringify().length` would mean serializing a
 * megabyte a dozen times to decide how much of it to throw away. The constants
 * are measured against real output and `persist.test.ts` holds them to within
 * 10% of it, which is the accuracy a budget with a safety margin needs.
 */
export function recordBytes(record: ObservedRecord): number {
  let bytes = RECORD_OVERHEAD_BYTES;
  for (const tier of [record.fine, record.coarse]) {
    for (const [id, series] of Object.entries(tier)) {
      bytes += SERIES_OVERHEAD_BYTES + id.length + series.slots.length * SLOT_BYTES;
    }
  }
  return bytes;
}

// Measured against `encodeRecord`, not reasoned about. `persist.test.ts` holds
// them to the output across four shapes, from one node with one slot to every
// garden over a week, and will fail if the encoding changes underneath them.

/** `{"schema":1,"savedAt":…,"fine":{},"coarse":{}}` exactly. */
const RECORD_OVERHEAD_BYTES = 58;
/** The quoted key, `stepMs`, five bracket pairs, and the separators. */
const SERIES_OVERHEAD_BYTES = 81;
/**
 * One slot number plus four rounded values, with the commas between them. Slot
 * numbers run to six digits hourly and five daily; a value at four decimals is
 * six characters unless it rounds short, and rounding short only makes the
 * estimate generous, which is the safe direction for a budget.
 */
const SLOT_BYTES = 35;

/**
 * Brings a record inside a byte budget by dropping the oldest observations,
 * fine tier first.
 *
 * The order is the point. The fine tier is hourly for a week, which is the span
 * a live feed can usually still be asked about — losing it costs a re-fetch. The
 * coarse tier is daily for twenty weeks, and past the source's own window those
 * days exist nowhere else, so they are the last thing to go. Within a tier the
 * oldest goes first, for the ordinary reason.
 *
 * Mutates in place and returns the number of slots dropped.
 */
export function shedRecord(record: ObservedRecord, budgetBytes: number): number {
  let dropped = 0;

  for (const tier of [record.fine, record.coarse]) {
    // A pass, not a calculation. Slots are the bulk of the bytes but not all of
    // them: a series carries its own key and grain, and those only go when it
    // empties. So the shortfall is re-measured rather than solved for, and the
    // loop ends either under budget or with the tier gone.
    for (;;) {
      const over = recordBytes(record) - budgetBytes;
      if (over <= 0) return dropped;
      const shed = shedTier(tier, Math.ceil(over / SLOT_BYTES));
      if (shed === 0) break;
      dropped += shed;
    }
  }
  return dropped;
}

function shedTier(tier: Record<string, ObservedSeries>, slotsToDrop: number): number {
  if (slotsToDrop <= 0) return 0;

  // The cutoff is a moment rather than a count per series, so every node loses
  // the same span of time. Dropping a fixed count each would leave a node that
  // reported twice with both its samples gone and a node that reported hourly
  // with most of its week.
  const all: number[] = [];
  for (const series of Object.values(tier)) all.push(...series.slots);
  if (all.length === 0) return 0;

  if (slotsToDrop >= all.length) {
    for (const id of Object.keys(tier)) delete tier[id];
    return all.length;
  }

  all.sort((a, b) => a - b);
  let cutoff = all[slotsToDrop];

  // Nodes in a garden share their slots — they are all read on the same beat —
  // so the k-th oldest slot across the tier is very often the oldest slot, and a
  // cutoff equal to the minimum drops nothing and hangs the caller's loop.
  // Stepping to the next distinct slot overshoots the target by a fraction of a
  // slot's worth of nodes and guarantees the pass makes progress.
  if (cutoff === all[0]) {
    const next = all.find((slot) => slot > cutoff);
    if (next === undefined) {
      for (const id of Object.keys(tier)) delete tier[id];
      return all.length;
    }
    cutoff = next;
  }

  let dropped = 0;
  for (const [id, series] of Object.entries(tier)) {
    const from = lowerBound(series.slots, cutoff);
    if (from === 0) continue;
    dropped += from;
    sliceSeries(series, from, series.slots.length);
    if (series.slots.length === 0) delete tier[id];
  }
  return dropped;
}

export function encodeRecord(record: ObservedRecord): string {
  const round = (values: number[]) =>
    values.map((v) => Math.round(v * PRECISION) / PRECISION);
  const tier = (source: Record<string, ObservedSeries>) => {
    const out: Record<string, ObservedSeries> = {};
    for (const [id, series] of Object.entries(source)) {
      out[id] = {
        stepMs: series.stepMs,
        slots: series.slots,
        vitality: round(series.vitality),
        activity: round(series.activity),
        maturity: round(series.maturity),
        trend: round(series.trend),
      };
    }
    return out;
  };
  return JSON.stringify({
    schema: record.schema,
    savedAt: record.savedAt,
    fine: tier(record.fine),
    coarse: tier(record.coarse),
  });
}

/**
 * Parses a stored record, or returns null for anything that is not one.
 *
 * Storage is shared with every other script on the origin and survives every
 * version of this app that ever ran, so the input is untrusted in the ordinary
 * way: a wrong schema, a truncated write, or something else's key collision all
 * have to produce a discarded record rather than a garden built from nonsense.
 * Series that fail validation are dropped individually — a corrupt node should
 * not cost the season.
 */
export function decodeRecord(text: string): ObservedRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const raw = parsed as Partial<ObservedRecord>;
  if (raw.schema !== RECORD_SCHEMA) return null;
  if (typeof raw.savedAt !== 'number' || !Number.isFinite(raw.savedAt)) return null;

  return {
    schema: RECORD_SCHEMA,
    savedAt: raw.savedAt,
    fine: decodeTier(raw.fine, HOUR_MS),
    coarse: decodeTier(raw.coarse, DAY_MS),
  };
}

function decodeTier(tier: unknown, stepMs: number): Record<string, ObservedSeries> {
  const out: Record<string, ObservedSeries> = {};
  if (!tier || typeof tier !== 'object') return out;

  for (const [id, value] of Object.entries(tier as Record<string, unknown>)) {
    const series = value as Partial<ObservedSeries>;
    if (!series || typeof series !== 'object') continue;
    if (series.stepMs !== stepMs) continue;

    const { slots, vitality, activity, maturity, trend } = series;
    if (!numbers(slots) || !numbers(vitality)) continue;
    if (!numbers(activity) || !numbers(maturity) || !numbers(trend)) continue;

    const n = slots.length;
    if (
      vitality.length !== n ||
      activity.length !== n ||
      maturity.length !== n ||
      trend.length !== n
    ) {
      continue;
    }
    // Ascending order is an invariant every reader here relies on, and a
    // binary search over a shuffled array fails silently rather than loudly.
    let ordered = true;
    for (let i = 1; i < n; i++) if (slots[i] <= slots[i - 1]) ordered = false;
    if (!ordered) continue;

    out[id] = { stepMs, slots, vitality, activity, maturity, trend };
  }
  return out;
}

function numbers(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'number' && Number.isFinite(v));
}
