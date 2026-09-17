/**
 * Scratch preset preview. Not part of the app — a scaffold for tuning the plant
 * forms one at a time, using the real renderer so what is on screen is what
 * ships. Delete when the tuning pass is done.
 */
import { StrictMode, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas } from '@react-three/fiber';
import { Branches } from './scene/Branches';
import { Foliage } from './scene/Foliage';
import { Produce } from './scene/Produce';
import { Trellis } from './scene/Trellis';
import { Signal } from './scene/Signal';
import { daylightAt } from './scene/daylight';
import { generatePlant } from './lsystem/generate';
import { leafKindFor, understoryFor, type PresetName } from './lsystem/presets';
import type { EcosystemNode } from './ecosystem/types';
import type { PlacedPlant } from './scene/types';

const ORDER: { preset: PresetName; height: number; produce?: string }[] = [
  { preset: 'broadleaf', height: 2.4 },
  { preset: 'bushy', height: 2.4 },
  { preset: 'willow', height: 2.6 },
  { preset: 'spire', height: 2.5 },
  { preset: 'shrub', height: 2.0 },
  { preset: 'topiary', height: 1.6 },
  { preset: 'vine', height: 1.5, produce: '#5b3a72' },
  { preset: 'flower', height: 1.1 },
  { preset: 'wildflower', height: 1.2 },
  { preset: 'acacia', height: 2.4 },
  { preset: 'palm', height: 2.9 },
];

const params = new URLSearchParams(location.search);
const VITALITY = Number(params.get('v') ?? 0.75);
const ONLY = (params.get('only') ?? '').split(',').filter(Boolean);
const SHOWN = ONLY.length ? ORDER.filter((e) => ONLY.includes(e.preset)) : ORDER;
const SPACING = ONLY.length ? 2.4 : 3.2;
const DIST = ONLY.length ? 6 + SHOWN.length * 1.6 : 15;
/** `?row=vineyard` shows a trained row against its trellis, at three
 *  vitalities, which is the only way to judge a vine against the wires it
 *  is tied to. */
const ROW = params.get('row');
/** `?plume=0.5` puts a rising plume on every plant shown, `?plume=-0.5` a
 *  falling one, so the trend cue can be tuned against each form's canopy
 *  instead of against whichever club happens to be on a run (see scene/signal).
 *  Zero, the default, draws nothing at all — which is what most of a garden
 *  looks like. */
const PLUME = Number(params.get('plume') ?? 0);

function node(id: string): EcosystemNode {
  return {
    id,
    parentId: null,
    gardenId: 'preview',
    label: id,
    domain: 'general',
    kind: 'plant',
    polarity: 'nurture',
    vitality: VITALITY,
    activity: 0.3,
    maturity: 0.85,
    trend: 0,
    blights: [],
    updatedAt: Date.now(),
  } as EcosystemNode;
}

/** A trained vineyard row: three vines at their real spacing and height, with
 *  the trellis they answer to, at rising vitality left to right. */
function VineyardRow({ daylight }: { daylight: ReturnType<typeof daylightAt> }) {
  const HEIGHT = 1.6;
  const SPACING = 1.5;
  const vitalities = [0.2, 0.55, 0.95];
  const plants = useMemo<PlacedPlant[]>(
    () =>
      vitalities.map((v, i) => ({
        node: { ...node(`vine-${i}`), vitality: v },
        position: [(i - 1) * SPACING, 0, 0] as [number, number, number],
        geometry: generatePlant({
          seed: `vine-${i}`,
          vitality: v,
          maturity: 0.85,
          growthScale: HEIGHT,
          preset: 'vine',
        }),
        // The health tint the garden would give it: brown at nothing, green at
        // full. This is what "fewer leaves in a less bright colour" looks like.
        tint: { bark: '#6b563d', foliage: v > 0.6 ? '#7ea34e' : v > 0.35 ? '#8a8a45' : '#96683a' },
        leafKind: leafKindFor('vine'),
        understory: understoryFor('vine'),
        bloomTint: '#e8657f',
        produceTint: '#5b3a72',
        grape: true,
        vitality: v,
        signal: PLUME,
        stale: 0,
      })),
    [],
  );

  return (
    <>
      <Trellis
        rows={[
          {
            bed: { nodeId: 'row', center: [0, 0, 0], size: [SPACING * 3, 1] },
            height: HEIGHT,
          },
        ]}
      />
      <Branches plants={plants} />
      <Foliage plants={plants} daylight={daylight} />
      <Produce plants={plants} />
    </>
  );
}

function Scene() {
  const daylight = useMemo(() => daylightAt(Date.UTC(2026, 5, 21, 11, 0)), []);
  const plants = useMemo<PlacedPlant[]>(
    () =>
      SHOWN.map((entry, i) => ({
        node: node(entry.preset),
        position: [(i - (SHOWN.length - 1) / 2) * SPACING, 0, 0] as [number, number, number],
        geometry: generatePlant({
          seed: entry.preset,
          vitality: VITALITY,
          maturity: 0.85,
          growthScale: entry.height,
          preset: entry.preset,
        }),
        tint: { bark: '#6b563d', foliage: '#7ea34e' },
        leafKind: leafKindFor(entry.preset),
        understory: understoryFor(entry.preset),
        bloomTint: '#e8657f',
        produceTint: entry.produce,
        grape: entry.preset === 'vine',
        vitality: VITALITY,
        signal: PLUME,
        stale: 0,
      })),
    [],
  );

  return (
    <>
      <fogExp2 attach="fog" args={[daylight.fogColor, 0.008]} />
      <hemisphereLight
        color={daylight.skyColor}
        groundColor={daylight.groundColor}
        intensity={daylight.ambientIntensity}
      />
      <directionalLight position={[10, 16, 9]} intensity={daylight.sunIntensity} castShadow />
      <directionalLight position={[-6, 4, 8]} intensity={0.4} color="#bcd2ec" />
      {ROW === 'vineyard' ? (
        <VineyardRow daylight={daylight} />
      ) : (
        <>
          <Branches plants={plants} />
          <Foliage plants={plants} daylight={daylight} />
          <Produce plants={plants} />
          <Signal plants={plants} night={0} />
        </>
      )}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#6d7f4c" roughness={1} />
      </mesh>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Canvas shadows camera={{ position: [0, 1.1, ROW ? 4.6 : DIST], fov: 42 }} gl={{ toneMappingExposure: 1.1 }}>
      <Scene />
    </Canvas>
  </StrictMode>,
);
