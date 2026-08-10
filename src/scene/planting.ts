import type { PlantingType } from '../ecosystem/planting';
import type { PresetName } from '../lsystem/presets';

/**
 * Which plant forms a planting is drawn with.
 *
 * This is the render half of the planting concept: `ecosystem/planting.ts` says
 * a bed is an orchard; this says an orchard is made of broadleaf and bushy
 * trees. It lives in the scene because it maps onto L-system archetypes, which
 * are a rendering vocabulary.
 *
 * A palette rather than a single form, so a bed shows varied individuals — the
 * scene picks one per plant by a hash of the node id, the same trick the old
 * per-node variety used, now scoped to what the planting allows.
 *
 * The planned plantings have no geometry of their own yet, so they fall back to
 * the nearest tree form and are never assigned to a bed until their phase lands.
 * Keeping an entry for every type means the map is total and the fallback is a
 * deliberate choice rather than an undefined lookup.
 */
export const PLANTING_FORMS: Record<PlantingType, PresetName[]> = {
  orchard: ['broadleaf', 'bushy'],
  grove: ['willow'],
  hedge: ['bushy'],
  'conifer-stand': ['spire'],
  thicket: ['shrub'],
  'flower-border': ['flower'],
  'wildflower-meadow': ['wildflower'],
  'vegetable-rows': ['bushy'],
  vineyard: ['vine'],
  topiary: ['topiary'],
  'palm-grove': ['palm'],
  // Acacia carries the savanna, with the odd broadleaf among them. A single
  // form would read as a plantation, and scattered trees of two kinds is what
  // makes it look unplanted rather than merely spaced out.
  savanna: ['acacia', 'acacia', 'broadleaf'],
};

/** The archetype for one plant in a planting, chosen deterministically by id. */
export function formFor(planting: PlantingType, nodeId: string): PresetName {
  const palette = PLANTING_FORMS[planting];
  return palette[hashString(nodeId) % palette.length];
}

/**
 * Which plantings bear produce. Fruit is drawn as a scene-side decoration on a
 * subset of a plant's leaf points, so it costs the pure geometry nothing and its
 * amount follows leaf count — a struggling plant carries less, the same wilt read
 * the leaves already give. This is the seam the vineyard and a fruiting orchard
 * will reuse when they land.
 */
export function bearsProduce(planting: PlantingType): boolean {
  return planting === 'vegetable-rows' || planting === 'vineyard';
}

/**
 * Produce colour. Like petals, decorative and varietal, seeded from the id and
 * never a health signal; staleness greys it. Vegetables wear a spread of
 * kitchen-garden colours; a vineyard wears grape colours, so the same produce
 * layer reads as a tomato patch or a hanging bunch depending on the planting.
 */
const VEGETABLE_PALETTE = [
  '#d1462f', // tomato
  '#e2892f', // squash
  '#7f9e3b', // green pepper
  '#7d4a8f', // aubergine
  '#e0b32e', // yellow
  '#c8383a', // chilli
];

const GRAPE_PALETTE = [
  '#5b3a72', // black grape
  '#71487f', // purple
  '#9aa84b', // green grape
  '#4a3163', // deep purple
];

export function produceTintFor(
  nodeId: string,
  stale: number,
  planting: PlantingType,
): string {
  if (stale > 1) return '#8f8b83';
  const palette = planting === 'vineyard' ? GRAPE_PALETTE : VEGETABLE_PALETTE;
  return palette[hashString(nodeId + '#fruit') % palette.length];
}

/** Stable non-negative hash of a string, for the deterministic form pick. */
function hashString(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
