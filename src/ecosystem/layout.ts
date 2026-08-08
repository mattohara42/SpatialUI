import type { EcosystemNode } from './types';
import type { Vec3 } from '../lsystem/types';

/**
 * Where things stand in the garden.
 *
 * Pure and deterministic, kept out of the scene so layout can be tested and
 * swapped without touching a renderer. The first layout is rows inside beds,
 * which is the least presumptuous option and the fastest to judge by eye. If
 * connected plants sitting far apart is what ruins the reading, this is the file
 * that changes.
 */

export interface PlantPlacement {
  nodeId: string;
  position: Vec3;
  /** Height in metres, from maturity. */
  growthScale: number;
}

export interface BedPlacement {
  nodeId: string;
  center: Vec3;
  /** Width along x, depth along z. */
  size: [number, number];
}

export interface GardenLayout {
  beds: BedPlacement[];
  plants: PlantPlacement[];
  /** Lookup for the graft renderer, which needs endpoints not placements. */
  positionOf: Record<string, Vec3>;
  /** Overall footprint, for framing the camera and for Bonsai mode scaling. */
  size: [number, number];
}

export interface LayoutOptions {
  /** Metres between plant centres. */
  plantSpacing?: number;
  /** Metres of soil around the outermost plants. */
  bedPadding?: number;
  /** Metres between beds. */
  bedGap?: number;
  /** Plants per row before wrapping. */
  columns?: number;
  /** Plant height at maturity 0 and 1. */
  heightRange?: [number, number];
}

export function layoutGarden(
  nodes: EcosystemNode[],
  options: LayoutOptions = {},
): GardenLayout {
  const {
    plantSpacing = 1.4,
    bedPadding = 0.7,
    bedGap = 1.2,
    columns = 3,
    heightRange = [0.8, 2.6],
  } = options;

  const beds = nodes
    .filter((n) => n.kind === 'bed')
    .sort((a, b) => a.id.localeCompare(b.id));

  const bedPlacements: BedPlacement[] = [];
  const plants: PlantPlacement[] = [];
  const positionOf: Record<string, Vec3> = {};

  let cursorX = 0;
  let maxDepth = 0;

  for (const bed of beds) {
    const children = nodes
      .filter((n) => n.parentId === bed.id && n.kind === 'plant')
      .sort((a, b) => a.id.localeCompare(b.id));

    const cols = Math.min(columns, Math.max(1, children.length));
    const rows = Math.max(1, Math.ceil(children.length / cols));

    const width = (cols - 1) * plantSpacing + bedPadding * 2;
    const depth = (rows - 1) * plantSpacing + bedPadding * 2;
    const centerX = cursorX + width / 2;

    bedPlacements.push({
      nodeId: bed.id,
      center: [centerX, 0, depth / 2],
      size: [width, depth],
    });

    children.forEach((plant, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const position: Vec3 = [
        cursorX + bedPadding + col * plantSpacing,
        0,
        bedPadding + row * plantSpacing,
      ];
      positionOf[plant.id] = position;
      plants.push({
        nodeId: plant.id,
        position,
        growthScale:
          heightRange[0] + (heightRange[1] - heightRange[0]) * plant.maturity,
      });
    });

    cursorX += width + bedGap;
    maxDepth = Math.max(maxDepth, depth);
  }

  return {
    beds: bedPlacements,
    plants,
    positionOf,
    size: [Math.max(0, cursorX - bedGap), maxDepth],
  };
}
