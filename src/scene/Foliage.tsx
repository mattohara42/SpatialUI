import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlacedPlant } from './types';
import { smoothActivity, swayMatrix } from './sway';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Every leaf in the garden in one InstancedMesh, same reasoning as Branches.
 *
 * Leaves sway with the same per-plant matrix the branches use, so a leaf never
 * drifts off the twig that spawned it. Leaf count already carries health: the
 * generator drops foliage in proportion to vitality rather than shrinking it, so
 * a sick plant is cheaper to draw as well as visibly thinner.
 */
export function Foliage({ plants }: { plants: PlacedPlant[] }) {
  const mesh = useRef<THREE.InstancedMesh>(null);

  const count = useMemo(
    () => plants.reduce((sum, p) => sum + p.geometry.leafCount, 0),
    [plants],
  );

  useLayoutEffect(() => {
    const instanced = mesh.current;
    if (!instanced || count === 0) return;
    const colour = new THREE.Color();
    let i = 0;
    for (const plant of plants) {
      colour.set(plant.tint.foliage);
      for (let l = 0; l < plant.geometry.leafCount; l++) {
        instanced.setColorAt(i++, colour);
      }
    }
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
  }, [plants, count]);

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

    let i = 0;
    for (const plant of plants) {
      const { geometry, position, node } = plant;
      swayMatrix(sway, node.id, smoothActivity(node.id, node.activity, t), t);

      for (let l = 0; l < geometry.leafCount; l++) {
        const l3 = l * 3;
        dummy.position
          .set(
            geometry.leafPosition[l3],
            geometry.leafPosition[l3 + 1],
            geometry.leafPosition[l3 + 2],
          )
          .applyMatrix4(sway);
        dummy.position.x += position[0];
        dummy.position.y += position[1];
        dummy.position.z += position[2];

        direction
          .set(
            geometry.leafDirection[l3],
            geometry.leafDirection[l3 + 1],
            geometry.leafDirection[l3 + 2],
          )
          .applyMatrix4(sway)
          .normalize();
        dummy.quaternion.setFromUnitVectors(UP, direction);

        const scale = geometry.leafScale[l];
        dummy.scale.set(scale, scale * 0.4, scale);
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
      args={[undefined, undefined, count]}
      frustumCulled={false}
      castShadow
    >
      <octahedronGeometry args={[1, 0]} />
      <meshStandardMaterial roughness={0.7} flatShading />
    </instancedMesh>
  );
}
