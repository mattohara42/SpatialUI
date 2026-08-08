import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlacedPlant } from './types';
import { droopSag, GROUND_Y, smoothActivity, smoothVitality, swayMatrix } from './sway';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Every branch in the garden in a single InstancedMesh.
 *
 * One mesh per plant would be one draw call per plant, which is the usual way
 * this gets built and the usual reason it misses frame budget in a headset.
 * Aggregating across plants keeps it at one call regardless of how many are
 * standing.
 *
 * Matrices are rebuilt every frame so plants can sway: swayMatrix leans each
 * plant rigidly about its base, keeping branches joined while the tips move
 * most. Colours change only when telemetry does, so they upload once per plants
 * change rather than per frame. Frustum culling is off because the whole garden
 * is in view and moving geometry would otherwise need its bounds recomputed
 * every frame.
 *
 * Per-instance taper is lost, since a cylinder cannot narrow along its own
 * length without a custom shader. Segments are short enough that the stepping is
 * hard to see, and the radii are in the buffer when we want to fix it properly.
 */
export function Branches({ plants }: { plants: PlacedPlant[] }) {
  const mesh = useRef<THREE.InstancedMesh>(null);

  const count = useMemo(
    () => plants.reduce((sum, p) => sum + p.geometry.segmentCount, 0),
    [plants],
  );

  useLayoutEffect(() => {
    const instanced = mesh.current;
    if (!instanced || count === 0) return;
    const colour = new THREE.Color();
    let i = 0;
    for (const plant of plants) {
      colour.set(plant.tint.bark);
      for (let s = 0; s < plant.geometry.segmentCount; s++) {
        instanced.setColorAt(i++, colour);
      }
    }
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
  }, [plants, count]);

  const scratch = useMemo(
    () => ({
      dummy: new THREE.Object3D(),
      sway: new THREE.Matrix4(),
      start: new THREE.Vector3(),
      end: new THREE.Vector3(),
      direction: new THREE.Vector3(),
    }),
    [],
  );

  useFrame(({ clock }) => {
    const instanced = mesh.current;
    if (!instanced || count === 0) return;
    const { dummy, sway, start, end, direction } = scratch;
    const t = clock.elapsedTime;

    let i = 0;
    for (const plant of plants) {
      const { geometry, position, node } = plant;
      swayMatrix(sway, node.id, smoothActivity(node.id, node.activity, t), t);
      const vit = smoothVitality(node.id, plant.vitality, t);

      for (let s = 0; s < geometry.segmentCount; s++) {
        const s3 = s * 3;
        start
          .set(
            geometry.segmentStart[s3],
            geometry.segmentStart[s3 + 1],
            geometry.segmentStart[s3 + 2],
          )
          .applyMatrix4(sway);
        start.y -= droopSag(start.x, start.z, vit);
        start.x += position[0];
        start.y += position[1];
        start.z += position[2];
        if (start.y < GROUND_Y) start.y = GROUND_Y;
        end
          .set(
            geometry.segmentEnd[s3],
            geometry.segmentEnd[s3 + 1],
            geometry.segmentEnd[s3 + 2],
          )
          .applyMatrix4(sway);
        end.y -= droopSag(end.x, end.z, vit);
        end.x += position[0];
        end.y += position[1];
        end.z += position[2];
        if (end.y < GROUND_Y) end.y = GROUND_Y;

        direction.subVectors(end, start);
        const length = direction.length() || 1e-6;
        const radius =
          (geometry.segmentRadius[s * 2] + geometry.segmentRadius[s * 2 + 1]) / 2;

        dummy.position.copy(start).addScaledVector(direction, 0.5);
        dummy.quaternion.setFromUnitVectors(UP, direction.divideScalar(length));
        dummy.scale.set(radius, length, radius);
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
      receiveShadow
    >
      <cylinderGeometry args={[1, 1, 1, 5, 1]} />
      <meshStandardMaterial roughness={0.9} metalness={0} />
    </instancedMesh>
  );
}
