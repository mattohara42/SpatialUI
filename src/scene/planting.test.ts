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
  it('is borne only by the vegetable planting', () => {
    for (const type of ALL) {
      expect(bearsProduce(type)).toBe(type === 'vegetable-rows');
    }
  });

  it('gives a stable varietal colour that greys when stale', () => {
    const fresh = produceTintFor('vault/projects/api-1', 0);
    expect(fresh).toMatch(/^#[0-9a-f]{6}$/);
    expect(produceTintFor('vault/projects/api-1', 0)).toBe(fresh);
    expect(produceTintFor('vault/projects/api-1', 2)).toBe('#8f8b83');
  });
});
