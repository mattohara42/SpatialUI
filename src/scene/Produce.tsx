import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlacedPlant } from './types';
import { droopSag, GROUND_Y, smoothActivity, smoothVitality, swayMatrix } from './sway';
import { grain } from './textures';

/**
 * Produce — fruit and vegetables hanging on the plants that bear them.
 *
 * Drawn as a decoration on a subset of each plant's leaf points rather than from
 * its own geometry: that keeps the pure L-system untouched and makes the amount
 * of produce follow the leaf count for free, so a struggling plant carries less
 * exactly as it sheds leaves. Every fruit rides the same per-plant sway and
 * droop as the leaves, so it never floats off the plant.
 *
 * One InstancedMesh of spheres for the whole garden's produce. Only plants with
 * a `produceTint` contribute, so a garden with no vegetables draws nothing.
 */

/** One fruit for every Nth leaf. Sparser than foliage, so produce reads as a
 *  scatter of heavier objects rather than a second canopy. */
/**
 * How produce is drawn, per bearer. A vegetable carries a few large fruit; a
 * vine hangs many small berries, so a grape reads as a bunch rather than a
 * single big sphere. `every` is the leaf stride between fruit and `scale` is
 * their size relative to the leaf they sit on.
 */
interface ProduceStyle {
  /** Leaf stride between anchors: one fruit, or one bunch, per Nth leaf. */
  every: number;
  /** Size of a single fruit, as a multiple of the leaf it hangs beside. */
  scale: number;
  /**
   * Fruit drawn at each anchor. One is a single fruit hanging on its own; many
   * is a *bunch*, and a bunch is the whole difference between grapes and a
   * scatter of purple balls. A vine carries a few dozen tight clusters of small
   * berries, never one big berry every third leaf.
   */
  berries: number;
  /** Half-width of a bunch at its shoulder, in berry widths. */
  spread: number;
  /** How far a bunch hangs below its anchor, in berry widths. */
  drop: number;
  /**
   * When set, only leaves at exactly this bracket depth are anchors.
   *
   * A vine's fruit hangs in one band under the cordon, not wherever a leaf
   * happens to be — and once its shoots were trained upward, anchoring on any
   * leaf put every bunch in the top of the canopy. The generator records a depth
   * per leaf, so the vine marks its fruiting spurs with one of their own and
   * this picks them out. Unset means any leaf will do, which is right for a
   * plant that fruits all over.
   */
  depth?: number;
}

/** Whether leaf `l` can carry fruit under this style. */
function isAnchor(plant: PlacedPlant, l: number, style: ProduceStyle): boolean {
  return style.depth === undefined || plant.geometry.leafDepth[l] === style.depth;
}

/**
 * Where one berry sits inside its bunch, in berry widths relative to the anchor.
 *
 * A bunch of grapes is a cone hanging point-down: widest at the shoulder where
 * it joins the stem, tapering to a single berry at the tip. `t` runs 0 at the
 * shoulder to 1 at the tip, the radius closes as it descends, and successive
 * berries are turned by the golden angle so they pack without settling into
 * visible rows or a spiral seam.
 *
 * Pure, because the shape of a bunch is the decision here and it should be
 * arguable without a renderer.
 */
export function bunchOffset(
  index: number,
  count: number,
  spread: number,
  drop: number,
): [number, number, number] {
  if (count <= 1) return [0, 0, 0];
  const t = index / (count - 1);
  const radius = spread * (1 - t);
  const angle = index * 2.399963229728653;
  return [Math.cos(angle) * radius, -drop * t, Math.sin(angle) * radius];
}

/** How far one fruit may stray from its kind's colour. Luminance only, like
 *  every other grain in the scene. */
const PRODUCE_GRAIN = 0.12;

/** A vegetable hangs alone and large. */
const VEGETABLE_STYLE: ProduceStyle = {
  every: 5,
  scale: 2.2,
  berries: 1,
  spread: 0,
  drop: 0,
};

/**
 * Grapes hang in bunches, and every number here is set against the *leaf* beside
 * them. A berry is a fraction of a leaf, which is what makes it read as a berry;
 * two dozen of them in a cone is what makes the cone read as a bunch.
 */
const GRAPE_STYLE: ProduceStyle = {
  every: 1,
  scale: 0.22,
  berries: 26,
  // A bunch is roughly as wide at the shoulder as it is long. Narrower than this
  // and two dozen berries string out into a dark spike rather than reading as
  // fruit.
  spread: 3.2,
  drop: 6,
  /** The depth the vine marks its fruiting spurs with. See `generateVine`. */
  depth: 3,
};

function styleFor(plant: PlacedPlant): ProduceStyle {
  return plant.grape ? GRAPE_STYLE : VEGETABLE_STYLE;
}

function bearers(plants: PlacedPlant[]): PlacedPlant[] {
  return plants.filter((p) => p.produceTint !== undefined);
}

/** How many fruit a plant contributes: one per Nth leaf, matching the stride the
 *  render loop walks so the instance buffer is sized exactly. */
function fruitCount(plant: PlacedPlant): number {
  const style = styleFor(plant);
  let anchors = 0;
  for (let l = 0; l < plant.geometry.leafCount; l += style.every) {
    if (isAnchor(plant, l, style)) anchors++;
  }
  return anchors * style.berries;
}

export function Produce({ plants }: { plants: PlacedPlant[] }) {
  const mesh = useRef<THREE.InstancedMesh>(null);

  const fruiting = useMemo(() => bearers(plants), [plants]);

  const count = useMemo(
    () => fruiting.reduce((sum, p) => sum + fruitCount(p), 0),
    [fruiting],
  );

  const geometry = useMemo(() => new THREE.IcosahedronGeometry(1, 0), []);
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);

  useLayoutEffect(() => {
    const instanced = mesh.current;
    if (!instanced || count === 0) return;
    const colour = new THREE.Color();
    let i = 0;
    for (const plant of fruiting) {
      const n = fruitCount(plant);
      for (let f = 0; f < n; f++) {
        colour.set(plant.produceTint!).multiplyScalar(
          grain(plant.node.id, f, PRODUCE_GRAIN),
        );
        instanced.setColorAt(i++, colour);
      }
    }
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
  }, [fruiting, count]);

  const scratch = useMemo(
    () => ({ dummy: new THREE.Object3D(), sway: new THREE.Matrix4() }),
    [],
  );

  useFrame(({ clock }) => {
    const instanced = mesh.current;
    if (!instanced || count === 0) return;
    const { dummy, sway } = scratch;
    const t = clock.elapsedTime;

    let i = 0;
    for (const plant of fruiting) {
      const { geometry: geo, position, node } = plant;
      const motion = plant.stale > 1 ? 0 : 1;
      swayMatrix(sway, node.id, smoothActivity(node.id, node.activity, t), t, motion);
      const vit = smoothVitality(node.id, plant.vitality, t);
      const style = styleFor(plant);

      for (let l = 0; l < geo.leafCount; l += style.every) {
        if (!isAnchor(plant, l, style)) continue;
        const l3 = l * 3;
        const size = geo.leafScale[l] * style.scale;
        for (let b = 0; b < style.berries; b++) {
          const [ox, oy, oz] = bunchOffset(b, style.berries, style.spread, style.drop);
          dummy.position
            .set(geo.leafPosition[l3], geo.leafPosition[l3 + 1], geo.leafPosition[l3 + 2])
            .applyMatrix4(sway);
          dummy.position.y -= droopSag(dummy.position.x, dummy.position.z, vit);
          // The bunch hangs after the sway, so it stays plumb rather than
          // swinging out sideways with the shoot that carries it.
          dummy.position.x += position[0] + ox * size;
          dummy.position.y += position[1] + oy * size;
          dummy.position.z += position[2] + oz * size;
          if (dummy.position.y < GROUND_Y) dummy.position.y = GROUND_Y;

          dummy.scale.set(size, size, size);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          instanced.setMatrixAt(i++, dummy.matrix);
        }
      }
    }

    instanced.count = i;
    instanced.instanceMatrix.needsUpdate = true;
  });

  if (count === 0) return null;

  return (
    <instancedMesh ref={mesh} args={[geometry, undefined, count]} frustumCulled={false} castShadow>
      <meshStandardMaterial roughness={0.5} flatShading />
    </instancedMesh>
  );
}
