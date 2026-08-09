import { useLayoutEffect, useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import { FLOOR_Y, type Shell } from './greenhouse';
import { gravelPixels, liftForTexture, surfaceTexture } from './textures';

/**
 * The glasshouse: a dwarf wall, a frame, and the light coming through it.
 *
 * Static, signal-free, and owning no colour logic — the same three rules the
 * horizon keeps (DESIGN.md). The shared rig lights it and the shared fog fades
 * it, so it tracks the day and season scrub for nothing.
 *
 * Three decisions are load-bearing, and all three are about keeping the light
 * soft rather than about the building:
 *
 * **The glass casts no shadow.** It could — a grid of glazing bars throws a
 * beautiful lattice across a bed — and it must not. The shadow map is 2048 over
 * twenty-four metres, so an eight centimetre bar is three or four texels and
 * would shimmer as the sun moved; worse, a hard lattice over the beds would
 * compete with the plants' own shadows, which are a reading, for the attention
 * of somebody glancing at this from three metres away. A greenhouse's actual job
 * here is to *diffuse*, and diffused light is what it delivers.
 *
 * **The panes do not write depth.** They are drawn after everything opaque and
 * blended over it, so a plant behind glass is never sorted away, and neither is
 * the sky, the sun, the moon, or the invisible sixteen-metre grab handles those
 * two carry. That last one is not a detail: scrubbing time *is* grabbing the sun,
 * and a roof that swallowed the pointer would have cost the whole gesture.
 *
 * **Everything is one box and one plane.** Every frame member is the same unit
 * cube scaled, every pane the same unit quad, so the entire shell is two
 * geometries and three materials however many bays it has. A house for the
 * league — twenty-four metres of it — costs about as much as the trellis.
 */

/** Painted timber, the pale bone white of an old glasshouse in the sun. */
const FRAME = '#e6e0d1';
/** The dwarf wall, and the grit floor inside it. Warm and pale rather than
 *  grey: a cool stone at this size reads as poured concrete, and a concrete
 *  base under a glasshouse is a loading bay. */
const STONE = '#b3a894';
const GRIT = '#9a938a';

/** Section sizes, in metres: glazing bar, rafter, and the heavier members. */
const BAR = 0.08;
const RAFTER: [number, number] = [0.09, 0.12];
const PLATE = 0.13;
const RIDGE_BEAM = 0.15;

/** Thickness of the dwarf wall, and how far the floor runs past it. */
const PLINTH = 0.24;
const APRON = 0.5;

/** Metres of floor per grit tile. Small, because gravel is small. */
const GRIT_TILE = 1.4;

/** The roof vent, propped open near the ridge: its size, how far it lifts, and
 *  where along the ridge it sits as a fraction of the house's length. */
const VENT: [number, number] = [1.5, 0.95];
const VENT_OPEN = 0.34;
const VENT_AT = 0.22;

/** How far the door stands open, in radians. Enough to read as ajar. */
const DOOR_SWING = 0.55;

export function Greenhouse({ shell }: { shell: Shell }) {
  const { width: w, depth: d, knee, eaves, ridge, rise, rake, pitch, bays, ribs, door } =
    shell;
  const hw = w / 2;
  const hd = d / 2;

  // One cube and one quad for the whole building. Scale does the rest.
  const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const quad = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const gable = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-hd, 0);
    shape.lineTo(hd, 0);
    shape.lineTo(0, rise);
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, [hd, rise]);

  const grit = useMemo(
    () =>
      surfaceTexture(gravelPixels(), [
        Math.max(1, Math.round(w / GRIT_TILE)),
        Math.max(1, Math.round(d / GRIT_TILE)),
      ]),
    [w, d],
  );

  const frame = useMemo(
    () => new THREE.MeshStandardMaterial({ color: FRAME, roughness: 0.75 }),
    [],
  );
  const stone = useMemo(
    () => new THREE.MeshStandardMaterial({ color: STONE, roughness: 1 }),
    [],
  );
  const glass = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        // A wash rather than a surface. Most of what says "glass" here is the
        // frame and the specular catch on it; the pane itself only has to veil
        // what is behind it slightly and hold a highlight when the sun is low.
        color: '#e8f3f7',
        transparent: true,
        opacity: 0.15,
        roughness: 0.06,
        metalness: 0.05,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [],
  );

  useLayoutEffect(
    () => () => {
      box.dispose();
      quad.dispose();
      gable.dispose();
      grit.dispose();
      frame.dispose();
      stone.dispose();
      glass.dispose();
    },
    [box, quad, gable, grit, frame, stone, glass],
  );

  /** A frame member: the unit cube, scaled and placed. */
  const bar = (
    key: string,
    position: [number, number, number],
    scale: [number, number, number],
    rotation?: [number, number, number],
  ): ReactNode => (
    <mesh
      key={key}
      geometry={box}
      material={frame}
      position={position}
      scale={scale}
      rotation={rotation}
    />
  );

  /** A course of the dwarf wall. Same cube, the other material, and it does
   *  catch shadow, because the wall is the one part of the shell at plant
   *  height that a bed's own shadow should land on. */
  const wall = (
    key: string,
    position: [number, number, number],
    scale: [number, number, number],
  ): ReactNode => (
    <mesh
      key={key}
      geometry={box}
      material={stone}
      position={position}
      scale={scale}
      receiveShadow
    />
  );

  /** A pane: the unit quad, scaled and placed. */
  const pane = (
    key: string,
    position: [number, number, number],
    scale: [number, number],
    rotation: [number, number, number] = [0, 0, 0],
  ): ReactNode => (
    <mesh
      key={key}
      geometry={quad}
      material={glass}
      position={position}
      scale={[scale[0], scale[1], 1]}
      rotation={rotation}
    />
  );

  const wallHeight = knee + 0.1;
  const wallY = (knee - 0.1) / 2;
  const sillY = knee + 0.05;
  // The doorway breaks the dwarf wall and its sill on one gable end, so the two
  // sides of it are drawn as flanking runs rather than one wall with a hole.
  const jamb = door.width / 2;
  const flank = hd + PLINTH - jamb;
  const flanks: [number, number][] = [
    [-(jamb + flank / 2), flank],
    [jamb + flank / 2, flank],
  ];

  return (
    // Everything in here is measured up from the floor, which is where a
    // building's own dimensions are measured from. The group is what puts that
    // datum where the soil's bed depth says it goes.
    <group position={[0, FLOOR_Y, 0]}>
      {/* Grit floor, sitting a little proud of the outside ground so the beds
          bed into it. It receives shadow: the beds and the plants standing on
          them are what the floor is there to catch. */}
      <mesh position={[0, -0.1, 0]} receiveShadow>
        <boxGeometry args={[w + APRON * 2, 0.24, d + APRON * 2]} />
        <meshStandardMaterial map={grit} color={liftForTexture(GRIT)} roughness={1} />
      </mesh>

      {/* Dwarf wall. Glass to the ground would put a bright seam at the foot of
          every bed; a low stone course is what real houses do and it also hides
          where the interior floor meets the field outside. */}
      {wall('plinth-z-', [0, wallY, -hd], [w + PLINTH * 2, wallHeight, PLINTH])}
      {wall('plinth-z+', [0, wallY, hd], [w + PLINTH * 2, wallHeight, PLINTH])}
      {wall('plinth-x-', [-hw, wallY, 0], [PLINTH, wallHeight, d + PLINTH * 2])}
      {flanks.map(([at, length]) =>
        wall(`plinth-x+${at}`, [hw, wallY, at], [PLINTH, wallHeight, length]),
      )}

      {/* Sill: the timber the glazing stands on, capping the wall. */}
      {bar('sill-z-', [0, sillY, -hd], [w + PLINTH * 2 + 0.1, 0.1, PLINTH + 0.06])}
      {bar('sill-z+', [0, sillY, hd], [w + PLINTH * 2 + 0.1, 0.1, PLINTH + 0.06])}
      {bar('sill-x-', [-hw, sillY, 0], [PLINTH + 0.06, 0.1, d + PLINTH * 2 + 0.1])}
      {flanks.map(([at, length]) =>
        bar(`sill-x+${at}`, [hw, sillY, at], [PLINTH + 0.06, 0.1, length]),
      )}

      {/* Glazing bars up the long walls, one per bay, and the same rhythm
          carried over the roof as rafters. */}
      {bays.map((x) => (
        <group key={`bay${x}`}>
          {bar(`m-z-${x}`, [x, (knee + eaves) / 2, -hd], [BAR, eaves - knee, BAR])}
          {bar(`m-z+${x}`, [x, (knee + eaves) / 2, hd], [BAR, eaves - knee, BAR])}
          {bar(
            `r-z-${x}`,
            [x, eaves + rise / 2, -d / 4],
            [RAFTER[0], RAFTER[1], rake],
            [-pitch, 0, 0],
          )}
          {bar(
            `r-z+${x}`,
            [x, eaves + rise / 2, d / 4],
            [RAFTER[0], RAFTER[1], rake],
            [pitch, 0, 0],
          )}
        </group>
      ))}

      {/* Glazing bars across the gable ends, skipping the doorway. */}
      {ribs.map((z) => (
        <group key={`rib${z}`}>
          {bar(`m-x-${z}`, [-hw, (knee + eaves) / 2, z], [BAR, eaves - knee, BAR])}
          {Math.abs(z) > jamb + 0.1 &&
            bar(`m-x+${z}`, [hw, (knee + eaves) / 2, z], [BAR, eaves - knee, BAR])}
        </group>
      ))}

      {/* Eaves plates, ridge beam, and the two gable rakes that close the ends. */}
      {bar('eave-z-', [0, eaves, -hd], [w + 0.4, PLATE, 0.2])}
      {bar('eave-z+', [0, eaves, hd], [w + 0.4, PLATE, 0.2])}
      {bar('eave-x-', [-hw, eaves, 0], [0.2, PLATE, d])}
      {bar('eave-x+', [hw, eaves, 0], [0.2, PLATE, d])}
      {bar('ridge', [0, ridge + 0.04, 0], [w + 0.4, RIDGE_BEAM, RIDGE_BEAM])}
      {[-hw, hw].map((x) =>
        [-1, 1].map((side) =>
          bar(
            `rake${x},${side}`,
            [x, eaves + rise / 2, (side * d) / 4],
            [0.1, 0.12, rake],
            [side * pitch, 0, 0],
          ),
        ),
      )}

      {/* Glazing. Long walls, then the ends: one whole wall at the blind end,
          and two flanking lights plus a transom at the door. */}
      {pane('glass-z-', [0, (knee + eaves) / 2, -hd], [w, eaves - knee])}
      {pane('glass-z+', [0, (knee + eaves) / 2, hd], [w, eaves - knee])}
      {pane('glass-x-', [-hw, (knee + eaves) / 2, 0], [d, eaves - knee], [0, Math.PI / 2, 0])}
      {[-1, 1].map((side) =>
        pane(
          `glass-x+${side}`,
          [hw, (knee + eaves) / 2, (side * (jamb + hd)) / 2],
          [hd - jamb, eaves - knee],
          [0, Math.PI / 2, 0],
        ),
      )}
      {pane(
        'transom',
        [hw, (door.height + eaves) / 2, 0],
        [door.width, eaves - door.height],
        [0, Math.PI / 2, 0],
      )}

      {/* The gable triangles, cut to the roof's own pitch. */}
      {[-hw, hw].map((x) => (
        <mesh
          key={`gable${x}`}
          geometry={gable}
          material={glass}
          position={[x, eaves, 0]}
          rotation={[0, Math.PI / 2, 0]}
        />
      ))}

      {/* Roof. Two slopes, each a single sheet under the rafters. */}
      {pane('roof-z-', [0, eaves + rise / 2, -d / 4], [w, rake], [
        Math.PI / 2 - pitch,
        0,
        0,
      ])}
      {pane('roof-z+', [0, eaves + rise / 2, d / 4], [w, rake], [
        -(Math.PI / 2 - pitch),
        0,
        0,
      ])}

      {/* A roof vent, hinged at the ridge and propped open. It is here for one
          reason: a sealed glass box is an aquarium, and one thing standing open
          says the air moves through this and somebody opened it this morning. */}
      <group
        position={[-hw + w * VENT_AT, ridge, 0]}
        rotation={[Math.PI / 2 - pitch + VENT_OPEN, 0, 0]}
      >
        {pane('vent', [0, -VENT[1] / 2, 0], VENT)}
        {bar('vent-head', [0, -0.03, 0], [VENT[0], 0.06, 0.05])}
        {bar('vent-foot', [0, -VENT[1], 0], [VENT[0], 0.06, 0.05])}
        {bar('vent-stay', [VENT[0] * 0.3, -VENT[1] + 0.06, -0.16], [0.03, 0.03, 0.32])}
      </group>

      {/* The door, standing open. Hinged on the near jamb and swung outward. */}
      {bar('jamb-', [hw, door.height / 2, -jamb], [0.12, door.height, 0.11])}
      {bar('jamb+', [hw, door.height / 2, jamb], [0.12, door.height, 0.11])}
      {bar('door-head', [hw, door.height + 0.06, 0], [0.12, 0.12, door.width + 0.22])}
      <group position={[hw, 0, -jamb]} rotation={[0, DOOR_SWING, 0]}>
        {bar('leaf-a', [0, door.height / 2, 0.05], [0.06, door.height, 0.1])}
        {bar('leaf-b', [0, door.height / 2, door.width - 0.05], [0.06, door.height, 0.1])}
        {bar('leaf-foot', [0, 0.13, door.width / 2], [0.05, 0.26, door.width])}
        {bar('leaf-head', [0, door.height - 0.07, door.width / 2], [0.05, 0.14, door.width])}
        {pane(
          'leaf-glass',
          [0, (0.26 + door.height - 0.14) / 2, door.width / 2],
          [door.width - 0.12, door.height - 0.4],
          [0, Math.PI / 2, 0],
        )}
      </group>
    </group>
  );
}
