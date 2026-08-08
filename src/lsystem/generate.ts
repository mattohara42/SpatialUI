import { expand } from './grammar';
import { PRESETS, foliageFor, type PresetName } from './presets';
import { rngFromSeed, type Rng } from './random';
import { interpret, type RawGeometry } from './turtle';
import { generateTopiary, generateVine } from './bespoke';
import type { Bounds, Grammar, PlantGeometry, TurtleParams, Vec3 } from './types';

/**
 * Forms built by hand rather than by rewriting a grammar. A vine trained on a
 * wire and a topiary clipped to a solid are not self-similar, so they get a
 * bespoke generator that still emits the standard geometry (see lsystem/bespoke).
 */
const BESPOKE: Partial<Record<PresetName, (rng: Rng, params: TurtleParams) => RawGeometry>> = {
  vine: generateVine,
  topiary: generateTopiary,
};

export interface GeneratePlantInput {
  /** Node id. Same seed always yields the same plant. */
  seed: string;
  /** 0 to 1. Drives droop, splay, thinning, and leaf survival. */
  vitality: number;
  /** Target height in metres. The result is scaled to hit this exactly. */
  growthScale: number;
  /** 0 to 1. Scales iteration count. Defaults to 1. */
  maturity?: number;
  /** Defaults to broadleaf. Ignored when `grammar` is supplied. */
  preset?: PresetName;
  /** Escape hatch for a hand-written grammar. */
  grammar?: Grammar;
}

/**
 * Every constant that turns health into appearance. Kept in one object so the
 * visual language can be tuned without hunting through the turtle.
 *
 * Each entry is [value at vitality 0, value at vitality 1].
 */
export const VITALITY_RESPONSE = {
  /** Sick plants splay outward, healthy ones reach up. */
  angleDeg: [46, 25] as const,
  /** Downward bend per segment. The most legible sickness cue at distance. */
  gravity: [0.3, 0.02] as const,
  /** Random angle variation. Unhealthy growth is erratic. */
  jitter: [0.45, 0.14] as const,
  /** Radius decay per segment. Sick limbs go spindly. */
  taper: [0.84, 0.93] as const,
  /** Leaf size in unit space, before height normalization. */
  leafScale: [0.18, 0.32] as const,
  /** Iteration multiplier at maturity 0 and 1. */
  maturityIterations: [0.55, 1] as const,
} as const;

/** Step length before normalization. Geometry is built in unit space. */
const UNIT_STEP = 1;
/** Unit-space trunk radius. Only the taper chain depends on this value. */
const UNIT_RADIUS = 0.09;
/**
 * Trunk radius as a fraction of final height. Radii are scaled independently of
 * positions so a tree does not go spindly just because a grammar with more
 * iterations produced a taller unit-space plant. Real trunks sit near 0.02 to
 * 0.05 of height.
 */
const TRUNK_RATIO = 0.035;
const LENGTH_FALLOFF = 0.9;

export function generatePlant(input: GeneratePlantInput): PlantGeometry {
  const vitality = clamp01(input.vitality);
  const maturity = clamp01(input.maturity ?? 1);
  const rng = rngFromSeed(input.seed);

  // Preset picks the grammar and, when there is one, the foliage style. A raw
  // grammar with no preset falls back to a single leaf per J. Because both
  // cluster and scale derive purely from the preset, the geometry cache keyed on
  // preset (see generatePlantMemo) stays correct with nothing new to add.
  const preset = input.preset ?? 'broadleaf';
  const base = input.grammar ?? PRESETS[preset];
  const foliage = input.grammar ? foliageFor(undefined) : foliageFor(preset);
  const grammar: Grammar = {
    ...base,
    iterations: Math.max(
      1,
      Math.round(
        base.iterations * lerpPair(VITALITY_RESPONSE.maturityIterations, maturity),
      ),
    ),
  };

  const params: TurtleParams = {
    stepLength: UNIT_STEP,
    angleDeg: lerpPair(VITALITY_RESPONSE.angleDeg, vitality),
    baseRadius: UNIT_RADIUS,
    taper: lerpPair(VITALITY_RESPONSE.taper, vitality),
    lengthFalloff: LENGTH_FALLOFF,
    jitter: lerpPair(VITALITY_RESPONSE.jitter, vitality),
    gravity: lerpPair(VITALITY_RESPONSE.gravity, vitality),
    leafScale: lerpPair(VITALITY_RESPONSE.leafScale, vitality) * foliage.scale,
    leafSurvival: vitality,
    leafCluster: foliage.cluster,
    leafSpread: foliage.spread,
  };

  // A bespoke form skips the grammar entirely; everything downstream (scaling,
  // caching, rendering) is identical because it emits the same geometry.
  const bespoke = input.grammar ? undefined : BESPOKE[preset];
  const { symbols, truncated } = bespoke
    ? { symbols: '', truncated: false }
    : expand(grammar, rng);
  const geometry = bespoke ? bespoke(rng, params) : interpret(symbols, params, rng);

  // Scaling happens in place over the typed arrays. Nothing is copied and no
  // intermediate objects are built.
  const height = geometry.bounds.max[1] - geometry.bounds.min[1];
  const scale = height > 1e-6 ? input.growthScale / height : 1;
  const radiusScale = (input.growthScale * TRUNK_RATIO) / UNIT_RADIUS;

  multiply(geometry.segmentStart, scale);
  multiply(geometry.segmentEnd, scale);
  multiply(geometry.segmentRadius, radiusScale);
  multiply(geometry.leafPosition, scale);
  multiply(geometry.leafScale, scale);

  return {
    ...geometry,
    bounds: scaleBounds(geometry.bounds, scale),
    symbolCount: symbols.length,
    truncated,
  };
}

function multiply(values: Float32Array, k: number): void {
  for (let i = 0; i < values.length; i++) values[i] *= k;
}

function scaleBounds(b: Bounds, k: number): Bounds {
  return { min: scaleVec(b.min, k), max: scaleVec(b.max, k) };
}

function scaleVec(v: Vec3, k: number): Vec3 {
  return [v[0] * k, v[1] * k, v[2] * k];
}

function lerpPair(pair: readonly [number, number], t: number): number {
  return pair[0] + (pair[1] - pair[0]) * t;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
