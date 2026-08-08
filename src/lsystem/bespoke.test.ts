import { describe, expect, it } from 'vitest';
import { generatePlant } from './generate';

const finite = (n: number) => Number.isFinite(n);

/**
 * The bespoke forms go through generatePlant like any preset, so these check the
 * same contract the L-system plants keep: deterministic, finite, scaled to the
 * requested height, and shedding foliage as health drops.
 */
describe.each(['vine', 'topiary'] as const)('%s', (preset) => {
  it('is deterministic for a seed', () => {
    const a = generatePlant({ seed: 'p/1', vitality: 0.8, growthScale: 2, preset });
    const b = generatePlant({ seed: 'p/1', vitality: 0.8, growthScale: 2, preset });
    expect(a).toEqual(b);
  });

  it('differs by seed', () => {
    const a = generatePlant({ seed: 'p/1', vitality: 0.8, growthScale: 2, preset });
    const b = generatePlant({ seed: 'p/2', vitality: 0.8, growthScale: 2, preset });
    expect(a.segmentStart).not.toEqual(b.segmentStart);
  });

  it('emits finite coordinates and positive radii', () => {
    for (const vitality of [0.1, 0.5, 1]) {
      const g = generatePlant({ seed: 'p/x', vitality, growthScale: 2, preset });
      expect(g.segmentStart.every(finite)).toBe(true);
      expect(g.segmentEnd.every(finite)).toBe(true);
      expect(g.segmentRadius.every((r) => r > 0)).toBe(true);
      expect(g.leafPosition.every(finite)).toBe(true);
      expect(g.truncated).toBe(false);
    }
  });

  it('scales to the requested height', () => {
    for (const growthScale of [0.6, 1.5, 3]) {
      const g = generatePlant({ seed: 'p/h', vitality: 0.9, growthScale, preset });
      expect(g.bounds.max[1] - g.bounds.min[1]).toBeCloseTo(growthScale, 4);
    }
  });

  it('sizes every array to its declared count', () => {
    const g = generatePlant({ seed: 'p/s', vitality: 0.8, growthScale: 2, preset });
    expect(g.segmentStart).toHaveLength(g.segmentCount * 3);
    expect(g.segmentRadius).toHaveLength(g.segmentCount * 2);
    expect(g.leafPosition).toHaveLength(g.leafCount * 3);
    expect(g.leafScale).toHaveLength(g.leafCount);
  });

  it('sheds foliage as vitality drops', () => {
    const sick = generatePlant({ seed: 'p/v', vitality: 0.1, growthScale: 2, preset });
    const well = generatePlant({ seed: 'p/v', vitality: 1, growthScale: 2, preset });
    expect(sick.leafCount).toBeLessThan(well.leafCount);
  });
});

describe('topiary', () => {
  it('grows stray shoots as it is neglected', () => {
    // A tended topiary is a clean shell (trunk only); a neglected one sprouts
    // shoots through the surface, so its segment count climbs as health falls.
    const tended = generatePlant({ seed: 't/1', vitality: 1, growthScale: 2, preset: 'topiary' });
    const neglected = generatePlant({ seed: 't/1', vitality: 0.1, growthScale: 2, preset: 'topiary' });
    expect(neglected.segmentCount).toBeGreaterThan(tended.segmentCount);
  });
});
