import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlacedPlant } from './types';
import { MOTION } from './sway';
import {
  DUST_CEILING,
  DUST_FALL_SPEED,
  DUST_PER_PLANT,
  DUST_RADIUS,
  dustCount,
  settle,
} from './dust';
import { hashString, mulberry32 } from '../lsystem/random';

/**
 * The dust hanging around a stale plant.
 *
 * One Points object for every stale plant in the garden, so this is a single
 * draw call and, in the ordinary case where nothing is stale, no object at all.
 * The reasoning for the cue itself is in `dust.ts`; this file is the mechanism.
 *
 * Two things it deliberately does not do. It does not sway: the plant it hangs
 * on is frozen, and dust drifting on a breeze that is not moving the leaves
 * would undo the stillness the staleness state depends on. And it does not
 * blend additively — the mote field does that, because activity is light, and
 * dust that glowed would read as the very thing it is meant to contradict.
 *
 * A speck's fall is the only motion on a stale plant, which is the point of it:
 * the plant has stopped, and what is left moving is the plant coming apart.
 */

/** Grey-beige, close enough to the stale tint that dust reads as coming off the
 *  plant rather than as a separate object hanging near it. */
const DUST_COLOR = '#b3ac9e';

/**
 * How far the dust dims at night.
 *
 * A `pointsMaterial` is unlit, so its colour is whatever it was told regardless
 * of the hour — which is fine for the motes, because they are additive and stand
 * for light, but wrong for dust, which is matter and has to go dark when
 * everything else does. Left at full brightness it became the brightest thing in
 * the garden after sunset, which is the opposite of the reading: a neglected
 * plant should be harder to see at night, not easier.
 */
const NIGHT_DIM = 0.65;

interface Column {
  /** Where the specks for one plant sit, in the garden group's space. */
  x: number;
  z: number;
  base: number;
  top: number;
  radius: number;
}

interface Field {
  /** Plant ids in buffer order, so a rebuild can be detected cheaply. */
  key: string;
  columns: Column[];
  positions: Float32Array;
  geometry: THREE.BufferGeometry;
  /** Per-speck state, indexed plant-major: plant p owns [p*PER, p*PER + PER). */
  height: Float32Array;
  angle: Float32Array;
  spread: Float32Array;
  phase: Float32Array;
  speed: Float32Array;
}

/** A plant's dust column, from the geometry it already carries. The bounds are
 *  in metres (geometry is scaled before it reaches the scene), so no unit
 *  conversion is needed and a tall plant gets a tall column for free. */
function columnOf(plant: PlacedPlant): Column {
  const { bounds } = plant.geometry;
  const reach = Math.max(
    Math.abs(bounds.min[0]),
    Math.abs(bounds.max[0]),
    Math.abs(bounds.min[2]),
    Math.abs(bounds.max[2]),
    0.15,
  );
  // Capped, not proportional: a tall tree gets the same low column of dust a
  // hedge does, because dust settles rather than filling the canopy. See
  // DUST_CEILING.
  const height = Math.min(Math.max(bounds.max[1], 0.3), DUST_CEILING);
  return {
    x: plant.position[0],
    z: plant.position[2],
    base: plant.position[1] + 0.02,
    top: plant.position[1] + height,
    radius: Math.min(reach, DUST_RADIUS),
  };
}

function buildField(stale: PlacedPlant[], key: string): Field {
  const capacity = stale.length * DUST_PER_PLANT;
  const positions = new Float32Array(capacity * 3);
  const height = new Float32Array(capacity);
  const angle = new Float32Array(capacity);
  const spread = new Float32Array(capacity);
  const phase = new Float32Array(capacity);
  const speed = new Float32Array(capacity);

  const columns = stale.map(columnOf);
  stale.forEach((plant, p) => {
    // Seeded per node, so a plant's dust is the same dust every time it goes
    // quiet rather than a fresh scatter on every rebuild.
    const rng = mulberry32(hashString(`${plant.node.id}:dust`));
    const column = columns[p];
    for (let k = 0; k < DUST_PER_PLANT; k++) {
      const i = p * DUST_PER_PLANT + k;
      height[i] = column.base + rng() * (column.top - column.base);
      angle[i] = rng() * Math.PI * 2;
      // Square root, so specks spread evenly over the disc instead of bunching
      // around the trunk.
      spread[i] = Math.sqrt(rng()) * column.radius;
      phase[i] = rng() * Math.PI * 2;
      speed[i] = DUST_FALL_SPEED * (0.6 + rng() * 0.8);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setDrawRange(0, 0);

  return { key, columns, positions, geometry, height, angle, spread, phase, speed };
}

export function Dust({ plants, night }: { plants: PlacedPlant[]; night: number }) {
  const stale = useMemo(() => plants.filter((p) => p.stale > 1), [plants]);

  // Rebuild only when the set of stale plants changes, not on every telemetry
  // tick: `plants` is a fresh array every time anything in the garden moves, and
  // reallocating the buffer would restart every speck's fall mid-air.
  const key = useMemo(() => stale.map((p) => p.node.id).join('|'), [stale]);
  const field = useMemo(() => (key ? buildField(stale, key) : null), [key]);
  useLayoutEffect(() => {
    return () => {
      field?.geometry.dispose();
    };
  }, [field]);

  const colour = useMemo(
    () => new THREE.Color(DUST_COLOR).multiplyScalar(1 - NIGHT_DIM * night),
    [night],
  );

  // The frame loop needs live staleness (the density ramp moves with it) while
  // the buffer is keyed on the id list. Both come from the same array, so they
  // stay in step by construction.
  const live = useRef(stale);
  live.current = stale;

  useFrame(({ clock }, delta) => {
    if (!field) return;
    const t = clock.elapsedTime;
    const list = live.current;
    const { positions, columns, height, angle, spread, phase, speed } = field;

    let n = 0;
    for (let p = 0; p < list.length; p++) {
      const column = columns[p];
      const active = dustCount(list[p].stale);
      for (let k = 0; k < active; k++) {
        const i = p * DUST_PER_PLANT + k;
        height[i] = settle(
          height[i],
          column.base,
          column.top,
          speed[i] * delta * MOTION,
        );
        // A slow turn about the trunk, so specks drift as they fall instead of
        // dropping on rails. Far slower than the sway it must not imitate.
        const a = angle[i] + Math.sin(t * 0.12 + phase[i]) * 0.25;
        positions[n * 3] = column.x + Math.cos(a) * spread[i];
        positions[n * 3 + 1] = height[i];
        positions[n * 3 + 2] = column.z + Math.sin(a) * spread[i];
        n++;
      }
    }

    field.geometry.setDrawRange(0, n);
    field.geometry.attributes.position.needsUpdate = true;
  });

  if (!field) return null;

  return (
    <points geometry={field.geometry} frustumCulled={false}>
      <pointsMaterial
        color={colour}
        size={0.042}
        transparent
        opacity={0.55}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}
