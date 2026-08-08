import { describe, expect, it } from 'vitest';
import { bearsProduce, formFor, produceTintFor } from './planting';
import { PLANTINGS, type PlantingType } from '../ecosystem/planting';

const ALL = Object.keys(PLANTINGS) as PlantingType[];

describe('formFor', () => {
  it('is deterministic and stays within the planting palette', () => {
    for (const type of ALL) {
      const a = formFor(type, 'some/node/id');
      const b = formFor(type, 'some/node/id');
      expect(a).toBe(b);
    }
  });

  it('draws flowers as blooms and a thicket as a weed', () => {
    expect(formFor('flower-border', 'x')).toBe('flower');
    expect(formFor('wildflower-meadow', 'x')).toBe('wildflower');
    expect(formFor('thicket', 'x')).toBe('shrub');
  });
});

describe('produce', () => {
  it('is borne by vegetables and vineyards, and nothing else', () => {
    for (const type of ALL) {
      const bears = type === 'vegetable-rows' || type === 'vineyard';
      expect(bearsProduce(type)).toBe(bears);
    }
  });

  it('gives a stable varietal colour that greys when stale', () => {
    const fresh = produceTintFor('vault/projects/api-1', 0, 'vegetable-rows');
    expect(fresh).toMatch(/^#[0-9a-f]{6}$/);
    expect(produceTintFor('vault/projects/api-1', 0, 'vegetable-rows')).toBe(fresh);
    expect(produceTintFor('vault/projects/api-1', 2, 'vegetable-rows')).toBe('#8f8b83');
  });

  it('wears grape colours in a vineyard, garden colours in a patch', () => {
    const grape = produceTintFor('portfolio/financials/core-1', 0, 'vineyard');
    const veg = produceTintFor('portfolio/financials/core-1', 0, 'vegetable-rows');
    expect(grape).not.toBe(veg);
  });
});
