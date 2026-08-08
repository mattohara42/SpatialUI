import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlacedPlant } from './types';
import { droopSag, GROUND_Y, smoothActivity, smoothVitality, swayMatrix } from './sway';
import { grain } from './textures';

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
/**
 * How produce is drawn, per bearer. A vegetable carries a few large fruit; a
 * vine hangs many small berries, so a grape reads as a bunch rather than a
 * single big sphere. `every` is the leaf stride between fruit and `scale` is
 * their size relative to the leaf they sit on.
 */
interface ProduceStyle {
  every: number;
  scale: number;
}
/** How far one fruit may stray from its plant's produce colour. Enough that a
 *  bunch of grapes reads as individual berries rather than as a single moulded
 *  object; not enough to look like some of them are ripe and some are not,
 *  which would be colour carrying a signal it must not carry. */
const PRODUCE_GRAIN = 0.12;

const VEGETABLE_STYLE: ProduceStyle = { every: 5, scale: 2.2 };
const GRAPE_STYLE: ProduceStyle = { every: 2, scale: 1.05 };

function styleFor(plant: PlacedPlant): ProduceStyle {
  return plant.grape ? GRAPE_STYLE : VEGETABLE_STYLE;
}

function bearers(plants: PlacedPlant[]): PlacedPlant[] {
  return plants.filter((p) => p.produceTint !== undefined);
}

/** How many fruit a plant contributes: one per Nth leaf, matching the stride the
 *  render loop walks so the instance buffer is sized exactly. */
function fruitCount(plant: PlacedPlant): number {
  return Math.ceil(plant.geometry.leafCount / styleFor(plant).every);
}

export function Produce({ plants }: { plants: PlacedPlant[] }) {
  const mesh = useRef<THREE.InstancedMesh>(null);

  const fruiting = useMemo(() => bearers(plants), [plants]);

  const count = useMemo(
    () => fruiting.reduce((sum, p) => sum + fruitCount(p), 0),
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
      const n = fruitCount(plant);
      for (let f = 0; f < n; f++) {
        colour.set(plant.produceTint!).multiplyScalar(
          grain(plant.node.id, f, PRODUCE_GRAIN),
        );
        instanced.setColorAt(i++, colour);
      }
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
      const motion = plant.stale > 1 ? 0 : 1;
      swayMatrix(sway, node.id, smoothActivity(node.id, node.activity, t), t, motion);
      const vit = smoothVitality(node.id, plant.vitality, t);
      const style = styleFor(plant);

      for (let l = 0; l < geo.leafCount; l += style.every) {
        const l3 = l * 3;
        dummy.position
          .set(geo.leafPosition[l3], geo.leafPosition[l3 + 1], geo.leafPosition[l3 + 2])
          .applyMatrix4(sway);
        dummy.position.y -= droopSag(dummy.position.x, dummy.position.z, vit);
        dummy.position.x += position[0];
        dummy.position.y += position[1];
        dummy.position.z += position[2];
        if (dummy.position.y < GROUND_Y) dummy.position.y = GROUND_Y;

        const scale = geo.leafScale[l] * style.scale;
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
