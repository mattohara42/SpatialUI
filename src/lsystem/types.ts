/**
 * Types for the L-System module.
 *
 * Nothing here imports three.js. The generator runs in a plain worker or a
 * vitest process with no renderer, which is the whole point of keeping the
 * math separate from the hook.
 */

export type Vec3 = readonly [number, number, number];

/** One weighted alternative in a stochastic production rule. */
export interface StochasticSuccessor {
  successor: string;
  /** Relative weight. Defaults to 1. */
  weight?: number;
}

/** A production rule: either a fixed successor or a weighted set. */
export type Rule = string | StochasticSuccessor[];

/**
 * A grammar in the turtle alphabet:
 *
 *   F   move forward and draw a segment
 *   f   move forward without drawing
 *   +   yaw left        -   yaw right
 *   &   pitch down      ^   pitch up
 *   \   roll left       /   roll right
 *   |   turn 180 degrees
 *   [   push state      ]   pop state
 *   J   emit a leaf at the current position
 *
 * Unknown symbols are carried through expansion and ignored by the turtle,
 * so grammars can use A, B, X as non-drawing production variables.
 */
export interface Grammar {
  axiom: string;
  rules: Record<string, Rule>;
  iterations: number;
}

export interface TurtleParams {
  /** Length of one F step before depth falloff, in metres. */
  stepLength: number;
  /** Base turn angle in degrees for + - & ^ \ /. */
  angleDeg: number;
  /** Trunk radius at depth 0, in metres. */
  baseRadius: number;
  /**
   * Radius multiplier applied once per drawn segment, so thickness narrows
   * continuously along a limb instead of stepping at branch points.
   */
  taper: number;
  /** Step length multiplier per bracket depth. */
  lengthFalloff: number;
  /** 0 to 1. Random variation added to each turn, scaled by angleDeg. */
  jitter: number;
  /** 0 to 1. Downward bend applied per drawn segment. Droop for sick plants. */
  gravity: number;
  /** Leaf scale in metres at depth 0, before depth falloff. */
  leafScale: number;
  /**
   * 0 to 1. Probability a leaf survives. Applied during the walk rather than as
   * a filter afterwards, so no leaf is ever allocated only to be discarded.
   */
  leafSurvival: number;
  /**
   * Leaves emitted per J marker. A cluster fans several leaves around one twig
   * so foliage reads as a mass rather than a scatter of single blades, without
   * adding branch symbols. 1 is the old one-leaf-per-J behaviour.
   */
  leafCluster: number;
  /** How far cluster leaves spread from their J point, in unit space. */
  leafSpread: number;
}

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

/**
 * Plant geometry as flat typed arrays.
 *
 * Objects-per-segment measured at 134KB per plant, which is fine for one live
 * geometry and ruinous as a scrub cache: 500 plants across ten vitality buckets
 * projected to roughly 670MB. This layout is close to sevenfold smaller and
 * uploads to an InstancedMesh with no transform step.
 *
 * Segment i occupies [3i, 3i+3) in the position arrays, [2i, 2i+2) in radius,
 * and i in depth. Draw order is the array order, so a growth-in animation reads
 * the index directly.
 */
export interface PlantGeometry {
  /** segmentCount * 3 */
  segmentStart: Float32Array;
  /** segmentCount * 3 */
  segmentEnd: Float32Array;
  /** segmentCount * 2, start and end radius per segment */
  segmentRadius: Float32Array;
  /** segmentCount. Bracket nesting depth, clamped at 255. */
  segmentDepth: Uint8Array;
  segmentCount: number;

  /** leafCount * 3 */
  leafPosition: Float32Array;
  /** leafCount * 3, unit heading of the branch that spawned each leaf */
  leafDirection: Float32Array;
  /** leafCount */
  leafScale: Float32Array;
  /** leafCount */
  leafDepth: Uint8Array;
  leafCount: number;

  bounds: Bounds;
  /** Length of the expanded string. Watch this when tuning iteration counts. */
  symbolCount: number;
  /** True when the expansion hit the symbol budget and stopped early. */
  truncated: boolean;
}
