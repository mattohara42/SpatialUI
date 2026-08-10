import { historyExtent, type VitalsHistory } from './history';

/**
 * The shape of the past a garden can honestly show.
 *
 * `scrub.ts` says what counts as a legal cursor. This says what the legal range
 * *looks like*, which is a different question and one nothing has been able to
 * answer: the sun is the time control and it is a good one, but a sun cannot
 * express an extent. Dragging it back, there is no way to know whether the
 * record runs out in an hour or in four months, and the moment it runs out the
 * cursor simply stops with no explanation. The edge is the most important fact
 * about a scrub and it was the one thing invisible.
 *
 * So this is not a transport control wearing a garden's clothes — the objection
 * `SunScrub.tsx` raises against a scrub bar stands, and the sun keeps the
 * gesture. This is a **provenance display**: how far back the record goes, where
 * its grain changes, and where you are standing inside it. That it can also be
 * dragged is a consequence of showing a position, not the reason for it.
 *
 * Two facts it must not soften.
 *
 * **The floor is what was kept, not what happened.** Left of `from` is not empty
 * data, it is history nobody recorded, and the display has to read as an edge
 * rather than as a flat line running off into the past. Same rule as the
 * backfills, which leave unrecorded slots unwritten rather than filling them
 * with a plausible number.
 *
 * **The grain changes partway.** The fine buffer holds hours for about a week;
 * beyond it the archive holds days. A cursor either side of that boundary means
 * genuinely different things — a point, versus a whole day flattened to one
 * sample — so the boundary is drawn. It is the same conservative rule the window
 * itself uses: taken from the *worst* covered plant in the garden, because a
 * boundary placed at the best-recorded one would claim an hourly reading for
 * plants that have only a daily.
 */
export interface Timeline {
  /** The oldest moment this garden can honestly be shown at. */
  from: number;
  /** The present. */
  to: number;
  /**
   * Where hours become days: the oldest moment still covered by the fine
   * buffer. Null when the garden keeps no fine history at all, which is not the
   * same as a boundary at `from` — one means "no hourly record", the other means
   * "hourly all the way back".
   */
  fineFrom: number | null;
  /** Where the cursor stands, or null for live. */
  cursor: number | null;
}

export function buildTimeline(
  now: number,
  windowMs: number,
  fineMs: number,
  cursor: number | null,
): Timeline {
  const from = now - Math.max(0, windowMs);
  return {
    from,
    to: now,
    // Clamped into the window rather than allowed past it: a fine buffer
    // reaching further back than the archive is possible and would otherwise
    // draw a boundary outside the strip it belongs to.
    fineFrom: fineMs > 0 ? Math.max(from, now - fineMs) : null,
    cursor,
  };
}

/** Where a moment sits along the strip, 0 at the far edge and 1 at the present. */
export function fractionOf(timeline: Timeline, at: number): number {
  const span = timeline.to - timeline.from;
  if (span <= 0) return 1;
  const t = (at - timeline.from) / span;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** The inverse, for a pointer landing somewhere along it. */
export function timeAt(timeline: Timeline, fraction: number): number {
  const f = fraction < 0 ? 0 : fraction > 1 ? 1 : fraction;
  return timeline.from + f * (timeline.to - timeline.from);
}

/**
 * How far back a set of buffers *all* reach.
 *
 * The minimum rather than the maximum, and zero if any of them holds nothing,
 * which is the same judgement `scrubWindowFor` makes about the window: a garden
 * is shown as a whole, so the honest claim is the one true of every plant in it.
 * A bed where one plant has a week and the rest have an hour has an hour.
 */
export function reachOf(
  buffers: Iterable<VitalsHistory | undefined>,
  now: number,
): number {
  let reach = Infinity;
  for (const buffer of buffers) {
    if (!buffer) return 0;
    const extent = historyExtent(buffer);
    if (!extent) return 0;
    reach = Math.min(reach, Math.max(0, now - extent.from));
    if (reach === 0) return 0;
  }
  return Number.isFinite(reach) ? reach : 0;
}
