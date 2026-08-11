import { describe, expect, it } from 'vitest';
import { parseInstantVector } from '../adapters/prometheus/query';
import {
  LATENCY_RESPONSE,
  LATENCY_RESPONSE_LATER,
  UP_RESPONSE,
} from '../adapters/prometheus/fixtures';
import type { PromSnapshot } from '../adapters/prometheus/types';
import {
  promBedId,
  promNodeId,
  readSeries,
  scale,
  translatePromSnapshot,
  type PromMapping,
} from './prometheus';

/**
 * Latency in seconds, lower is better. The scale runs backwards (min above max):
 * 30ms reads as thriving, anything past a second as dying. Polarity stays
 * `nurture` — we want low latency, so a fast target is a healthy tree, not a
 * weed. This is the mapping that exercises the inverted scale.
 */
const LATENCY_MAPPING: PromMapping = {
  gardenId: 'prom-demo',
  gardenLabel: 'Demo Prometheus',
  idLabel: 'instance',
  bedLabel: 'job',
  vitality: { min: 1.0, max: 0.02 }, // 1s → 0, 20ms → 1
  polarity: 'nurture',
  planting: 'conifer-stand',
};

function snapshotFrom(metric = LATENCY_RESPONSE, up = UP_RESPONSE): PromSnapshot {
  return {
    fetchedAt: 1_723_334_400_000,
    series: parseInstantVector(metric),
    up: parseInstantVector(up),
    provenance: { kind: 'captured', query: 'probe_duration_seconds', note: 'fixture' },
  };
}

describe('scale', () => {
  it('maps a value onto [0, 1] between min and max', () => {
    expect(scale(50, { min: 0, max: 100 })).toBeCloseTo(0.5);
    expect(scale(-10, { min: 0, max: 100 })).toBe(0); // clamped
    expect(scale(999, { min: 0, max: 100 })).toBe(1);
  });

  it('runs backwards when min is above max, so "lower is better" needs no flag', () => {
    // A latency scale: small is healthy.
    const s = { min: 1.0, max: 0.02 };
    expect(scale(0.02, s)).toBeCloseTo(1);
    expect(scale(1.0, s)).toBeCloseTo(0);
    expect(scale(0.51, s)).toBeCloseTo(0.5, 1);
  });

  it('a degenerate scale reads as the neutral middle rather than dividing by zero', () => {
    expect(scale(5, { min: 3, max: 3 })).toBe(0.5);
  });
});

describe('readSeries', () => {
  const sample = { labels: { instance: 'x' }, value: 0.5, at: 0 };

  it('derives trend from the previous poll, not from the level', () => {
    const now = readSeries(sample, LATENCY_MAPPING); // vitality ~0.51
    // No previous reading means no past to have moved from.
    expect(now.trend).toBe(0);

    // Latency halved since last poll: vitality up, trend positive.
    const improved = readSeries(sample, LATENCY_MAPPING, 0.2);
    expect(improved.trend).toBeGreaterThan(0);
    // ...and worsening reads negative.
    const worsened = readSeries(sample, LATENCY_MAPPING, 0.8);
    expect(worsened.trend).toBeLessThan(0);
  });

  it('holds maturity constant and away from the health axes', () => {
    expect(readSeries(sample, LATENCY_MAPPING).maturity).toBe(0.5);
    expect(readSeries(sample, { ...LATENCY_MAPPING, maturity: 0.9 }).maturity).toBe(0.9);
  });
});

describe('translatePromSnapshot', () => {
  it('builds a garden of beds-per-job and plants-per-instance', () => {
    const { nodes } = translatePromSnapshot(snapshotFrom(), LATENCY_MAPPING);

    const garden = nodes['prom-demo'];
    expect(garden.kind).toBe('garden');

    // Two jobs → two beds; three instances → three plants.
    const beds = Object.values(nodes).filter((n) => n.kind === 'bed');
    const plants = Object.values(nodes).filter((n) => n.kind === 'plant');
    expect(beds.map((b) => b.label).sort()).toEqual(['node', 'prometheus']);
    expect(plants).toHaveLength(3);

    // A plant sits under its job's bed and wears its instance as a name.
    const nodeA = nodes[promNodeId('prom-demo', 'node-a:9100')];
    expect(nodeA.parentId).toBe(promBedId('prom-demo', 'node'));
    expect(nodeA.label).toBe('node-a:9100');
    expect(nodeA.emblem).toBeDefined();
  });

  it('reads a fast target as thriving and a slow one as wilting', () => {
    const { nodes } = translatePromSnapshot(snapshotFrom(), LATENCY_MAPPING);

    const fast = nodes[promNodeId('prom-demo', 'demo:9090')]; // 42ms
    const slow = nodes[promNodeId('prom-demo', 'node-b:9100')]; // 950ms
    expect(fast.vitality).toBeGreaterThan(0.9);
    expect(slow.vitality).toBeLessThan(0.1);
  });

  it('turns up{} 0 into a down blight and stops that plant’s clock', () => {
    const snapshot = snapshotFrom();
    const { nodes } = translatePromSnapshot(snapshot, LATENCY_MAPPING);

    const down = nodes[promNodeId('prom-demo', 'node-b:9100')]; // up == 0
    expect(down.blights).toHaveLength(1);
    expect(down.blights[0].severity).toBe('critical');

    const live = nodes[promNodeId('prom-demo', 'demo:9090')]; // up == 1
    expect(live.blights).toHaveLength(0);

    // The down plant's clock is its sample time, not the poll time, so it greys
    // as the silence up{} declares rather than staying fresh because we asked.
    const nodeBSample = snapshot.series.find((s) => s.labels.instance === 'node-b:9100')!;
    expect(down.updatedAt).toBe(nodeBSample.at);
  });

  it('records one live sample and invents no archive', () => {
    const { history, archive } = translatePromSnapshot(snapshotFrom(), LATENCY_MAPPING);

    const buffer = history[promNodeId('prom-demo', 'demo:9090')];
    expect(buffer.latestSlot).toBeGreaterThanOrEqual(0); // one real sample
    // A genuinely-live source cannot backfill months from an instant query.
    expect(Object.keys(archive)).toHaveLength(0);
  });

  it('threads previous vitality so trend is a delta across polls', () => {
    const first = translatePromSnapshot(snapshotFrom(), LATENCY_MAPPING);
    const previous: Record<string, number> = {};
    for (const node of Object.values(first.nodes)) {
      if (node.kind === 'plant') previous[node.id] = node.vitality;
    }

    // node-a slowed 180ms → 620ms: vitality falls, so trend must be negative.
    const second = translatePromSnapshot(
      snapshotFrom(LATENCY_RESPONSE_LATER),
      LATENCY_MAPPING,
      { asOf: 1_723_334_460_000, previous },
    );
    const nodeA = second.nodes[promNodeId('prom-demo', 'node-a:9100')];
    expect(nodeA.trend).toBeLessThan(0);

    // demo eased 42ms → 30ms: already near the ceiling, so trend is >= 0.
    const demo = second.nodes[promNodeId('prom-demo', 'demo:9090')];
    expect(demo.trend).toBeGreaterThanOrEqual(0);
  });

  it('a suppress mapping makes a rising metric read as alarm', () => {
    // Same latency numbers, but declared suppress with a rising-is-bad scale:
    // this is the error-rate framing, where a big number is a thriving weed.
    const errorRate: PromMapping = {
      ...LATENCY_MAPPING,
      vitality: { min: 0, max: 1 }, // bigger value → higher vitality (as a weed)
      polarity: 'suppress',
    };
    const { nodes } = translatePromSnapshot(snapshotFrom(), errorRate);
    const worst = nodes[promNodeId('prom-demo', 'node-b:9100')]; // 0.95
    // The node's own vitality is high; polarity is what the renderer inverts.
    expect(worst.vitality).toBeGreaterThan(0.9);
    expect(worst.polarity).toBe('suppress');
  });
});
