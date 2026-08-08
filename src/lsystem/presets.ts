import type { Grammar } from './types';

/**
 * Archetypes, not domains. Any adapter can pick any archetype; the mapping from
 * domain to archetype lives in the translation layer where it belongs.
 */
export type PresetName = 'broadleaf' | 'shrub' | 'spire';

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
};
