import { describe, expect, it } from 'vitest';
import {
  LOOK_LIMITS,
  TURN_PER_PIXEL,
  clampPitch,
  facing,
  lookAt,
  turn,
  walk,
  type Path,
} from './look';

const PATH: Path = { minRadius: 1.2, maxRadius: 6 };
const EYE: [number, number, number] = [0, 1.62, 4];

describe('turning', () => {
  it('reaches the zenith, because the sun is the time control', () => {
    // The failure this control exists to fix: an orbit aims at its target, so
    // the upper sky is never in frame and the sun cannot be pointed at. A
    // ceiling short of overhead would reproduce it on midsummer days.
    expect(LOOK_LIMITS.maxPitch).toBeGreaterThan(Math.PI / 2 - 0.02);
    expect(LOOK_LIMITS.maxPitch).toBeLessThan(Math.PI / 2);

    let look = { yaw: 0, pitch: 0 };
    for (let i = 0; i < 200; i++) look = turn(look, 0, -20);
    expect(look.pitch).toBe(LOOK_LIMITS.maxPitch);
  });

  it('stops well short of looking through the floor', () => {
    let look = { yaw: 0, pitch: 0 };
    for (let i = 0; i < 200; i++) look = turn(look, 0, 20);
    expect(look.pitch).toBe(LOOK_LIMITS.minPitch);
    expect(look.pitch).toBeGreaterThan(-Math.PI / 2);
  });

  it('turns all the way round without wrapping the value', () => {
    // Unbounded on purpose: a wrap is invisible here and would make the number
    // jump under anything that interpolates it.
    const full = (2 * Math.PI) / TURN_PER_PIXEL;
    const look = turn({ yaw: 0, pitch: 0 }, full, 0);
    expect(look.yaw).toBeCloseTo(-2 * Math.PI, 6);
  });

  it('moves the world under the drag, not the head', () => {
    // Dragging down looks up, the same direction of travel as the sun drag.
    expect(turn({ yaw: 0, pitch: 0 }, 0, -10).pitch).toBeGreaterThan(0);
    expect(turn({ yaw: 0, pitch: 0 }, 10, 0).yaw).toBeLessThan(0);
  });

  it('clamps a pitch handed to it directly', () => {
    expect(clampPitch(4)).toBe(LOOK_LIMITS.maxPitch);
    expect(clampPitch(-4)).toBe(LOOK_LIMITS.minPitch);
    expect(clampPitch(0.3)).toBe(0.3);
  });
});

describe('facing', () => {
  it('points down negative z at rest, which is where a camera looks', () => {
    const [x, z] = facing(0);
    expect(x).toBeCloseTo(0, 10);
    expect(z).toBeCloseTo(-1, 10);
  });

  it('turns anticlockwise seen from above', () => {
    const [x, z] = facing(Math.PI / 2);
    expect(x).toBeCloseTo(-1, 10);
    expect(z).toBeCloseTo(0, 10);
  });
});

describe('taking over from the framing', () => {
  it('aims at the target the viewpoint names', () => {
    // The handover has to be exact, or walking into a garden would face
    // somewhere other than where the framing arithmetic says.
    const look = lookAt(EYE, [0, 1, 0]);
    expect(look.yaw).toBeCloseTo(0, 10);
    // Standing at eye height looking at plant height is a slight look down.
    expect(look.pitch).toBeLessThan(0);
    expect(look.pitch).toBeGreaterThan(-0.2);
  });

  it('faces the target it is given, whichever side it is on', () => {
    // Asserted through `facing` rather than on the raw angle: yaw is unbounded
    // and +pi and -pi are the same bearing, so the number is not the claim.
    const from = [
      [0, 1, -4],
      [4, 1, 0],
      [-4, 1, 0],
    ] as const;
    const toward = [
      [0, 1],
      [-1, 0],
      [1, 0],
    ];
    from.forEach((eye, i) => {
      const [x, z] = facing(lookAt(eye, [0, 1, 0]).yaw);
      expect(x, `${eye}`).toBeCloseTo(toward[i][0], 10);
      expect(z, `${eye}`).toBeCloseTo(toward[i][1], 10);
    });
  });

  it('does not tip over when asked to aim at where it already stands', () => {
    expect(lookAt([0, 1, 0], [0, 1, 0]).pitch).toBe(0);
  });
});

describe('walking the path', () => {
  it('steps along the way it is facing', () => {
    const [x, , z] = walk(EYE, 0, 1, PATH);
    expect(x).toBeCloseTo(0, 10);
    expect(z).toBeCloseTo(3, 10);
  });

  it('stops at the glass rather than walking through it', () => {
    const [x, , z] = walk(EYE, Math.PI, 100, PATH);
    expect(Math.hypot(x, z)).toBeCloseTo(PATH.maxRadius, 10);
  });

  it('stops at the planting rather than walking into a bed', () => {
    // Straight at the middle from four metres out, landing well inside the
    // beds. It is pushed back to the near edge of them, still on the far side
    // of where it started, because that is the way the walk was going.
    const [x, , z] = walk(EYE, 0, 4.5, PATH);
    expect(Math.hypot(x, z)).toBeCloseTo(PATH.minRadius, 10);
    expect(z).toBeLessThan(0);
  });

  it('lets a long stride cross the garden and come out the other side', () => {
    // Overshooting the planting entirely is a legal walk: you have gone round
    // to the far path, which is a place a person can stand.
    const [x, , z] = walk(EYE, 0, 6, PATH);
    expect(Math.hypot(x, z)).toBeCloseTo(2, 10);
    expect(z).toBeCloseTo(-2, 10);
  });

  it('keeps a walk that stays on the path exactly where it landed', () => {
    const [x, , z] = walk([0, 1.62, 4], 0, 0.5, PATH);
    expect(Math.hypot(x, z)).toBeCloseTo(3.5, 10);
  });

  it('never changes the standing height', () => {
    // Eye height is a fact about a body, not about where it is standing.
    for (const distance of [-3, 0, 0.5, 40]) {
      expect(walk(EYE, 1.1, distance, PATH)[1]).toBe(EYE[1]);
    }
  });

  it('leaves dead centre in the direction the walk was heading', () => {
    // A radius has no direction at the origin, and the gesture is the only
    // thing that does.
    const [x, , z] = walk([0, 1.62, 0], Math.PI / 2, 0, PATH);
    expect(Math.hypot(x, z)).toBeCloseTo(PATH.minRadius, 10);
    expect(x).toBeCloseTo(-PATH.minRadius, 10);
  });
});
