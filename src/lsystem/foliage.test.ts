import { describe, expect, it } from 'vitest';
import { interpret } from './turtle';
import { generatePlant } from './generate';
import {
  DEFAULT_FOLIAGE,
  FOLIAGE,
  PRESETS,
  TREE_PRESETS,
  foliageFor,
  leafKindFor,
  type PresetName,
} from './presets';
import { rngFromSeed } from './random';
import type { TurtleParams } from './types';

const ALL = Object.keys(PRESETS) as PresetName[];

const params = (overrides: Partial<TurtleParams> = {}): TurtleParams => ({
  stepLength: 1,
  angleDeg: 25,
  baseRadius: 0.09,
  taper: 0.9,
  lengthFalloff: 0.9,
  jitter: 0,
  gravity: 0,
  leafScale: 0.2,
  leafSurvival: 1,
  leafCluster: 1,
  leafSpread: 0.5,
  ...overrides,
});

describe('leaf clusters', () => {
  // Three twigs, three leaf markers.
  const symbols = 'FJFJFJ';

  it('emits one leaf per marker at cluster 1', () => {
    const g = interpret(symbols, params({ leafCluster: 1 }), rngFromSeed('x'));
    expect(g.leafCount).toBe(3);
  });

  it('multiplies leaves by the cluster size when all survive', () => {
    const g = interpret(symbols, params({ leafCluster: 4 }), rngFromSeed('x'));
    expect(g.leafCount).toBe(12);
  });

  it('still sizes every leaf array to the surviving count', () => {
    const g = interpret(symbols, params({ leafCluster: 4 }), rngFromSeed('x'));
    expect(g.leafPosition).toHaveLength(g.leafCount * 3);
    expect(g.leafDirection).toHaveLength(g.leafCount * 3);
    expect(g.leafScale).toHaveLength(g.leafCount);
    expect(g.leafDepth).toHaveLength(g.leafCount);
  });

  it('thins a cluster by survival and drops it entirely at zero', () => {
    const some = interpret(symbols, params({ leafCluster: 6, leafSurvival: 0.5 }), rngFromSeed('y'));
    expect(some.leafCount).toBeGreaterThan(0);
    expect(some.leafCount).toBeLessThan(18);

    const none = interpret(symbols, params({ leafCluster: 6, leafSurvival: 0 }), rngFromSeed('y'));
    expect(none.leafCount).toBe(0);
  });

  it('fans cluster leaves to distinct positions rather than stacking them', () => {
    const g = interpret('FJ', params({ leafCluster: 4, leafSpread: 0.6 }), rngFromSeed('z'));
    expect(g.leafCount).toBe(4);
    const xs = new Set<number>();
    for (let i = 0; i < g.leafCount; i++) xs.add(g.leafPosition[i * 3]);
    expect(xs.size).toBeGreaterThan(1);
  });

  it('leaves cluster leaf headings unit length for the leaf orientation', () => {
    const g = interpret('FJ', params({ leafCluster: 4 }), rngFromSeed('z'));
    for (let i = 0; i < g.leafCount; i++) {
      const x = g.leafDirection[i * 3];
      const y = g.leafDirection[i * 3 + 1];
      const z = g.leafDirection[i * 3 + 2];
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 5);
    }
  });
});

describe('foliage styles', () => {
  it('maps every preset to a leaf kind', () => {
    for (const preset of ALL) {
      expect(FOLIAGE[preset]).toBeDefined();
      expect(leafKindFor(preset)).toBe(FOLIAGE[preset].kind);
    }
  });

  it('falls back to a single broad leaf for a raw grammar with no preset', () => {
    expect(foliageFor(undefined)).toBe(DEFAULT_FOLIAGE);
    expect(DEFAULT_FOLIAGE.cluster).toBe(1);
    expect(DEFAULT_FOLIAGE.kind).toBe('broad');
  });

  it('lists only tree archetypes in the variety rotation', () => {
    // Weeds, the conifer, and the flowers are chosen by planting, never by the
    // rotation, so an ordinary bed never accidentally sprouts one.
    for (const off of ['shrub', 'spire', 'flower', 'wildflower'] as const) {
      expect(TREE_PRESETS).not.toContain(off);
    }
    for (const preset of TREE_PRESETS) expect(ALL).toContain(preset);
  });

  it('draws flowers with petals, not leaves', () => {
    expect(leafKindFor('flower')).toBe('bloom');
    expect(leafKindFor('wildflower')).toBe('bloom');
  });
});

describe('every preset generates cleanly', () => {
  it('stays within the expansion budget', () => {
    for (const preset of ALL) {
      const g = generatePlant({ seed: `t/${preset}`, vitality: 1, growthScale: 2.4, preset });
      expect(g.truncated).toBe(false);
      expect(g.segmentCount).toBeGreaterThan(0);
    }
  });

  it('scales to the requested height for each preset', () => {
    for (const preset of ALL) {
      const g = generatePlant({ seed: `h/${preset}`, vitality: 0.8, growthScale: 3, preset });
      expect(g.bounds.max[1] - g.bounds.min[1]).toBeCloseTo(3, 4);
    }
  });

  it('gives a healthy broadleaf a full canopy', () => {
    // Locks in the lushness: clusters plus survival should leave a few hundred
    // leaves on a thriving tree, not a scatter.
    const g = generatePlant({ seed: 'canopy', vitality: 1, growthScale: 2.4, preset: 'broadleaf' });
    expect(g.leafCount).toBeGreaterThan(150);
  });

  it('sheds foliage as vitality drops, for every preset', () => {
    for (const preset of ALL) {
      const sick = generatePlant({ seed: `s/${preset}`, vitality: 0.15, growthScale: 2, preset });
      const well = generatePlant({ seed: `s/${preset}`, vitality: 1, growthScale: 2, preset });
      expect(sick.leafCount).toBeLessThan(well.leafCount);
    }
  });
});
