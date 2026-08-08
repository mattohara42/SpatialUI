import { useMemo } from 'react';
import { generatePlant, type GeneratePlantInput } from '../lsystem/generate';
import type { PlantGeometry } from '../lsystem/types';

/**
 * Number of discrete vitality steps. Telemetry jitters constantly and
 * regenerating a few thousand segments on every tick would eat the frame
 * budget, so vitality is quantized before it reaches the generator.
 *
 * 20 steps means a 5% health change rebuilds the plant. Anything finer is
 * invisible at arm's length; animate the difference in the material instead.
 */
export const VITALITY_STEPS = 20;
export const MATURITY_STEPS = 10;

export function quantize(value: number, steps: number): number {
  return Math.round(value * steps) / steps;
}

/**
 * Memoized plant geometry for one node.
 *
 * This is the only file in the L-System module that imports React. Everything
 * under `src/lsystem/` stays pure so it can run in a worker or a test.
 */
export function useLSystem(input: GeneratePlantInput): PlantGeometry {
  const vitality = quantize(input.vitality, VITALITY_STEPS);
  const maturity = quantize(input.maturity ?? 1, MATURITY_STEPS);

  return useMemo(
    () =>
      generatePlant({
        ...input,
        vitality,
        maturity,
      }),
    // The grammar object is intentionally compared by reference. Callers should
    // hoist custom grammars to module scope rather than build them inline.
    [input.seed, input.growthScale, input.preset, input.grammar, vitality, maturity],
  );
}

/**
 * Same memoization as the hook, for callers that generate many plants in a loop
 * where a hook cannot go (the scene builds every plant inside one useMemo).
 *
 * This is what makes quantization pay off. Without it every telemetry tick
 * rebuilds every plant from scratch, a synchronous burst that drops a frame on
 * the cadence of the tick. With it, a tick that does not move a plant across a
 * vitality bucket is a Map lookup. Maturity is stable tick to tick, so growthScale
 * is too, and the key stays put until health genuinely steps.
 *
 * Returned geometry is shared and read-only; the scene never mutates it.
 *
 * ponytail: FIFO eviction, sized for a garden's worth of live buckets. If time
 * scrubbing starts churning many buckets per plant, make it LRU keyed on last use.
 */
const CACHE_MAX = 600;
const cache = new Map<string, PlantGeometry>();

export function generatePlantMemo(input: GeneratePlantInput): PlantGeometry {
  const maturity = quantize(input.maturity ?? 1, MATURITY_STEPS);
  // Deliberately NOT keyed on vitality. generatePlant re-rolls its seeded RNG for
  // any vitality change, so telemetry jitter crossing a quantization bucket would
  // regenerate a whole new plant every tick, ~5 of 15 plants reshaping per drift
  // tick. That is the visible jerk. Structure keys on identity and maturity, both
  // stable tick to tick; live vitality reads through colour and droop at render
  // time instead. First-seen vitality is baked into the shape and stays put.
  const key = `${input.seed}|${maturity}|${input.growthScale}|${input.preset ?? 'broadleaf'}`;

  let geometry = cache.get(key);
  if (!geometry) {
    geometry = generatePlant({
      ...input,
      vitality: quantize(input.vitality, VITALITY_STEPS),
      maturity,
    });
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(key, geometry);
  }
  return geometry;
}
