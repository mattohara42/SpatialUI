import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlacedPlant } from './types';
import { MOTION, droopSag } from './sway';
import {
  SIGNAL_FALL_SPEED,
  SIGNAL_HEADROOM,
  SIGNAL_PER_PLANT,
  SIGNAL_RADIUS,
  SIGNAL_RISE_SPEED,
  cycle,
  plumeCount,
  plumeDirection,
  plumeStrength,
} from './signal';
import { hashString, mulberry32 } from '../lsystem/random';

/**
 * The plume around a plant that is moving — rising and bright where the signal
 * is improving, falling and washed out where it is not.
 *
 * The reasoning for the cue is in `signal.ts`; this file is the mechanism, and
 * it is the dust's (Dust.tsx) with the direction made a parameter. Two Points
 * objects for the whole garden, one per direction, so this is two draw calls at
 * most and, in a garden where nothing is moving, no object at all.
 *
 * The two directions differ in more than their sign, because they are standing
 * for different things:
 *
 *   rising   up, warm amber, bright and large    growth
 *   falling  down, cool slate, dim and small     loss
 *
 * Neither blends additively, which the first version of the rising plume did on
 * the theory that growth is light. Against a bright sky an additive speck adds
 * to what is already there and arrives white, so the one thing the cue was asked
 * for — colour, saying look at me — was the first thing the blend took away. The
 * motes can afford it because they stand for light itself; a plume stands for a
 * direction, and a direction has to keep its colour on whatever it is seen
 * against.
 *
 * Like the dust, the specks do not ride the plant's sway, and for a different
 * reason: the dust is still because its plant is frozen, and a plume is in the
 * air rather than on the plant. The sway is a rigid lean of a body about its
 * base (see sway.ts) and a speck drifting past a branch is not part of that
 * body. What they have instead is a slow curl of their own, which is enough to
 * keep them from running on rails without pretending to be attached.
 */

/**
 * The two colours, and why they are these two.
 *
 * Amber against slate-blue, which is the one pairing that survives every common
 * colour blindness — the deliberate opposite of the red-and-green DESIGN.md has
 * warned about since the first pass. Direction is doing the work anyway; the
 * hues only have to restate it without becoming the thing a colour-blind reader
 * has to squint at.
 *
 * Amber also clears the mote field's pale cream and the dust's warm grey, so a
 * plume is never mistaken for the air being busy or for neglect settling. And
 * the slate is cool where every other falling speck in this garden is warm,
 * which is what separates *this is going down* from *nobody has heard from
 * this*.
 */
const RISE_COLOR = '#ffc23d';
const FALL_COLOR = '#9aa7bd';

/**
 * How far each plume dims at night, matching the dust's rule and for the same
 * reason: a `pointsMaterial` is unlit, so it has to be told to go dark when
 * everything else does, or it becomes the brightest thing in the garden after
 * sunset.
 *
 * The falling one dims further than the rising one. A plume that is climbing
 * should still be findable in a dark house — it is the thing you came back to
 * look for — and one that is sinking has already said what it has to say in the
 * plant's own droop.
 */
const RISE_NIGHT_DIM = 0.3;
const FALL_NIGHT_DIM = 0.6;

/**
 * Speck size in metres, rising and falling.
 *
 * Scaled by the world scale every frame, which is what the table view needs. A
 * `pointsMaterial` sizes its specks in world units and attenuates them with
 * distance, and neither of those notices that the whole garden has been shrunk
 * to a model — so a speck that was a grain beside a two metre tree stayed a
 * grain beside a five centimetre one and buried the miniature under it. The
 * world garden is where that stopped being a detail: 193 plants at table scale
 * disappeared entirely behind their own plumes.
 *
 * Scaling them is the reading the table view is built on. The tabletop plant is
 * the same plant, smaller; so is its plume, and a garden that is moving shows it
 * there as a tint across the beds rather than as specks the size of the beds.
 */
const RISE_SIZE = 0.075;
const FALL_SIZE = 0.068;

/** Scratch vector for the per-frame world-scale read, so the frame loop
 *  allocates nothing. */
const scratch = new THREE.Vector3();

interface Column {
  /** Where this plant's specks sit, in the garden group's space. */
  x: number;
  z: number;
  base: number;
  radius: number;
  /** The canopy standing upright, and how far it reaches sideways — the two
   *  numbers `topOf` needs to put the ceiling where the leaves currently are. */
  height: number;
  reach: number;
}

interface Field {
  /** Plant ids in buffer order, so a rebuild can be detected cheaply. */
  key: string;
  columns: Column[];
  positions: Float32Array;
  geometry: THREE.BufferGeometry;
  /** Per-speck state, plant-major: plant p owns [p*PER, p*PER + PER). */
  height: Float32Array;
  angle: Float32Array;
  spread: Float32Array;
  phase: Float32Array;
  speed: Float32Array;
}

/**
 * A plant's plume column, from the geometry it already carries.
 *
 * Proportional rather than capped, which is the opposite of the dust: dust
 * settles low whatever it is settling on, and a plume has to travel the height
 * of the plant to read as leaving it. The headroom carries the rising specks
 * clear of the canopy, where they are against the sky rather than lost in
 * leaves.
 *
 * The droop has to be taken off first. Geometry is generated standing upright
 * and the wilt is applied by the renderer (see `droopSag`), so a struggling
 * plant's bounding box describes a plant that is not there: its canopy is a
 * metre lower than the box says. Read the box straight and the plume of a
 * sinking plant hangs in clear air above it, attached to nothing — which is the
 * one thing a per-plant cue cannot do. The sag at the canopy's own reach is the
 * same number the foliage is displaced by, so the column lands where the leaves
 * actually are.
 */
function columnOf(plant: PlacedPlant): Column {
  const { bounds } = plant.geometry;
  const reach = Math.max(
    Math.abs(bounds.min[0]),
    Math.abs(bounds.max[0]),
    Math.abs(bounds.min[2]),
    Math.abs(bounds.max[2]),
    0.15,
  );
  return {
    x: plant.position[0],
    z: plant.position[2],
    base: plant.position[1] + 0.02,
    radius: Math.min(reach, SIGNAL_RADIUS),
    height: Math.max(bounds.max[1], 0.3),
    reach,
  };
}

/**
 * The top of a plant's column, for the vitality it is showing this frame.
 *
 * Recomputed per frame rather than baked into the column, because the buffer is
 * rebuilt only when the *set* of plumed plants changes: a plant that wilts while
 * its trend holds steady never triggers a rebuild, and a ceiling frozen at the
 * vitality it had when the plume started would slowly part company with the
 * canopy it belongs to. Allocation-free, so it costs a few multiplications per
 * plant per frame and nothing for the collector to do.
 */
function topOf(column: Column, vitality: number): number {
  const sag = droopSag(column.reach, 0, vitality);
  return column.base + Math.max(column.height - sag, 0.3) + SIGNAL_HEADROOM;
}

function buildField(plants: PlacedPlant[], key: string, rising: boolean): Field {
  const capacity = plants.length * SIGNAL_PER_PLANT;
  const positions = new Float32Array(capacity * 3);
  const height = new Float32Array(capacity);
  const angle = new Float32Array(capacity);
  const spread = new Float32Array(capacity);
  const phase = new Float32Array(capacity);
  const speed = new Float32Array(capacity);

  const columns = plants.map(columnOf);
  const base = rising ? SIGNAL_RISE_SPEED : SIGNAL_FALL_SPEED;
  plants.forEach((plant, p) => {
    // Seeded per node, so a plant's plume is the same plume every time it starts
    // moving rather than a fresh scatter on every rebuild.
    const rng = mulberry32(hashString(`${plant.node.id}:plume`));
    const column = columns[p];
    const top = topOf(column, plant.vitality);
    for (let k = 0; k < SIGNAL_PER_PLANT; k++) {
      const i = p * SIGNAL_PER_PLANT + k;
      height[i] = column.base + rng() * (top - column.base);
      angle[i] = rng() * Math.PI * 2;
      // Square root, so specks spread evenly over the disc instead of bunching
      // around the trunk.
      spread[i] = Math.sqrt(rng()) * column.radius;
      phase[i] = rng() * Math.PI * 2;
      speed[i] = base * (0.6 + rng() * 0.8);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setDrawRange(0, 0);

  return { key, columns, positions, geometry, height, angle, spread, phase, speed };
}

/**
 * One direction's worth of plume. Mounted twice by `Signal` below.
 *
 * The buffer is keyed on the id list so it is rebuilt only when the set of
 * plants in this direction changes — a plant crossing the deadband, or flipping
 * sign — and not on every telemetry tick, which would restart every speck
 * mid-flight.
 */
function Plume({
  plants,
  rising,
  night,
}: {
  plants: PlacedPlant[];
  rising: boolean;
  night: number;
}) {
  const points = useRef<THREE.Points>(null);
  const key = useMemo(() => plants.map((p) => p.node.id).join('|'), [plants]);
  const field = useMemo(
    () => (key ? buildField(plants, key, rising) : null),
    [key, rising],
  );
  useLayoutEffect(() => {
    return () => {
      field?.geometry.dispose();
    };
  }, [field]);

  const colour = useMemo(
    () =>
      rising
        ? new THREE.Color(RISE_COLOR).multiplyScalar(1 - RISE_NIGHT_DIM * night)
        : new THREE.Color(FALL_COLOR).multiplyScalar(1 - FALL_NIGHT_DIM * night),
    [rising, night],
  );

  // The frame loop needs live strength (the density ramp moves with it) while
  // the buffer is keyed on the id list. Both come from the same array, so they
  // stay in step by construction.
  const live = useRef(plants);
  live.current = plants;

  useFrame(({ clock }, delta) => {
    if (!field) return;
    const t = clock.elapsedTime;
    const list = live.current;
    const { positions, columns, height, angle, spread, phase, speed } = field;
    const sign = rising ? 1 : -1;

    let n = 0;
    for (let p = 0; p < list.length; p++) {
      const column = columns[p];
      const strength = plumeStrength(list[p].signal);
      const active = plumeCount(list[p].signal);
      // A stronger signal moves faster as well as thicker, so a plant on a run
      // is visibly urgent and one barely over the line merely drifts.
      const rate = 0.65 + strength * 0.7;
      const top = topOf(column, list[p].vitality);
      for (let k = 0; k < active; k++) {
        const i = p * SIGNAL_PER_PLANT + k;
        height[i] = cycle(
          height[i],
          column.base,
          top,
          sign * speed[i] * rate * delta * MOTION,
        );
        // A slow turn about the trunk, so specks curl as they travel instead of
        // running on rails. Far slower than the sway it must not imitate.
        const a = angle[i] + Math.sin(t * 0.18 + phase[i]) * 0.3;
        positions[n * 3] = column.x + Math.cos(a) * spread[i];
        positions[n * 3 + 1] = height[i];
        positions[n * 3 + 2] = column.z + Math.sin(a) * spread[i];
        n++;
      }
    }

    field.geometry.setDrawRange(0, n);
    field.geometry.attributes.position.needsUpdate = true;

    // Specks shrink with the garden. See RISE_SIZE.
    const object = points.current;
    if (object) {
      const material = object.material as THREE.PointsMaterial;
      material.size = (rising ? RISE_SIZE : FALL_SIZE) * object.getWorldScale(scratch).x;
    }
  });

  if (!field) return null;

  return (
    <points ref={points} geometry={field.geometry} frustumCulled={false}>
      <pointsMaterial
        color={colour}
        size={rising ? RISE_SIZE : FALL_SIZE}
        transparent
        opacity={rising ? 0.95 : 0.8}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

/**
 * Both plumes over a garden.
 *
 * The split is done once here rather than inside each direction, so a plant is
 * in exactly one list and can never be drawn rising and falling at the same
 * time. Stale plants are dropped before the split: an old number has no
 * direction (see signal.ts).
 */
export function Signal({ plants, night }: { plants: PlacedPlant[]; night: number }) {
  const { rising, falling } = useMemo(() => {
    const up: PlacedPlant[] = [];
    const down: PlacedPlant[] = [];
    for (const plant of plants) {
      if (plant.stale > 1) continue;
      const direction = plumeDirection(plant.signal);
      if (direction > 0) up.push(plant);
      else if (direction < 0) down.push(plant);
    }
    return { rising: up, falling: down };
  }, [plants]);

  return (
    <>
      <Plume plants={rising} rising night={night} />
      <Plume plants={falling} rising={false} night={night} />
    </>
  );
}
