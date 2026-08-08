import { useLayoutEffect, useMemo } from 'react';
import type { BedPlacement } from '../ecosystem/layout';
import { liftForTexture, soilPixels, surfaceTexture } from './textures';

/**
 * Soil.
 *
 * Still deliberately quiet — beds are structure, not the thing being read — but
 * no longer a flat brown slab. The soil map carries crumb noise under shallow
 * furrows, and the furrows run along x, which is the axis layout lays rows out
 * on, so a bed looks worked for the thing planted in it. The map is achromatic
 * (see textures.ts), so this is texture and not a second colour: the bed is the
 * same brown it always was, with a surface.
 */

/** Metres of soil per texture tile. The map carries three furrows per tile, so
 *  this sets the ridge spacing — near enough a raked seedbed at a bed's scale. */
const TILE_METRES = 1.2;

/** Whole tiles across a bed, so a furrow is never cut off mid-ridge at the edge
 *  of the soil. At least one, or a small bed would stretch a single tile. */
function tiles(metres: number): number {
  return Math.max(1, Math.round(metres / TILE_METRES));
}

export function Beds({ beds }: { beds: BedPlacement[] }) {
  return (
    <group>
      {beds.map((bed) => (
        <Bed key={bed.nodeId} bed={bed} />
      ))}
    </group>
  );
}

function Bed({ bed }: { bed: BedPlacement }) {
  // A texture per bed, because the repeat has to match the bed's own size for
  // the furrows to keep a constant spacing from one bed to the next. The pixel
  // buffer is regenerated with it, which costs a fraction of a millisecond for
  // the handful of beds a garden has.
  const soil = useMemo(
    () => surfaceTexture(soilPixels(), [tiles(bed.size[0]), tiles(bed.size[1])]),
    [bed.size[0], bed.size[1]],
  );
  useLayoutEffect(() => () => soil.dispose(), [soil]);

  return (
    <mesh position={[bed.center[0], -0.04, bed.center[2]]} receiveShadow>
      <boxGeometry args={[bed.size[0], 0.08, bed.size[1]]} />
      <meshStandardMaterial map={soil} color={liftForTexture('#3d342b')} roughness={1} />
    </mesh>
  );
}
