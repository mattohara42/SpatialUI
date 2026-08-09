import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MOTION } from './sway';

const COUNT = 140;
const CEILING = 4.8;
const FLOOR = 0.4;

/**
 * Drifting motes over the garden, ported from the desk-bonsai sketch. Activity
 * made visible in the air: denser, brighter, and faster-rising when the garden
 * is busy, near-invisible when it is quiet. Additive blending so they read as
 * light rather than dust, which is the opposite of the staleness cue.
 *
 * Spawned across the garden footprint, so this sits inside the same translated
 * group as the plants.
 *
 * The ceiling is now the eaves, because there is a roof: motes that rose through
 * the glass would say the building is not there, and specks gathering under the
 * ridge is what warm air in a greenhouse actually does.
 */
export function Motes({
  size,
  activity,
  ceiling = CEILING,
}: {
  size: [number, number];
  activity: number;
  ceiling?: number;
}) {
  const points = useRef<THREE.Points>(null);
  const phase = useMemo(() => {
    const p = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) p[i] = Math.random() * Math.PI * 2;
    return p;
  }, []);

  const geometry = useMemo(() => {
    const positions = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = Math.random() * size[0];
      positions[i * 3 + 1] = FLOOR + Math.random() * (ceiling - FLOOR);
      positions[i * 3 + 2] = Math.random() * size[1];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return g;
  }, [size[0], size[1], ceiling]);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    const rise = (0.05 + activity * 0.16) * MOTION;
    const arr = geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < COUNT; i++) {
      arr[i * 3 + 1] += rise * delta;
      arr[i * 3] += Math.sin(t * 0.3 + phase[i]) * 0.0009;
      if (arr[i * 3 + 1] > ceiling) {
        arr[i * 3 + 1] = FLOOR;
        arr[i * 3] = Math.random() * size[0];
        arr[i * 3 + 2] = Math.random() * size[1];
      }
    }
    geometry.attributes.position.needsUpdate = true;

    const material = points.current!.material as THREE.PointsMaterial;
    material.opacity = 0.05 + activity * 0.4;
    material.size = 0.035 + activity * 0.03;
  });

  return (
    <points ref={points} geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        color="#d9c9a0"
        size={0.05}
        transparent
        opacity={0.2}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
