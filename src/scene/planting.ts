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

  // planned — fallback forms until each grows its own geometry
  'vegetable-rows': ['bushy'],
  vineyard: ['willow'],
  topiary: ['bushy'],
};

/** The archetype for one plant in a planting, chosen deterministically by id. */
export function formFor(planting: PlantingType, nodeId: string): PresetName {
  const palette = PLANTING_FORMS[planting];
  return palette[hashString(nodeId) % palette.length];
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
