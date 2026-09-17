import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlacedPlant } from './types';
import { droopSag, GROUND_Y, smoothActivity, smoothVitality, swayMatrix } from './sway';
import type { LeafKind } from '../lsystem/presets';
import { grain } from './textures';
import { bladeGeometry, LEAF_PROFILES } from './leaf';
import { makeLeafMaterial } from './translucency';
import type { Daylight } from './daylight';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * How each leaf kind is drawn: a base geometry and a scale aspect applied to the
 * generator's per-leaf scale. The aspect is [across, along, thickness] where
 * "along" runs down the branch heading, since the instance is oriented by
 * mapping local +Y onto the leaf direction. This is the whole leaf-shape
 * vocabulary in one table.
 *
 *   broad   flat wide blade, the default hardwood leaf
 *   blade   long narrow leaf, for the willow's drooping whips
 *   needle  thin and long, a conifer needle drawn as a spike
 *   round   compact and full, dense small leaves on a weed
 */
interface LeafShape {
  geometry: () => THREE.BufferGeometry;
  aspect: [number, number, number];
  roughness: number;
}

/**
 * How far a single leaf may stray from its plant's colour. Petals get less: a
 * flower head is a deliberate, composed thing, and mottling it reads as a sick
 * bloom rather than as a full one.
 */
const LEAF_GRAIN = 0.15;
const PETAL_GRAIN = 0.07;

const SHAPES: Record<LeafKind, LeafShape> = {
  broad: { geometry: () => bladeGeometry(LEAF_PROFILES.broad), aspect: [0.92, 0.52, 0.5], roughness: 0.7 },
  blade: { geometry: () => bladeGeometry(LEAF_PROFILES.blade), aspect: [0.42, 1.3, 0.34], roughness: 0.65 },
  // A needle keeps its cone. A conifer needle really is a spike with no blade,
  // no shoulder and no fold, so giving it a leaf outline would be fidelity spent
  // making it less true; see leaf.ts.
  needle: { geometry: () => new THREE.ConeGeometry(1, 1, 5), aspect: [0.16, 1.35, 0.16], roughness: 0.6 },
  round: { geometry: () => bladeGeometry(LEAF_PROFILES.round), aspect: [0.8, 0.84, 0.66], roughness: 0.8 },
  // A petal: rounded and strongly cupped, brighter than a leaf. A cluster of
  // these fanned around a stem tip reads as a flower head.
  bloom: { geometry: () => bladeGeometry(LEAF_PROFILES.bloom), aspect: [0.94, 0.7, 0.6], roughness: 0.45 },
  // A palm leaflet: much longer than it is wide and only faintly folded. Strung
  // in pairs down an arcing rachis (see `generatePalm`), a run of these reads as
  // one frond rather than as a line of separate leaves.
  frond: { geometry: () => bladeGeometry(LEAF_PROFILES.frond), aspect: [0.26, 2.3, 0.22], roughness: 0.6 },
};

/**
 * Which kinds are blades rather than solids, and so want shading that reads as a
 * curved surface and faces that read from both sides.
 *
 * A solid was closed, so flat shading gave it crisp facets and back faces were
 * never seen. A blade is a sheet: smooth shading is what lets its fold read as a
 * fold instead of as two creased panels, and a leaf seen from underneath is an
 * ordinary thing to see, so its back face has to be drawn.
 */
function isBlade(kind: LeafKind): boolean {
  return kind !== 'needle';
}

/**
 * Every leaf in the garden, one InstancedMesh per leaf shape.
 *
 * Leaves sway with the same per-plant matrix the branches use, so a leaf never
 * drifts off the twig that spawned it. Leaf count already carries health: the
 * generator drops foliage in proportion to vitality rather than shrinking it, so
 * a sick plant is cheaper to draw as well as visibly thinner.
 *
 * Every leaf on a plant is handed the same colour, which is what made a canopy
 * read as one solid green object; each instance now takes a small stable
 * luminance jitter (see `grain`) so individual leaves catch the light
 * differently. It is decoration and must stay decoration — luminance only, and
 * small enough that nobody could mistake a bright leaf for a signal.
 *
 * The shapes themselves are blades rather than solids (see `leaf.ts`): an
 * outline with a shoulder and a point, folded along its midrib and curled at the
 * tip. That is a shape decision per leaf *kind*, which follows the archetype and
 * so the bed's planting, and it never moves with a vital — health still reads
 * through how many leaves survive and how far the plant droops, because a sick
 * plant's leaves are missing rather than misshapen.
 *
 * Splitting by kind keeps the one-draw-call-per-mesh property while letting a
 * conifer wear needles and a hardwood wear broad leaves: an InstancedMesh has a
 * single geometry, so distinct shapes have to be distinct meshes. A garden uses
 * at most four, so this is four draw calls, not one per plant.
 */
/**
 * One plant's contribution to one leaf mesh. A plant with an understory appears
 * in two of these — once for its petals and once for its stem leaves — and each
 * takes the half of its markers that belongs to it.
 */
interface LeafGroup {
  plant: PlacedPlant;
  understory: boolean;
}

/**
 * Whether leaf `l` belongs to this group.
 *
 * A plant with no understory has one group and every leaf is in it. A plant with
 * one is split by bracket depth: markers written straight onto a stem are
 * shallow and are its leaves, and markers inside a bracket are deeper and are
 * its petals (see `UnderstoryStyle`).
 */
function leafBelongs(plant: PlacedPlant, l: number, understory: boolean): boolean {
  const style = plant.understory;
  if (!style) return !understory;
  const shallow = plant.geometry.leafDepth[l] <= style.maxDepth;
  return understory ? shallow : !shallow;
}

/** How many of a plant's leaves this group draws. */
function groupCount(group: LeafGroup): number {
  const { plant, understory } = group;
  if (!plant.understory) return understory ? 0 : plant.geometry.leafCount;
  let n = 0;
  for (let l = 0; l < plant.geometry.leafCount; l++) {
    if (leafBelongs(plant, l, understory)) n++;
  }
  return n;
}

export function Foliage({ plants, daylight }: { plants: PlacedPlant[]; daylight: Daylight }) {
  const groups = useMemo(() => {
    const byKind = new Map<LeafKind, LeafGroup[]>();
    const push = (kind: LeafKind, group: LeafGroup) => {
      const list = byKind.get(kind);
      if (list) list.push(group);
      else byKind.set(kind, [group]);
    };
    for (const plant of plants) {
      push(plant.leafKind, { plant, understory: false });
      if (plant.understory) push(plant.understory.kind, { plant, understory: true });
    }
    return byKind;
  }, [plants]);

  return (
    <>
      {[...groups].map(([kind, kindGroups]) => (
        <LeafLayer key={kind} kind={kind} groups={kindGroups} daylight={daylight} />
      ))}
    </>
  );
}

function LeafLayer({
  kind,
  groups,
  daylight,
}: {
  kind: LeafKind;
  groups: LeafGroup[];
  daylight: Daylight;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const shape = SHAPES[kind];

  const count = useMemo(
    () => groups.reduce((sum, g) => sum + groupCount(g), 0),
    [groups],
  );

  const geometry = useMemo(() => shape.geometry(), [shape]);
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);

  // A leaf material that lets the sun through when the canopy is backlit. Built
  // once per leaf shape and aimed at the sun each frame; see `translucency.ts`.
  const leaf = useMemo(
    () => makeLeafMaterial(shape.roughness, !isBlade(kind), isBlade(kind)),
    [shape, kind],
  );
  useLayoutEffect(() => () => leaf.dispose(), [leaf]);

  useLayoutEffect(() => {
    const instanced = mesh.current;
    if (!instanced || count === 0) return;
    const colour = new THREE.Color();
    const amount = kind === 'bloom' ? PETAL_GRAIN : LEAF_GRAIN;
    let i = 0;
    for (const { plant, understory } of groups) {
      // Petals wear the plant's varietal bloom colour, which is decorative and
      // seeded, not the health tint; a flower's health reads through how many
      // petals it still carries, never through their hue. A stem leaf on the
      // same plant is ordinary foliage and takes the health tint like any other.
      const base = kind === 'bloom' ? plant.bloomTint : plant.tint.foliage;
      for (let l = 0; l < plant.geometry.leafCount; l++) {
        if (!leafBelongs(plant, l, understory)) continue;
        colour.set(base).multiplyScalar(grain(plant.node.id, l, amount));
        instanced.setColorAt(i++, colour);
      }
    }
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
  }, [groups, count, kind]);

  const scratch = useMemo(
    () => ({
      dummy: new THREE.Object3D(),
      sway: new THREE.Matrix4(),
      direction: new THREE.Vector3(),
    }),
    [],
  );

  useFrame(({ clock, camera }) => {
    const instanced = mesh.current;
    if (!instanced || count === 0) return;
    // Aim the transmission at the sun for this frame, in the camera's space, and
    // let its strength ride the sun's own intensity so the glow fades at dusk.
    leaf.update(camera, daylight.sunDirection, daylight.sunColor, daylight.sunIntensity);
    const { dummy, sway, direction } = scratch;
    const t = clock.elapsedTime;
    const [ax, ay, az] = shape.aspect;

    let i = 0;
    for (const { plant, understory } of groups) {
      const { geometry: geo, position, node } = plant;
      const motion = plant.stale > 1 ? 0 : 1;
      swayMatrix(sway, node.id, smoothActivity(node.id, node.activity, t), t, motion);
      const vit = smoothVitality(node.id, plant.vitality, t);
      const sizing = understory ? (plant.understory?.scale ?? 1) : 1;

      for (let l = 0; l < geo.leafCount; l++) {
        if (!leafBelongs(plant, l, understory)) continue;
        const l3 = l * 3;
        dummy.position
          .set(
            geo.leafPosition[l3],
            geo.leafPosition[l3 + 1],
            geo.leafPosition[l3 + 2],
          )
          .applyMatrix4(sway);
        dummy.position.y -= droopSag(dummy.position.x, dummy.position.z, vit);
        dummy.position.x += position[0];
        dummy.position.y += position[1];
        dummy.position.z += position[2];
        if (dummy.position.y < GROUND_Y) dummy.position.y = GROUND_Y;

        direction
          .set(
            geo.leafDirection[l3],
            geo.leafDirection[l3 + 1],
            geo.leafDirection[l3 + 2],
          )
          .applyMatrix4(sway)
          .normalize();
        dummy.quaternion.setFromUnitVectors(UP, direction);

        const scale = geo.leafScale[l] * sizing;
        dummy.scale.set(scale * ax, scale * ay, scale * az);
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
      args={[geometry, leaf.material, count]}
      frustumCulled={false}
      castShadow
    />
  );
}
