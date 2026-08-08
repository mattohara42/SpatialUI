import { useMemo } from 'react';
import { OrbitControls } from '@react-three/drei';
import { Beds } from './Beds';
import { Branches } from './Branches';
import { Foliage } from './Foliage';
import { Produce } from './Produce';
import { Grafts } from './Grafts';
import { Motes } from './Motes';
import { Sky } from './Sky';
import { Horizon } from './Horizon';
import { SunScrub } from './SunScrub';
import { MOON_COLOR, daylightAt, mixHex, type Daylight } from './daylight';
import type { PlacedPlant, Tint } from './types';
import { useEcosystem } from '../state/ecosystemStore';
import { edgesInGarden, nodesInGarden } from '../ecosystem/graph';
import { layoutGarden } from '../ecosystem/layout';
import { vitalsAt } from '../ecosystem/history';
import { staleness, staleThresholdFor } from '../ecosystem/staleness';
import { signalHealth, type EcosystemNode } from '../ecosystem/types';
import { generatePlantMemo } from '../hooks/useLSystem';
import { leafKindFor, type LeafKind, type PresetName } from '../lsystem/presets';
import { plantingOf } from '../ecosystem/planting';
import { bearsProduce, formFor, produceTintFor } from './planting';
import type { Vec3 } from '../lsystem/types';

/**
 * How far out the key lights sit. A directional light only needs a direction,
 * but its shadow camera sits at its position, so it has to stand far enough
 * back to see the whole garden and near enough to keep depth precision.
 */
const LIGHT_DISTANCE = 30;

/** Half-width of the shadow frustum. The garden footprint is about 15m by 3m. */
const SHADOW_EXTENT = 12;

/**
 * Time is quantized before it reaches the sky. The sun crosses a full circle in
 * a day, so half a minute is a hundredth of a degree: invisible while dragging,
 * and it means a telemetry tick every two seconds does not rebuild the lighting
 * for a sun that has not measurably moved.
 */
const SKY_STEP_MS = 30_000;

/** A unit direction pushed out to where a light or a body should stand. */
function scaled(direction: Vec3, distance: number): Vec3 {
  return [
    direction[0] * distance,
    direction[1] * distance,
    direction[2] * distance,
  ];
}

/**
 * The form a plant wears. Shape is learnable and constant, never a health
 * signal; letting it move with health would compete with the channels that
 * already carry health.
 *
 * A plant takes its bed's planting — an orchard tree, a hedge shrub, a conifer —
 * and picks one form from that planting's palette by a hash of its id, so a bed
 * shows varied individuals without the choice encoding anything. Polarity still
 * overrides everything: a suppress-polarity node is a weed wherever it grows,
 * because a thriving weed being alarming on sight is the one load-bearing shape
 * read, and it must survive whatever the bed is planted with.
 */
function archetypeFor(node: EcosystemNode, bed: EcosystemNode | undefined): PresetName {
  if (node.polarity === 'suppress') return 'shrub';
  return formFor(plantingOf(bed ?? {}), node.id);
}

/**
 * Colour is a redundant encoding, never the encoding. Now that structure is
 * generated once and frozen (see generatePlantMemo), colour carries the live
 * health signal, so it interpolates continuously rather than stepping between
 * thresholds: a stepped tint change would be its own visible jerk every tick.
 */
function tintFor(health: number, stale: number, kind: LeafKind): Tint {
  if (stale > 1) {
    // Silence is its own state and should be faintly unsettling rather than
    // merely neutral: grey, dusty, no signal at all.
    return { bark: '#6b6660', foliage: '#8f8b83' };
  }
  // A flowering plant has a green stem, not bark, so it reads as a herb rather
  // than a tiny tree. The petals themselves are coloured separately (bloomTint).
  const bark =
    kind === 'bloom'
      ? mixHex('#4a5a34', '#6a8248', health)
      : mixHex('#5a4a3a', '#6b563d', health);
  return {
    bark,
    foliage: mixHex('#96683a', '#7ea34e', health),
  };
}

/**
 * A flower's petal colour. Decorative and seeded from the node id, never a
 * health signal — health reads through how many petals survive, not their hue —
 * so the palette is simply a spread of garden colours. Staleness is the one
 * exception that greys it, because a silent flower must not look like a bright
 * one.
 */
const BLOOM_PALETTE = [
  '#e8657f', // pink
  '#f2b705', // gold
  '#f4f0ea', // white
  '#b072d0', // violet
  '#ef6a3a', // orange
  '#e24b6a', // rose
  '#6fa8dc', // cornflower
];

function bloomTintFor(seed: string, stale: number): string {
  if (stale > 1) return '#9a968d';
  return BLOOM_PALETTE[hashString(seed) % BLOOM_PALETTE.length];
}

/** Stable non-negative hash of a string, for the varietal bloom colour. */
function hashString(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function Garden() {
  const nodes = useEcosystem((s) => s.nodes);
  const edges = useEcosystem((s) => s.edges);
  const history = useEcosystem((s) => s.history);
  const cursor = useEcosystem((s) => s.cursor);
  const activeGardenId = useEcosystem((s) => s.activeGardenId);
  const revision = useEcosystem((s) => s.revision);

  const state = { nodes, edges, history, cursor, activeGardenId, revision };

  const gardenNodes = useMemo(
    () => (activeGardenId ? nodesInGarden(state, activeGardenId) : []),
    [nodes, activeGardenId],
  );

  const layout = useMemo(() => layoutGarden(gardenNodes), [gardenNodes]);

  const gardenEdges = useMemo(
    () => (activeGardenId ? edgesInGarden(state, activeGardenId) : []),
    [edges, activeGardenId],
  );

  const plants = useMemo<PlacedPlant[]>(() => {
    if (!activeGardenId) return [];
    const now = cursor ?? revision;
    const threshold = staleThresholdFor(activeGardenId);

    return layout.plants.flatMap((placement) => {
      const node = nodes[placement.nodeId];
      if (!node) return [];

      // Everything reads vitals through the cursor. Nothing in the scene may
      // touch node.vitality directly, or scrubbing silently stops working.
      const vitals = vitalsAt(node, history[node.id], cursor);
      const stale = staleness(node, now, threshold);

      // Memoized on the quantized vitals, so a tick that does not step a plant
      // across a vitality bucket reuses geometry instead of rebuilding it.
      const bed = node.parentId ? nodes[node.parentId] : undefined;
      const planting = plantingOf(bed ?? {});
      const preset = archetypeFor(node, bed);
      const geometry = generatePlantMemo({
        seed: node.id,
        vitality: vitals.vitality,
        maturity: vitals.maturity,
        growthScale: placement.growthScale,
        preset,
      });

      const leafKind = leafKindFor(preset);

      return [
        {
          node,
          position: placement.position,
          geometry,
          tint: tintFor(signalHealth({ ...node, ...vitals }), stale, leafKind),
          vitality: vitals.vitality,
          leafKind,
          bloomTint: bloomTintFor(node.id, stale),
          produceTint:
            node.polarity !== 'suppress' && bearsProduce(planting)
              ? produceTintFor(node.id, stale)
              : undefined,
        },
      ];
    });
  }, [layout, nodes, history, cursor, activeGardenId, revision]);

  // One number for the whole mote field: how busy the garden is on average.
  const activity = plants.length
    ? plants.reduce((sum, p) => sum + p.node.activity, 0) / plants.length
    : 0;

  // The hour under the cursor, and every visible consequence of it. Scrubbing
  // moves this, so the light is not a setting the scene was tuned against; it
  // is the reading of the time being shown.
  const skyBucket = Math.floor((cursor ?? revision) / SKY_STEP_MS);
  const daylight = useMemo<Daylight>(
    () => daylightAt(skyBucket * SKY_STEP_MS),
    [skyBucket],
  );

  const sunPosition = useMemo(
    () => scaled(daylight.sunDirection, LIGHT_DISTANCE),
    [daylight.sunDirection],
  );
  const moonPosition = useMemo(
    () => scaled(daylight.moonDirection, LIGHT_DISTANCE),
    [daylight.moonDirection],
  );

  return (
    <>
      {/*
       * A hemisphere light does the sky's job, tinted from above and bounced
       * from the ground below, so shadowed sides stay lit rather than going
       * black. The sun casts the shadows while it is up; the moon takes the key
       * once it is down, because a light left pointing up through the floor
       * would rim every plant from underneath. A cool fill on the camera side
       * keeps backlit faces readable.
       *
       * Every colour and intensity here comes from `daylightFor`, so the sun you
       * can see, the shadows it casts, and the haze it lights are one decision.
       */}
      {/* Fog colour matches the sky horizon so plants fade into it, not a seam. */}
      <fogExp2 attach="fog" args={[daylight.fogColor, 0.02]} />
      <Sky daylight={daylight} />
      <SunScrub daylight={daylight} />

      <hemisphereLight
        color={daylight.skyColor}
        groundColor={daylight.groundColor}
        intensity={daylight.ambientIntensity}
      />
      <directionalLight
        position={sunPosition}
        intensity={daylight.sunIntensity}
        color={daylight.sunColor}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-SHADOW_EXTENT}
        shadow-camera-right={SHADOW_EXTENT}
        shadow-camera-top={SHADOW_EXTENT}
        shadow-camera-bottom={-SHADOW_EXTENT}
        shadow-camera-far={LIGHT_DISTANCE * 2.5}
      />
      <directionalLight
        position={moonPosition}
        intensity={daylight.moonIntensity}
        color={MOON_COLOR}
      />
      {/* Cool fill on the camera side, so the backlit plants keep readable
          faces against the bright sun instead of going flat. */}
      <directionalLight
        position={[4, 4, 8]}
        intensity={daylight.fillIntensity}
        color="#bcd2ec"
      />

      <group position={[-layout.size[0] / 2, 0, -layout.size[1] / 2]}>
        <Beds beds={layout.beds} />
        <Branches plants={plants} />
        <Foliage plants={plants} />
        <Produce plants={plants} />
        <Grafts edges={gardenEdges} positionOf={layout.positionOf} />
        {plants.length > 0 && <Motes size={layout.size} activity={activity} />}
      </group>
      {/* Ground runs out to meet the sky, so there is no plate edge floating in
          fog. Only the garden-sized centre receives shadows (the shadow camera
          covers a few metres), but the whole sheet is lit and fogged, which is
          what carries it to the horizon. The hills and tree line stand on it. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
        <planeGeometry args={[1000, 1000]} />
        <meshStandardMaterial color="#5c6e3a" roughness={1} />
      </mesh>
      <Horizon />
      {/* makeDefault so the sun drag can find these and suspend them; without
          it, grabbing the sun would orbit the camera at the same time. */}
      <OrbitControls makeDefault target={[0, 1, 0]} maxPolarAngle={Math.PI / 2.05} />
    </>
  );
}
