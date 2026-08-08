import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlacedPlant } from './types';
import { droopSag, GROUND_Y, smoothActivity, smoothVitality, swayMatrix } from './sway';

/**
 * Produce — fruit and vegetables hanging on the plants that bear them.
 *
 * Drawn as a decoration on a subset of each plant's leaf points rather than from
 * its own geometry: that keeps the pure L-system untouched and makes the amount
 * of produce follow the leaf count for free, so a struggling plant carries less
 * exactly as it sheds leaves. Every fruit rides the same per-plant sway and
 * droop as the leaves, so it never floats off the plant.
 *
 * One InstancedMesh of spheres for the whole garden's produce. Only plants with
 * a `produceTint` contribute, so a garden with no vegetables draws nothing.
 */

/** One fruit for every Nth leaf. Sparser than foliage, so produce reads as a
 *  scatter of heavier objects rather than a second canopy. */
const EVERY = 5;
/** Fruit size relative to the leaf it sits on. */
const FRUIT_SCALE = 2.2;

function bearers(plants: PlacedPlant[]): PlacedPlant[] {
  return plants.filter((p) => p.produceTint !== undefined);
}

/** How many fruit a plant contributes: one per Nth leaf, matching the stride the
 *  render loop walks so the instance buffer is sized exactly. */
function fruitCount(leafCount: number): number {
  return Math.ceil(leafCount / EVERY);
}

export function Produce({ plants }: { plants: PlacedPlant[] }) {
  const mesh = useRef<THREE.InstancedMesh>(null);

  const fruiting = useMemo(() => bearers(plants), [plants]);

  const count = useMemo(
    () => fruiting.reduce((sum, p) => sum + fruitCount(p.geometry.leafCount), 0),
    [fruiting],
  );

  const geometry = useMemo(() => new THREE.IcosahedronGeometry(1, 0), []);
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);

  useLayoutEffect(() => {
    const instanced = mesh.current;
    if (!instanced || count === 0) return;
    const colour = new THREE.Color();
    let i = 0;
    for (const plant of fruiting) {
      colour.set(plant.produceTint!);
      const n = fruitCount(plant.geometry.leafCount);
      for (let f = 0; f < n; f++) instanced.setColorAt(i++, colour);
    }
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
  }, [fruiting, count]);

  const scratch = useMemo(
    () => ({ dummy: new THREE.Object3D(), sway: new THREE.Matrix4() }),
    [],
  );

  useFrame(({ clock }) => {
    const instanced = mesh.current;
    if (!instanced || count === 0) return;
    const { dummy, sway } = scratch;
    const t = clock.elapsedTime;

    let i = 0;
    for (const plant of fruiting) {
      const { geometry: geo, position, node } = plant;
      swayMatrix(sway, node.id, smoothActivity(node.id, node.activity, t), t);
      const vit = smoothVitality(node.id, plant.vitality, t);

      for (let l = 0; l < geo.leafCount; l += EVERY) {
        const l3 = l * 3;
        dummy.position
          .set(geo.leafPosition[l3], geo.leafPosition[l3 + 1], geo.leafPosition[l3 + 2])
          .applyMatrix4(sway);
        dummy.position.y -= droopSag(dummy.position.x, dummy.position.z, vit);
        dummy.position.x += position[0];
        dummy.position.y += position[1];
        dummy.position.z += position[2];
        if (dummy.position.y < GROUND_Y) dummy.position.y = GROUND_Y;

        const scale = geo.leafScale[l] * FRUIT_SCALE;
        dummy.scale.set(scale, scale, scale);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        instanced.setMatrixAt(i++, dummy.matrix);
      }
    }

    instanced.count = i;
    instanced.instanceMatrix.needsUpdate = true;
  });

  if (count === 0) return null;

  return (
    <instancedMesh ref={mesh} args={[geometry, undefined, count]} frustumCulled={false} castShadow>
      <meshStandardMaterial roughness={0.5} flatShading />
    </instancedMesh>
  );
}
