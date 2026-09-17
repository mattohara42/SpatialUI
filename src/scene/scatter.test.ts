import { describe, expect, it } from 'vitest';
import {
  distanceOutside,
  insideExtent,
  meadowDensity,
  meadowScatter,
  pathScatter,
  type Extent,
} from './scatter';

const SHELL: Extent = { width: 20, depth: 12 };
const PLOT: Extent = { width: 15.6, depth: 7.6 };

describe('insideExtent', () => {
  it('accepts the centre and rejects well outside', () => {
    expect(insideExtent(0, 0, SHELL)).toBe(true);
    expect(insideExtent(50, 0, SHELL)).toBe(false);
  });

  it('measures from the centre, since every extent in the scene is centred', () => {
    expect(insideExtent(9.9, 5.9, SHELL)).toBe(true);
    expect(insideExtent(10.1, 0, SHELL)).toBe(false);
    expect(insideExtent(0, 6.1, SHELL)).toBe(false);
  });

  it('grows the rectangle by a positive margin', () => {
    expect(insideExtent(10.4, 0, SHELL, 0.5)).toBe(true);
    expect(insideExtent(10.6, 0, SHELL, 0.5)).toBe(false);
  });
});

describe('distanceOutside', () => {
  it('is zero anywhere inside', () => {
    expect(distanceOutside(0, 0, SHELL)).toBe(0);
    expect(distanceOutside(9, 5, SHELL)).toBe(0);
  });

  it('measures to the nearest wall, not to the centre', () => {
    expect(distanceOutside(13, 0, SHELL)).toBeCloseTo(3);
    expect(distanceOutside(0, 8, SHELL)).toBeCloseTo(2);
  });

  it('measures diagonally off a corner', () => {
    expect(distanceOutside(13, 10, SHELL)).toBeCloseTo(5);
  });
});

describe('meadowDensity', () => {
  it('is full at the wall and nothing at the reach', () => {
    expect(meadowDensity(0, 10)).toBeCloseTo(1);
    expect(meadowDensity(10, 10)).toBeCloseTo(0);
  });

  it('thins late rather than immediately, so the near field stays full', () => {
    // Halfway out it should still be well over half density.
    expect(meadowDensity(5, 10)).toBeGreaterThan(0.7);
  });

  it('never goes negative past the reach', () => {
    expect(meadowDensity(100, 10)).toBeCloseTo(0);
    expect(meadowDensity(100, 10)).toBeGreaterThanOrEqual(0);
  });

  it('is zero for a degenerate reach rather than dividing by it', () => {
    expect(meadowDensity(1, 0)).toBe(0);
  });
});

describe('meadowScatter', () => {
  const points = meadowScatter(SHELL, 11, { spacing: 0.6, seed: 1 });

  it('places a field of tufts', () => {
    expect(points.length).toBeGreaterThan(200);
  });

  // The enclosure the greenhouse exists to provide: a tuft growing up through
  // the floor would break it.
  it('never puts a tuft inside the house', () => {
    for (const point of points) {
      expect(insideExtent(point.x, point.z, SHELL)).toBe(false);
    }
  });

  it('thins with distance from the walls', () => {
    const near = points.filter((p) => distanceOutside(p.x, p.z, SHELL) < 3).length;
    const far = points.filter((p) => {
      const d = distanceOutside(p.x, p.z, SHELL);
      return d >= 8 && d < 11;
    }).length;
    // Compared per unit of ring, the near band has to be denser. The far band is
    // the wider ring, so a raw count comparison would understate it.
    expect(near / 3).toBeGreaterThan(far / 3);
  });

  it('is identical run to run, so the field never re-rolls on a re-render', () => {
    const again = meadowScatter(SHELL, 11, { spacing: 0.6, seed: 1 });
    expect(again).toEqual(points);
  });

  it('varies turn and size, so the apron does not read as stamped', () => {
    const rotations = new Set(points.map((p) => p.rotation.toFixed(4)));
    const scales = new Set(points.map((p) => p.scale.toFixed(4)));
    expect(rotations.size).toBeGreaterThan(points.length / 2);
    expect(scales.size).toBeGreaterThan(points.length / 2);
  });

  it('returns nothing rather than looping forever on a zero spacing', () => {
    expect(meadowScatter(SHELL, 11, { spacing: 0 })).toEqual([]);
  });
});

describe('pathScatter', () => {
  const points = pathScatter(SHELL, PLOT, { spacing: 0.5, seed: 2 });

  it('litters the path', () => {
    expect(points.length).toBeGreaterThan(20);
  });

  // The rule the whole module turns on: a bed is where polarity reads, and a
  // thing on the soil would read as something growing there.
  it('never puts anything in a bed', () => {
    for (const point of points) {
      expect(insideExtent(point.x, point.z, PLOT)).toBe(false);
    }
  });

  it('keeps clear of the bed timber rather than tucking under it', () => {
    for (const point of points) {
      expect(insideExtent(point.x, point.z, PLOT, 0.2)).toBe(false);
    }
  });

  it('stays inside the house', () => {
    for (const point of points) {
      expect(insideExtent(point.x, point.z, SHELL)).toBe(true);
    }
  });

  it('is identical run to run', () => {
    expect(pathScatter(SHELL, PLOT, { spacing: 0.5, seed: 2 })).toEqual(points);
  });

  // Density is a property of the geometry and the seed, never of anything that
  // moves: ground cover that followed health would be a second vitality channel.
  it('depends only on the extents and the seed', () => {
    const wider = pathScatter({ width: 24, depth: 12 }, PLOT, {
      spacing: 0.5,
      seed: 2,
    });
    expect(wider.length).toBeGreaterThan(points.length);
    const reseeded = pathScatter(SHELL, PLOT, { spacing: 0.5, seed: 3 });
    expect(reseeded).not.toEqual(points);
  });
});
