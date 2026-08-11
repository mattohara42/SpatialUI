import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlacedPlant } from './types';
import { droopSag, GROUND_Y, smoothActivity, smoothVitality, swayMatrix } from './sway';
import { grain } from './textures';
import { ripeness } from '../ecosystem/completion';
import type { CompletionOutcome } from '../ecosystem/types';

/**
 * What a plant has finished lately: fruit for the builds that passed, deadwood
 * for the ones that failed.
 *
 * This is the *output* channel — a reading the budget had never spent (see
 * `docs/completion.md`). It is drawn like `Produce`: marks placed on a plant's
 * leaf points, riding the same per-plant sway and droop so they never float off,
 * one InstancedMesh per kind for the whole garden. But where produce is
 * decoration keyed to a planting, this is a *signal* keyed to `node.completions`
 * — and the two never meet, because only gardens whose beds bear no decorative
 * produce carry completions (the "separate by garden" rule, kept in the mock data
 * by construction).
 *
 * Fruit's colour is not a health signal: presence and count carry the reading —
 * "this pipeline finished a lot, lately" — and the hue is just "ripe", a fixed
 * palette with a little grain. Deadwood is a grey-brown brittle spur, local to
 * the plant, deliberately distinct from the whole-plant grey of staleness.
 */

const UP = new THREE.Vector3(0, 1, 0);

const FRUIT_PALETTE = ['#d1542e', '#e07a2c', '#c9432f', '#dd8a2a'];
const FRUIT_GRAIN = 0.12;
/**
 * Fruit radius in metres — a consistent physical size, deliberately *not* scaled
 * off the leaf it sits on. Produce couples to leaf scale because a full canopy's
 * leaves are uniform; a sparse pipeline plant has the odd oversized leaf, and a
 * fruit that inherited it read as a beachball. A build is a build, so it is one
 * size, with only the ripen swell and a little grain to vary it.
 */
const FRUIT_SIZE = 0.11;
/** The fraction a just-set, unripe fruit starts at before it swells to full. */
const FRUIT_MIN = 0.55;

const DEAD_COLOR = '#5f5a52';
/** Deadwood spur size in metres — likewise fixed, a short brittle stub. */
const DEAD_SIZE = 0.11;

/** One mark to draw: a completion placed on a particular leaf point of a plant. */
interface Mark {
  plant: PlacedPlant;
  leaf: number;
  at: number;
}

/**
 * The marks of one outcome across the garden. Each plant spreads its shown
 * completions across its own canopy by index, so fruit and deadwood scatter
 * through the plant rather than clumping at one twig.
 */
function marksOf(plants: PlacedPlant[], outcome: CompletionOutcome): Mark[] {
  const out: Mark[] = [];
  for (const plant of plants) {
    const shown = plant.completions;
    const leafCount = plant.geometry.leafCount;
    if (!shown || shown.length === 0 || leafCount === 0) continue;
    const total = shown.length;
    shown.forEach((completion, k) => {
      if (completion.outcome !== outcome) return;
      const leaf = Math.min(leafCount - 1, Math.floor(((k + 0.5) / total) * leafCount));
      out.push({ plant, leaf, at: completion.at });
    });
  }
  return out;
}

export function Completions({ plants, now }: { plants: PlacedPlant[]; now: number }) {
  const fruit = useMemo(() => marksOf(plants, 'done'), [plants]);
  const dead = useMemo(() => marksOf(plants, 'failed'), [plants]);

  return (
    <>
      <MarkLayer marks={fruit} now={now} kind="fruit" />
      <MarkLayer marks={dead} now={now} kind="dead" />
    </>
  );
}

function MarkLayer({ marks, now, kind }: { marks: Mark[]; now: number; kind: 'fruit' | 'dead' }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const count = marks.length;

  const geometry = useMemo(
    () =>
      kind === 'fruit'
        ? new THREE.IcosahedronGeometry(1, 0)
        : new THREE.ConeGeometry(0.5, 1.7, 4),
    [kind],
  );
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);

  // Colours, and the per-mark size factor (fruit swells as it ripens; deadwood is
  // fixed). Recomputed when the marks or the shown time change, which is once a
  // tick — ripeness moves slowly enough that per-frame updating would be waste.
  const sizes = useRef<Float32Array>(new Float32Array(0));
  useLayoutEffect(() => {
    const instanced = mesh.current;
    if (!instanced || count === 0) return;
    sizes.current = new Float32Array(count);
    const colour = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const { plant, at } = marks[i];
      if (kind === 'fruit') {
        const base = FRUIT_PALETTE[hash(plant.node.id, i) % FRUIT_PALETTE.length];
        colour.set(base).multiplyScalar(grain(plant.node.id, i, FRUIT_GRAIN));
        sizes.current[i] = FRUIT_MIN + (1 - FRUIT_MIN) * ripeness(at, now);
      } else {
        colour.set(DEAD_COLOR).multiplyScalar(grain(plant.node.id, i, 0.08));
        sizes.current[i] = 1;
      }
      instanced.setColorAt(i, colour);
    }
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
  }, [marks, count, kind, now]);

  const scratch = useMemo(
    () => ({ dummy: new THREE.Object3D(), sway: new THREE.Matrix4(), dir: new THREE.Vector3() }),
    [],
  );

  useFrame(({ clock }) => {
    const instanced = mesh.current;
    if (!instanced || count === 0) return;
    const { dummy, sway, dir } = scratch;
    const t = clock.elapsedTime;
    const baseSize = kind === 'fruit' ? FRUIT_SIZE : DEAD_SIZE;

    for (let i = 0; i < count; i++) {
      const { plant, leaf } = marks[i];
      const { geometry: geo, position, node } = plant;
      const motion = plant.stale > 1 ? 0 : 1;
      swayMatrix(sway, node.id, smoothActivity(node.id, node.activity, t), t, motion);
      const vit = smoothVitality(node.id, plant.vitality, t);
      const l3 = leaf * 3;

      dummy.position
        .set(geo.leafPosition[l3], geo.leafPosition[l3 + 1], geo.leafPosition[l3 + 2])
        .applyMatrix4(sway);
      dummy.position.y -= droopSag(dummy.position.x, dummy.position.z, vit);
      dummy.position.x += position[0];
      dummy.position.y += position[1];
      dummy.position.z += position[2];
      if (dummy.position.y < GROUND_Y) dummy.position.y = GROUND_Y;

      if (kind === 'dead') {
        // A dead spur points the way its twig grew, so it reads as broken wood on
        // the plant rather than a shape dropped onto it.
        dir
          .set(geo.leafDirection[l3], geo.leafDirection[l3 + 1], geo.leafDirection[l3 + 2])
          .applyMatrix4(sway)
          .normalize();
        dummy.quaternion.setFromUnitVectors(UP, dir);
      } else {
        dummy.quaternion.identity();
      }

      const scale = baseSize * sizes.current[i];
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      instanced.setMatrixAt(i, dummy.matrix);
    }

    instanced.count = count;
    instanced.instanceMatrix.needsUpdate = true;
  });

  if (count === 0) return null;

  return (
    <instancedMesh ref={mesh} args={[geometry, undefined, count]} frustumCulled={false} castShadow>
      <meshStandardMaterial
        roughness={kind === 'fruit' ? 0.45 : 0.9}
        metalness={0}
        flatShading
      />
    </instancedMesh>
  );
}

/** Stable small hash for the varietal fruit colour, from the plant id and index. */
function hash(id: string, index: number): number {
  let h = 2166136261 ^ index;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
