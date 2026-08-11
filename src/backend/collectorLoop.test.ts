import { describe, expect, it } from 'vitest';
import { createCollectorLoop } from './collectorLoop';
import { memoryStorage } from './storage';
import { promRegistry } from './registry';
import { STORAGE_KEY } from '../state/collector';
import {
  PROM_MOCK_MAPPING,
  PROM_MOCK_QUERY,
  mockPromFetch,
} from '../adapters/prometheus/mock';
import type { FetchLike } from '../adapters/prometheus/query';

const SCRAPE = 15_000;

function loopAt(clock: () => number, storage = memoryStorage()) {
  const registry = promRegistry([
    {
      id: 'prometheus',
      query: PROM_MOCK_QUERY,
      mapping: PROM_MOCK_MAPPING,
      scrapeIntervalMs: SCRAPE,
    },
  ]);
  return {
    loop: createCollectorLoop({
      registry,
      fetchImpl: mockPromFetch(clock),
      storage,
      now: clock(),
    }),
    storage,
  };
}

describe('createCollectorLoop', () => {
  it('primes an unseen source on the first tick and produces a garden of plants', async () => {
    const t0 = 1_000_000;
    const { loop } = loopAt(() => t0);

    const advanced = await loop.tick(t0);

    expect(advanced).toContain('prometheus');
    const plants = Object.values(loop.nodes).filter((n) => n.kind === 'plant');
    expect(plants.length).toBeGreaterThan(0);
    for (const plant of plants) {
      expect(plant.vitality).toBeGreaterThanOrEqual(0);
      expect(plant.vitality).toBeLessThanOrEqual(1);
    }
  });

  it('does not re-fetch before the scrape interval is owed', async () => {
    const t0 = 1_000_000;
    const { loop } = loopAt(() => t0);
    await loop.tick(t0);

    // A tick a beat later, well inside the interval: nothing is due.
    const advanced = await loop.tick(t0 + 2_000);
    expect(advanced).toEqual([]);
  });

  it('re-fetches once the interval has elapsed', async () => {
    let now = 1_000_000;
    const { loop } = loopAt(() => now);
    await loop.tick(now);

    now += SCRAPE + 1;
    const advanced = await loop.tick(now);
    expect(advanced).toContain('prometheus');
  });

  it('writes an ObservedRecord that a fresh loop restores from the same storage', async () => {
    const t0 = 1_000_000;
    const { loop, storage } = loopAt(() => t0);
    await loop.tick(t0);
    expect(loop.flush(t0)).toBe(true);

    const stored = storage.getItem(STORAGE_KEY);
    expect(stored).toBeTruthy();
    const record = JSON.parse(stored!);
    // Sparse per-node series were written for the fleet.
    expect(Object.keys(record.fine).length).toBeGreaterThan(0);

    // A second loop over the same storage loads what the first wrote.
    const second = createCollectorLoop({
      registry: promRegistry([
        { id: 'prometheus', query: PROM_MOCK_QUERY, mapping: PROM_MOCK_MAPPING, scrapeIntervalMs: SCRAPE },
      ]),
      fetchImpl: mockPromFetch(() => t0),
      storage,
      now: t0,
    });
    expect(Object.keys(second.collector.record.fine).length).toBeGreaterThan(0);
  });

  it('recovers a source that primes empty instead of wedging its garden forever', async () => {
    // A fetch that answers empty until t >= 1_010_000, then reports the fleet.
    let now = 1_000_000;
    const base = mockPromFetch(() => now);
    const emptyThenFull: FetchLike = async (url) => {
      if (now < 1_010_000) {
        return { ok: true, status: 200, json: async () => ({ status: 'success', data: { resultType: 'vector', result: [] } }) };
      }
      return base(url);
    };
    const registry = promRegistry([
      { id: 'prometheus', query: PROM_MOCK_QUERY, mapping: PROM_MOCK_MAPPING, scrapeIntervalMs: SCRAPE },
    ]);
    const loop = createCollectorLoop({ registry, fetchImpl: emptyThenFull, storage: memoryStorage(), now });

    await loop.tick(now); // primes empty
    expect(Object.values(loop.nodes).filter((n) => n.kind === 'plant')).toHaveLength(0);

    now += SCRAPE + 1; // schedule says a reading is owed again
    await loop.tick(now);
    // The garden did not wedge: once the source had plants, the loop picked them up.
    expect(Object.values(loop.nodes).filter((n) => n.kind === 'plant').length).toBeGreaterThan(0);
  });

  it('drops a plant that disappears from a source rather than ghosting it', async () => {
    let now = 1_000_000;
    let dropOne = false;
    const base = mockPromFetch(() => now);
    const droppable: FetchLike = async (url) => {
      const res = await base(url);
      if (!dropOne) return res;
      const body = (await res.json()) as unknown as {
        data: { result: Array<{ metric: Record<string, string> }> };
      };
      // Remove one instance from the result set, as a decommissioned target would.
      body.data.result = body.data.result.filter((e) => e.metric.instance !== 'api-1:8080');
      return { ok: true, status: 200, json: async () => body };
    };
    const registry = promRegistry([
      { id: 'prometheus', query: PROM_MOCK_QUERY, mapping: PROM_MOCK_MAPPING, scrapeIntervalMs: SCRAPE },
    ]);
    const loop = createCollectorLoop({ registry, fetchImpl: droppable, storage: memoryStorage(), now });

    await loop.tick(now);
    const before = Object.values(loop.nodes).filter((n) => n.kind === 'plant').length;

    dropOne = true;
    now += SCRAPE + 1;
    await loop.tick(now);
    const after = Object.values(loop.nodes).filter((n) => n.kind === 'plant').length;
    expect(after).toBe(before - 1);
  });

  it('does not advance when the upstream fetch fails, leaving staleness to grey the garden', async () => {
    const registry = promRegistry([
      { id: 'prometheus', query: PROM_MOCK_QUERY, mapping: PROM_MOCK_MAPPING, scrapeIntervalMs: SCRAPE },
    ]);
    const failing: FetchLike = () => {
      throw new Error('unreachable');
    };
    const loop = createCollectorLoop({ registry, fetchImpl: failing, storage: memoryStorage(), now: 0 });

    const advanced = await loop.tick(0);
    expect(advanced).toEqual([]);
    expect(Object.keys(loop.nodes).length).toBe(0);
  });
});
