import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlacedPlant } from './types';
import { droopSag, GROUND_Y, smoothActivity, smoothVitality, swayMatrix } from './sway';
import {
  barkPixels,
  liftForTexture,
  normalTexture,
  roughnessTexture,
  surfaceTexture,
} from './textures';

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
 *
 * The bark map has the same limitation from the same cause: UVs belong to the
 * shared geometry, so a twig and a trunk get the same number of grain cycles
 * along their length and the twig's grain is compressed. It survives because the
 * map is low-contrast luminance rather than detail — nobody reads the grain on a
 * twig — and the fix, a per-instance UV scale, is the same custom shader the
 * taper wants. Colour is per instance and unaffected.
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

  // Bark grain, generated once. Streaks run along v, which cylinder UVs map to
  // the limb's own axis, so the grain runs up the trunk rather than around it.
  // The relief map is built from the same pixels, so the ridges the albedo
  // darkens are the ones the light now catches (see textures.ts).
  const barkPx = useMemo(() => barkPixels(), []);
  const bark = useMemo(() => surfaceTexture(barkPx, [1, 2]), [barkPx]);
  const barkRelief = useMemo(() => normalTexture(barkPx, [1, 2], 7), [barkPx]);
  const barkRough = useMemo(() => roughnessTexture(barkPx, [1, 2], 0.9, 1.1), [barkPx]);
  useLayoutEffect(() => () => {
    bark.dispose();
    barkRelief.dispose();
    barkRough.dispose();
  }, [bark, barkRelief, barkRough]);

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
      // A stale plant stops moving. Frozen where it stands, it stops passing for
      // a healthy one still swaying in the breeze.
      const motion = plant.stale > 1 ? 0 : 1;
      swayMatrix(sway, node.id, smoothActivity(node.id, node.activity, t), t, motion);
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
      {/* The lifted white cancels the map's mean, so the per-instance health
          tint arrives at the brightness it was tuned to and the grain rides on
          top of it. See textures.ts. */}
      <meshStandardMaterial
        map={bark}
        normalMap={barkRelief}
        roughnessMap={barkRough}
        color={liftForTexture('#ffffff')}
        roughness={1}
        metalness={0}
      />
    </instancedMesh>
  );
}
