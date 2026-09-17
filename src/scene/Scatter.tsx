import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bladeGeometry, type LeafProfile } from './leaf';
import { FLOOR_Y, type Shell } from './greenhouse';
import {
  meadowScatter,
  pathScatter,
  type Extent,
  type ScatterPoint,
} from './scatter';
import { grain } from './textures';

/**
 * The small things on the ground: an apron of grass outside the glass, and
 * litter on the path within it.
 *
 * Two of the largest surfaces in the scene were doing nothing. The field is read
 * through every pane and the path is read underfoot, and both were a single
 * textured plane — which is enough to say *ground* and not nearly enough to say
 * *a place*. A texture can only vary a surface's colour; what makes ground look
 * like ground is objects standing on it, each catching its own light and laying
 * down its own small shadow. That is what this is.
 *
 * Placement is `scatter.ts` and is pure, deterministic, and keyed on position
 * rather than on any vital — see that file for the three rules this has to keep,
 * of which the load-bearing one is that **nothing lands in a bed**. A tuft of
 * grass in the soil would be a weed, and a weed is the one shape read the whole
 * language turns on.
 *
 * Everything here is one `InstancedMesh` per kind, which is the same bargain the
 * branches and the leaves make: the scatter is a few thousand objects and would
 * be a few thousand draw calls done the obvious way. Nothing in it moves, so
 * unlike the foliage the matrices are written once when the garden changes and
 * never touched again — the per-frame cost is zero and the whole cost is the
 * draw.
 */

/** A grass blade: long, narrow, widest very low, folded just enough to catch
 *  the light down one side. Four rows rather than five, because a blade this
 *  thin spends its vertices on length and there are a great many of them. */
const GRASS_PROFILE: LeafProfile = { shoulder: 0.16, cup: 0.22, curl: 0.55, taper: 0.55 };
const GRASS_ROWS = 4;

/** Blades in one tuft, and how far they lean from vertical. Three is the fewest
 *  that reads as a clump from any angle rather than as a flat fan. */
const BLADES_PER_TUFT = 3;
const TUFT_LEAN = 0.38;

/** Height of a tuft at scale one, in metres. Ankle height: tall enough to read
 *  through the glass from inside, where the dwarf wall already hides the first
 *  half metre of field, and short enough that the apron never competes with the
 *  planting. */
const TUFT_HEIGHT = 0.23;
const TUFT_WIDTH = 0.022;

/** How far the apron of grass reaches out from the walls, and how close together
 *  the tufts stand at the glass. Beyond the reach the turf texture takes over on
 *  its own (see `meadowDensity`). */
const MEADOW_REACH = 11;
const MEADOW_SPACING = 0.42;

/** Spacing of the litter on the path, and how big a pebble is. */
const PATH_SPACING = 0.5;
const PEBBLE_SIZE = 0.035;

/** Grass green, and the stone and litter colours on the path. All three are
 *  ordinary ground colours and none of them is allowed to mean anything: the
 *  jitter below moves luminance only, exactly as `textures.ts` requires. */
const GRASS = '#5f7438';
const PEBBLE = '#a39c8e';
const LITTER = '#8a6a3f';

/** How far one instance may stray from its kind's colour. Ground cover wants
 *  more variation than a canopy, because a lawn of one exact green is the tell
 *  that gave the flat plane away in the first place. */
const SCATTER_GRAIN = 0.2;

/**
 * One tuft: a few blades sharing an origin, each turned about the vertical and
 * leaned out from it. Merged into a single geometry so a tuft is one instance
 * rather than three.
 */
function tuftGeometry(): THREE.BufferGeometry {
  const blades: THREE.BufferGeometry[] = [];
  for (let b = 0; b < BLADES_PER_TUFT; b++) {
    const blade = bladeGeometry(GRASS_PROFILE, GRASS_ROWS);
    // The blade spans -1 to 1 about its middle; shift it so it grows up out of
    // the ground rather than half of it standing below.
    blade.translate(0, 1, 0);
    blade.scale(TUFT_WIDTH, TUFT_HEIGHT / 2, TUFT_WIDTH);
    const turn = (b / BLADES_PER_TUFT) * Math.PI * 2;
    blade.rotateZ(TUFT_LEAN * Math.cos(turn));
    blade.rotateX(TUFT_LEAN * Math.sin(turn));
    blade.rotateY(turn);
    blades.push(blade);
  }
  const merged = mergeGeometries(blades);
  for (const blade of blades) blade.dispose();
  return merged ?? blades[0];
}

/** A pebble: a rough lump, flattened so it sits rather than rolls. */
function pebbleGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(PEBBLE_SIZE, 0);
  geometry.scale(1, 0.55, 1.15);
  return geometry;
}

/** A fallen leaf: one blade lying face up on the floor. */
function litterGeometry(): THREE.BufferGeometry {
  const leaf = bladeGeometry({ shoulder: 0.4, cup: 0.22, curl: 0.3, taper: 0.8 }, 4);
  leaf.rotateX(-Math.PI / 2);
  leaf.scale(0.035, 0.035, 0.055);
  return leaf;
}

/**
 * An instanced layer of one kind of scattered thing.
 *
 * Matrices and colours are both written in a layout effect rather than a frame
 * loop, because none of this moves. A garden change rewrites them; a telemetry
 * tick does not, since nothing here reads a vital.
 */
function ScatterLayer({
  points,
  geometry,
  color,
  y,
  roughness = 1,
  castShadow = false,
  doubleSided = true,
}: {
  points: ScatterPoint[];
  geometry: THREE.BufferGeometry;
  color: string;
  y: number;
  roughness?: number;
  castShadow?: boolean;
  doubleSided?: boolean;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        roughness,
        side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
        color,
      }),
    [roughness, doubleSided, color],
  );
  useLayoutEffect(() => () => material.dispose(), [material]);

  useLayoutEffect(() => {
    const instanced = mesh.current;
    if (!instanced || points.length === 0) return;
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      dummy.position.set(point.x, y, point.z);
      dummy.rotation.set(0, point.rotation, 0);
      dummy.scale.setScalar(point.scale);
      dummy.updateMatrix();
      instanced.setMatrixAt(i, dummy.matrix);
      // Luminance only, like every other grain in the scene: this may break a
      // lawn up into blades, and may never look like it is saying something.
      tint.set('#ffffff').multiplyScalar(grain(color, i, SCATTER_GRAIN));
      instanced.setColorAt(i, tint);
    }
    instanced.instanceMatrix.needsUpdate = true;
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
    instanced.computeBoundingSphere();
  }, [points, y, color]);

  if (points.length === 0) return null;

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, points.length]}
      receiveShadow
      castShadow={castShadow}
    />
  );
}

/**
 * The apron of grass outside the house.
 *
 * Mounted **outside** the assembly group, with the ground plane and the horizon,
 * because it is weather rather than garden: it belongs to the field the house
 * stands in, so it must not shrink when the garden becomes a miniature on a
 * table — a model of a greenhouse sitting in real grass is exactly right, and a
 * model sitting in model grass would just be the same picture again.
 *
 * It casts no shadow. Several thousand ankle-high tufts would each want a place
 * in a shadow map sized for a garden, and what they would contribute is noise at
 * the resolution the map has to spare; they still *receive*, which is the half
 * that makes them sit in the field rather than hover over it.
 */
export function Meadow({ shell }: { shell: Shell }) {
  const geometry = useMemo(() => tuftGeometry(), []);
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);

  const extent = useMemo<Extent>(
    () => ({ width: shell.width, depth: shell.depth }),
    [shell.width, shell.depth],
  );
  const points = useMemo(
    () =>
      meadowScatter(extent, MEADOW_REACH, {
        spacing: MEADOW_SPACING,
        scale: [0.6, 1.5],
        seed: 0x9ea55,
      }),
    [extent],
  );

  return (
    <ScatterLayer points={points} geometry={geometry} color={GRASS} y={FLOOR_Y} />
  );
}

/**
 * Litter on the path: stones and a few fallen leaves on the grit.
 *
 * Mounted **inside** the assembly group, with the house and the props, because
 * this is part of the building's floor and shrinks with it.
 *
 * `plot` is the planting's own footprint, and passing it is not optional: it is
 * how the beds are stepped around, and it is the whole of what keeps a pebble
 * out of the soil where it would read as something growing.
 */
export function PathLitter({ shell, plot }: { shell: Shell; plot: Extent }) {
  const pebble = useMemo(() => pebbleGeometry(), []);
  const litter = useMemo(() => litterGeometry(), []);
  useLayoutEffect(
    () => () => {
      pebble.dispose();
      litter.dispose();
    },
    [pebble, litter],
  );

  const extent = useMemo<Extent>(
    () => ({ width: shell.width, depth: shell.depth }),
    [shell.width, shell.depth],
  );

  const stones = useMemo(
    () =>
      pathScatter(extent, plot, {
        spacing: PATH_SPACING,
        scale: [0.5, 1.6],
        seed: 0x5707e,
      }),
    [extent, plot],
  );

  // A sparser second pass on the same ring, on its own seed, so the leaves are
  // not stones in disguise standing in the same places.
  const leaves = useMemo(
    () =>
      pathScatter(extent, plot, {
        spacing: PATH_SPACING * 2.6,
        scale: [0.7, 1.4],
        seed: 0x1177e,
      }),
    [extent, plot],
  );

  // The floor slab's top face: the box is 0.24 thick and set 0.1 below the
  // datum, so its surface sits this far above it (see Greenhouse).
  const floorTop = FLOOR_Y + 0.02;

  return (
    <>
      <ScatterLayer
        points={stones}
        geometry={pebble}
        color={PEBBLE}
        y={floorTop}
        roughness={0.85}
        castShadow
        doubleSided={false}
      />
      <ScatterLayer points={leaves} geometry={litter} color={LITTER} y={floorTop} />
    </>
  );
}
