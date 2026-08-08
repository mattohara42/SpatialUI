import type { EcosystemNode } from '../ecosystem/types';
import type { PlantGeometry, Vec3 } from '../lsystem/types';
import type { LeafKind } from '../lsystem/presets';

/** Colours resolved from health and staleness, decided once per plant. */
export interface Tint {
  bark: string;
  foliage: string;
}

/** A plant with its geometry, its place in the garden, and its colours. */
export interface PlacedPlant {
  node: EcosystemNode;
  position: Vec3;
  geometry: PlantGeometry;
  tint: Tint;
  /** Which leaf shape this plant wears, from its archetype. */
  leafKind: LeafKind;
  /**
   * The colour petals wear, for bloom-kind plants. Decorative and seeded, never
   * a health signal; greyed only when the plant is stale. Ignored by non-bloom
   * plants, which colour their leaves from `tint.foliage`.
   */
  bloomTint: string;
  /**
   * Set when this plant bears produce (a vegetable, later a vine or fruit tree).
   * The colour is decorative and varietal; produce is drawn on a subset of the
   * plant's leaf points, so its amount follows leaf count and thins with health.
   * Undefined means no produce.
   */
  produceTint?: string;
  /**
   * Cursor-aware vitality for this frame, driving render-time droop. Kept
   * separate from node.vitality so wilt scrubs with time like the geometry does.
   */
  vitality: number;
}
