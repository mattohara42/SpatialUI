import { describe, expect, it } from 'vitest';
import {
  BARK_REPEAT,
  coneNormalY,
  GRAIN_PER_METRE,
  limbAttribute,
  taperedRadius,
} from './taper';

describe('taperedRadius', () => {
  it('is the start radius at the start and the end radius at the end', () => {
    expect(taperedRadius(0.08, 0.02, 0)).toBeCloseTo(0.08);
    expect(taperedRadius(0.08, 0.02, 1)).toBeCloseTo(0.02);
  });

  it('interpolates continuously between them', () => {
    expect(taperedRadius(0.08, 0.02, 0.5)).toBeCloseTo(0.05);
    expect(taperedRadius(0.08, 0.02, 0.25)).toBeCloseTo(0.065);
  });

  it('narrows monotonically along a limb that narrows', () => {
    let previous = Infinity;
    for (let t = 0; t <= 1; t += 0.1) {
      const radius = taperedRadius(0.1, 0.01, t);
      expect(radius).toBeLessThan(previous);
      previous = radius;
    }
  });

  // The whole point of the attribute: the old code averaged the two radii and
  // drew a barrel, and the mean is exactly what the midpoint now agrees with
  // while the ends no longer do.
  it('agrees with the old mean only at the midpoint', () => {
    const mean = (0.08 + 0.02) / 2;
    expect(taperedRadius(0.08, 0.02, 0.5)).toBeCloseTo(mean);
    expect(taperedRadius(0.08, 0.02, 0)).not.toBeCloseTo(mean);
    expect(taperedRadius(0.08, 0.02, 1)).not.toBeCloseTo(mean);
  });
});

describe('coneNormalY', () => {
  it('is zero for a limb that does not taper, leaving a cylinder normal', () => {
    expect(coneNormalY(0.05, 0.05)).toBe(0);
  });

  it('is positive for a narrowing limb, tilting the normal up the taper', () => {
    expect(coneNormalY(0.08, 0.02)).toBeCloseTo(0.06);
  });

  it('is negative for a limb that widens', () => {
    expect(coneNormalY(0.02, 0.08)).toBeCloseTo(-0.06);
  });
});

describe('limbAttribute', () => {
  it('passes both radii through untouched, so the shader can interpolate', () => {
    const [start, end] = limbAttribute(0.08, 0.02, 1);
    expect(start).toBe(0.08);
    expect(end).toBe(0.02);
  });

  it('scales the along-limb repeat with length', () => {
    const short = limbAttribute(0.05, 0.05, 0.25)[3];
    const long = limbAttribute(0.05, 0.05, 1)[3];
    expect(long).toBeCloseTo(short * 4);
  });

  it('scales the around-limb repeat with girth', () => {
    const twig = limbAttribute(0.01, 0.01, 1)[2];
    const trunk = limbAttribute(0.04, 0.04, 1)[2];
    expect(trunk).toBeCloseTo(twig * 4);
  });

  it('divides out the repeat the texture already carries', () => {
    // One metre at the stated rate should land exactly GRAIN_PER_METRE cycles
    // along the limb once the texture's own repeat is accounted for.
    const [, , , v] = limbAttribute(0.05, 0.05, 1);
    expect(v * BARK_REPEAT[1]).toBeCloseTo(GRAIN_PER_METRE);
  });

  // The defect this replaces: a twig and a trunk got the same two cycles along
  // their length, so a twig a tenth as long wore its grain ten times too fine.
  it('gives a twig and a trunk the same grain rate per metre', () => {
    const twig = limbAttribute(0.01, 0.005, 0.08);
    const trunk = limbAttribute(0.09, 0.07, 0.8);
    expect(trunk[3] / 0.8).toBeCloseTo(twig[3] / 0.08);
  });

  it('is finite for a degenerate zero-length, zero-radius limb', () => {
    for (const value of limbAttribute(0, 0, 0)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});
