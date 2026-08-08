import { useMemo } from 'react';
import * as THREE from 'three';
import type { EcosystemEdge } from '../ecosystem/types';
import { topologyKey } from '../ecosystem/graph';
import type { Vec3 } from '../lsystem/types';

/** How far below the soil a graft dips at its midpoint. */
const DIP = 0.4;
/** Samples per graft. More is smoother and linearly more memory. */
const SAMPLES = 10;

/**
 * Root grafts, drawn as curves dipping under the soil between connected plants.
 *
 * Curved tubes cannot be usefully instanced, so every graft in the garden merges
 * into one geometry rebuilt only when `topologyKey` changes. Strength wobbles
 * constantly and topology almost never does, so this is the difference between
 * rebuilding on every telemetry tick and rebuilding when something is genuinely
 * plugged in or unplugged.
 *
 * Lines have no real thickness in WebGL, so strength currently reads through
 * opacity alone. Proper tubes are the fix when the reading language is settled.
 */
export function Grafts({
  edges,
  positionOf,
}: {
  edges: EcosystemEdge[];
  positionOf: Record<string, Vec3>;
}) {
  const key = useMemo(() => topologyKey(edges), [edges]);

  const geometry = useMemo(() => {
    const drawable = edges.filter(
      (e) => positionOf[e.sourceId] && positionOf[e.targetId],
    );
    const points = new Float32Array(drawable.length * (SAMPLES - 1) * 2 * 3);

    let i = 0;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const control = new THREE.Vector3();
    const previous = new THREE.Vector3();
    const current = new THREE.Vector3();

    for (const edge of drawable) {
      a.fromArray(positionOf[edge.sourceId] as unknown as number[]);
      b.fromArray(positionOf[edge.targetId] as unknown as number[]);
      control.copy(a).add(b).multiplyScalar(0.5);
      control.y -= DIP + a.distanceTo(b) * 0.12;

      for (let s = 0; s < SAMPLES; s++) {
        const t = s / (SAMPLES - 1);
        quadratic(current, a, control, b, t);
        if (s > 0) {
          points[i++] = previous.x;
          points[i++] = previous.y;
          points[i++] = previous.z;
          points[i++] = current.x;
          points[i++] = current.y;
          points[i++] = current.z;
        }
        previous.copy(current);
      }
    }

    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute('position', new THREE.BufferAttribute(points, 3));
    return buffer;
    // Keyed on topology, not on the edge array identity, which changes on every
    // commit even when nothing was plugged in or out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (edges.length === 0) return null;

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#8a6f4a" transparent opacity={0.55} />
    </lineSegments>
  );
}

function quadratic(
  out: THREE.Vector3,
  a: THREE.Vector3,
  control: THREE.Vector3,
  b: THREE.Vector3,
  t: number,
): void {
  const inv = 1 - t;
  out.set(
    inv * inv * a.x + 2 * inv * t * control.x + t * t * b.x,
    inv * inv * a.y + 2 * inv * t * control.y + t * t * b.y,
    inv * inv * a.z + 2 * inv * t * control.z + t * t * b.z,
  );
}
