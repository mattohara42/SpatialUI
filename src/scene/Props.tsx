import { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { FLOOR_Y, type Shell } from './greenhouse';
import { liftForTexture, normalTexture, plankPixels, surfaceTexture } from './textures';

/**
 * The things a gardener leaves lying about.
 *
 * A hose on its hook, a bench on castors, a watering can, shears, a pair of
 * gloves, pots waiting to be filled. None of it means anything — it is
 * decoration under exactly the rule the horizon and the grain keep (DESIGN.md):
 * it may be beautiful, it may never look like it is telling you something.
 *
 * What it buys is *tense*. Beds and glass say a garden exists; a can set down
 * next to a pair of gloves says somebody was here this morning and is coming
 * back. That is the reading the whole product wants — a place you keep an eye on
 * rather than a dashboard you open — and it is the cheapest thing in the scene to
 * add, because unlike a plant none of it has to be true.
 *
 * Two rules keep it out of the way. It is **all against the walls**, in the path
 * the shell leaves around the beds, so it never stands between the camera and a
 * plant. And it is **still**: the only things that move in this scene are motes,
 * dust, and sway, and all three carry signal. A rocking watering can would be
 * motion that meant nothing, which is worse here than in a scene where motion
 * means nothing anyway.
 */

const WOOD = '#8a7053';
const GALV = '#b9c0c3';
const STEEL = '#c8cfd3';
const TERRACOTTA = '#b06846';
const CANVAS = '#ded0b6';
const HOSE = '#3f6350';
const TWINE = '#d9c99e';
const HANDLE = '#a2503c';

/** Bench top height, and its footprint. A potting bench is worked at standing
 *  height, which is what makes it read as a working surface and not a table. */
const BENCH = { height: 0.92, length: 1.9, depth: 0.72, top: 0.055 };

export function Props({ shell }: { shell: Shell }) {
  const { width: w, depth: d } = shell;
  const hw = w / 2;
  const hd = d / 2;

  // Everything is placed against a wall, inside the path the shell leaves.
  const benchX = w * 0.16;
  const benchZ = -hd + 1.0;
  const tapX = -w * 0.28;
  const wallZ = -hd + 0.14;

  const plankPx = useMemo(() => plankPixels(0x91b0), []);
  const plankTiles: [number, number] = [BENCH.length / 1.1, 1];
  const plank = useMemo(() => surfaceTexture(plankPx, plankTiles), [plankPx]);
  // Relief from the same grain, so the props' sawn timber catches the light
  // the way the beds' does.
  const plankRelief = useMemo(() => normalTexture(plankPx, plankTiles, 4), [plankPx]);
  useLayoutEffect(() => () => {
    plank.dispose();
    plankRelief.dispose();
  }, [plank, plankRelief]);
  const wood = useMemo(() => liftForTexture(WOOD), []);

  /** The hose: three turns hanging on a hook, and a length left on the floor. */
  const coil = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const turns = 3;
    const steps = 24 * turns;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = t * Math.PI * 2 * turns - Math.PI / 2;
      const radius = 0.31 - 0.035 * t * turns;
      points.push(
        new THREE.Vector3(
          tapX + Math.cos(angle) * radius,
          1.2 + Math.sin(angle) * radius,
          wallZ + 0.06 + Math.sin(angle * 1.5) * 0.035,
        ),
      );
    }
    // The tail leaves the last loop and drops to the tap.
    points.push(new THREE.Vector3(tapX + 0.02, 0.72, wallZ + 0.1));
    points.push(new THREE.Vector3(tapX, 0.52, wallZ + 0.04));
    return tubeOf(points, 0.024);
  }, [tapX, wallZ]);

  const run = useMemo(
    () =>
      tubeOf(
        [
          new THREE.Vector3(tapX + 0.06, 0.2, wallZ + 0.06),
          new THREE.Vector3(tapX + 0.3, 0.03, wallZ + 0.35),
          new THREE.Vector3(tapX + 1.0, 0.03, wallZ + 1.1),
          new THREE.Vector3(tapX + 1.8, 0.03, wallZ + 0.5),
          new THREE.Vector3(tapX + 2.5, 0.03, wallZ + 1.25),
        ],
        0.024,
      ),
    [tapX, wallZ],
  );

  useLayoutEffect(
    () => () => {
      coil.dispose();
      run.dispose();
    },
    [coil, run],
  );

  return (
    // Everything measures up from the floor, so nothing here has to know where
    // the floor happens to be.
    <group position={[0, FLOOR_Y, 0]}>
      {/* The rolling bench, and what is on it. */}
      <group position={[benchX, 0, benchZ]}>
        <mesh position={[0, BENCH.height, 0]} castShadow receiveShadow>
          <boxGeometry args={[BENCH.length, BENCH.top, BENCH.depth]} />
          <meshStandardMaterial map={plank} normalMap={plankRelief} color={wood} roughness={0.85} />
        </mesh>
        {/* A lip along the back, so potting compost stays on the bench. */}
        <mesh position={[0, BENCH.height + 0.07, -BENCH.depth / 2 + 0.03]} castShadow>
          <boxGeometry args={[BENCH.length, 0.1, 0.05]} />
          <meshStandardMaterial map={plank} normalMap={plankRelief} color={wood} roughness={0.85} />
        </mesh>
        {/* Slatted lower shelf. */}
        {[-0.22, 0, 0.22].map((z) => (
          <mesh key={z} position={[0, 0.32, z]} castShadow receiveShadow>
            <boxGeometry args={[BENCH.length - 0.16, 0.03, 0.17]} />
            <meshStandardMaterial map={plank} normalMap={plankRelief} color={wood} roughness={0.9} />
          </mesh>
        ))}
        {/* Legs, and the castors that make it a bench you can move to the light. */}
        {[-1, 1].map((sx) =>
          [-1, 1].map((sz) => (
            <group
              key={`${sx},${sz}`}
              position={[
                (sx * (BENCH.length - 0.16)) / 2,
                0,
                (sz * (BENCH.depth - 0.14)) / 2,
              ]}
            >
              <mesh position={[0, 0.55, 0]} castShadow>
                <boxGeometry args={[0.07, 0.74, 0.07]} />
                <meshStandardMaterial map={plank} normalMap={plankRelief} color={wood} roughness={0.9} />
              </mesh>
              <mesh position={[0, 0.14, 0]} castShadow>
                <boxGeometry args={[0.06, 0.1, 0.06]} />
                <meshStandardMaterial color="#5d5f61" roughness={0.6} metalness={0.4} />
              </mesh>
              <mesh position={[0, 0.06, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.06, 0.06, 0.035, 12]} />
                <meshStandardMaterial color="#3a3d3f" roughness={0.8} />
              </mesh>
            </group>
          )),
        )}
        {/* A push handle at one end, which is the whole idea of a bench on
            castors: it is chased around the house after the sun. */}
        <group position={[BENCH.length / 2 + 0.06, 0, 0]}>
          {[-1, 1].map((sz) => (
            <mesh
              key={sz}
              position={[0, BENCH.height + 0.15, (sz * (BENCH.depth - 0.2)) / 2]}
              castShadow
            >
              <cylinderGeometry args={[0.022, 0.022, 0.32, 8]} />
              <meshStandardMaterial color={WOOD} roughness={0.85} />
            </mesh>
          ))}
          <mesh
            position={[0, BENCH.height + 0.3, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            castShadow
          >
            <cylinderGeometry args={[0.025, 0.025, BENCH.depth - 0.2, 8]} />
            <meshStandardMaterial color={WOOD} roughness={0.85} />
          </mesh>
        </group>

        <WateringCan position={[-0.62, BENCH.height + BENCH.top / 2, 0.02]} />
        <Shears position={[0.06, BENCH.height + BENCH.top / 2, 0.06]} />
        <Gloves position={[0.42, BENCH.height + BENCH.top / 2, 0.1]} />
        <PotStack position={[0.78, BENCH.height + BENCH.top / 2, -0.08]} count={3} />
        <Twine position={[-0.2, BENCH.height + BENCH.top / 2 + 0.05, -0.2]} />
        <Trug position={[-0.55, 0.35, 0.02]} />
        <PotStack position={[0.5, 0.35, 0]} count={2} />
      </group>

      {/* The tap, the hose on its hook, and the length nobody coiled back up. */}
      <group position={[tapX, 0, wallZ]}>
        <mesh position={[0, 0.28, 0.02]} castShadow>
          <cylinderGeometry args={[0.035, 0.035, 0.56, 10]} />
          <meshStandardMaterial color={STEEL} roughness={0.45} metalness={0.5} />
        </mesh>
        <mesh position={[0, 0.56, 0.1]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.028, 0.028, 0.16, 8]} />
          <meshStandardMaterial color={STEEL} roughness={0.45} metalness={0.5} />
        </mesh>
        <mesh position={[0, 0.62, 0.02]} castShadow>
          <cylinderGeometry args={[0.07, 0.07, 0.03, 12]} />
          <meshStandardMaterial color="#8fa0a6" roughness={0.5} metalness={0.4} />
        </mesh>
        {/* The hook the coil hangs on. */}
        <mesh position={[0, 1.52, 0.04]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.02, 0.02, 0.14, 8]} />
          <meshStandardMaterial color={STEEL} roughness={0.5} metalness={0.5} />
        </mesh>
      </group>
      <mesh geometry={coil} castShadow>
        <meshStandardMaterial color={HOSE} roughness={0.85} />
      </mesh>
      <mesh geometry={run} castShadow receiveShadow>
        <meshStandardMaterial color={HOSE} roughness={0.85} />
      </mesh>
      {/* The brass nozzle on the loose end. */}
      <mesh
        position={[tapX + 2.55, 0.04, wallZ + 1.3]}
        rotation={[Math.PI / 2, 0, 0.6]}
        castShadow
      >
        <cylinderGeometry args={[0.02, 0.035, 0.16, 10]} />
        <meshStandardMaterial color="#b79a5c" roughness={0.4} metalness={0.6} />
      </mesh>

      {/* A broom against the wall by the door. */}
      <group position={[hw - 0.9, 0, wallZ + 0.1]} rotation={[0.16, 0, -0.1]}>
        <mesh position={[0, 0.72, 0]} castShadow>
          <cylinderGeometry args={[0.019, 0.019, 1.44, 8]} />
          <meshStandardMaterial color="#a68a63" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.06, 0]} castShadow>
          <boxGeometry args={[0.3, 0.11, 0.07]} />
          <meshStandardMaterial color="#8a6b46" roughness={0.95} />
        </mesh>
        <mesh position={[0, 0.16, 0]} castShadow>
          <boxGeometry args={[0.28, 0.1, 0.06]} />
          <meshStandardMaterial color={WOOD} roughness={0.9} />
        </mesh>
      </group>

      {/* A few empty pots stood by the near wall, because a greenhouse always
          has more pots than it has plants. */}
      <PotStack position={[-hw + 1.1, 0, hd - 0.55]} count={4} />
      <PotStack position={[-hw + 1.5, 0, hd - 0.75]} count={2} />
    </group>
  );
}

/** A can: body, rim, hooped handle, and a long spout with a rose on it. */
function WateringCan({ position }: { position: [number, number, number] }) {
  return (
    <group position={position} rotation={[0, 0.4, 0]}>
      <mesh position={[0, 0.15, 0]} castShadow>
        <cylinderGeometry args={[0.135, 0.155, 0.3, 16]} />
        <meshStandardMaterial color={GALV} roughness={0.42} metalness={0.45} />
      </mesh>
      <mesh position={[0, 0.3, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.135, 0.012, 8, 20]} />
        <meshStandardMaterial color={GALV} roughness={0.4} metalness={0.5} />
      </mesh>
      {/* The hoop over the top, which is what a can is carried by. */}
      <mesh position={[0, 0.31, 0]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[0.115, 0.013, 8, 18, Math.PI]} />
        <meshStandardMaterial color={GALV} roughness={0.4} metalness={0.5} />
      </mesh>
      {/* The back handle, for tipping it. */}
      <mesh position={[-0.14, 0.22, 0]} rotation={[Math.PI / 2, 0, 0.4]}>
        <torusGeometry args={[0.07, 0.012, 8, 14, Math.PI]} />
        <meshStandardMaterial color={GALV} roughness={0.4} metalness={0.5} />
      </mesh>
      {/* Spout: out of the base, rising to above the rim, the way one pours. */}
      <mesh position={[0.24, 0.22, 0]} rotation={[0, 0, -0.72]} castShadow>
        <cylinderGeometry args={[0.028, 0.038, 0.46, 10]} />
        <meshStandardMaterial color={GALV} roughness={0.42} metalness={0.45} />
      </mesh>
      <mesh position={[0.38, 0.35, 0]} rotation={[0, 0, -0.72]}>
        <cylinderGeometry args={[0.055, 0.03, 0.06, 12]} />
        <meshStandardMaterial color="#a8b0b3" roughness={0.5} metalness={0.4} />
      </mesh>
    </group>
  );
}

/** Shears, laid open on the bench: two blades crossed at the pivot. */
function Shears({ position }: { position: [number, number, number] }) {
  return (
    <group position={position} rotation={[0, -0.5, 0]}>
      {[-1, 1].map((side) => (
        <group key={side} rotation={[0, side * 0.13, 0]}>
          <mesh position={[0.15, 0.008, 0]} castShadow>
            <boxGeometry args={[0.3, 0.012, 0.028]} />
            <meshStandardMaterial color={STEEL} roughness={0.28} metalness={0.75} />
          </mesh>
          <mesh position={[-0.13, 0.012, 0]} castShadow>
            <boxGeometry args={[0.22, 0.024, 0.03]} />
            <meshStandardMaterial color={HANDLE} roughness={0.75} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.014, 0]}>
        <cylinderGeometry args={[0.017, 0.017, 0.034, 10]} />
        <meshStandardMaterial color="#8d9599" roughness={0.4} metalness={0.6} />
      </mesh>
    </group>
  );
}

/** A pair of gloves, dropped palm-down where they were pulled off. */
function Gloves({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {[-1, 1].map((side) => (
        <group
          key={side}
          position={[side * 0.075, 0, side * 0.03]}
          rotation={[0, side * 0.55 + 0.3, 0]}
        >
          <mesh position={[0, 0.022, 0]} scale={[1, 0.42, 1]} castShadow>
            <sphereGeometry args={[0.062, 12, 10]} />
            <meshStandardMaterial color={CANVAS} roughness={0.95} />
          </mesh>
          <mesh position={[0.055, 0.02, 0.045]} rotation={[0, -0.5, 0]} castShadow>
            <capsuleGeometry args={[0.017, 0.05, 4, 8]} />
            <meshStandardMaterial color={CANVAS} roughness={0.95} />
          </mesh>
          <mesh position={[-0.075, 0.024, -0.01]} rotation={[Math.PI / 2, 0, 0.2]}>
            <cylinderGeometry args={[0.042, 0.046, 0.06, 12]} />
            <meshStandardMaterial color="#c6b28f" roughness={0.95} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Terracotta pots, nested into a stack. */
function PotStack({
  position,
  count,
}: {
  position: [number, number, number];
  count: number;
}) {
  return (
    <group position={position}>
      {Array.from({ length: count }, (_, i) => (
        <mesh key={i} position={[0, 0.09 + i * 0.052, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.115, 0.082, 0.18, 14, 1, true]} />
          <meshStandardMaterial
            color={TERRACOTTA}
            roughness={0.95}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.083, 0.083, 0.02, 14]} />
        <meshStandardMaterial color={TERRACOTTA} roughness={0.95} />
      </mesh>
    </group>
  );
}

/** A ball of garden twine. */
function Twine({ position }: { position: [number, number, number] }) {
  return (
    <mesh position={position} rotation={[Math.PI / 2, 0, 0]} castShadow>
      <sphereGeometry args={[0.055, 12, 10]} />
      <meshStandardMaterial color={TWINE} roughness={0.95} />
    </mesh>
  );
}

/** A trug on the shelf, with a handle over it. */
function Trug({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.16, 0.125, 0.2, 16, 1, true]} />
        <meshStandardMaterial color="#4f6b5c" roughness={0.85} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -0.1, 0]}>
        <cylinderGeometry args={[0.125, 0.125, 0.015, 16]} />
        <meshStandardMaterial color="#4f6b5c" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.1, 0]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[0.14, 0.011, 8, 16, Math.PI]} />
        <meshStandardMaterial color="#3f5a4c" roughness={0.8} />
      </mesh>
    </group>
  );
}

/** A hose is a tube along a curve. Smooth rather than segmented, because the
 *  one thing everybody knows about a hose is that it does not have corners. */
function tubeOf(points: THREE.Vector3[], radius: number): THREE.TubeGeometry {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.4);
  return new THREE.TubeGeometry(curve, points.length * 6, radius, 8, false);
}
