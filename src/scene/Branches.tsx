import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlacedPlant } from './types';
import { droopSag, GROUND_Y, smoothActivity, smoothVitality, swayMatrix } from './sway';
import { limbAttribute, makeTaperedBark } from './taper';
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
 * Per-instance taper and bark scale used to be the two things this could not do,
 * both for want of a custom shader, and both are now `taper.ts`. The instance
 * matrix carries only the limb's length and heading; its two radii and the UV
 * repeats its physical size asks for ride the `aLimb` attribute, and the vertex
 * stage interpolates the cross-section between the ends. So a trunk narrows
 * continuously into its twigs instead of stepping between barrels, and bark
 * grain is a fixed number of cycles per metre whether it is on a trunk or a
 * twig.
 *
 * That moves radius out of the matrix, which is the one thing to know when
 * reading the frame loop below: the scale set there is `(1, length, 1)`, and a
 * shadow drawn without the same patch would be a one-metre cylinder — hence the
 * matching `customDepthMaterial`.
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

  // The cylinder every branch is drawn from. Six sides rather than five: the
  // taper now makes a trunk read as one continuous limb, so its silhouette is
  // looked at rather than glossed over, and the extra face is the cheapest way
  // to stop a close trunk reading as a pentagonal post.
  const geometry = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 6, 1), []);
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);

  // One vec4 per segment: its two radii, and the UV repeats its length and girth
  // ask for. Rebuilt when the plants change, which is when a vitality bucket
  // moved and the generator handed back new geometry — never per frame, because
  // none of it moves with the sway.
  const limbs = useMemo(
    () => new THREE.InstancedBufferAttribute(new Float32Array(Math.max(count, 1) * 4), 4),
    [count],
  );

  useLayoutEffect(() => {
    if (count === 0) return;
    const array = limbs.array as Float32Array;
    let i = 0;
    for (const plant of plants) {
      const { segmentStart, segmentEnd, segmentRadius, segmentCount } = plant.geometry;
      for (let s = 0; s < segmentCount; s++) {
        const s3 = s * 3;
        // Rest length, not the swayed one. A lean moves a limb without
        // stretching it, so the bark scale it implies is constant, and
        // recomputing it every frame would buy an identical number.
        const length = Math.hypot(
          segmentEnd[s3] - segmentStart[s3],
          segmentEnd[s3 + 1] - segmentStart[s3 + 1],
          segmentEnd[s3 + 2] - segmentStart[s3 + 2],
        );
        const limb = limbAttribute(
          segmentRadius[s * 2],
          segmentRadius[s * 2 + 1],
          length,
        );
        array.set(limb, i * 4);
        i++;
      }
    }
    limbs.needsUpdate = true;
  }, [plants, count, limbs]);

  useLayoutEffect(() => {
    geometry.setAttribute('aLimb', limbs);
    return () => {
      geometry.deleteAttribute('aLimb');
    };
  }, [geometry, limbs]);

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

  // The lifted white cancels the map's mean, so the per-instance health tint
  // arrives at the brightness it was tuned to and the grain rides on top of it.
  // See textures.ts.
  const barkMaterial = useMemo(
    () =>
      makeTaperedBark({
        map: bark,
        normalMap: barkRelief,
        roughnessMap: barkRough,
        color: liftForTexture('#ffffff'),
        roughness: 1,
        metalness: 0,
      }),
    [bark, barkRelief, barkRough],
  );
  useLayoutEffect(() => () => barkMaterial.dispose(), [barkMaterial]);

  // The shadow pass runs the depth material, not the colour one, and radius no
  // longer lives in the instance matrix — so without this every branch would
  // cast the shadow of a one-metre cylinder.
  useLayoutEffect(() => {
    const instanced = mesh.current;
    if (instanced) instanced.customDepthMaterial = barkMaterial.depthMaterial;
  }, [barkMaterial, count]);

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
      const { geometry: plantGeometry, position, node } = plant;
      // A stale plant stops moving. Frozen where it stands, it stops passing for
      // a healthy one still swaying in the breeze.
      const motion = plant.stale > 1 ? 0 : 1;
      swayMatrix(sway, node.id, smoothActivity(node.id, node.activity, t), t, motion);
      const vit = smoothVitality(node.id, plant.vitality, t);

      for (let s = 0; s < plantGeometry.segmentCount; s++) {
        const s3 = s * 3;
        start
          .set(
            plantGeometry.segmentStart[s3],
            plantGeometry.segmentStart[s3 + 1],
            plantGeometry.segmentStart[s3 + 2],
          )
          .applyMatrix4(sway);
        start.y -= droopSag(start.x, start.z, vit);
        start.x += position[0];
        start.y += position[1];
        start.z += position[2];
        if (start.y < GROUND_Y) start.y = GROUND_Y;
        end
          .set(
            plantGeometry.segmentEnd[s3],
            plantGeometry.segmentEnd[s3 + 1],
            plantGeometry.segmentEnd[s3 + 2],
          )
          .applyMatrix4(sway);
        end.y -= droopSag(end.x, end.z, vit);
        end.x += position[0];
        end.y += position[1];
        end.z += position[2];
        if (end.y < GROUND_Y) end.y = GROUND_Y;

        direction.subVectors(end, start);
        const length = direction.length() || 1e-6;

        dummy.position.copy(start).addScaledVector(direction, 0.5);
        dummy.quaternion.setFromUnitVectors(UP, direction.divideScalar(length));
        // Radius is the shader's now, from `aLimb` — see taper.ts. Scaling it
        // here as well would apply it twice.
        dummy.scale.set(1, length, 1);
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
      args={[geometry, barkMaterial.material, count]}
      frustumCulled={false}
      castShadow
      receiveShadow
    />
  );
}
