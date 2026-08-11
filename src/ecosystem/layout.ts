import type { EcosystemNode } from './types';
import { arrangementFor, plantingOf } from './planting';
import type { Vec3 } from '../lsystem/types';

/**
 * Where things stand in the garden.
 *
 * Pure and deterministic, kept out of the scene so layout can be tested and
 * swapped without touching a renderer. Each bed is arranged by its planting
 * type: an orchard stands in roomy rows, a hedge in one tight low line, a
 * thicket in a jittered clump. Arrangement is a spatial property of the
 * planting (see `ecosystem/planting.ts`), so this file reads it rather than
 * deciding it.
 */

/**
 * The most beds that still wrap into two rows. Above this the garden squares
 * off — see `bedsPerRow`. Twelve keeps every garden built so far on the old
 * rule with room to spare, and the smallest garden it changes is nearly twice
 * that.
 */
const TWO_ROW_LIMIT = 12;

export interface PlantPlacement {
  nodeId: string;
  position: Vec3;
  /** Height in metres, from maturity and the planting's height scale. */
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
  /** Metres of soil around the outermost plants. */
  bedPadding?: number;
  /** Metres between beds. */
  bedGap?: number;
  /** Plant height at maturity 0 and 1, before the planting's height scale. */
  heightRange?: [number, number];
  /**
   * Beds per row before wrapping to the next one back. 0 picks a default: up to
   * four beds stand in a single row, more wrap into two. A garden of eight beds
   * in one line is a thirty-five metre strip nobody can stand in front of, and
   * the wrap is also what lets a grouping above the bed — an NFL conference, a
   * cluster of clusters — read as *which row you are looking at* without adding
   * a container level the model does not have.
   *
   * Past a dozen beds the two-row rule stops helping and starts hurting: the
   * world garden's twenty-two subregions would stand eleven to a row, which is
   * a sixty-metre wall of planting with the far end invisible from the near one.
   * So beyond that the default squares the garden off instead. The threshold is
   * set where it is deliberately — it leaves every existing garden's layout
   * exactly as it was, because the row *is* the reading in those, and only
   * takes over where no such grouping exists to preserve.
   */
  bedsPerRow?: number;
}

export function layoutGarden(
  nodes: EcosystemNode[],
  options: LayoutOptions = {},
): GardenLayout {
  const {
    bedPadding = 0.7,
    bedGap = 1.2,
    heightRange = [0.8, 2.6],
    bedsPerRow = 0,
  } = options;

  const beds = nodes
    .filter((n) => n.kind === 'bed')
    .sort((a, b) => a.id.localeCompare(b.id));

  const perRow =
    bedsPerRow > 0
      ? bedsPerRow
      : beds.length <= 4
        ? Math.max(1, beds.length)
        : beds.length <= TWO_ROW_LIMIT
          ? Math.ceil(beds.length / 2)
          : Math.ceil(Math.sqrt(beds.length));

  const bedPlacements: BedPlacement[] = [];
  const plants: PlantPlacement[] = [];
  const positionOf: Record<string, Vec3> = {};

  let cursorX = 0;
  let cursorZ = 0;
  let rowDepth = 0;
  let maxWidth = 0;

  beds.forEach((bed, index) => {
    if (index > 0 && index % perRow === 0) {
      maxWidth = Math.max(maxWidth, cursorX - bedGap);
      cursorX = 0;
      cursorZ += rowDepth + bedGap;
      rowDepth = 0;
    }
    const arr = arrangementFor(plantingOf(bed));
    const children = nodes
      .filter((n) => n.parentId === bed.id && n.kind === 'plant')
      .sort((a, b) => a.id.localeCompare(b.id));

    // columns 0 means one row of any length, which is what makes a hedge or a
    // vine row read as a line rather than a block.
    const cols =
      arr.columns === 0
        ? Math.max(1, children.length)
        : Math.min(arr.columns, Math.max(1, children.length));
    const rows = Math.max(1, Math.ceil(children.length / cols));

    const width = (cols - 1) * arr.spacing + bedPadding * 2;
    const depth = (rows - 1) * arr.rowSpacing + bedPadding * 2;
    const centerX = cursorX + width / 2;

    bedPlacements.push({
      nodeId: bed.id,
      center: [centerX, 0, cursorZ + depth / 2],
      size: [width, depth],
    });

    children.forEach((plant, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      // Deterministic per-plant wobble, so a planting looks grown rather than
      // stamped, and a plant never jumps between frames or telemetry ticks.
      const jx = (hash01(plant.id, 1) * 2 - 1) * arr.jitter * arr.spacing * 0.5;
      const jz = (hash01(plant.id, 2) * 2 - 1) * arr.jitter * arr.rowSpacing * 0.5;
      const position: Vec3 = [
        cursorX + bedPadding + col * arr.spacing + jx,
        0,
        cursorZ + bedPadding + row * arr.rowSpacing + jz,
      ];
      positionOf[plant.id] = position;
      plants.push({
        nodeId: plant.id,
        position,
        growthScale:
          (heightRange[0] + (heightRange[1] - heightRange[0]) * plant.maturity) *
          arr.heightScale,
      });
    });

    cursorX += width + bedGap;
    rowDepth = Math.max(rowDepth, depth);
  });

  maxWidth = Math.max(maxWidth, cursorX - bedGap);

  return {
    beds: bedPlacements,
    plants,
    positionOf,
    size: [Math.max(0, maxWidth), cursorZ + rowDepth],
  };
}

/** Stable [0,1) hash of an id with a salt, for reproducible positional jitter. */
function hash01(id: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}
