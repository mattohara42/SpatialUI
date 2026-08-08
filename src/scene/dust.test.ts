import { describe, expect, it } from 'vitest';
import {
  DUST_FULL_AT,
  DUST_PER_PLANT,
  dustCount,
  dustDensity,
  settle,
} from './dust';

describe('dustDensity', () => {
  it('is zero for a fresh plant, so a live plant is never dusty', () => {
    expect(dustDensity(0)).toBe(0);
    expect(dustDensity(0.5)).toBe(0);
  });

  it('is zero exactly at the threshold, where staleness has not yet tipped', () => {
    // The other staleness cues switch on above 1; dust must not contradict them
    // by appearing on a plant that is still coloured and still moving.
    expect(dustDensity(1)).toBe(0);
  });

  it('ramps continuously rather than popping on', () => {
    const justOver = dustDensity(1.01);
    expect(justOver).toBeGreaterThan(0);
    expect(justOver).toBeLessThan(0.05);
  });

  it('rises with the length of the silence', () => {
    expect(dustDensity(1.5)).toBeLessThan(dustDensity(2));
    expect(dustDensity(2)).toBeLessThan(dustDensity(2.5));
  });

  it('reaches full thickness at DUST_FULL_AT and holds there', () => {
    expect(dustDensity(DUST_FULL_AT)).toBe(1);
    expect(dustDensity(DUST_FULL_AT + 10)).toBe(1);
    expect(dustDensity(1000)).toBe(1);
  });
});

describe('dustCount', () => {
  it('draws nothing until the plant is stale', () => {
    expect(dustCount(0.9)).toBe(0);
    expect(dustCount(1)).toBe(0);
  });

  it('never exceeds the reserved capacity', () => {
    for (const stale of [1.1, 2, 3, 50]) {
      expect(dustCount(stale)).toBeLessThanOrEqual(DUST_PER_PLANT);
    }
  });

  it('fills the capacity once the silence is long enough', () => {
    expect(dustCount(DUST_FULL_AT)).toBe(DUST_PER_PLANT);
  });

  it('scales to a supplied capacity', () => {
    expect(dustCount(DUST_FULL_AT, 8)).toBe(8);
    expect(dustCount(2, 8)).toBe(4);
  });
});

describe('settle', () => {
  it('falls', () => {
    expect(settle(1, 0, 2, 0.1)).toBeCloseTo(0.9, 6);
  });

  it('wraps back to the top instead of piling up on the ground', () => {
    const y = settle(0.05, 0, 2, 0.1);
    expect(y).toBeGreaterThan(1.9);
    expect(y).toBeLessThanOrEqual(2);
  });

  it('stays inside the column however large the step', () => {
    // A backgrounded tab resuming hands the frame loop a huge delta; a clamp
    // would leave every speck stuck on the soil, and a bare subtraction would
    // put them under it.
    for (const distance of [0.1, 5, 137.4, 10_000]) {
      const y = settle(1, 0, 2, distance);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(2);
    }
  });

  it('is a no-op on a column with no height', () => {
    expect(settle(1, 1, 1, 0.5)).toBe(1);
  });
});
