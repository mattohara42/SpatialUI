import { describe, expect, it } from 'vitest';
import {
  BAY,
  BED_HEIGHT,
  DOOR,
  EAVES,
  EYE,
  FLOOR_Y,
  KNEE,
  PATH,
  bayPositions,
  roofHeightAt,
  shellFor,
  viewpointFor,
} from './greenhouse';

/**
 * The tallest thing that can grow here: the layout's height range tops out at
 * 2.6m and the most generous planting scales that by 1.15.
 */
const TALLEST_PLANT = 2.6 * 1.15;

describe('bayPositions', () => {
  it('lands a bar on both corners', () => {
    const bars = bayPositions(12);
    expect(bars[0]).toBeCloseTo(-6, 10);
    expect(bars[bars.length - 1]).toBeCloseTo(6, 10);
  });

  it('spaces its bays evenly, so no bay is a leftover', () => {
    for (const length of [3, 7.4, 12, 24.4, 31]) {
      const bars = bayPositions(length);
      const gaps = bars.slice(1).map((x, i) => x - bars[i]);
      for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0], 10);
    }
  });

  it('keeps the spacing near the target it was asked for', () => {
    for (const length of [3, 7.4, 12, 24.4, 31]) {
      const bars = bayPositions(length);
      const gap = bars[1] - bars[0];
      // Rounding to a whole number of panels can only ever miss by a third
      // either way, which is the widest a bay can drift and still read as the
      // same rhythm.
      expect(gap).toBeGreaterThan(BAY * 0.66);
      expect(gap).toBeLessThan(BAY * 1.5);
    }
  });

  it('gives a very short wall a single panel rather than none', () => {
    expect(bayPositions(0.4)).toHaveLength(2);
  });

  it('is symmetric about the middle', () => {
    const bars = bayPositions(9.3);
    for (let i = 0; i < bars.length; i++) {
      expect(bars[i]).toBeCloseTo(-bars[bars.length - 1 - i], 10);
    }
  });
});

describe('shellFor', () => {
  it('clears the garden by a full path on every side', () => {
    const shell = shellFor([20, 8]);
    expect((shell.width - 20) / 2).toBeCloseTo(PATH, 10);
    expect((shell.depth - 8) / 2).toBeCloseTo(PATH, 10);
  });

  it('never shrinks below a building, however small the garden', () => {
    const tiny = shellFor([0, 0]);
    expect(tiny.width).toBeGreaterThanOrEqual(10);
    expect(tiny.depth).toBeGreaterThanOrEqual(7.5);
  });

  it('stacks knee, eaves, and ridge in that order', () => {
    for (const size of [[0, 0], [12, 2], [20, 8]] as const) {
      const shell = shellFor(size);
      expect(shell.knee).toBeLessThan(shell.eaves);
      expect(shell.eaves).toBeLessThan(shell.ridge);
      expect(shell.ridge - shell.eaves).toBeCloseTo(shell.rise, 10);
    }
  });

  it('clamps the pitch, so a wide house does not grow a cathedral', () => {
    // Unclamped, a forty metre deep house would carry a roof taller than its
    // walls. The clamp holds the ridge to something a building could have.
    const huge = shellFor([60, 40]);
    expect(huge.rise).toBeLessThan(huge.eaves);
    expect(huge.pitch).toBeLessThan(shellFor([12, 2]).pitch);
    // And the smallest house still gets a roof with a slope to it.
    expect(shellFor([0, 0]).pitch).toBeGreaterThan(0.2);
  });

  it('measures the rake as the slope it actually is', () => {
    const shell = shellFor([20, 8]);
    // A pane cut to the rake has to reach from eaves to ridge exactly, or it
    // hangs over the gutter or leaves a gap at the ridge.
    expect(shell.rake).toBeCloseTo(
      Math.hypot(shell.depth / 2, shell.rise),
      10,
    );
    expect(Math.sin(shell.pitch) * shell.rake).toBeCloseTo(shell.rise, 10);
    expect(Math.cos(shell.pitch) * shell.rake).toBeCloseTo(shell.depth / 2, 10);
  });

  it('leaves glazing either side of the door and a transom over it', () => {
    const shell = shellFor([12, 2]);
    expect(shell.door.width).toBeLessThan(shell.depth);
    expect(shell.door.height).toBeLessThan(shell.eaves);
    // Enough wall left on each side to be a wall rather than a sliver.
    expect((shell.depth - shell.door.width) / 2).toBeGreaterThan(1);
  });

  it('runs the ridge along the long axis for every real garden', () => {
    // The roof slopes across z, so a garden wider than it is deep gets a ridge
    // down its length. Every layout the bed wrapping produces is wider than it
    // is deep, and the minimums keep that true for the small ones too.
    for (const size of [[0, 0], [12, 2], [20, 8]] as const) {
      const shell = shellFor(size);
      expect(shell.width).toBeGreaterThan(shell.depth);
    }
  });

  it('puts a bar on every corner of both walls', () => {
    const shell = shellFor([20, 8]);
    expect(shell.bays[0]).toBeCloseTo(-shell.width / 2, 10);
    expect(shell.bays[shell.bays.length - 1]).toBeCloseTo(shell.width / 2, 10);
    expect(shell.ribs[0]).toBeCloseTo(-shell.depth / 2, 10);
    expect(shell.ribs[shell.ribs.length - 1]).toBeCloseTo(shell.depth / 2, 10);
  });
});

describe('the floor', () => {
  it('sits a bed height below the soil, so plants never move', () => {
    // Beds are raised by lowering the world. A plant is placed at y = 0 and
    // everything that reads a plant position — grafts, dust, sway — measures
    // from there, so the soil surface has to stay at zero.
    expect(FLOOR_Y).toBeLessThan(0);
    expect(BED_HEIGHT).toBeCloseTo(-FLOOR_Y, 10);
  });

  it('measures its heights from the floor, not from the soil', () => {
    // The one thing to keep straight in here. A knee wall specified against the
    // soil surface would stand a bed's depth taller than intended, which is a
    // parapet rather than a dwarf wall.
    expect(KNEE).toBeGreaterThan(BED_HEIGHT);
    expect(KNEE).toBeLessThan(BED_HEIGHT + 0.25);
    expect(DOOR.height).toBeLessThan(EAVES);
  });

  it('clears the tallest plant that can stand in the nearest bed', () => {
    // Nothing may grow through the roof. The nearest a plant can get to a wall
    // is the path plus the bed's own padding, and the roof has already started
    // climbing by then — which is what makes an eaves height this modest work.
    for (const size of [[0, 0], [12, 2], [20, 8]] as const) {
      const shell = shellFor(size);
      const overhead = roofHeightAt(shell, PATH);
      expect(overhead).toBeGreaterThan(BED_HEIGHT + TALLEST_PLANT);
    }
  });

  it('reads the roof height as eaves at the wall and ridge at the middle', () => {
    const shell = shellFor([20, 8]);
    expect(roofHeightAt(shell, 0)).toBeCloseTo(shell.eaves, 10);
    expect(roofHeightAt(shell, shell.depth / 2)).toBeCloseTo(shell.ridge, 10);
    // Past the ridge is still the ridge rather than an ever-climbing roof.
    expect(roofHeightAt(shell, shell.depth)).toBeCloseTo(shell.ridge, 10);
  });
});

/**
 * Every garden the app can open, smallest to largest: an empty one, a three bed
 * mock, and the league's eight beds in two rows.
 */
const FOOTPRINTS = [
  [0, 0],
  [6, 2],
  [12, 2],
  [20, 8],
  [24, 11],
] as const;

describe('standing inside the house', () => {
  it('puts the viewer inside the glass, for every garden', () => {
    // The whole point, and the one that regressed before: a camera solved to
    // fit the width in frame stands outside the building looking in.
    for (const size of FOOTPRINTS) {
      const shell = shellFor(size);
      const { position } = viewpointFor(shell);
      expect(Math.abs(position[0])).toBeLessThan(shell.width / 2);
      expect(Math.abs(position[2])).toBeLessThan(shell.depth / 2);
    }
  });

  it('stands a body on the floor rather than floating a camera', () => {
    for (const size of FOOTPRINTS) {
      const { position } = viewpointFor(shellFor(size));
      expect(position[1]).toBeCloseTo(FLOOR_Y + EYE, 10);
    }
    // Eye height is a person's, not a vantage point's.
    expect(EYE).toBeGreaterThan(1.4);
    expect(EYE).toBeLessThan(1.8);
  });

  it('cannot be scrolled back out through the wall', () => {
    // The far clamp is the wall itself. Orbiting sweeps the full circle at that
    // radius, so it has to clear the nearest wall in *either* axis, not just
    // the one the viewer happens to start facing down.
    for (const size of FOOTPRINTS) {
      const shell = shellFor(size);
      const { maxRadius, minRadius } = viewpointFor(shell);
      expect(maxRadius).toBeLessThan(shell.width / 2);
      expect(maxRadius).toBeLessThan(shell.depth / 2);
      expect(minRadius).toBeLessThan(maxRadius);
      expect(minRadius).toBeGreaterThan(0);
    }
  });

  it('keeps the viewer under the eaves by standing rather than by a clamp', () => {
    // This used to be a polar limit on how far the orbit could swing up before
    // the camera met the glass. A viewer who stands does not rise at all —
    // walking never changes eye height — so the guarantee is now structural, and
    // the assertion is that eye height really does clear the roof everywhere.
    for (const size of FOOTPRINTS) {
      const shell = shellFor(size);
      const { position } = viewpointFor(shell);
      expect(position[1]).toBeLessThan(FLOOR_Y + shell.eaves);
      // And above the soil, or you would be looking at the beds from underneath.
      expect(position[1]).toBeGreaterThan(0);
    }
  });

  it('starts at the wall it is clamped to, so the first scroll out does nothing', () => {
    // Standing short of the clamp would mean an outward scroll moved the viewer
    // for no reason before stopping.
    for (const size of FOOTPRINTS) {
      const { position, target, maxRadius } = viewpointFor(shellFor(size));
      const radius = Math.hypot(
        position[0] - target[0],
        position[1] - target[1],
        position[2] - target[2],
      );
      expect(radius).toBeCloseTo(maxRadius, 6);
    }
  });

  it('looks at the planting, not at the floor or the roof', () => {
    const { target } = viewpointFor(shellFor([20, 8]));
    expect(target[0]).toBe(0);
    expect(target[2]).toBe(0);
    // Above the soil, well under the eaves.
    expect(target[1]).toBeGreaterThan(0);
    expect(target[1]).toBeLessThan(EAVES / 2);
  });
});
