/**
 * Moving the camera from one place to another over a moment, as arithmetic.
 *
 * The two cameras — standing on the path, and looking down at the table — are
 * each a fixed answer to "where is the eye". Cutting between them instantly would
 * throw away the one thing that makes a second view of *the same garden* legible
 * as the same garden: that you can see it is the same, because you watched the
 * eye travel there. So a switch is a short flight rather than a cut, and this is
 * the flight, kept pure and testable the way `look` and `bonsai` are — the eye is
 * a point and a target, and a flight is those two points interpolated.
 *
 * A component owns the clock and the camera; this owns only the shape of the
 * motion, which is the part worth being able to argue with without a renderer.
 */

/** How long a flight lasts, in milliseconds. Long enough to read as travel,
 *  short enough that it never becomes a thing you wait through. */
export const FLIGHT_MS = 900;

/**
 * Ease in and out, so the flight starts and ends at rest.
 *
 * A linear flight lurches into motion and stops dead, which reads as a jump-cut
 * with a delay rather than as travel. The smootherstep curve is flat at both
 * ends — zero velocity and zero acceleration — so the eye accelerates away from
 * where it stood and settles onto where it is going, the way a hand moving a
 * model would.
 */
export function ease(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/** Fraction of the flight elapsed, clamped to the unit interval. Returns 1 for a
 *  zero or negative duration, so a degenerate flight is simply already arrived. */
export function progress(elapsedMs: number, durationMs = FLIGHT_MS): number {
  if (durationMs <= 0) return 1;
  const t = elapsedMs / durationMs;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** A point on the line between two vectors. */
export function lerp3(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  t: number,
): [number, number, number] {
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t,
  ];
}

export interface Pose {
  /** Where the eye is. */
  position: [number, number, number];
  /** What it looks at. */
  target: [number, number, number];
}

/**
 * The camera pose a fraction of the way through a flight.
 *
 * Position and target are eased together on the same clock, so the aim swings
 * across with the eye rather than snapping to the destination first and then
 * being flown up to — which would read as the camera looking away and then
 * chasing itself.
 */
export function flyPose(from: Pose, to: Pose, t: number): Pose {
  const e = ease(t);
  return {
    position: lerp3(from.position, to.position, e),
    target: lerp3(from.target, to.target, e),
  };
}
