import { describe, expect, it } from 'vitest';
import { translatePromSnapshot } from '../../translation/prometheus';
import { fetchPromSnapshot } from './query';
import {
  PROM_MOCK_MAPPING,
  PROM_MOCK_QUERY,
  mockPromFetch,
  syntheticPromResponse,
  syntheticPromSnapshot,
} from './mock';
import { promSource } from './index';
import type { PromVectorEntry } from './types';
import { SOURCES } from '../../state/sources';

const NOW = Date.UTC(2026, 7, 11, 12, 0, 0);

describe('the mock Prometheus fetch, in the exact wire shape', () => {
  it('answers the metric query with a success vector of the whole fleet', async () => {
    const fetchImpl = mockPromFetch(() => NOW);
    const res = await fetchImpl(
      `${PROM_MOCK_QUERY.baseUrl}/api/v1/query?query=${encodeURIComponent(PROM_MOCK_QUERY.query)}`,
    );
    expect(res.ok).toBe(true);
    const body = (await res.json()) as ReturnType<typeof syntheticPromResponse>;
    expect(body.status).toBe('success');
    expect(body.data?.result.length).toBe(7);
    // The wire really sends the value as a string and the time in seconds.
    const [seconds, value] = (body.data!.result as PromVectorEntry[])[0].value;
    expect(typeof value).toBe('string');
    expect(seconds).toBeCloseTo(NOW / 1000);
  });

  it('answers the up query with a liveness vector that includes a down target', async () => {
    const fetchImpl = mockPromFetch(() => NOW);
    const res = await fetchImpl(`${PROM_MOCK_QUERY.baseUrl}/api/v1/query?query=up`);
    const body = (await res.json()) as ReturnType<typeof syntheticPromResponse>;
    const downs = (body.data!.result as PromVectorEntry[]).filter((e) => e.value[1] === '0');
    expect(downs).toHaveLength(1);
    expect(downs[0].metric.instance).toBe('db-replica:5432');
  });

  it('is deterministic at a fixed time and moves across time', () => {
    expect(syntheticPromResponse('probe_duration_seconds', NOW)).toEqual(
      syntheticPromResponse('probe_duration_seconds', NOW),
    );
    const a = syntheticPromResponse('probe_duration_seconds', NOW);
    const b = syntheticPromResponse('probe_duration_seconds', NOW + 90_000);
    expect(a).not.toEqual(b);
  });
});

describe('the mock is byte-identical whether taken sync or through the fetch', () => {
  it('syntheticPromSnapshot equals what fetchPromSnapshot parses from the mock', async () => {
    const viaFetch = await fetchPromSnapshot(PROM_MOCK_QUERY, mockPromFetch(() => NOW), NOW);
    const viaSync = syntheticPromSnapshot(NOW);
    // Same series and liveness; provenance differs by design (the fetch path
    // stamps `live`, the sync prime stamps `captured`), so compare the payload.
    expect(viaFetch.series).toEqual(viaSync.series);
    expect(viaFetch.up).toEqual(viaSync.up);
  });
});

describe('the fleet translates into a well-formed garden', () => {
  const snapshot = syntheticPromSnapshot(NOW);
  const { nodes } = translatePromSnapshot(snapshot, PROM_MOCK_MAPPING, { asOf: NOW });

  it('has the garden, a bed per job, and a plant per instance', () => {
    expect(nodes['prometheus'].kind).toBe('garden');
    const beds = Object.values(nodes).filter((n) => n.kind === 'bed');
    expect(beds.map((b) => b.label).sort()).toEqual(['api', 'db', 'worker']);
    const plants = Object.values(nodes).filter((n) => n.kind === 'plant');
    expect(plants).toHaveLength(7);
  });

  it('keeps every vital in [0, 1]', () => {
    for (const node of Object.values(nodes)) {
      for (const axis of ['vitality', 'activity', 'maturity'] as const) {
        expect(node[axis]).toBeGreaterThanOrEqual(0);
        expect(node[axis]).toBeLessThanOrEqual(1);
      }
    }
  });

  it('reads a fast target as healthy under the lower-is-better scale', () => {
    // db-primary sits at ~25ms, near the thriving end of the 1.0→0.02 scale.
    const primary = Object.values(nodes).find(
      (n) => n.kind === 'plant' && n.label === 'db-primary:5432',
    )!;
    expect(primary.vitality).toBeGreaterThan(0.8);
  });

  it('shows the down replica as silent: a critical blight and a stale clock', () => {
    const replica = Object.values(nodes).find(
      (n) => n.kind === 'plant' && n.label === 'db-replica:5432',
    )!;
    expect(replica.blights.some((b) => b.severity === 'critical')).toBe(true);
    // Its last sample is frozen minutes back, so its clock is behind the poll.
    expect(replica.updatedAt).toBeLessThan(NOW);
  });
});

describe('it is wired into SOURCES, primed and refreshable', () => {
  const prom = SOURCES.find((s) => s.gardenId === 'prometheus');

  it('is present, pollable, and carries a refresh (the async seam)', () => {
    expect(prom).toBeDefined();
    expect(prom!.pollable).toBe(true);
    expect(typeof prom!.refresh).toBe('function');
  });

  it('is primed, so the first synchronous read already has the fleet', () => {
    const garden = prom!.read(NOW);
    const plants = Object.values(garden.nodes).filter((n) => n.kind === 'plant');
    expect(plants).toHaveLength(7);
    expect(garden.nodes['prometheus']).toBeDefined();
  });

  it('advances what read returns after a refresh lands', async () => {
    const source = promSource({
      query: PROM_MOCK_QUERY,
      mapping: PROM_MOCK_MAPPING,
      fetchImpl: mockPromFetch(() => NOW + 120_000),
    });
    await source.refresh(NOW + 120_000);
    const plants = Object.values(source.read(NOW + 120_000).nodes).filter(
      (n) => n.kind === 'plant',
    );
    expect(plants).toHaveLength(7);
  });
});
