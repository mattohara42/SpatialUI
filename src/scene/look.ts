/**
 * Standing somewhere and turning your head, as arithmetic.
 *
 * The scene had one camera gesture and it was an orbit: the eye swung around a
 * fixed point at plant height and always aimed at it. That is a good way to
 * examine an object and a poor way to be somewhere, and it had one consequence
 * nobody could work around — **an orbit cannot look up**. The aim is pinned to
 * the target, so the upper sky is never in frame, and the sun is the time
 * control. For most of the day the thing you scrub time with was a real object
 * in the world that a desktop pointer could not reach. Standing inside the
 * greenhouse neither caused that nor cured it; it removed the last escape, which
 * had been backing away until the sky came into view.
 *
 * So the fixed thing changes. An orbit fixes the target and moves the eye; this
 * fixes the eye and moves the aim, which is what a person does. You stand on the
 * path, turn to look at whatever you like including straight up, and walk.
 *
 * Kept pure and out of the component for the reason `sway`, `dust` and
 * `daylight` are: the limits are the design decision, and they should be
 * assertable without a renderer.
 */

/** Where the view is pointed: a compass bearing and an elevation, in radians. */
export interface Look {
  /** Rotation about the vertical axis. Unbounded — you may turn all the way. */
  yaw: number;
  /** Elevation. Positive is up, and up is the whole point. */
  pitch: number;
}

export interface LookLimits {
  /** How far the view may rise. */
  maxPitch: number;
  /** How far it may fall. Negative. */
  minPitch: number;
}

/**
 * The pitch range.
 *
 * **Up reaches the zenith**, less a hair for numerical comfort, and that is not
 * generosity — at midsummer the sun passes nearly overhead, and a control that
 * stopped at a comfortable sixty degrees would leave the time scrub unreachable
 * on exactly the days it climbs highest. The ceiling has to be the sky, not a
 * taste in framing.
 *
 * **Down stops well short of your own feet.** Below the horizon there is the bed
 * in front of you and then the floor you are standing on, and past that the view
 * is through the floor at the underside of the world. Sixty degrees reaches the
 * near bed's soil and no further.
 */
export const LOOK_LIMITS: LookLimits = {
  maxPitch: Math.PI / 2 - 0.01,
  minPitch: -Math.PI / 3,
};

/**
 * Radians turned per pixel dragged.
 *
 * Set so a drag across a typical window turns about three quarters of the way
 * round, which is the rate that lets you find something behind you in one
 * gesture without overshooting whatever you were aiming at.
 */
export const TURN_PER_PIXEL = 0.0042;

/** The ring of floor a viewer may stand on: the path between planting and glass. */
export interface Path {
  /** Closest to the middle of the planting, so you cannot walk into a bed. */
  minRadius: number;
  /** Furthest out, which is the glass. */
  maxRadius: number;
}

export function clampPitch(pitch: number, limits: LookLimits = LOOK_LIMITS): number {
  if (pitch > limits.maxPitch) return limits.maxPitch;
  if (pitch < limits.minPitch) return limits.minPitch;
  return pitch;
}

/**
 * Where a drag leaves the view.
 *
 * Yaw accumulates without limit and is deliberately not wrapped: a wrap would
 * be invisible here and would make the value jump under any caller that
 * interpolates it. Pitch is clamped rather than wrapped, because rolling over
 * the top would put the horizon upside down.
 */
export function turn(
  look: Look,
  dx: number,
  dy: number,
  limits: LookLimits = LOOK_LIMITS,
  perPixel: number = TURN_PER_PIXEL,
): Look {
  return {
    yaw: look.yaw - dx * perPixel,
    // Dragging down looks up: the gesture moves the world, not the head, which
    // is the same direction of travel as the sun drag and as every map.
    pitch: clampPitch(look.pitch - dy * perPixel, limits),
  };
}

/** The direction a yaw faces, on the ground. Three.js cameras look down -Z. */
export function facing(yaw: number): [number, number] {
  return [-Math.sin(yaw), -Math.cos(yaw)];
}

/**
 * The look that aims from one point at another.
 *
 * Used to take over from the framing arithmetic exactly: the viewpoint says
 * where a body stands and what it should be looking at, and this turns the
 * second into a heading rather than leaving the two descriptions to drift.
 */
export function lookAt(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  limits: LookLimits = LOOK_LIMITS,
): Look {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const ground = Math.hypot(dx, dz);
  return {
    yaw: Math.atan2(-dx, -dz),
    pitch: clampPitch(ground === 0 ? 0 : Math.atan2(dy, ground), limits),
  };
}

/**
 * Where a step lands, kept on the path.
 *
 * The planting is treated as a disc and the house as a larger one, which is the
 * same simplification the orbit made with its near and far radius — it is only
 * doing a different job now, holding a viewer who can walk in any direction
 * rather than one who could only swing around the middle. Landing inside the
 * planting pushes back out along the radius, so walking into a bed slides you
 * along it rather than stopping you dead, which is what walking into a bed
 * actually does.
 */
export function walk(
  position: readonly [number, number, number],
  yaw: number,
  distance: number,
  path: Path,
): [number, number, number] {
  const [fx, fz] = facing(yaw);
  let x = position[0] + fx * distance;
  let z = position[2] + fz * distance;

  const radius = Math.hypot(x, z);
  if (radius < 1e-6) {
    // Dead centre, where a radius has no direction. Step back out the way the
    // walk was heading, which is the only direction the gesture defines.
    return [fx * path.minRadius, position[1], fz * path.minRadius];
  }

  const clamped =
    radius < path.minRadius
      ? path.minRadius
      : radius > path.maxRadius
        ? path.maxRadius
        : radius;

  if (clamped !== radius) {
    x = (x / radius) * clamped;
    z = (z / radius) * clamped;
  }
  return [x, position[1], z];
}
