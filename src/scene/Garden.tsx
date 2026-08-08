import { useMemo } from 'react';
import { OrbitControls } from '@react-three/drei';
import { Beds } from './Beds';
import { Branches } from './Branches';
import { Foliage } from './Foliage';
import { Grafts } from './Grafts';
import { Motes } from './Motes';
import { Sky } from './Sky';
import type { PlacedPlant, Tint } from './types';
import { useEcosystem } from '../state/ecosystemStore';
import { edgesInGarden, nodesInGarden } from '../ecosystem/graph';
import { layoutGarden } from '../ecosystem/layout';
import { vitalsAt } from '../ecosystem/history';
import { staleness, staleThresholdFor } from '../ecosystem/staleness';
import { signalHealth, type EcosystemNode } from '../ecosystem/types';
import { generatePlantMemo } from '../hooks/useLSystem';
import type { PresetName } from '../lsystem/presets';
import type { Vec3 } from '../lsystem/types';

/**
 * Direction the sun sits and the key light shines from. One vector so the visible
 * sun and the shadows always agree; the future time-scrub drives this.
 */
const SUN_DIR: Vec3 = [-3, 1.4, -8];

/**
 * Archetype means kind of thing, never health. Shape is learnable and constant;
 * letting it move with health would put it in competition with the channels that
 * already carry health.
 *
 * Weeds are shrubs because a dense low mound reads as infestation rather than as
 * a specimen.
 */
function archetypeFor(node: EcosystemNode): PresetName {
  if (node.polarity === 'suppress') return 'shrub';
  return node.domain === 'devops' && node.label.includes('db') ? 'spire' : 'broadleaf';
}

/** Linear interpolate two #rrggbb colours. */
function mix(lo: string, hi: string, t: number): string {
  const c = Math.max(0, Math.min(1, t));
  const a = parseInt(lo.slice(1), 16);
  const b = parseInt(hi.slice(1), 16);
  const l = (s: number) => {
    const x = Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * c);
    return x.toString(16).padStart(2, '0');
  };
  return `#${l(16)}${l(8)}${l(0)}`;
}

/**
 * Colour is a redundant encoding, never the encoding. Now that structure is
 * generated once and frozen (see generatePlantMemo), colour carries the live
 * health signal, so it interpolates continuously rather than stepping between
 * thresholds: a stepped tint change would be its own visible jerk every tick.
 */
function tintFor(health: number, stale: number): Tint {
  if (stale > 1) {
    // Silence is its own state and should be faintly unsettling rather than
    // merely neutral: grey, dusty, no signal at all.
    return { bark: '#6b6660', foliage: '#8f8b83' };
  }
  return {
    bark: mix('#5a4a3a', '#6b563d', health),
    foliage: mix('#96683a', '#7ea34e', health),
  };
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
      const geometry = generatePlantMemo({
        seed: node.id,
        vitality: vitals.vitality,
        maturity: vitals.maturity,
        growthScale: placement.growthScale,
        preset: archetypeFor(node),
      });

      return [
        {
          node,
          position: placement.position,
          geometry,
          tint: tintFor(signalHealth({ ...node, ...vitals }), stale),
          vitality: vitals.vitality,
        },
      ];
    });
  }, [layout, nodes, history, cursor, activeGardenId, revision]);

  // One number for the whole mote field: how busy the garden is on average.
  const activity = plants.length
    ? plants.reduce((sum, p) => sum + p.node.activity, 0) / plants.length
    : 0;

  return (
    <>
      {/*
       * Daylight. A bright warm sun casts the shadows; a hemisphere light does
       * the sky's job, blue from above and warm-green bounce from the grass
       * below, so shadowed sides stay lit and read as daytime. A gentle cool
       * fill on the camera side keeps the backlit faces from going flat. Fog is
       * a pale blue haze, so distance reads as aerial perspective.
       */}
      {/* Fog colour matches the sky horizon so plants fade into it, not a seam. */}
      <fogExp2 attach="fog" args={['#c3d8ec', 0.02]} />
      <Sky sunDirection={SUN_DIR} />

      <hemisphereLight args={['#cfe0f2', '#5f6d3c', 1.15]} />
      <directionalLight
        position={SUN_DIR}
        intensity={2.6}
        color="#fff3df"
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      {/* Cool fill on the camera side, so the backlit plants keep readable
          faces against the bright sun instead of going flat. */}
      <directionalLight position={[4, 4, 8]} intensity={0.5} color="#bcd2ec" />

      <group position={[-layout.size[0] / 2, 0, -layout.size[1] / 2]}>
        <Beds beds={layout.beds} />
        <Branches plants={plants} />
        <Foliage plants={plants} />
        <Grafts edges={gardenEdges} positionOf={layout.positionOf} />
        {plants.length > 0 && <Motes size={layout.size} activity={activity} />}
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#5c6e3a" roughness={1} />
      </mesh>
      <OrbitControls target={[0, 1, 0]} maxPolarAngle={Math.PI / 2.05} />
    </>
  );
}
