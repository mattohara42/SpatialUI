import { useMemo } from 'react';
import { VINE_REFERENCE, VINE_WIRES } from '../lsystem/bespoke';
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

/**
 * Wire heights are not chosen here. They are the vine's own, read from
 * `VINE_WIRES` and scaled by how tall the row is trained — so the low wire is
 * the one the cordon is tied to, the middle and top are the ones its shoots
 * catch with tendrils, and how far a vine has climbed can be read against them.
 *
 * Tuning these independently is how the structure and the plant drift apart into
 * two things that merely stand near each other.
 */
function wireHeights(rowHeight: number): number[] {
  return [VINE_WIRES.low, VINE_WIRES.middle, VINE_WIRES.top].map(
    (u) => (u / VINE_REFERENCE) * rowHeight,
  );
}

/** How far the posts stand proud of the top wire. */
const POST_HEADROOM = 0.16;
const POST_R = 0.045;
const WIRE_R = 0.012;
/** Metres between posts along the row, matching the vine spacing so each vine
 *  has a post to its left and one to its right. */
const POST_SPACING = 1.5;

const POST_COLOR = '#6b5a44';
const WIRE_COLOR = '#3a3a3a';

export interface TrellisRow {
  bed: BedPlacement;
  /** How tall the vines in this bed are trained, in metres. */
  height: number;
}

export function Trellis({ rows: input }: { rows: TrellisRow[] }) {
  const rows = useMemo(
    () =>
      input.map(({ bed, height }) => {
        const [w] = bed.size;
        const cx = bed.center[0];
        const z = bed.center[2];
        const x0 = cx - w / 2;
        const x1 = cx + w / 2;
        const posts = Math.max(2, Math.round(w / POST_SPACING) + 1);
        const xs = Array.from({ length: posts }, (_, i) => x0 + (w * i) / (posts - 1));
        const wires = wireHeights(height);
        const postH = wires[wires.length - 1] + POST_HEADROOM;
        return { id: bed.nodeId, x0, x1, z, length: w, xs, wires, postH };
      }),
    [input],
  );

  if (rows.length === 0) return null;

  return (
    <group>
      {rows.map((row) => (
        <group key={row.id}>
          {row.xs.map((x, i) => (
            <mesh key={i} position={[x, row.postH / 2, row.z]} castShadow>
              <cylinderGeometry args={[POST_R, POST_R * 1.3, row.postH, 6]} />
              <meshStandardMaterial color={POST_COLOR} roughness={1} />
            </mesh>
          ))}
          {row.wires.map((h, i) => (
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
