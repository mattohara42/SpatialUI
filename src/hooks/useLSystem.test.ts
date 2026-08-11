import { beforeEach, describe, expect, it } from 'vitest';
import {
  CACHE_MAX,
  MATURITY_STEPS,
  VITALITY_STEPS,
  clearGeometryCache,
  generatePlantMemo,
  geometryCacheKeys,
  quantize,
} from './useLSystem';

/**
 * The cache, tested against the real one rather than only against the LRU in
 * isolation. The bug this replaced was not in a data structure, it was in which
 * one was wired up here, and an isolated test of a correct LRU would have gone
 * on passing throughout.
 */

const plant = (seed: string, maturity = 0.5) => ({
  seed,
  vitality: 0.7,
  maturity,
  growthScale: 2,
});

beforeEach(clearGeometryCache);

describe('quantize', () => {
  it('collapses jitter inside a step to one value', () => {
    expect(quantize(0.5123, VITALITY_STEPS)).toBe(quantize(0.5087, VITALITY_STEPS));
  });

  it('separates values a step apart', () => {
    expect(quantize(0.5, MATURITY_STEPS)).not.toBe(quantize(0.6, MATURITY_STEPS));
  });
});

describe('generatePlantMemo', () => {
  it('returns the identical object for a repeated request', () => {
    const first = generatePlantMemo(plant('a'));
    expect(generatePlantMemo(plant('a'))).toBe(first);
  });

  it('is not keyed on vitality, so telemetry jitter never reshapes a plant', () => {
    const first = generatePlantMemo({ ...plant('a'), vitality: 0.2 });
    expect(generatePlantMemo({ ...plant('a'), vitality: 0.9 })).toBe(first);
  });

  it('is keyed on maturity, which is what growth is allowed to change', () => {
    const young = generatePlantMemo(plant('a', 0.2));
    expect(generatePlantMemo(plant('a', 0.9))).not.toBe(young);
  });

  it('stays inside its bound', () => {
    for (let i = 0; i < CACHE_MAX + 40; i++) generatePlantMemo(plant(`seed-${i}`));
    expect(geometryCacheKeys()).toHaveLength(CACHE_MAX);
  });

  /**
   * The reason the policy changed. Under FIFO the plant in front of you is
   * evicted by churn it has nothing to do with — scrubbing a season walks every
   * plant through maturity buckets nobody will ask for again — and it rebuilds
   * on the next frame, every frame.
   */
  it('keeps the plant you are looking at through a season of scrub churn', () => {
    const inFrame = generatePlantMemo(plant('in-frame'));

    for (let i = 0; i < CACHE_MAX + 100; i++) {
      // A bucket the scrub passes through once and never revisits.
      generatePlantMemo(plant(`scrubbed-${i}`, (i % MATURITY_STEPS) / MATURITY_STEPS));
      // And the frame drawing the plant that is actually on screen.
      expect(generatePlantMemo(plant('in-frame'))).toBe(inFrame);
    }
  });

  it('drops a plant that has stopped being drawn', () => {
    generatePlantMemo(plant('left-behind'));
    for (let i = 0; i < CACHE_MAX; i++) generatePlantMemo(plant(`later-${i}`));
    expect(geometryCacheKeys().some((key) => key.startsWith('left-behind|'))).toBe(false);
  });
});
