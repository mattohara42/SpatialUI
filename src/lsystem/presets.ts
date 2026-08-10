import type { Grammar } from './types';

/**
 * Archetypes, not domains. Any adapter can pick any archetype; the mapping from
 * domain to archetype lives in the translation layer where it belongs.
 */
export type PresetName =
  | 'broadleaf'
  | 'bushy'
  | 'willow'
  | 'shrub'
  | 'spire'
  | 'flower'
  | 'wildflower'
  | 'acacia'
  // Bespoke forms — built by hand in lsystem/bespoke.ts, not by a grammar.
  | 'vine'
  | 'topiary'
  | 'palm';

/**
 * The tree-like archetypes, in the order the scene rotates through them to give
 * a bed varied individuals. Weeds (shrub) and the db conifer (spire) are chosen
 * by meaning, not by this rotation, so they are deliberately not in it.
 */
export const TREE_PRESETS: PresetName[] = ['broadleaf', 'bushy', 'willow'];

/**
 * How a leaf is drawn, separate from where it grows. The generator only decides
 * position, heading, and size (pure geometry); the shape a leaf takes is a
 * render choice keyed off the archetype, so it lives here as data the scene
 * reads rather than as a field on every leaf.
 */
export type LeafKind = 'broad' | 'blade' | 'needle' | 'round' | 'bloom' | 'frond';

export interface FoliageStyle {
  kind: LeafKind;
  /**
   * Leaves emitted per J marker. Density without more branch symbols: leaves are
   * instanced and cheap, branch symbols grow the grammar exponentially, so this
   * is the knob that makes a plant lush without risking the expansion budget.
   */
  cluster: number;
  /** Multiplies the vitality-driven leaf size for this archetype. */
  scale: number;
  /** How far a cluster spreads around its J point, in unit space. */
  spread: number;
}

/**
 * One entry per preset. `cluster` and `scale` reach the generator (so they are
 * baked into the cached geometry and keyed by preset); `kind` reaches the scene,
 * which groups plants by it into one instanced mesh per leaf shape.
 */
export const FOLIAGE: Record<PresetName, FoliageStyle> = {
  broadleaf: { kind: 'broad', cluster: 3, scale: 1.18, spread: 0.6 },
  bushy: { kind: 'broad', cluster: 3, scale: 1.0, spread: 0.7 },
  willow: { kind: 'blade', cluster: 3, scale: 1.15, spread: 0.72 },
  shrub: { kind: 'round', cluster: 2, scale: 0.7, spread: 0.5 },
  spire: { kind: 'needle', cluster: 5, scale: 1.0, spread: 0.45 },
  // Blooms are big relative to the short stem and pack tightly into a head.
  flower: { kind: 'bloom', cluster: 6, scale: 2.6, spread: 0.28 },
  wildflower: { kind: 'bloom', cluster: 4, scale: 2.3, spread: 0.34 },
  // Fine pinnate leaflets in a wide flat canopy: many small blades rather than
  // a few broad ones, which is what makes an acacia read as feathery from
  // across the room instead of as a small broadleaf.
  //
  // The cluster is the highest in the table and that is the whole trick. Small
  // leaves need to be numerous or the canopy reads as bare twigs — the first
  // cut had a third of a broadleaf's foliage at the same vitality, which put a
  // healthy country in the savanna beds at the bleakest sick-state the language
  // has. Density comes from the cluster rather than from more branch symbols
  // because leaves are instanced and cheap while symbols grow the grammar
  // exponentially.
  acacia: { kind: 'blade', cluster: 8, scale: 0.7, spread: 0.85 },
  // Bespoke forms place their own leaves, so cluster and spread go unused; only
  // kind and scale reach them.
  vine: { kind: 'broad', cluster: 1, scale: 1.1, spread: 0 },
  topiary: { kind: 'round', cluster: 1, scale: 0.7, spread: 0 },
  palm: { kind: 'frond', cluster: 1, scale: 1.15, spread: 0 },
};

/** Foliage for a plant with no preset (a raw hand-written grammar). */
export const DEFAULT_FOLIAGE: FoliageStyle = {
  kind: 'broad',
  cluster: 1,
  scale: 1.0,
  spread: 0.4,
};

export function foliageFor(preset?: PresetName): FoliageStyle {
  return preset ? FOLIAGE[preset] : DEFAULT_FOLIAGE;
}

export function leafKindFor(preset: PresetName): LeafKind {
  return FOLIAGE[preset].kind;
}

/**
 * Iteration counts are tuned to land between 1k and 6k symbols. Raising one by
 * a single step roughly triples the cost, so measure before you do it.
 */
export const PRESETS: Record<PresetName, Grammar> = {
  /** Branching tree. Reads well at 2 to 4 metres in Greenhouse mode. */
  broadleaf: {
    axiom: 'FA',
    rules: {
      A: [
        { successor: 'F[&+FA]/[&-FA]//[^FA]J', weight: 2 },
        { successor: 'F[&+FA]///[&-FA]J', weight: 3 },
        { successor: 'FF[&+FA]/[&-FA]J', weight: 1 },
      ],
    },
    iterations: 6,
  },

  /**
   * Fuller, rounder crown than broadleaf: more side branches per node, one fewer
   * iteration to stay inside budget. Reads as a dense shade tree next to the
   * broadleaf's more open frame.
   */
  bushy: {
    axiom: 'FA',
    rules: {
      A: [
        { successor: 'F[&+FA][&-FA][^FA]J', weight: 2 },
        { successor: 'F[+FA][-FA]J', weight: 2 },
        { successor: 'FF[&FA]/[&FA]J', weight: 1 },
      ],
    },
    iterations: 6,
  },

  /**
   * Slender trunk hung with drooping leafy whips. B is a terminal strand — it
   * carries no B of its own, so the whips stay short while the A recursion builds
   * the cascade above them. The heavy pitch-down (&&&) gives the weep that
   * gravity alone would not, since a healthy plant runs gravity near zero.
   */
  willow: {
    axiom: 'FFA',
    rules: {
      A: [
        { successor: 'F[&&&B]/[&&&B]\\[&&&B]FA', weight: 1 },
        { successor: 'F[&&B]//[&&B]FA', weight: 1 },
      ],
      B: 'F[&FJ]&F[&FJ]&FJ',
    },
    iterations: 8,
  },

  /** Dense low mound. Good for leaf nodes and for tabletop Bonsai mode. */
  shrub: {
    axiom: 'A',
    rules: {
      A: [
        { successor: 'F[+A][-A][&A][^A]J', weight: 3 },
        { successor: 'F[+A][&A]J', weight: 2 },
      ],
    },
    iterations: 6,
  },

  /** Conifer. Cheap: a single trunk with whorls, so iterations grow linearly. */
  spire: {
    axiom: 'FA',
    rules: {
      A: 'F[&FJ]/////[&FJ]/////[&FJ]/////FA',
    },
    iterations: 9,
  },

  /**
   * A single flower: a short stem topped with a head. The bloom markers (J) all
   * sit near the top on short splayed stalks, so the foliage renderer's leaf
   * cluster turns each into a burst of petals and the whole reads as one head.
   * No recursion — a flower is not a fractal — so this is a fixed string and
   * height comes from growthScale, not from iterating. Health thins the petals
   * the same way it thins leaves, so a struggling flower stops blooming rather
   * than turning into a dead twig.
   */
  flower: {
    axiom: 'FFF[^FJ][+FJ][-FJ][\\FJ][/FJ]FJ',
    rules: {},
    iterations: 1,
  },

  /** A taller, looser, sparser bloom for a scattered meadow. */
  wildflower: {
    axiom: 'FFFF[+FJ][-FJ][^FJ]FJ',
    rules: {},
    iterations: 1,
  },

  /**
   * A flat-crowned savanna tree: a long bare trunk, then a whorl of limbs that
   * pitch over hard and spread almost horizontally into feathery sprays.
   *
   * The crown is deliberately not recursive. An acacia's silhouette is a plate
   * balanced on a stem, and self-similar branching produces a dome however it is
   * tuned — so `A` fires once into four limbs and `C` clothes each of them, and
   * the whole thing settles after two rewrites. Cheap for the same reason: a
   * couple of hundred symbols against the broadleaf's few thousand.
   */
  acacia: {
    axiom: 'FFFFFA',
    rules: {
      A: 'F[&&&C]////[&&&C]////[&&&C]////[&&&C]////[&&&C]////[&&&C]',
      C: [
        { successor: 'FF[+FJ][-FJ][^FJ]FJ', weight: 2 },
        { successor: 'F[+FJ][-FFJ][&FJ]FJ', weight: 3 },
      ],
    },
    iterations: 4,
  },

  // The bespoke forms are generated in lsystem/bespoke.ts, not from a grammar.
  // These placeholders keep the preset table total; the generator supersedes
  // them before expansion is ever reached.
  vine: { axiom: 'F', rules: {}, iterations: 1 },
  topiary: { axiom: 'F', rules: {}, iterations: 1 },
  palm: { axiom: 'F', rules: {}, iterations: 1 },
};
