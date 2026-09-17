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

/**
 * A second kind of foliage on the same plant, split out by how deep in the
 * bracket nesting each leaf sits.
 *
 * A leaf kind is otherwise a property of the whole plant, which is right for
 * everything that wears one kind of leaf — and wrong for a flower, whose stems
 * carry ordinary green leaves *and* petals. The generator already records a
 * depth per leaf, so the split costs nothing new: markers written straight onto
 * a stem are shallow, and markers inside a bracket (a bud on a short side
 * branch) are deeper.
 */
export interface UnderstoryStyle {
  kind: LeafKind;
  /** Leaves at this bracket depth or shallower wear `kind`. Deeper ones wear the
   *  plant's primary kind. */
  maxDepth: number;
  /** Size relative to the plant's leaf scale. Stem leaves are small beside a
   *  flower head. */
  scale: number;
}

export interface FoliageStyle {
  kind: LeafKind;
  /** Optional second foliage kind, split by leaf depth. See UnderstoryStyle. */
  understory?: UnderstoryStyle;
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
  // Whips carry leaves the whole way down, not a few scattered blades.
  willow: { kind: 'blade', cluster: 5, scale: 0.85, spread: 0.8 },
  shrub: { kind: 'round', cluster: 2, scale: 0.7, spread: 0.5 },
  // Needles have to read as foliage mass from across the room. At the first
  // size they were individually accurate and collectively invisible, so a
  // whorl of them looked like bare twigs.
  spire: { kind: 'needle', cluster: 6, scale: 2.2, spread: 0.5 },
  // Blooms are big relative to the short stem and pack tightly into a head.
  // Sized for one head among several, not for a single bloom standing alone.
  flower: {
    kind: 'bloom',
    cluster: 7,
    scale: 0.5,
    spread: 0.16,
    // Markers written straight onto a stem are at the axiom's own bracket
    // depth; buds sit one bracket deeper. So depth 1 is foliage and
    // anything below it is petals.
    understory: { kind: 'broad', maxDepth: 1, scale: 0.55 },
  },
  // Sized against the flower's head, which is no longer a single giant bloom.
  wildflower: { kind: 'bloom', cluster: 5, scale: 0.75, spread: 0.3 },
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
  vine: { kind: 'broad', cluster: 1, scale: 0.85, spread: 0 },
  topiary: { kind: 'round', cluster: 1, scale: 0.7, spread: 0 },
  palm: { kind: 'frond', cluster: 1, scale: 1.15, spread: 0 },
};

/**
 * Trunk radius as a fraction of the plant's finished height, per archetype.
 *
 * This was one global constant, and a single number cannot be right for both an
 * oak and a daisy: at 0.035 of height every form got a trunk the thickness of a
 * tree's, so a flower stem came out 15cm across and a willow's drooping whips
 * were as fat as the limb they hung from. Thickness is not a health signal — it
 * is maturity, and maturity is structural — so the fix belongs here beside the
 * other per-archetype form data rather than in the health response.
 *
 * Real trunks run about 0.02 to 0.05 of height. Anything herbaceous is an order
 * of magnitude under that, which is the range this table actually spans.
 */
export const TRUNK_RATIO: Record<PresetName, number> = {
  /** Timber. The original global value, kept for the forms it was tuned on. */
  broadleaf: 0.035,
  bushy: 0.035,
  /** A willow is slender for its height, and its whips are strands. The first
   *  cut of this table put it at 0.018 and the limbs still read as jointed
   *  pipes rather than as anything that could hang; 0.01 went the other way and
   *  left it wiry. */
  willow: 0.014,
  /** Carries the widest crown of any preset, and a canopy that size needs a
   *  bole under it rather than a stick. */
  shrub: 0.045,
  /** Conifers carry a narrow bole and fine whorls. */
  spire: 0.022,
  /** Herbaceous: a stalk you could snap between two fingers. */
  flower: 0.005,
  wildflower: 0.005,
  acacia: 0.03,
  /** Gnarled but short, and the cordon arms have to stay wiry. */
  vine: 0.022,
  topiary: 0.028,
  /** A palm's trunk barely tapers, so it reads thick if it starts thick. */
  palm: 0.024,
};

/** The trunk ratio for a preset, or the timber default for a raw grammar. */
export function trunkRatioFor(preset?: PresetName): number {
  return preset ? TRUNK_RATIO[preset] : 0.035;
}

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

/** The plant's second foliage kind, if its archetype has one. */
export function understoryFor(preset: PresetName): UnderstoryStyle | undefined {
  return FOLIAGE[preset].understory;
}

/**
 * Iteration counts are tuned to land between 1k and 6k symbols. Raising one by
 * a single step roughly triples the cost, so measure before you do it.
 */
export const PRESETS: Record<PresetName, Grammar> = {
  /**
   * Branching tree. Reads well at 2 to 4 metres in Greenhouse mode.
   *
   * Pitch alternates between `&` and `^` rather than running `&` throughout.
   * Pitch accumulates down the recursion, so a rule that only ever pitched one
   * way had its branches past horizontal by the third level and pointing at the
   * ground by the fourth — which is why the crown came out half again wider than
   * the tree was tall and looked like it was collapsing outward.
   */
  broadleaf: {
    axiom: 'FFA',
    rules: {
      A: [
        { successor: 'F[&+FA]/[^-FA]//[^FA]J', weight: 2 },
        { successor: 'F[^+FA]///[&-FA]J', weight: 3 },
        { successor: 'FF[^FA]//[&FA]J', weight: 1 },
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
        { successor: 'F[&+FA][^-FA][^FA]J', weight: 2 },
        { successor: 'F[+FA][-FA][^FA]J', weight: 2 },
        { successor: 'FF[^FA]/[&FA]J', weight: 1 },
      ],
    },
    iterations: 6,
  },

  /**
   * Slender trunk hung with drooping leafy whips. `B` is a terminal strand — it
   * carries no `B` of its own, so the whips stay finite while the `A` recursion
   * builds the cascade above them. The heavy pitch-down (`&&&`) gives the weep
   * that gravity alone would not, since a healthy plant runs gravity near zero.
   *
   * The whip is the whole form and it has to be *long*. At three segments with
   * leaves only at their tips, the tree came out a bare pole carrying a tuft
   * somewhere near its middle — nothing that could be mistaken for a willow. A
   * strand now pitches down at every step and carries a leaf cluster at each,
   * which is what makes it hang rather than merely point downward.
   *
   * `A` also stopped adding a second trunk segment per firing. The trunk grew
   * twice as fast as the cascade could cover it, which is the other half of why
   * the pole showed.
   *
   * Rolls between whips all run the same way (`///`). Rolling out and back
   * (`/` then `\\`) puts the first and third whip at the same bearing, so a
   * three-whip node hung two of its three strands on one side and the tree came
   * out lopsided.
   */
  willow: {
    axiom: 'FFA',
    rules: {
      A: [
        { successor: 'F[&&&B]///[&&&B]///[&&&B]///A', weight: 2 },
        // Whips without extending the trunk, so the cascade thickens faster than
        // the leader climbs. Without this the trunk outran its own foliage and
        // left a bare spike standing above the crown.
        { successor: '[&&B]///[&&B]///[&&&B]///A', weight: 2 },
      ],
      B: 'FJ&FJ&FJ&FJ&FJ&FJ',
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

  /**
   * Conifer: a straight bole hung with whorls of drooping limbs.
   *
   * The first cut made each whorl branch a single `F` with one leaf marker at
   * its tip, which is a stub with a tuft floating on the end — and at 0.12m
   * across on a 2.2m tree, a pencil rather than a conifer. A real whorl limb is
   * *long*, pitches down from the trunk, and carries needles along its whole
   * length rather than in a ball at the end.
   *
   * So `C` is that limb, and it is a terminal rule — its successor contains no
   * `C`, so it expands once and stops. That keeps this the cheap preset it has
   * always been: the trunk recursion `A` fires linearly, and each firing adds a
   * fixed handful of limbs rather than a branching tree of them.
   *
   * Four limbs per whorl instead of three, rolled by an odd fraction of a turn
   * so successive whorls do not stack into vertical rows.
   *
   * The recursion is wrapped in brackets — `F[A]` rather than `FA` — and that
   * bracket is doing real work rather than nothing. Step length is
   * `lengthFalloff^depth` and `[` increments depth, so nesting each level inside
   * the last makes every whorl a little shorter than the one below it. Without
   * it every whorl came out the same length, which is the one thing a conifer's
   * silhouette never does: the top layers looked as wide as the bottom ones, and
   * sometimes wider.
   */
  spire: {
    axiom: 'FFA',
    rules: {
      A: 'F[&&C]/////[&&C]/////[&&C]/////[&&C]///////F[A]',
      C: 'FJ[-FJ]FJ[+FJ]FJ',
    },
    iterations: 9,
  },

  /**
   * A **clump** of flowers, not one flower.
   *
   * A plant here is a whole team, and a bed is a border those teams are planted
   * in — so the thing that has to read is a *group of the same flower*, which is
   * what a border actually looks like. One stem with one head instead gave each
   * team a single enormous bloom on a stalk, with petals nearly forty
   * centimetres across.
   *
   * `B` is one stem with a small head, and the axiom stands six of them around a
   * common base. The offset is `&f^`: pitch over, step *without drawing*, then
   * pitch back upright. That moves each stem's foot away from the centre and
   * leaves it growing straight up, which is what a planted clump does — tilting
   * the whole stem instead splayed the tips so far that the clumps merged into
   * each other again, which is the problem this was meant to fix. The petal
   * colour is seeded per node, so every stem in a clump shares one colour and
   * the grouping by team happens for free.
   *
   * A stem is not a bare stalk with one head on it. `B` writes leaf markers
   * straight onto the stem as it climbs and then opens into several buds on
   * short side branches, and it comes in three lengths so a clump has a natural
   * spread of heights rather than six stems cut level.
   *
   * The two kinds of marker are told apart by bracket depth rather than by a
   * second symbol: written on the stem they are shallow and render as green
   * leaves, and inside a bracket they are deeper and render as petals. See
   * `UnderstoryStyle`.
   *
   * Barely recursive — a flower is not a fractal — so two iterations is all it
   * takes: one to place the stems, one to expand them. Health thins the petals
   * the same way it thins leaves, so a struggling clump stops blooming rather
   * than turning into dead twigs.
   */
  flower: {
    axiom: '[B]/[&f^B]//[&f^B]//[&f^B]//[&f^B]//[&f^B]',
    rules: {
      B: [
        { successor: 'FJFJF[^FJ][+FJ][-FJ][J]', weight: 2 },
        { successor: 'FJFJFJF[^FJ][+FJ][-FJ][J]', weight: 2 },
        { successor: 'FJF[^FJ][+FJ][J]', weight: 1 },
      ],
    },
    iterations: 2,
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
