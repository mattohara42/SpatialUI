import type { BedPlacement } from '../ecosystem/layout';

/** Soil. Deliberately plain: the beds are structure, not the thing being read. */
export function Beds({ beds }: { beds: BedPlacement[] }) {
  return (
    <group>
      {beds.map((bed) => (
        <mesh
          key={bed.nodeId}
          position={[bed.center[0], -0.04, bed.center[2]]}
          receiveShadow
        >
          <boxGeometry args={[bed.size[0], 0.08, bed.size[1]]} />
          <meshStandardMaterial color="#3d342b" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}
