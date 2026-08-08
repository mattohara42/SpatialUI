import { useMemo } from 'react';
import type { BedPlacement } from '../ecosystem/layout';

/**
 * The trellis a vineyard's vines are trained on: a line of posts down the row
 * with horizontal catch-wires strung between them.
 *
 * Static structure, not a plant — it carries no signal, like the horizon — so it
 * is plain geometry lit and fogged by the shared rig. It spans each vineyard
 * bed's row along x (a vineyard is laid out as a single row), and the wires sit
 * at the height the trained cordons reach, so the vines read as growing on it.
 */

/** Post height and the two wire heights, in metres, tuned to the vine cordon. */
const POST_H = 1.7;
const WIRES = [0.8, 1.35];
const POST_R = 0.04;
const WIRE_R = 0.015;
/** Metres between posts along the row. */
const POST_SPACING = 1.5;

const POST_COLOR = '#6b5a44';
const WIRE_COLOR = '#3a3a3a';

export function Trellis({ beds }: { beds: BedPlacement[] }) {
  const rows = useMemo(
    () =>
      beds.map((bed) => {
        const [w] = bed.size;
        const cx = bed.center[0];
        const z = bed.center[2];
        const x0 = cx - w / 2;
        const x1 = cx + w / 2;
        const posts = Math.max(2, Math.round(w / POST_SPACING) + 1);
        const xs = Array.from({ length: posts }, (_, i) => x0 + (w * i) / (posts - 1));
        return { id: bed.nodeId, x0, x1, z, length: w, xs };
      }),
    [beds],
  );

  if (rows.length === 0) return null;

  return (
    <group>
      {rows.map((row) => (
        <group key={row.id}>
          {row.xs.map((x, i) => (
            <mesh key={i} position={[x, POST_H / 2, row.z]} castShadow>
              <cylinderGeometry args={[POST_R, POST_R * 1.3, POST_H, 5]} />
              <meshStandardMaterial color={POST_COLOR} roughness={1} />
            </mesh>
          ))}
          {WIRES.map((h, i) => (
            <mesh
              key={`w${i}`}
              position={[(row.x0 + row.x1) / 2, h, row.z]}
              rotation={[0, 0, Math.PI / 2]}
            >
              <cylinderGeometry args={[WIRE_R, WIRE_R, row.length, 4]} />
              <meshStandardMaterial color={WIRE_COLOR} roughness={0.6} metalness={0.3} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
