import type {
  Blight,
  Completion,
  Domain,
  EcosystemEdge,
  EcosystemNode,
  EcosystemState,
  EdgeKind,
  Polarity,
} from '../ecosystem/types';
import {
  DAY_MS,
  DEFAULT_ARCHIVE_CAPACITY,
  HOUR_MS,
  createHistory,
  record,
  type VitalsHistory,
} from '../ecosystem/history';
import { COMPLETION_WINDOW_MS } from '../ecosystem/completion';
import { emblemFrom } from '../ecosystem/labels';
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
  /** Days of backfilled coarse history per plant, for the season scrub. */
  archiveDays?: number;
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
  /**
   * Whether this garden's plants finish units of work — builds, in the pipelines
   * garden — and so bear completions. Its beds use plantings that carry no
   * decorative produce, so fruit here means one thing only: a completion. See
   * `docs/completion.md`, the "separate by garden" rule.
   */
  completions?: boolean;
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
      { label: 'projects', planting: 'vegetable-rows' },
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
    id: 'pipelines',
    label: 'Pipelines',
    domain: 'devops',
    polarity: 'nurture',
    edgeKind: 'depends',
    directed: true,
    // Plantings that bear no decorative produce, so the only fruit here is a
    // completion — the "separate by garden" rule from docs/completion.md, kept by
    // construction rather than by a runtime check.
    beds: [
      { label: 'web', planting: 'orchard' },
      { label: 'api', planting: 'conifer-stand' },
      { label: 'infra', planting: 'hedge' },
    ],
    plants: ['build', 'test', 'deploy', 'lint', 'e2e', 'release'],
    blights: [
      'main red for the last 3 builds',
      'flaky: 40% failure over 20 runs',
      'queue backed up, 12 builds waiting',
    ],
    completions: true,
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
      { label: 'energy', planting: 'topiary' },
      { label: 'financials', planting: 'vineyard' },
    ],
    plants: ['core', 'satellite', 'hedge', 'income'],
    blights: [
      'down 6.2% on the day',
      'below the 200 day average',
      'dividend cut announced',
    ],
  },
];

/**
 * How long ago the silent plant last reported.
 *
 * One plant in each garden has a dead adapter. Without it the mock never
 * exercises the failure the whole design is built around — silence looking like
 * health — so the staleness state (grey, still, and dusty) could only be seen by
 * hand-editing data. Ninety-five minutes is comfortably past the fifteen minute
 * fallback threshold, far enough that the dust has reached full thickness rather
 * than sitting on the ramp.
 *
 * It must also be **longer than one history step**, and that is not a
 * preference. History is hourly, and a silence of fifty-five minutes — what this
 * was — lands in the same hourly slot as now whenever the clock happens to read
 * past the fifty-fifth minute. For those five minutes in every hour the silent
 * plant's history had no gap in it at all: the scrub would have shown a reading
 * where there was none, which is precisely the failure the staleness state
 * exists to make impossible. Anything over an hour cannot land in the same slot.
 */
const SILENT_FOR_MS = 95 * 60_000;

/**
 * Whether the mock marked this node as having a dead adapter. `raw` is opaque to
 * every other layer by contract, and this module wrote it, so it is the one
 * place allowed to know its shape.
 */
function isSilent(node: EcosystemNode): boolean {
  return (node.raw as { silent?: boolean } | undefined)?.silent === true;
}

/**
 * Whether this module owns the node.
 *
 * The store composes the mock gardens with translated ones — the NFL league sits
 * alongside them — and a drift tick that wandered into real data would invent
 * results nobody played. Ownership is by garden rather than by a marker on the
 * node, because beds and gardens carry no `raw` of their own and they roll up
 * too.
 */
const MOCK_GARDEN_IDS = new Set(GARDENS.map((g) => g.id));

function isMock(node: EcosystemNode): boolean {
  return MOCK_GARDEN_IDS.has(node.gardenId);
}

export function generateMockEcosystem(options: MockOptions = {}): EcosystemState {
  const {
    seed = 1337,
    bedsPerGarden = 3,
    plantsPerBed = 5,
    blightRate = 0.18,
    edgeDensity = 0.8,
    historyHours = 168,
    archiveDays = DEFAULT_ARCHIVE_CAPACITY,
  } = options;

  const rng = mulberry32(seed);
  const nodes: Record<string, EcosystemNode> = {};
  const edges: Record<string, EcosystemEdge> = {};
  const history: Record<string, VitalsHistory> = {};
  const archive: Record<string, VitalsHistory> = {};
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
        // The last plant of the first bed has stopped reporting. Deterministic
        // rather than random, so the stale plant is always in the same place and
        // the state is easy to go and look at.
        const silent = b === 0 && p === plantsPerBed - 1;
        const reportedAt = silent ? now - SILENT_FOR_MS : now;
        // A garden should read as mostly thriving with a few plants in trouble,
        // not as a field of the dying. Healthy plants sit high; sick ones sit
        // low but not flat, so they wilt rather than read as dead on arrival.
        const vitality = sick ? 0.2 + rng() * 0.35 : 0.68 + rng() * 0.32;

        nodes[id] = {
          id,
          parentId: bedId,
          gardenId: garden.id,
          label,
          // A source with no marks of its own takes the default deliberately,
          // which is what "translation chooses the emblem" means for a source
          // that has nothing to choose: initials on a colour keyed to the id,
          // fixed for the life of the node. A real adapter with an abbreviation
          // and a brand colour passes those instead — see `emblemFor` in
          // translation/nfl.ts.
          emblem: emblemFrom(label, id),
          domain: garden.domain,
          kind: 'plant',
          polarity: garden.polarity,
          vitality,
          activity: rng(),
          maturity: 0.2 + rng() * 0.8,
          trend: (rng() * 2 - 1) * 0.4,
          blights: sick ? [makeBlight(garden, vitality, rng, now)] : [],
          // A pipeline bears the builds it has finished lately. A silent one has
          // a dead adapter, so it finished nothing and bears nothing.
          completions:
            garden.completions && !silent ? makeCompletions(id, rng, now) : undefined,
          updatedAt: reportedAt,
          raw: { note: 'mock node, no upstream source', mock: true, silent },
        };
        // History stops when the adapter did, so scrubbing back through a silent
        // plant shows the gap rather than a series that quietly kept going.
        history[id] = backfillHistory(
          nodes[id],
          HOUR_MS,
          historyHours,
          reportedAt,
          rng,
        );
        // And a season of it at a day a slot, so the mock gardens answer the
        // season scrub too. Without this they would fall through to live and
        // show today's garden while the sky said November — silence looking
        // like health, one layer up.
        archive[id] = backfillHistory(
          nodes[id],
          DAY_MS,
          archiveDays,
          reportedAt,
          rng,
        );
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
    archive,
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
    // A silent node stays silent: its adapter is dead, so it neither drifts nor
    // refreshes its timestamp, and it goes on ageing while everything around it
    // reports. That is the whole point of it. Nodes this module did not generate
    // are left strictly alone.
    if (node.kind !== 'plant' || !isMock(node) || isSilent(node)) {
      nodes[id] = node;
      continue;
    }
    const delta = (rng() * 2 - 1) * drift;
    // A pipeline finishes a build now and then, so fruit and deadwood accrue
    // live; the list is trimmed to the visible window so it cannot grow without
    // bound across a long sitting.
    let completions = node.completions;
    if (completions && rng() < 0.14) {
      completions = trimCompletions([...completions, makeBuild(id, rng, now)], now);
    }
    nodes[id] = {
      ...node,
      vitality: clamp01(node.vitality + delta),
      activity: clamp01(node.activity + (rng() * 2 - 1) * drift * 3),
      trend: clamp(delta / drift, -1, 1),
      completions,
      updatedAt: now,
    };
  }

  for (const node of Object.values(nodes)) {
    if (!isMock(node)) continue;
    if (node.kind === 'bed' || node.kind === 'garden') rollUp(nodes, node.id);
  }

  // Buffers are mutated in place. They are typed arrays outside React's concern,
  // and copying 168 slots per node per tick would be pure waste.
  for (const node of Object.values(nodes)) {
    if (!isMock(node)) continue;
    const buffer = state.history[node.id];
    if (buffer) record(buffer, now, node);
  }

  return { ...state, nodes, revision: now };
}

/**
 * Walks backwards from the node's present vitals, so the series ends exactly at
 * what the scene is showing now.
 *
 * The step is a parameter so the same walk fills both grains — hourly for the
 * week, daily for the season. A day's drift is wider than an hour's, because a
 * service that moved 5% in an hour has moved further than that by the same time
 * tomorrow, and a season of hour-sized steps would be a flat line with a
 * tremor.
 */
function backfillHistory(
  node: EcosystemNode,
  stepMs: number,
  steps: number,
  now: number,
  rng: Rng,
): VitalsHistory {
  const buffer = createHistory(stepMs, Math.max(1, steps));
  const drift = stepMs >= DAY_MS ? 0.16 : 0.05;
  let vitality = node.vitality;
  let activity = node.activity;

  for (let h = 0; h < steps; h++) {
    const at = now - h * stepMs;
    const delta = (rng() * 2 - 1) * drift;
    record(buffer, at, {
      vitality,
      activity,
      maturity: node.maturity,
      trend: clamp(-delta / drift, -1, 1),
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

/** How often a mock build goes red. Low, so a pipeline reads as mostly fruit
 *  with the occasional length of deadwood — a bad build among good ones. */
const BUILD_FAIL_RATE = 0.22;

/** One finished build, at a given time. */
function makeBuild(plantId: string, rng: Rng, at: number): Completion {
  const failed = rng() < BUILD_FAIL_RATE;
  return {
    id: `${plantId}#${at}-${Math.floor(rng() * 1e6).toString(36)}`,
    at,
    outcome: failed ? 'failed' : 'done',
    label: `build ${1000 + Math.floor(rng() * 9000)}`,
    evidence: 'mock pipeline, no upstream CI',
  };
}

/**
 * A recent run of builds for a pipeline, spread across the visible window so a
 * plant opens with fruit already on it rather than waiting for the drift tick.
 */
function makeCompletions(plantId: string, rng: Rng, now: number): Completion[] {
  const count = 3 + Math.floor(rng() * 8); // 3..10
  const out: Completion[] = [];
  for (let i = 0; i < count; i++) {
    const at = now - Math.floor(rng() * (COMPLETION_WINDOW_MS - HOUR_MS));
    out.push(makeBuild(plantId, rng, at));
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Drop builds that have aged out of the window, and cap the list so a busy
 *  pipeline's array cannot grow without bound over a long sitting. */
function trimCompletions(completions: Completion[], now: number): Completion[] {
  const live = completions.filter((c) => now - c.at <= COMPLETION_WINDOW_MS);
  return live.length > 40 ? live.slice(live.length - 40) : live;
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
