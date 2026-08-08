import type { EcosystemNode } from '../ecosystem/types';
import type { PlantGeometry, Vec3 } from '../lsystem/types';

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
}
