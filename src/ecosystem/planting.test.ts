import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLANTING,
  PLANTINGS,
  arrangementFor,
  isLivePlanting,
  plantingOf,
  type PlantingType,
} from './planting';
import { generateMockEcosystem } from '../mock/mockEcosystemData';

const ALL = Object.keys(PLANTINGS) as PlantingType[];

describe('planting specs', () => {
  it('gives every type a complete, sane arrangement', () => {
    for (const type of ALL) {
      const a = arrangementFor(type);
      expect(a.columns).toBeGreaterThanOrEqual(0);
      expect(a.spacing).toBeGreaterThan(0);
      expect(a.rowSpacing).toBeGreaterThan(0);
      expect(a.jitter).toBeGreaterThanOrEqual(0);
      expect(a.jitter).toBeLessThanOrEqual(1);
      expect(a.heightScale).toBeGreaterThan(0);
    }
  });

  it('marks exactly the tree-family plantings live', () => {
    const live = ALL.filter(isLivePlanting).sort();
    expect(live).toEqual(
      ['conifer-stand', 'grove', 'hedge', 'orchard', 'thicket'].sort(),
    );
  });

  it('flags only the weed planting invasive', () => {
    const invasive = ALL.filter((t) => PLANTINGS[t].invasive);
    expect(invasive).toEqual(['thicket']);
  });

  it('keeps a hedge low and a stand tall', () => {
    expect(arrangementFor('hedge').heightScale).toBeLessThan(1);
    expect(arrangementFor('conifer-stand').heightScale).toBeGreaterThan(1);
  });

  it('lays a hedge out as a single row', () => {
    expect(arrangementFor('hedge').columns).toBe(0);
  });
});

describe('plantingOf', () => {
  it('reads the planting off a bed', () => {
    expect(plantingOf({ plantingType: 'grove' })).toBe('grove');
  });

  it('falls back to the default when a bed has none', () => {
    expect(plantingOf({})).toBe(DEFAULT_PLANTING);
    expect(isLivePlanting(DEFAULT_PLANTING)).toBe(true);
  });
});

describe('mock beds', () => {
  it('assigns a live planting to every bed', () => {
    const state = generateMockEcosystem();
    const beds = Object.values(state.nodes).filter((n) => n.kind === 'bed');
    expect(beds.length).toBeGreaterThan(0);
    for (const bed of beds) {
      expect(bed.plantingType).toBeDefined();
      expect(isLivePlanting(bed.plantingType!)).toBe(true);
    }
  });

  it('plants a thicket in the suppress-polarity garden and nowhere else', () => {
    const state = generateMockEcosystem();
    const beds = Object.values(state.nodes).filter((n) => n.kind === 'bed');
    for (const bed of beds) {
      const invasive = bed.plantingType === 'thicket';
      expect(invasive).toBe(bed.polarity === 'suppress');
    }
  });
});
