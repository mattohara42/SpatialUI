/**
 * What kind of planting a bed is.
 *
 * A garden fixes what vitality *means*; a bed says what is *planted*. Today beds
 * are only spatial buckets, which is why a garden reads as a random thicket. Give
 * each bed a planting type — an orchard, a hedge, a vineyard — and the bed
 * becomes a legible unit with a shape, an arrangement, and (later) its own way of
 * showing health and yield.
 *
 * This is a property of the container, not of any node's health, so it spends no
 * part of the scarce health-reading budget: it sits in the same contextual slot
 * as domain and archetype variety — learnable, constant, signal-free per node.
 * Health still reads through droop, leaf density, and colour *within* whichever
 * form the planting dictates. Keeping that boundary is the whole reason this is
 * safe to add.
 *
 * The module is deliberately self-contained: it names the concept and its
 * spatial arrangement, and imports nothing, so both the pure layout code and the
 * renderer can read it without a dependency cycle. Which plant *forms* a planting
 * is drawn with is a render decision and lives in `scene/planting.ts`.
 */

export type PlantingType =
  // Live now: arrangements of the existing L-system forms.
  | 'orchard'
  | 'grove'
  | 'hedge'
  | 'conifer-stand'
  | 'thicket'
  // Planned: each needs its own geometry and lands with its own phase. Declared
  // here so the vocabulary is complete and the roadmap is visible in the type.
  | 'flower-border'
  | 'wildflower-meadow'
  | 'vegetable-rows'
  | 'vineyard'
  | 'topiary';

/**
 * How plants stand within a bed. Layout reads this; it is spatial, not visual,
 * which is why it lives with the concept rather than in the renderer.
 */
export interface PlantingArrangement {
  /** Plants per row before wrapping. 0 means a single row of any length. */
  columns: number;
  /** Metres between plants along a row. */
  spacing: number;
  /** Metres between rows. */
  rowSpacing: number;
  /** 0..1 positional wobble, applied deterministically per plant. */
  jitter: number;
  /** Multiplies plant height, so a hedge sits low and a stand stands tall. */
  heightScale: number;
}

export interface PlantingSpec {
  label: string;
  /** True for weed/invasive plantings, which suppress-polarity gardens use. */
  invasive: boolean;
  /** False while the type still renders through a fallback form (see scene). */
  live: boolean;
  arrangement: PlantingArrangement;
}

export const PLANTINGS: Record<PlantingType, PlantingSpec> = {
  orchard: {
    label: 'Orchard',
    invasive: false,
    live: true,
    arrangement: { columns: 3, spacing: 1.7, rowSpacing: 1.9, jitter: 0.12, heightScale: 1.1 },
  },
  grove: {
    label: 'Grove',
    invasive: false,
    live: true,
    arrangement: { columns: 2, spacing: 1.8, rowSpacing: 1.8, jitter: 0.35, heightScale: 1.15 },
  },
  hedge: {
    label: 'Hedge',
    invasive: false,
    live: true,
    // A single tight row of low, dense growth reads as a clipped wall.
    arrangement: { columns: 0, spacing: 0.85, rowSpacing: 1.0, jitter: 0.05, heightScale: 0.55 },
  },
  'conifer-stand': {
    label: 'Conifer stand',
    invasive: false,
    live: true,
    arrangement: { columns: 3, spacing: 1.4, rowSpacing: 1.6, jitter: 0.2, heightScale: 1.1 },
  },
  thicket: {
    label: 'Thicket',
    invasive: true,
    live: true,
    // Dense and disordered: an infestation, not a planting.
    arrangement: { columns: 3, spacing: 1.1, rowSpacing: 1.1, jitter: 0.45, heightScale: 0.9 },
  },

  'flower-border': {
    label: 'Flower border',
    invasive: false,
    live: true,
    arrangement: { columns: 0, spacing: 0.5, rowSpacing: 0.6, jitter: 0.15, heightScale: 0.5 },
  },
  'wildflower-meadow': {
    label: 'Wildflower meadow',
    invasive: false,
    live: true,
    arrangement: { columns: 4, spacing: 0.55, rowSpacing: 0.6, jitter: 0.5, heightScale: 0.55 },
  },

  // --- planned ---------------------------------------------------------------
  'vegetable-rows': {
    label: 'Vegetable rows',
    invasive: false,
    live: false,
    arrangement: { columns: 0, spacing: 0.7, rowSpacing: 0.9, jitter: 0.1, heightScale: 0.6 },
  },
  vineyard: {
    label: 'Vineyard',
    invasive: false,
    live: false,
    arrangement: { columns: 0, spacing: 1.2, rowSpacing: 1.8, jitter: 0.05, heightScale: 0.8 },
  },
  topiary: {
    label: 'Topiary',
    invasive: false,
    live: false,
    arrangement: { columns: 3, spacing: 1.7, rowSpacing: 1.7, jitter: 0.04, heightScale: 0.8 },
  },
};

/** The safe default when a bed has not been assigned a planting. */
export const DEFAULT_PLANTING: PlantingType = 'orchard';

/**
 * The planting a bed carries, or the default. Structurally typed on purpose, so
 * this file need not import the node type and create a cycle.
 */
export function plantingOf(bed: { plantingType?: PlantingType }): PlantingType {
  return bed.plantingType ?? DEFAULT_PLANTING;
}

export function arrangementFor(type: PlantingType): PlantingArrangement {
  return PLANTINGS[type].arrangement;
}

export function isLivePlanting(type: PlantingType): boolean {
  return PLANTINGS[type].live;
}
