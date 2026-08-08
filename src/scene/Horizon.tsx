import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mulberry32, type Rng } from '../lsystem/random';

/**
 * The world beyond the garden: layered hills, distant mountains, and a ring of
 * trees at the tree line.
 *
 * All of it is static and deterministic — no per-frame work, no telemetry, one
 * seed — because it exists to give the garden depth, not to be read. It carries
 * no signal at all, which is exactly why it can be as busy as it likes without
 * competing with the plants for attention.
 *
 * It is lit and fogged by the same rig as everything else, and deliberately owns
 * no colour logic of its own: the sun and moon light it, and the fog fades it,
 * so it tracks the time-of-day scrub for free. Distance does most of the work —
 * the fog turns far ridges into pale flat silhouettes, which is the aerial
 * perspective that reads as a real landscape rather than a painted wall.
 */

interface Ring {
  radius: number;
  /** Wall foot and the range its crest wanders between, in metres. */
  base: number;
  minHeight: number;
  maxHeight: number;
  color: string;
  seed: number;
  /** Angular samples around the ring. More is smoother and costs more. */
  segments: number;
}

/**
 * Three bands receding from the garden. Near hills sit just past the plot with
 * enough contrast to read as ground rising; the mid hills and far mountains are
 * progressively taller, cooler, and more washed by fog, so they stack into
 * distance. Colours are picked to look right *before* fog and lighting, which
 * then push them the rest of the way.
 */
const RINGS: Ring[] = [
  { radius: 58, base: -1, minHeight: 5, maxHeight: 13, color: '#4a5730', seed: 101, segments: 220 },
  { radius: 118, base: -1, minHeight: 12, maxHeight: 30, color: '#48566a', seed: 202, segments: 240 },
  { radius: 210, base: -1, minHeight: 34, maxHeight: 78, color: '#66718c', seed: 303, segments: 260 },
];

/** A crest height that is periodic around the ring, so the seam at 0 = 2π joins.
 *  Integer frequencies guarantee the period; the phases are seeded per ring. */
function crest(angle: number, p1: number, p2: number, p3: number): number {
  const n =
    0.5 * Math.sin(angle * 3 + p1) +
    0.3 * Math.sin(angle * 7 + p2) +
    0.2 * Math.sin(angle * 13 + p3);
  return n * 0.5 + 0.5; // into 0..1
}

/**
 * A wavy wall around the garden: a triangle strip whose foot sits on the ground
 * and whose crest undulates. Seen from inside it reads as a ridge line. Built
 * once as flat typed arrays with computed normals, then never touched again.
 */
function buildRidge(ring: Ring): THREE.BufferGeometry {
  const rng = mulberry32(ring.seed);
  const p1 = rng() * Math.PI * 2;
  const p2 = rng() * Math.PI * 2;
  const p3 = rng() * Math.PI * 2;

  const n = ring.segments;
  const positions = new Float32Array((n + 1) * 2 * 3);
  for (let i = 0; i <= n; i++) {
    const angle = (i / n) * Math.PI * 2;
    const x = Math.cos(angle) * ring.radius;
    const z = Math.sin(angle) * ring.radius;
    const h = ring.minHeight + crest(angle, p1, p2, p3) * (ring.maxHeight - ring.minHeight);

    const foot = i * 2 * 3;
    positions[foot] = x;
    positions[foot + 1] = ring.base;
    positions[foot + 2] = z;
    positions[foot + 3] = x;
    positions[foot + 4] = h;
    positions[foot + 5] = z;
  }

  const indices: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    const b = i * 2 + 1;
    const c = (i + 1) * 2;
    const d = (i + 1) * 2 + 1;
    indices.push(a, b, c, b, d, c);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function Ridge({ ring }: { ring: Ring }) {
  const geometry = useMemo(() => buildRidge(ring), [ring]);
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry}>
      {/* DoubleSide so the inward face the camera sees is lit, not culled. */}
      <meshStandardMaterial color={ring.color} roughness={1} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** Scatter parameters for the tree line. */
const TREE_COUNT = 120;
const TREE_INNER = 42;
const TREE_OUTER = 74;

/**
 * A belt of conifer silhouettes at the tree line, filling the gap between the
 * plot and the near hills so the ground does not read as empty out to the
 * ridge. One InstancedMesh, placed once, never animated.
 */
function TreeLine() {
  const mesh = useRef<THREE.InstancedMesh>(null);

  const geometry = useMemo(() => new THREE.ConeGeometry(1, 1, 6), []);
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);

  useLayoutEffect(() => {
    const instanced = mesh.current;
    if (!instanced) return;
    const rng: Rng = mulberry32(777);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    for (let i = 0; i < TREE_COUNT; i++) {
      const angle = rng() * Math.PI * 2;
      // Weighted toward the far edge so the belt thickens into the distance
      // rather than crowding the plot.
      const radius = TREE_INNER + Math.sqrt(rng()) * (TREE_OUTER - TREE_INNER);
      const height = 1.6 + rng() * 2.6;
      const width = height * (0.26 + rng() * 0.12);

      dummy.position.set(Math.cos(angle) * radius, height / 2 - 0.2, Math.sin(angle) * radius);
      dummy.scale.set(width, height, width);
      dummy.rotation.set(0, rng() * Math.PI * 2, 0);
      dummy.updateMatrix();
      instanced.setMatrixAt(i, dummy.matrix);

      // A little colour spread so the belt is not a flat stamp; still dark, so
      // it reads as distant evergreen rather than as anything with a signal.
      color.setHSL(0.28 + rng() * 0.05, 0.3, 0.16 + rng() * 0.06);
      instanced.setColorAt(i, color);
    }
    instanced.instanceMatrix.needsUpdate = true;
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
  }, []);

  return (
    <instancedMesh ref={mesh} args={[geometry, undefined, TREE_COUNT]} frustumCulled={false}>
      <meshStandardMaterial roughness={1} flatShading />
    </instancedMesh>
  );
}

export function Horizon() {
  return (
    <group>
      {RINGS.map((ring) => (
        <Ridge key={ring.seed} ring={ring} />
      ))}
      <TreeLine />
    </group>
  );
}
