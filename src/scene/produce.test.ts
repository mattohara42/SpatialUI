import { describe, expect, it } from 'vitest';
import { bunchOffset } from './Produce';

describe('bunchOffset', () => {
  it('puts a lone fruit exactly on its anchor', () => {
    expect(bunchOffset(0, 1, 3, 6)).toEqual([0, 0, 0]);
  });

  it('hangs: every berry after the first is below the anchor', () => {
    for (let i = 1; i < 24; i++) {
      expect(bunchOffset(i, 24, 3, 6)[1]).toBeLessThan(0);
    }
  });

  it('reaches the full drop at its tip and no further', () => {
    expect(bunchOffset(23, 24, 3, 6)[1]).toBeCloseTo(-6);
    for (let i = 0; i < 24; i++) {
      expect(bunchOffset(i, 24, 3, 6)[1]).toBeGreaterThanOrEqual(-6);
    }
  });

  // A bunch is a cone hanging point-down: widest where it joins the stem,
  // closing to a single berry at the tip. That taper is the whole silhouette.
  it('is widest at the shoulder and closes to a point', () => {
    const radius = (i: number) => Math.hypot(...[0, 2].map((k) => bunchOffset(i, 24, 3, 6)[k]));
    expect(radius(0)).toBeCloseTo(3);
    expect(radius(23)).toBeCloseTo(0);
    let previous = Infinity;
    for (let i = 0; i < 24; i++) {
      const r = radius(i);
      expect(r).toBeLessThanOrEqual(previous + 1e-9);
      previous = r;
    }
  });

  it('never exceeds its stated half-width', () => {
    for (let i = 0; i < 26; i++) {
      const [x, , z] = bunchOffset(i, 26, 3.2, 6);
      expect(Math.hypot(x, z)).toBeLessThanOrEqual(3.2 + 1e-9);
    }
  });

  // Golden-angle turning is what keeps the berries from settling into visible
  // rows or a seam running down one side of the bunch.
  it('spreads berries around rather than stacking them on one bearing', () => {
    const bearings = new Set<string>();
    for (let i = 0; i < 26; i++) {
      const [x, , z] = bunchOffset(i, 26, 3.2, 6);
      bearings.add(Math.atan2(z, x).toFixed(2));
    }
    expect(bearings.size).toBeGreaterThan(20);
  });

  it('is deterministic, so a bunch does not reshuffle between frames', () => {
    expect(bunchOffset(7, 26, 3.2, 6)).toEqual(bunchOffset(7, 26, 3.2, 6));
  });
});
