import { describe, expect, it } from 'vitest';
import {
  CAMERA_FOV,
  TABLE_AZIMUTH,
  TABLE_DISTANCE,
  TABLE_FILL,
  TABLE_MAX_DISTANCE,
  TABLE_MIN_DISTANCE,
  TABLE_PITCH,
  TABLE_PITCH_MAX,
  TABLE_PITCH_MIN,
  orbit,
  orbitPosition,
  tableGroundY,
  tableScaleFor,
  tableTarget,
  tableViewFor,
  zoomDistance,
} from './bonsai';
import { FLOOR_Y } from './greenhouse';
import { LABEL_FAR } from './labels';

/** Half the vertical field of view, in radians: the angle from the lens axis to
 *  the top of the frame, which the fit solves against. */
const HALF_FOV = (CAMERA_FOV * Math.PI) / 360;

describe('tableScaleFor', () => {
  it('shrinks a garden so its bounding radius fills the intended slice of frame', () => {
    // The whole point of a table: whatever a garden's footprint, its bounding
    // circle should subtend the same fraction of the frame at the resting
    // distance, so a huge garden and a tiny one come out the same size.
    for (const size of [[12, 8], [20, 8], [35, 46], [10, 10]] as const) {
      const scale = tableScaleFor(size);
      const radius = 0.5 * Math.hypot(size[0], size[1]) * scale;
      const framedFraction = radius / (TABLE_DISTANCE * Math.tan(HALF_FOV));
      expect(framedFraction).toBeCloseTo(TABLE_FILL, 6);
    }
  });

  it('makes the sprawling world garden far smaller than a mock one', () => {
    // The world garden is the reason this mode exists, and it must shrink hard.
    const world = tableScaleFor([35, 46]);
    const mock = tableScaleFor([12, 8]);
    expect(world).toBeLessThan(mock);
    expect(world).toBeLessThan(0.25);
  });

  it('is a no-op for a degenerate footprint rather than dividing by zero', () => {
    expect(tableScaleFor([0, 0])).toBe(1);
  });
});

describe('tableGroundY', () => {
  it('lands the scaled floor exactly on the ground', () => {
    // Scaling about the origin lifts the floor to scale*FLOOR_Y; the drop has to
    // put it back at FLOOR_Y so the model rests on the grass, not above it.
    for (const scale of [0.1, 0.2, 0.5, 1]) {
      const restedFloor = scale * FLOOR_Y + tableGroundY(scale);
      expect(restedFloor).toBeCloseTo(FLOOR_Y, 9);
    }
  });
});

describe('orbitPosition', () => {
  it('places the eye at the requested distance from the target', () => {
    const target: [number, number, number] = [0, 0.3, 0];
    const pos = orbitPosition(target, 0.4, 0.95, TABLE_DISTANCE);
    const d = Math.hypot(pos[0] - target[0], pos[1] - target[1], pos[2] - target[2]);
    expect(d).toBeCloseTo(TABLE_DISTANCE, 9);
  });

  it('rises with pitch and looks down the +Z axis at zero bearing', () => {
    const target: [number, number, number] = [0, 0, 0];
    const low = orbitPosition(target, 0, 0.4, TABLE_DISTANCE);
    const high = orbitPosition(target, 0, 1.2, TABLE_DISTANCE);
    expect(high[1]).toBeGreaterThan(low[1]);
    // Zero bearing sits on +Z, so the camera looks toward -Z, matching the
    // first-person start.
    expect(low[0]).toBeCloseTo(0, 9);
    expect(low[2]).toBeGreaterThan(0);
  });
});

describe('the resting table view keeps every label absent for free', () => {
  it('holds the whole garden beyond the tag radius at rest', () => {
    // No label logic is special-cased for the table; instead the nearest plant
    // is kept further than LABEL_FAR from the camera, so the existing distance
    // rule draws nothing. The nearest point of the shrunk garden is the bounding
    // radius toward the camera along the ground.
    for (const size of [[12, 8], [20, 8], [35, 46]] as const) {
      const view = tableViewFor(size);
      const radius = 0.5 * Math.hypot(size[0], size[1]) * view.scale;
      // Closest a plant can be: pull the bounding radius straight toward the
      // camera in the ground plane from the target.
      const ground = view.distance * Math.cos(view.pitch);
      const height = view.distance * Math.sin(view.pitch);
      const nearestGround = Math.max(0, ground - radius);
      const nearest = Math.hypot(nearestGround, height);
      expect(nearest).toBeGreaterThan(LABEL_FAR);
    }
  });

  it('never lets a zoom cross the tag radius', () => {
    // Even spun to the closest allowed distance the near clamp stays outside
    // LABEL_FAR, which is the invariant the whole "no text in the overview"
    // promise rests on.
    expect(TABLE_MIN_DISTANCE).toBeGreaterThan(LABEL_FAR);
    let d = 30;
    for (let i = 0; i < 5000; i++) d = zoomDistance(d, -100);
    expect(d).toBe(TABLE_MIN_DISTANCE);
    expect(d).toBeGreaterThan(LABEL_FAR);
  });
});

describe('orbit', () => {
  it('turns the bearing without limit and does not wrap', () => {
    let state = { azimuth: 0, pitch: TABLE_PITCH };
    for (let i = 0; i < 400; i++) state = orbit(state, 40, 0);
    // A full turn and more, kept as a growing number rather than wrapped to a
    // range, so an interpolator over it never sees a jump.
    expect(Math.abs(state.azimuth)).toBeGreaterThan(2 * Math.PI);
  });

  it('clamps the elevation to the table range from both ends', () => {
    const top = orbit({ azimuth: 0, pitch: TABLE_PITCH }, 0, 100000);
    const bottom = orbit({ azimuth: 0, pitch: TABLE_PITCH }, 0, -100000);
    expect(top.pitch).toBeCloseTo(TABLE_PITCH_MAX, 9);
    expect(bottom.pitch).toBeCloseTo(TABLE_PITCH_MIN, 9);
  });

  it('never tilts to eye level, so the table cannot become the room', () => {
    expect(TABLE_PITCH_MIN).toBeGreaterThan(0.2);
  });
});

describe('zoomDistance', () => {
  it('pulls back on a scroll away and clamps at the far end', () => {
    expect(zoomDistance(TABLE_DISTANCE, 100)).toBeGreaterThan(TABLE_DISTANCE);
    let d = 10;
    for (let i = 0; i < 5000; i++) d = zoomDistance(d, 100);
    expect(d).toBe(TABLE_MAX_DISTANCE);
  });
});

describe('tableViewFor', () => {
  it('starts at the resting orbit and aims at the shrunk planting', () => {
    const view = tableViewFor([20, 8]);
    expect(view.azimuth).toBe(TABLE_AZIMUTH);
    expect(view.pitch).toBe(TABLE_PITCH);
    expect(view.distance).toBe(TABLE_DISTANCE);
    expect(view.minDistance).toBe(TABLE_MIN_DISTANCE);
    expect(view.maxDistance).toBe(TABLE_MAX_DISTANCE);
    expect(view.target).toEqual(tableTarget(view.scale));
    // The position is the orbit resolved, so a control can fly to it and then
    // drive the orbit without the two disagreeing on frame one.
    expect(view.position).toEqual(
      orbitPosition(view.target, view.azimuth, view.pitch, view.distance),
    );
  });

  it('aims above the ground so soil does not fill the lower frame', () => {
    const view = tableViewFor([20, 8]);
    expect(view.target[1]).toBeGreaterThan(view.groundY);
  });
});
