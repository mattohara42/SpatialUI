/**
 * The garden on a table, as arithmetic.
 *
 * There are two grains of *time* in this project — hourly for a week, daily for
 * twenty — and until now one grain of *space*: you stand on the path and walk.
 * That is right for a bed you are among and wrong for a garden you want to take
 * in at once. The world garden is 193 plants across some 35 × 46 metres, and the
 * only way to see it whole was to scroll to the far end and lose the near one.
 * This is the second grain of space: the whole garden shrunk to **bonsai scale**
 * and set on a table you look down at from outside.
 *
 * The seam was already cut. `layoutGarden` returns a `size` for every garden and
 * its own comment says the field is "for Bonsai mode scaling" — the layout was
 * built to be shrunk, and nothing had ever shrunk it. So this is a new camera
 * and a new frame, not a new layout: the tabletop plant is the same plant,
 * smaller, and health still reads through droop, colour and density exactly as
 * it does in the room. It is a change of *distance*, not of reading.
 *
 * **Why shrink rather than fly the camera back.** The obvious alternative — leave
 * the garden full size and pull the camera out until the whole thing frames — is
 * defeated by the one number that lights the scene: `fogExp2` at density 0.02.
 * The world garden's bounding radius is near thirty metres, so framing it means
 * standing eighty back, and at eighty metres the exponential fog has swallowed it
 * whole. Bonsai scale keeps the model an arm's length away where the air is
 * clear, which is the same reason a architect builds a model instead of
 * photographing the building from orbit.
 *
 * Pure, and kept out of the component for the reason `look`, `greenhouse` and
 * `daylight` are: these are proportions, and the failure mode of getting them
 * wrong — a table you cannot see, a plant close enough to grow a label back —
 * is arithmetic anyone should be able to argue with in a test.
 */

import { FLOOR_Y } from './greenhouse';
import { LABEL_FAR } from './labels';
import { clampPitch, TURN_PER_PIXEL, type LookLimits } from './look';

/**
 * The camera's vertical field of view, in degrees. Must match the `fov` the
 * `Canvas` is created with in `App.tsx`; the fit arithmetic below solves for a
 * distance against it, and a mismatch would frame the table too tight or too
 * loose. Kept here because the fit is the design decision and the canvas is only
 * where it is applied.
 */
export const CAMERA_FOV = 50;

/**
 * How much of the frame's half-height the miniature's bounding radius fills at
 * the resting distance. Below one so there is air around the table rather than
 * the garden pressed to the glass; not far below, because a table lost in a
 * wide empty frame is a table nobody chose to look at.
 */
export const TABLE_FILL = 0.72;

/**
 * The resting distance from the table, in metres, and the range a zoom may take.
 *
 * The near clamp is the load-bearing one, and it is set from `labels`, not from
 * taste. A tag resolves within `LABEL_FAR` metres of the camera (see
 * `labels.ts`), and a whole-garden overview must have no text floating in it —
 * the same rule the room obeys, reached from the other side. Holding the closest
 * zoom just beyond `LABEL_FAR` means the distance rule keeps every label absent
 * on its own, with no label logic special-cased back in.
 */
export const TABLE_DISTANCE = 11;
export const TABLE_MIN_DISTANCE = LABEL_FAR + 0.6;
export const TABLE_MAX_DISTANCE = 22;

/**
 * The angle the view looks down at the table, in radians above the horizontal,
 * and how far a drag may tilt it. It rests at a three-quarter downward look —
 * enough to read the beds as a plan without flattening them to a floor plan —
 * and may tilt from a low raking angle to very nearly straight down, but never
 * to eye level: a table seen edge-on is a garden you are standing in again,
 * which is the mode this one exists to be an alternative to.
 */
export const TABLE_PITCH = 0.95;
export const TABLE_PITCH_MIN = 0.42;
export const TABLE_PITCH_MAX = 1.45;

/**
 * The compass bearing the table rests at, in radians. A slight turn off dead
 * centre, so beds read with a little depth rather than as a flat elevation, and
 * so the doorway gable is not staring straight down the lens.
 */
export const TABLE_AZIMUTH = 0.4;

/** Metres above the table's own floor that the view aims at: the middle of the
 *  planting once shrunk, so the frame centres on plants and not on soil. */
const TABLE_TARGET_LIFT = 0.8;

export interface TableView {
  /** Camera position, world space. */
  position: [number, number, number];
  /** What the camera looks at: the middle of the shrunk planting. */
  target: [number, number, number];
  /** Uniform scale the garden assembly is drawn at to become the miniature. */
  scale: number;
  /** How far the scaled assembly is dropped so its floor meets the ground. */
  groundY: number;
  /** Orbit state the camera starts at, for a control to take over from. */
  azimuth: number;
  pitch: number;
  distance: number;
  minDistance: number;
  maxDistance: number;
}

/** Elevation limits for the table orbit, phrased as `look`'s so the same clamp
 *  serves both cameras. */
export const TABLE_PITCH_LIMITS: LookLimits = {
  maxPitch: TABLE_PITCH_MAX,
  minPitch: TABLE_PITCH_MIN,
};

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

/**
 * The scale that turns a garden of a given footprint into a miniature that
 * frames at the resting distance.
 *
 * A garden is treated as its bounding circle — half the diagonal of the
 * footprint — because the camera can orbit, so the fit has to hold from any
 * bearing rather than only head-on. The wanted radius is what fills `TABLE_FILL`
 * of the frame at `distance`, and the scale is simply the ratio: a small mock
 * garden and the sprawling world one both come out the same size on the table,
 * which is the whole point of a table.
 */
export function tableScaleFor(
  size: readonly [number, number],
  distance = TABLE_DISTANCE,
  fov = CAMERA_FOV,
  fill = TABLE_FILL,
): number {
  const radius = 0.5 * Math.hypot(size[0], size[1]);
  if (radius <= 0) return 1;
  const wanted = distance * Math.tan((fov * Math.PI) / 360) * fill;
  return wanted / radius;
}

/**
 * How far to drop the scaled assembly so its floor sits on the ground.
 *
 * The garden's floor is at `FLOOR_Y`; scaling about the origin lifts it to
 * `scale * FLOOR_Y`, which would leave the miniature hovering a finger's width
 * over the field. Translating down by the difference lands it, so a model
 * greenhouse rests on the grass rather than floating above it.
 */
export function tableGroundY(scale: number): number {
  return FLOOR_Y - scale * FLOOR_Y;
}

/** The point the camera aims at: the origin, lifted to the middle of the shrunk
 *  planting so soil does not fill the lower frame. */
export function tableTarget(scale: number): [number, number, number] {
  return [0, tableGroundY(scale) + scale * TABLE_TARGET_LIFT, 0];
}

/**
 * Camera position from an orbit, in world space.
 *
 * Standard spherical placement around the target: `pitch` is elevation above the
 * horizontal and `azimuth` is bearing, with zero looking down the +Z axis so the
 * default table faces the same way the first-person camera starts. The ground
 * reach shrinks as the look tips toward vertical, which is what makes a steep
 * pitch a view from more directly overhead rather than merely a higher one.
 */
export function orbitPosition(
  target: readonly [number, number, number],
  azimuth: number,
  pitch: number,
  distance: number,
): [number, number, number] {
  const ground = distance * Math.cos(pitch);
  return [
    target[0] + ground * Math.sin(azimuth),
    target[1] + distance * Math.sin(pitch),
    target[2] + ground * Math.cos(azimuth),
  ];
}

/**
 * Where a drag leaves the orbit.
 *
 * Azimuth accumulates without limit — you may turn the table all the way round —
 * and is deliberately not wrapped, for the same reason `look.turn` does not wrap
 * yaw: a wrap is invisible and makes the value jump under anything that
 * interpolates it. Pitch is clamped to the table's elevation range, because past
 * the top the model turns upside down and past the bottom you are standing in
 * the garden again.
 *
 * Dragging *down* tips the view toward overhead and dragging *up* lowers it to a
 * raking angle — the gesture moves the table, not the eye, the same direction of
 * travel as the sun scrub and the first-person look.
 */
export function orbit(
  state: { azimuth: number; pitch: number },
  dx: number,
  dy: number,
  perPixel = TURN_PER_PIXEL,
): { azimuth: number; pitch: number } {
  return {
    azimuth: state.azimuth - dx * perPixel,
    pitch: clampPitch(state.pitch + dy * perPixel, TABLE_PITCH_LIMITS),
  };
}

/** How many metres a wheel notch moves the camera in or out. */
export const ZOOM_PER_NOTCH = 0.02;

/**
 * Where a wheel leaves the distance, clamped to the zoom range. Scrolling away
 * (positive deltaY) pulls back; the near clamp is what keeps labels from
 * resolving, so it is never crossed however hard the wheel is spun.
 */
export function zoomDistance(
  distance: number,
  deltaY: number,
  perNotch = ZOOM_PER_NOTCH,
  min = TABLE_MIN_DISTANCE,
  max = TABLE_MAX_DISTANCE,
): number {
  return clamp(distance + deltaY * perNotch, min, max);
}

/**
 * The whole resting view of a garden of a given footprint on the table: the
 * scale that shrinks it, where it sits, and the camera that looks at it. A
 * control takes the orbit state from here and animates the camera to `position`,
 * then drives it from `azimuth`/`pitch`/`distance` thereafter.
 */
export function tableViewFor(size: readonly [number, number]): TableView {
  const scale = tableScaleFor(size);
  const target = tableTarget(scale);
  return {
    scale,
    groundY: tableGroundY(scale),
    target,
    azimuth: TABLE_AZIMUTH,
    pitch: TABLE_PITCH,
    distance: TABLE_DISTANCE,
    minDistance: TABLE_MIN_DISTANCE,
    maxDistance: TABLE_MAX_DISTANCE,
    position: orbitPosition(target, TABLE_AZIMUTH, TABLE_PITCH, TABLE_DISTANCE),
  };
}
