import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlacedPlant } from './types';
import { droopSag, GROUND_Y, smoothActivity, smoothVitality, swayMatrix } from './sway';
import type { LeafKind } from '../lsystem/presets';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * How each leaf kind is drawn: a base geometry and a scale aspect applied to the
 * generator's per-leaf scale. The aspect is [across, along, thickness] where
 * "along" runs down the branch heading, since the instance is oriented by
 * mapping local +Y onto the leaf direction. This is the whole leaf-shape
 * vocabulary in one table.
 *
 *   broad   flat wide blade, the default hardwood leaf
 *   blade   long narrow leaf, for the willow's drooping whips
 *   needle  thin and long, a conifer needle drawn as a spike
 *   round   compact and full, dense small leaves on a weed
 */
interface LeafShape {
  geometry: () => THREE.BufferGeometry;
  aspect: [number, number, number];
  roughness: number;
}

const SHAPES: Record<LeafKind, LeafShape> = {
  broad: { geometry: () => new THREE.OctahedronGeometry(1, 0), aspect: [1.0, 0.4, 0.85], roughness: 0.7 },
  blade: { geometry: () => new THREE.OctahedronGeometry(1, 0), aspect: [0.45, 1.25, 0.2], roughness: 0.65 },
  needle: { geometry: () => new THREE.ConeGeometry(1, 1, 5), aspect: [0.16, 1.35, 0.16], roughness: 0.6 },
  round: { geometry: () => new THREE.IcosahedronGeometry(1, 0), aspect: [0.85, 0.8, 0.85], roughness: 0.8 },
  // A petal: rounded and slightly cupped, brighter than a leaf. A cluster of
  // these fanned around a stem tip reads as a flower head.
  bloom: { geometry: () => new THREE.IcosahedronGeometry(1, 0), aspect: [1.0, 0.55, 1.0], roughness: 0.45 },
};

/**
 * Every leaf in the garden, one InstancedMesh per leaf shape.
 *
 * Leaves sway with the same per-plant matrix the branches use, so a leaf never
 * drifts off the twig that spawned it. Leaf count already carries health: the
 * generator drops foliage in proportion to vitality rather than shrinking it, so
 * a sick plant is cheaper to draw as well as visibly thinner.
 *
 * Splitting by kind keeps the one-draw-call-per-mesh property while letting a
 * conifer wear needles and a hardwood wear broad leaves: an InstancedMesh has a
 * single geometry, so distinct shapes have to be distinct meshes. A garden uses
 * at most four, so this is four draw calls, not one per plant.
 */
export function Foliage({ plants }: { plants: PlacedPlant[] }) {
  const groups = useMemo(() => {
    const byKind = new Map<LeafKind, PlacedPlant[]>();
    for (const plant of plants) {
      const list = byKind.get(plant.leafKind);
      if (list) list.push(plant);
      else byKind.set(plant.leafKind, [plant]);
    }
    return byKind;
  }, [plants]);

  return (
    <>
      {[...groups].map(([kind, kindPlants]) => (
        <LeafLayer key={kind} kind={kind} plants={kindPlants} />
      ))}
    </>
  );
}

function LeafLayer({ kind, plants }: { kind: LeafKind; plants: PlacedPlant[] }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const shape = SHAPES[kind];

  const count = useMemo(
    () => plants.reduce((sum, p) => sum + p.geometry.leafCount, 0),
    [plants],
  );

  const geometry = useMemo(() => shape.geometry(), [shape]);
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);

  useLayoutEffect(() => {
    const instanced = mesh.current;
    if (!instanced || count === 0) return;
    const colour = new THREE.Color();
    let i = 0;
    for (const plant of plants) {
      // Petals wear the plant's varietal bloom colour, which is decorative and
      // seeded, not the health tint; a flower's health reads through how many
      // petals it still carries, never through their hue.
      colour.set(kind === 'bloom' ? plant.bloomTint : plant.tint.foliage);
      for (let l = 0; l < plant.geometry.leafCount; l++) {
        instanced.setColorAt(i++, colour);
      }
    }
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
  }, [plants, count, kind]);

  const scratch = useMemo(
    () => ({
      dummy: new THREE.Object3D(),
      sway: new THREE.Matrix4(),
      direction: new THREE.Vector3(),
    }),
    [],
  );

  useFrame(({ clock }) => {
    const instanced = mesh.current;
    if (!instanced || count === 0) return;
    const { dummy, sway, direction } = scratch;
    const t = clock.elapsedTime;
    const [ax, ay, az] = shape.aspect;

    let i = 0;
    for (const plant of plants) {
      const { geometry: geo, position, node } = plant;
      swayMatrix(sway, node.id, smoothActivity(node.id, node.activity, t), t);
      const vit = smoothVitality(node.id, plant.vitality, t);

      for (let l = 0; l < geo.leafCount; l++) {
        const l3 = l * 3;
        dummy.position
          .set(
            geo.leafPosition[l3],
            geo.leafPosition[l3 + 1],
            geo.leafPosition[l3 + 2],
          )
          .applyMatrix4(sway);
        dummy.position.y -= droopSag(dummy.position.x, dummy.position.z, vit);
        dummy.position.x += position[0];
        dummy.position.y += position[1];
        dummy.position.z += position[2];
        if (dummy.position.y < GROUND_Y) dummy.position.y = GROUND_Y;

        direction
          .set(
            geo.leafDirection[l3],
            geo.leafDirection[l3 + 1],
            geo.leafDirection[l3 + 2],
          )
          .applyMatrix4(sway)
          .normalize();
        dummy.quaternion.setFromUnitVectors(UP, direction);

        const scale = geo.leafScale[l];
        dummy.scale.set(scale * ax, scale * ay, scale * az);
        dummy.updateMatrix();
        instanced.setMatrixAt(i++, dummy.matrix);
      }
    }

    instanced.count = i;
    instanced.instanceMatrix.needsUpdate = true;
  });

  if (count === 0) return null;

  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, undefined, count]}
      frustumCulled={false}
      castShadow
    >
      <meshStandardMaterial roughness={shape.roughness} flatShading />
    </instancedMesh>
  );
}
