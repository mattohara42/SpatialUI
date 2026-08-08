import type {
  Blight,
  Domain,
  EcosystemEdge,
  EcosystemNode,
  EcosystemState,
  EdgeKind,
  Polarity,
} from '../ecosystem/types';
import {
  HOUR_MS,
  createHistory,
  record,
  type VitalsHistory,
} from '../ecosystem/history';
import type { PlantingType } from '../ecosystem/planting';
import { mulberry32, type Rng } from '../lsystem/random';

/**
 * Deterministic fake ecosystem. Lets the whole scene be built and tuned with no
 * Prometheus, no notes vault, and no log pipeline.
 */

export interface MockOptions {
  seed?: number;
  bedsPerGarden?: number;
  plantsPerBed?: number;
  /** Fraction of plants that start unhealthy. */
  blightRate?: number;
  /** Edges per garden, as a multiple of plant count. */
  edgeDensity?: number;
  /** Hours of backfilled history per plant. */
  historyHours?: number;
}

interface BedSpec {
  label: string;
  planting: PlantingType;
}

interface GardenSpec {
  id: string;
  label: string;
  domain: Domain;
  polarity: Polarity;
  edgeKind: EdgeKind;
  directed: boolean;
  beds: BedSpec[];
  plants: string[];
  blights: string[];
}

/**
 * Four gardens, chosen to exercise the awkward cases rather than the easy ones.
 * `threats` is suppress-polarity, where a thriving plant is bad news, and
 * `portfolio` leans on trend, where the delta matters more than the level.
 */
const GARDENS: GardenSpec[] = [
  {
    id: 'infrastructure',
    label: 'Infrastructure',
    domain: 'devops',
    polarity: 'nurture',
    edgeKind: 'depends',
    directed: true,
    beds: [
      { label: 'checkout', planting: 'orchard' },
      { label: 'identity', planting: 'conifer-stand' },
      { label: 'ingest', planting: 'hedge' },
    ],
    plants: ['api', 'worker', 'cache', 'gateway', 'scheduler', 'db-proxy'],
    blights: [
      'p99 latency above 800ms for 12 minutes',
      'restart loop, 4 restarts in 5 minutes',
      'memory working set at 94% of limit',
    ],
  },
  {
    id: 'vault',
    label: 'Vault',
    domain: 'pkm',
    polarity: 'nurture',
    edgeKind: 'links',
    directed: true,
    beds: [
      { label: 'research', planting: 'wildflower-meadow' },
      { label: 'projects', planting: 'orchard' },
      { label: 'reading', planting: 'flower-border' },
    ],
    plants: ['spatial-ui', 'l-systems', 'shaders', 'hand-tracking', 'archive'],
    blights: [
      '7 outbound links resolve to nothing',
      'untouched for 14 months',
      'orphaned, nothing links here',
    ],
  },
  {
    id: 'threats',
    label: 'Threats',
    domain: 'security',
    polarity: 'suppress',
    edgeKind: 'correlates',
    directed: false,
    beds: [
      { label: 'perimeter', planting: 'thicket' },
      { label: 'endpoints', planting: 'thicket' },
      { label: 'identity-logs', planting: 'thicket' },
    ],
    plants: ['auth-failures', 'egress', 'priv-escalation', 'scanners'],
    blights: [
      '340 failed logins from one ASN',
      'egress to an address seen for the first time',
      'privilege grant outside change window',
    ],
  },
  {
    id: 'portfolio',
    label: 'Portfolio',
    domain: 'markets',
    polarity: 'nurture',
    edgeKind: 'correlates',
    directed: false,
    beds: [
      { label: 'semis', planting: 'orchard' },
      { label: 'energy', planting: 'conifer-stand' },
      { label: 'financials', planting: 'grove' },
    ],
    plants: ['core', 'satellite', 'hedge', 'income'],
    blights: [
      'down 6.2% on the day',
      'below the 200 day average',
      'dividend cut announced',
    ],
  },
];

export function generateMockEcosystem(options: MockOptions = {}): EcosystemState {
  const {
    seed = 1337,
    bedsPerGarden = 3,
    plantsPerBed = 5,
    blightRate = 0.25,
    edgeDensity = 0.8,
    historyHours = 168,
  } = options;

  const rng = mulberry32(seed);
  const nodes: Record<string, EcosystemNode> = {};
  const edges: Record<string, EcosystemEdge> = {};
  const history: Record<string, VitalsHistory> = {};
  const now = Date.now();

  for (const garden of GARDENS) {
    nodes[garden.id] = {
      id: garden.id,
      parentId: null,
      gardenId: garden.id,
      label: garden.label,
      domain: garden.domain,
      kind: 'garden',
      polarity: garden.polarity,
      vitality: 1,
      activity: 0.3,
      maturity: 1,
      trend: 0,
      blights: [],
      updatedAt: now,
    };

    const plantIds: string[] = [];

    for (let b = 0; b < Math.min(bedsPerGarden, garden.beds.length); b++) {
      const bed = garden.beds[b];
      const bedLabel = bed.label;
      const bedId = `${garden.id}/${bedLabel}`;

      nodes[bedId] = {
        id: bedId,
        parentId: garden.id,
        gardenId: garden.id,
        label: bedLabel,
        domain: garden.domain,
        kind: 'bed',
        polarity: garden.polarity,
        plantingType: bed.planting,
        vitality: 1,
        activity: 0.3,
        maturity: 1,
        trend: 0,
        blights: [],
        updatedAt: now,
      };

      for (let p = 0; p < plantsPerBed; p++) {
        const label = `${garden.plants[p % garden.plants.length]}-${p + 1}`;
        const id = `${bedId}/${label}`;
        const sick = rng() < blightRate;
        const vitality = sick ? rng() * 0.5 : 0.6 + rng() * 0.4;

        nodes[id] = {
          id,
          parentId: bedId,
          gardenId: garden.id,
          label,
          domain: garden.domain,
          kind: 'plant',
          polarity: garden.polarity,
          vitality,
          activity: rng(),
          maturity: 0.2 + rng() * 0.8,
          trend: (rng() * 2 - 1) * 0.4,
          blights: sick ? [makeBlight(garden, vitality, rng, now)] : [],
          updatedAt: now,
          raw: { note: 'mock node, no upstream source' },
        };
        history[id] = backfillHistory(nodes[id], historyHours, now, rng);
        plantIds.push(id);
      }

      rollUp(nodes, bedId);
    }

    const edgeCount = Math.round(plantIds.length * edgeDensity);
    for (let i = 0; i < edgeCount; i++) {
      const source = plantIds[Math.floor(rng() * plantIds.length)];
      const target = plantIds[Math.floor(rng() * plantIds.length)];
      if (source === target) continue;
      const id = `${source}->${target}`;
      if (edges[id]) continue;

      edges[id] = {
        id,
        gardenId: garden.id,
        sourceId: source,
        targetId: target,
        kind: garden.edgeKind,
        strength: 0.2 + rng() * 0.8,
        directed: garden.directed,
      };
    }

    rollUp(nodes, garden.id);
  }

  return {
    nodes,
    edges,
    history,
    activeGardenId: GARDENS[0].id,
    cursor: null,
    revision: now,
  };
}

/**
 * Advances the mock ecosystem one tick. Use this to exercise the update path at
 * a realistic cadence before any adapter exists. Edges are left alone, since
 * real topology changes far more slowly than metrics do.
 */
export function tickMockEcosystem(
  state: EcosystemState,
  drift = 0.04,
  rng: Rng = Math.random,
): EcosystemState {
  const now = Date.now();
  const nodes: Record<string, EcosystemNode> = {};

  for (const [id, node] of Object.entries(state.nodes)) {
    if (node.kind !== 'plant') {
      nodes[id] = node;
      continue;
    }
    const delta = (rng() * 2 - 1) * drift;
    nodes[id] = {
      ...node,
      vitality: clamp01(node.vitality + delta),
      activity: clamp01(node.activity + (rng() * 2 - 1) * drift * 3),
      trend: clamp(delta / drift, -1, 1),
      updatedAt: now,
    };
  }

  for (const node of Object.values(nodes)) {
    if (node.kind === 'bed' || node.kind === 'garden') rollUp(nodes, node.id);
  }

  // Buffers are mutated in place. They are typed arrays outside React's concern,
  // and copying 168 slots per node per tick would be pure waste.
  for (const node of Object.values(nodes)) {
    const buffer = state.history[node.id];
    if (buffer) record(buffer, now, node);
  }

  return { ...state, nodes, revision: now };
}

/**
 * Walks backwards from the node's present vitals, so the series ends exactly at
 * what the scene is showing now.
 */
function backfillHistory(
  node: EcosystemNode,
  hours: number,
  now: number,
  rng: Rng,
): VitalsHistory {
  const buffer = createHistory(HOUR_MS, Math.max(1, hours));
  let vitality = node.vitality;
  let activity = node.activity;

  for (let h = 0; h < hours; h++) {
    const at = now - h * HOUR_MS;
    const delta = (rng() * 2 - 1) * 0.05;
    record(buffer, at, {
      vitality,
      activity,
      maturity: node.maturity,
      trend: clamp(-delta / 0.05, -1, 1),
    });
    vitality = clamp01(vitality - delta);
    activity = clamp01(activity + (rng() * 2 - 1) * 0.12);
  }
  return buffer;
}

/** A container summarizes its children, so a bed reads as an at-a-glance total. */
function rollUp(nodes: Record<string, EcosystemNode>, parentId: string): void {
  const children = Object.values(nodes).filter((n) => n.parentId === parentId);
  if (children.length === 0) return;
  const parent = nodes[parentId];
  nodes[parentId] = {
    ...parent,
    vitality: mean(children.map((c) => c.vitality)),
    activity: mean(children.map((c) => c.activity)),
    trend: mean(children.map((c) => c.trend)),
    updatedAt: Date.now(),
  };
}

function makeBlight(
  garden: GardenSpec,
  vitality: number,
  rng: Rng,
  now: number,
): Blight {
  return {
    id: `blight-${Math.floor(rng() * 1e9).toString(36)}`,
    severity: vitality < 0.15 ? 'critical' : vitality < 0.35 ? 'error' : 'warn',
    message: garden.blights[Math.floor(rng() * garden.blights.length)],
    since: now - Math.floor(rng() * 3_600_000),
    remediable: garden.domain === 'devops',
  };
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / (values.length || 1);
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

function clamp01(n: number): number {
  return clamp(n, 0, 1);
}
