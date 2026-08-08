import { describe, expect, it } from 'vitest';
import { generatePlant } from './generate';
import { expand, MAX_SYMBOLS } from './grammar';
import { rngFromSeed } from './random';

const finite = (n: number) => Number.isFinite(n);

describe('generatePlant', () => {
  it('is deterministic for a given seed', () => {
    const a = generatePlant({ seed: 'checkout/api-1', vitality: 0.7, growthScale: 2 });
    const b = generatePlant({ seed: 'checkout/api-1', vitality: 0.7, growthScale: 2 });
    expect(a).toEqual(b);
  });

  it('produces different shapes for different seeds', () => {
    const a = generatePlant({ seed: 'checkout/api-1', vitality: 0.7, growthScale: 2 });
    const b = generatePlant({ seed: 'checkout/api-2', vitality: 0.7, growthScale: 2 });
    expect(a.segmentStart).not.toEqual(b.segmentStart);
  });

  it('scales to the requested height', () => {
    for (const growthScale of [0.2, 1, 4]) {
      const g = generatePlant({ seed: 'x', vitality: 0.8, growthScale });
      expect(g.bounds.max[1] - g.bounds.min[1]).toBeCloseTo(growthScale, 5);
    }
  });

  it('emits only finite coordinates and positive radii', () => {
    for (const vitality of [0, 0.25, 0.5, 0.75, 1]) {
      const g = generatePlant({ seed: 'x', vitality, growthScale: 2 });
      expect(g.segmentStart.every(finite)).toBe(true);
      expect(g.segmentEnd.every(finite)).toBe(true);
      expect(g.segmentRadius.every((r) => r > 0)).toBe(true);
      expect(g.leafPosition.every(finite)).toBe(true);
    }
  });

  it('sizes every array to its declared count', () => {
    const g = generatePlant({ seed: 'x', vitality: 0.8, growthScale: 2 });
    expect(g.segmentStart).toHaveLength(g.segmentCount * 3);
    expect(g.segmentEnd).toHaveLength(g.segmentCount * 3);
    expect(g.segmentRadius).toHaveLength(g.segmentCount * 2);
    expect(g.segmentDepth).toHaveLength(g.segmentCount);
    expect(g.leafPosition).toHaveLength(g.leafCount * 3);
    expect(g.leafDirection).toHaveLength(g.leafCount * 3);
    expect(g.leafScale).toHaveLength(g.leafCount);
    expect(g.leafDepth).toHaveLength(g.leafCount);
  });

  it('sheds foliage as vitality drops', () => {
    const sick = generatePlant({ seed: 'x', vitality: 0.1, growthScale: 2 });
    const healthy = generatePlant({ seed: 'x', vitality: 1, growthScale: 2 });
    expect(sick.leafCount).toBeLessThan(healthy.leafCount);
  });

  it('grows a smaller structure at low maturity', () => {
    const young = generatePlant({ seed: 'x', vitality: 0.9, growthScale: 2, maturity: 0 });
    const old = generatePlant({ seed: 'x', vitality: 0.9, growthScale: 2, maturity: 1 });
    expect(young.segmentCount).toBeLessThan(old.segmentCount);
  });

  it('survives a degenerate grammar without producing NaN', () => {
    const g = generatePlant({
      seed: 'x',
      vitality: 1,
      growthScale: 2,
      grammar: { axiom: '+', rules: {}, iterations: 1 },
    });
    expect(g.segmentCount).toBe(0);
    expect(g.bounds.min.every(finite)).toBe(true);
  });
});

describe('expand', () => {
  it('stops at the symbol budget instead of exploding', () => {
    const { symbols, truncated } = expand(
      { axiom: 'A', rules: { A: 'AAAA' }, iterations: 20 },
      rngFromSeed('x'),
    );
    expect(truncated).toBe(true);
    expect(symbols.length).toBeLessThanOrEqual(MAX_SYMBOLS);
  });
});
