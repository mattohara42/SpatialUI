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
