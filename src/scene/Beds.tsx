import { useLayoutEffect, useMemo } from 'react';
import type { BedPlacement } from '../ecosystem/layout';
import { BED_HEIGHT, FLOOR_Y } from './greenhouse';
import { liftForTexture, plankPixels, soilPixels, surfaceTexture } from './textures';

/**
 * Raised beds: soil held in a timber box.
 *
 * The soil was a slab lying on the ground, and a slab is not a bed — it is a
 * patch of a different colour, which is why the beds read as regions on a map
 * rather than as objects in a room. Sides fix that with almost nothing: four
 * boards and a cap rail give the soil an edge, a thickness, and a shadow, and
 * that is the whole difference between ground that has been coloured in and
 * ground somebody built.
 *
 * The trick is which way it is built. Beds are raised by **lowering the floor**
 * (`FLOOR_Y` in greenhouse.ts), never by lifting the soil: plants are placed at
 * y = 0, and grafts, dust, and sway all measure from there. So the soil surface
 * stays exactly at zero and the timber falls away beneath it, which means this
 * change cost nothing anywhere else in the scene.
 *
 * Still deliberately quiet — a bed is structure, and structure carries no signal
 * — so the timber has one colour, generated grain, and no state at all. The soil
 * inside it keeps its furrows, running along x, which is the axis layout lays
 * rows out on.
 */

/** Metres of soil per texture tile. The map carries three furrows per tile, so
 *  this sets the ridge spacing — near enough a raked seedbed at a bed's scale. */
const TILE_METRES = 1.2;

/** Metres of board per grain tile: about the length of a real sawn section, so
 *  a long side reads as several boards rather than as one impossible plank. */
const PLANK_METRES = 1.1;

/** Board thickness, and how far the sides stand proud of the soil. Enough to
 *  cast a lip shadow onto the bed, which is what says the soil is held in. */
const BOARD = 0.07;
const PROUD = 0.06;

/** The cap rail: a flat board laid over the sides, and how far it oversails
 *  them. This is the one detail that reads as joinery rather than as a crate. */
const CAP = 0.035;
const OVERSAIL = 0.045;

/** Corner posts, flush with the top of the sides and under the cap. */
const POST = 0.12;

const WOOD = '#8a6f4e';

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
  const [width, depth] = bed.size;

  // A texture per bed, because the repeat has to match the bed's own size for
  // the furrows to keep a constant spacing from one bed to the next. The pixel
  // buffer is regenerated with it, which costs a fraction of a millisecond for
  // the handful of beds a garden has.
  const soil = useMemo(
    () => surfaceTexture(soilPixels(), [tiles(width), tiles(depth)]),
    [width, depth],
  );
  useLayoutEffect(() => () => soil.dispose(), [soil]);

  // One plank map per board direction. A box face's u runs along its longest
  // edge, so repeating by that edge's length is what keeps the grain the same
  // size on a two metre side and on a six metre one.
  const along = useMemo(
    () => surfaceTexture(plankPixels(), [outer(width) / PLANK_METRES, 1]),
    [width],
  );
  const across = useMemo(
    () => surfaceTexture(plankPixels(0x91a5), [depth / PLANK_METRES, 1]),
    [depth],
  );
  useLayoutEffect(() => () => {
    along.dispose();
    across.dispose();
  }, [along, across]);

  const wood = useMemo(() => liftForTexture(WOOD), []);

  // Sides run from the floor to a little above the soil, and sit outside the
  // soil's own footprint so the bed's planted area is unchanged by the timber.
  const sideHeight = BED_HEIGHT + PROUD;
  const sideY = FLOOR_Y + sideHeight / 2;
  const x = width / 2 + BOARD / 2;
  const z = depth / 2 + BOARD / 2;
  const capY = FLOOR_Y + sideHeight + CAP / 2;

  return (
    <group position={[bed.center[0], 0, bed.center[2]]}>
      {/* Soil, filling the box to the surface plants stand on. */}
      <mesh position={[0, FLOOR_Y + BED_HEIGHT / 2, 0]} receiveShadow>
        <boxGeometry args={[width, BED_HEIGHT, depth]} />
        <meshStandardMaterial map={soil} color={liftForTexture('#3d342b')} roughness={1} />
      </mesh>

      {/* The four sides. The long pair oversails the ends, the way boards are
          actually butted, so the corner shows an end grain joint. */}
      {[-z, z].map((at) => (
        <mesh key={`z${at}`} position={[0, sideY, at]} castShadow receiveShadow>
          <boxGeometry args={[outer(width), sideHeight, BOARD]} />
          <meshStandardMaterial map={along} color={wood} roughness={0.9} />
        </mesh>
      ))}
      {[-x, x].map((at) => (
        <mesh key={`x${at}`} position={[at, sideY, 0]} castShadow receiveShadow>
          <boxGeometry args={[BOARD, sideHeight, depth]} />
          <meshStandardMaterial map={across} color={wood} roughness={0.9} />
        </mesh>
      ))}

      {/* Corner posts, which is what a real bed is held together by. */}
      {[-x, x].map((px) =>
        [-z, z].map((pz) => (
          <mesh
            key={`p${px},${pz}`}
            position={[px, sideY, pz]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[POST, sideHeight, POST]} />
            <meshStandardMaterial map={across} color={wood} roughness={0.9} />
          </mesh>
        )),
      )}

      {/* Cap rail. It oversails on both faces, so the bed gets a shadow line
          under its own edge rather than a flat top. */}
      {[-z, z].map((at) => (
        <mesh key={`cz${at}`} position={[0, capY, at]} castShadow receiveShadow>
          <boxGeometry args={[outer(width) + OVERSAIL * 2, CAP, BOARD + OVERSAIL * 2]} />
          <meshStandardMaterial map={along} color={wood} roughness={0.85} />
        </mesh>
      ))}
      {[-x, x].map((at) => (
        <mesh key={`cx${at}`} position={[at, capY, 0]} castShadow receiveShadow>
          <boxGeometry args={[BOARD + OVERSAIL * 2, CAP, depth]} />
          <meshStandardMaterial map={across} color={wood} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

/** Outer length of the pair of sides that oversail the ends. */
function outer(width: number): number {
  return width + BOARD * 2;
}
