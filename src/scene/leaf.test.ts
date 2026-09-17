import { describe, expect, it } from 'vitest';
import {
  BLADE_ROWS,
  bladeHalfWidth,
  bladeMesh,
  edgeLift,
  LEAF_PROFILES,
  midribLift,
  type LeafProfile,
} from './leaf';

const BROAD = LEAF_PROFILES.broad;

describe('bladeHalfWidth', () => {
  it('closes to a point at both ends', () => {
    expect(bladeHalfWidth(0, BROAD)).toBeCloseTo(0);
    expect(bladeHalfWidth(1, BROAD)).toBeCloseTo(0);
  });

  it('is widest exactly at the shoulder', () => {
    expect(bladeHalfWidth(BROAD.shoulder, BROAD)).toBeCloseTo(1);
    for (const t of [0.1, 0.2, 0.6, 0.8, 0.95]) {
      expect(bladeHalfWidth(t, BROAD)).toBeLessThan(1.0001);
    }
  });

  it('swells monotonically up to the shoulder and tapers after it', () => {
    let previous = -1;
    for (let t = 0; t <= BROAD.shoulder; t += BROAD.shoulder / 8) {
      const w = bladeHalfWidth(t, BROAD);
      expect(w).toBeGreaterThanOrEqual(previous);
      previous = w;
    }
    previous = 2;
    for (let t = BROAD.shoulder; t <= 1; t += (1 - BROAD.shoulder) / 8) {
      const w = bladeHalfWidth(t, BROAD);
      expect(w).toBeLessThanOrEqual(previous + 1e-9);
      previous = w;
    }
  });

  // The defect the blade replaces. A squashed octahedron is a diamond: two
  // straight edges meeting at a blunt corner. Every profile here swells off its
  // base along a curve instead, bulging outside the straight line a diamond
  // would draw, which is what makes the outline read as grown.
  //
  // A centred shoulder is not the tell and `round` keeps one on purpose: a
  // weed's small leaf really is widest in the middle. Its edges are still
  // curved, which is the property that matters.
  it('is not a diamond: every outline bulges off the straight line', () => {
    for (const [kind, profile] of Object.entries(LEAF_PROFILES)) {
      const half = profile.shoulder / 2;
      // A straight edge from the base to the shoulder would be exactly half
      // width halfway along.
      expect(bladeHalfWidth(half, profile), kind).toBeGreaterThan(0.6);
    }
  });

  it('clamps outside the blade rather than running away', () => {
    expect(bladeHalfWidth(-1, BROAD)).toBeCloseTo(0);
    expect(bladeHalfWidth(2, BROAD)).toBeCloseTo(0);
  });

  it('survives degenerate profiles without dividing by zero', () => {
    const atBase: LeafProfile = { shoulder: 0, cup: 0, curl: 0, taper: 1 };
    const atTip: LeafProfile = { shoulder: 1, cup: 0, curl: 0, taper: 1 };
    expect(Number.isFinite(bladeHalfWidth(0.5, atBase))).toBe(true);
    expect(Number.isFinite(bladeHalfWidth(0.5, atTip))).toBe(true);
  });
});

describe('midribLift', () => {
  it('leaves the base in the plane it attaches at', () => {
    expect(midribLift(0, BROAD)).toBeCloseTo(0);
  });

  it('reaches the full curl at the tip', () => {
    expect(midribLift(1, BROAD)).toBeCloseTo(BROAD.curl);
  });

  it('accumulates toward the tip rather than hinging at the stalk', () => {
    // Quadratic: the first half of the leaf bends much less than the second.
    const firstHalf = midribLift(0.5, BROAD) - midribLift(0, BROAD);
    const secondHalf = midribLift(1, BROAD) - midribLift(0.5, BROAD);
    expect(secondHalf).toBeGreaterThan(firstHalf * 2);
  });
});

describe('edgeLift', () => {
  it('lifts the edges off the midrib where the blade is wide', () => {
    expect(edgeLift(BROAD.shoulder, BROAD)).toBeCloseTo(BROAD.cup);
  });

  it('closes the channel as the blade narrows to its point', () => {
    expect(edgeLift(0, BROAD)).toBeCloseTo(0);
    expect(edgeLift(1, BROAD)).toBeCloseTo(0);
  });
});

describe('bladeMesh', () => {
  it('spans the same -1 to 1 the old solids did, so downstream scaling holds', () => {
    const { positions } = bladeMesh(BROAD);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 1; i < positions.length; i += 3) {
      min = Math.min(min, positions[i]);
      max = Math.max(max, positions[i]);
    }
    expect(min).toBeCloseTo(-1);
    expect(max).toBeCloseTo(1);
  });

  it('comes to a single vertex at the base and at the tip', () => {
    const { positions, vertexCount } = bladeMesh(BROAD);
    // 1 + 3 * (rows - 2) + 1
    expect(vertexCount).toBe(2 + 3 * (BLADE_ROWS - 2));
    // The first and last vertices sit on the midrib.
    expect(positions[0]).toBeCloseTo(0);
    expect(positions[(vertexCount - 1) * 3]).toBeCloseTo(0);
  });

  it('indexes only vertices it created', () => {
    for (const profile of Object.values(LEAF_PROFILES)) {
      const { indices, vertexCount } = bladeMesh(profile);
      expect(indices.length % 3).toBe(0);
      for (const index of indices) {
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(vertexCount);
      }
    }
  });

  it('stays inside the instancing budget it has to be multiplied by', () => {
    const { indices, vertexCount } = bladeMesh(BROAD);
    // The octahedron it replaces was 6 vertices and 8 triangles. Half again as
    // much geometry is the deal; several times as much is not.
    expect(vertexCount).toBeLessThanOrEqual(12);
    expect(indices.length / 3).toBeLessThanOrEqual(14);
  });

  it('is symmetric about the midrib', () => {
    const { positions, vertexCount } = bladeMesh(BROAD);
    for (let v = 0; v < vertexCount; v++) {
      const x = positions[v * 3];
      // Every off-midrib vertex has a partner mirrored across it.
      if (Math.abs(x) < 1e-6) continue;
      const partner = positions[(x < 0 ? v + 2 : v - 2) * 3];
      expect(partner).toBeCloseTo(-x);
    }
  });

  it('folds: the edges do not sit in the midrib plane', () => {
    const { positions } = bladeMesh(BROAD);
    // Second row: left edge, midrib, right edge at indices 1, 2, 3.
    const leftZ = positions[1 * 3 + 2];
    const midZ = positions[2 * 3 + 2];
    const rightZ = positions[3 * 3 + 2];
    expect(leftZ).toBeGreaterThan(midZ);
    expect(rightZ).toBeGreaterThan(midZ);
    expect(leftZ).toBeCloseTo(rightZ);
  });

  it('builds a usable strip at any row count it is asked for', () => {
    for (const rows of [3, 4, 5, 6, 8]) {
      const { indices, vertexCount } = bladeMesh(BROAD, rows);
      expect(vertexCount).toBe(2 + 3 * (rows - 2));
      expect(indices.length).toBeGreaterThan(0);
      for (const index of indices) expect(index).toBeLessThan(vertexCount);
    }
  });
});
