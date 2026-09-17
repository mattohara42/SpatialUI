import { describe, expect, it } from 'vitest';
import { GARDEN_AO, kernelOcclusion, sampleOcclusion } from './ao';

describe('sampleOcclusion', () => {
  // Without a bias a flat surface occludes itself: its own depth wanders by a
  // fraction of a millimetre between neighbouring pixels, and every one of those
  // wobbles reads as a tiny occluder.
  it('ignores differences below the bias', () => {
    expect(sampleOcclusion(0, 0.2)).toBe(0);
    expect(sampleOcclusion(0.001, 0.2)).toBe(0);
    expect(sampleOcclusion(0.02, 0.2, 0.02)).toBe(0);
  });

  it('occludes once something is genuinely in front', () => {
    expect(sampleOcclusion(0.1, 0.2)).toBeGreaterThan(0);
  });

  it('never exceeds full occlusion', () => {
    for (const difference of [0.03, 0.1, 0.5, 5, 500]) {
      const occlusion = sampleOcclusion(difference, 0.2);
      expect(occlusion).toBeGreaterThanOrEqual(0);
      expect(occlusion).toBeLessThanOrEqual(1);
    }
  });

  // The other classic artefact: counting a distant occluder draws a dark
  // outline round every object in the foreground.
  it('fades back out for an occluder far beyond the radius', () => {
    const close = sampleOcclusion(0.2, 0.2);
    const distant = sampleOcclusion(4, 0.2);
    expect(distant).toBeLessThan(close);
    expect(distant).toBeLessThan(0.1);
  });

  it('is zero for a degenerate radius rather than dividing by it', () => {
    expect(sampleOcclusion(1, 0)).toBe(0);
  });
});

describe('kernelOcclusion', () => {
  it('is nothing when no sample was blocked', () => {
    expect(kernelOcclusion([0, 0, 0, 0], 1)).toBe(0);
  });

  it('rises with how many samples were blocked', () => {
    const few = kernelOcclusion([1, 0, 0, 0], 1);
    const many = kernelOcclusion([1, 1, 1, 0], 1);
    expect(many).toBeGreaterThan(few);
  });

  // The reason this averages rather than sums: dropping from sixteen samples to
  // eight in a lean frame has to make the result noisier, never darker.
  it('does not change strength with kernel size', () => {
    const eight = kernelOcclusion(Array(8).fill(0.5), 1);
    const sixteen = kernelOcclusion(Array(16).fill(0.5), 1);
    expect(eight).toBeCloseTo(sixteen);
  });

  it('clamps at full occlusion however hard it is driven', () => {
    expect(kernelOcclusion([1, 1, 1, 1], 10)).toBe(1);
  });

  it('is zero for an empty kernel', () => {
    expect(kernelOcclusion([], 1)).toBe(0);
  });
});

describe('GARDEN_AO', () => {
  // Felt rather than seen, which is the rule every piece of decoration in this
  // scene keeps. Past about one it stops reading as contact shading and starts
  // reading as dirt on the lens.
  it('is tuned to be felt rather than seen', () => {
    expect(GARDEN_AO.strength).toBeLessThanOrEqual(1);
    expect(GARDEN_AO.strength).toBeGreaterThan(0);
  });

  it('looks for crevices at the scale this garden actually has', () => {
    // Soil against timber, a trunk against the ground: centimetres, not metres.
    expect(GARDEN_AO.radius).toBeGreaterThan(0.05);
    expect(GARDEN_AO.radius).toBeLessThan(0.5);
  });

  it('keeps the kernel small enough to be one affordable pass', () => {
    expect(GARDEN_AO.samples).toBeLessThanOrEqual(16);
  });
});
