import { HOUR_MS } from './history';

/**
 * The rules a time cursor obeys, independent of the gesture that moves it.
 *
 * The sun is the control (see scene/daylight.ts), but what counts as a legal
 * time is a property of the history buffer, not of the sky, so it lives here
 * where the store can reach it without importing the renderer.
 */

/**
 * How far back the cursor may go. Two days is what the eye can hold as "the
 * sun went round twice", and it sits inside the week the ring buffer keeps, so
 * the scrub never runs off the end of recorded history into a flat line.
 */
export const SCRUB_WINDOW_MS = 47 * HOUR_MS;

/**
 * Landing this close to the present means live rather than a timestamp that
 * happens to be nearly now. Without it the cursor sticks a minute behind and
 * the scene quietly stops following telemetry while looking like it is.
 */
export const LIVE_SNAP_MS = 5 * 60_000;

/** Never the future, never further back than we kept. */
export function clampScrub(
  timestamp: number,
  now: number,
  windowMs: number = SCRUB_WINDOW_MS,
): number {
  if (timestamp > now) return now;
  const floor = now - windowMs;
  return timestamp < floor ? floor : timestamp;
}

/**
 * The cursor value for a scrub target: null, meaning live, once the drag comes
 * back to the present. Returning to now is a state the user must be able to
 * reach by dragging, not only by pressing a button.
 */
export function cursorFor(
  timestamp: number,
  now: number,
  windowMs: number = SCRUB_WINDOW_MS,
): number | null {
  const clamped = clampScrub(timestamp, now, windowMs);
  return clamped >= now - LIVE_SNAP_MS ? null : clamped;
}

/** Move the cursor by a signed offset, from wherever it currently sits. */
export function scrubBy(
  cursor: number | null,
  deltaMs: number,
  now: number,
  windowMs: number = SCRUB_WINDOW_MS,
): number | null {
  return cursorFor((cursor ?? now) + deltaMs, now, windowMs);
}
