import { describe, expect, it } from 'vitest';
import { FLIGHT_MS, ease, flyPose, lerp3, progress, type Pose } from './fly';

describe('ease', () => {
  it('is pinned at rest at both ends', () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
  });

  it('clamps outside the unit interval rather than shooting past', () => {
    expect(ease(-1)).toBe(0);
    expect(ease(2)).toBe(1);
  });

  it('starts and ends flat, so the flight has no lurch', () => {
    // Smootherstep has zero slope at both ends: the first and last steps move
    // almost nothing, which is what reads as accelerating away and settling in
    // rather than jumping.
    const start = ease(0.02) - ease(0);
    const middle = ease(0.52) - ease(0.5);
    const end = ease(1) - ease(0.98);
    expect(start).toBeLessThan(middle);
    expect(end).toBeLessThan(middle);
  });

  it('rises monotonically through the middle', () => {
    let previous = -1;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const v = ease(t);
      expect(v).toBeGreaterThanOrEqual(previous);
      previous = v;
    }
  });
});

describe('progress', () => {
  it('runs from nothing to everything across the duration', () => {
    expect(progress(0)).toBe(0);
    expect(progress(FLIGHT_MS)).toBe(1);
    expect(progress(FLIGHT_MS / 2)).toBeCloseTo(0.5, 9);
  });

  it('clamps past the ends and treats a degenerate flight as arrived', () => {
    expect(progress(-100)).toBe(0);
    expect(progress(FLIGHT_MS * 3)).toBe(1);
    expect(progress(0, 0)).toBe(1);
    expect(progress(50, -10)).toBe(1);
  });
});

describe('lerp3', () => {
  it('returns the ends exactly and the midpoint in the middle', () => {
    const a: [number, number, number] = [0, 0, 0];
    const b: [number, number, number] = [2, 4, 8];
    expect(lerp3(a, b, 0)).toEqual(a);
    expect(lerp3(a, b, 1)).toEqual(b);
    expect(lerp3(a, b, 0.5)).toEqual([1, 2, 4]);
  });
});

describe('flyPose', () => {
  const from: Pose = { position: [0, 1.6, 4], target: [0, 1, 0] };
  const to: Pose = { position: [3, 9, 8], target: [0, 0.3, 0] };

  it('is the origin pose at the start and the destination at the end', () => {
    expect(flyPose(from, to, 0)).toEqual(from);
    const end = flyPose(from, to, 1);
    for (let i = 0; i < 3; i++) {
      expect(end.position[i]).toBeCloseTo(to.position[i], 9);
      expect(end.target[i]).toBeCloseTo(to.target[i], 9);
    }
  });

  it('swings position and target together on one eased clock', () => {
    // The aim must not snap to the destination first and then be chased; both
    // are driven by the same eased fraction.
    const half = flyPose(from, to, 0.5);
    const e = ease(0.5);
    expect(half.position).toEqual(lerp3(from.position, to.position, e));
    expect(half.target).toEqual(lerp3(from.target, to.target, e));
  });
});
