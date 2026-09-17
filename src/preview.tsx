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
import { daylightAt } from './scene/daylight';
import { generatePlant } from './lsystem/generate';
import { leafKindFor, type PresetName } from './lsystem/presets';
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
        bloomTint: '#e8657f',
        produceTint: entry.produce,
        grape: entry.preset === 'vine',
        vitality: VITALITY,
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
      <Branches plants={plants} />
      <Foliage plants={plants} daylight={daylight} />
      <Produce plants={plants} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#6d7f4c" roughness={1} />
      </mesh>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Canvas shadows camera={{ position: [0, 1.5, DIST], fov: 42 }} gl={{ toneMappingExposure: 1.1 }}>
      <Scene />
    </Canvas>
  </StrictMode>,
);
