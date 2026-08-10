import { describe, expect, it } from 'vitest';
import {
  RECORD_BUDGET_BYTES,
  STORAGE_KEY,
  WRITE_INTERVAL_MS,
  collectorBytes,
  createCollector,
  type CollectorStorage,
} from './collector';
import {
  COARSE_RETAINED_SLOTS,
  RECORD_SCHEMA,
  decodeRecord,
  emptyRecord,
  encodeRecord,
  observe,
  recordBytes,
  slotAt,
} from './persist';
import { DAY_MS, HOUR_MS, createHistory, sampleAt } from '../ecosystem/history';
import { observations, useEcosystem } from './ecosystemStore';
import type { EcosystemNode } from '../ecosystem/types';

const NOW = Date.UTC(2026, 5, 10, 14, 30);

const plant = (id: string, vitality = 0.6): EcosystemNode =>
  ({
    id,
    parentId: null,
    gardenId: 'g',
    label: id,
    domain: 'markets',
    kind: 'plant',
    polarity: 'nurture',
    vitality,
    activity: 0.4,
    maturity: 0.7,
    trend: -0.25,
    blights: [],
    updatedAt: NOW,
  }) as EcosystemNode;

/** A `localStorage` that can be told to misbehave the way real ones do. */
class FakeStorage implements CollectorStorage {
  items = new Map<string, string>();
  writes = 0;
  /** Bytes it will accept in one value. Infinity for an honest one. */
  quota = Infinity;
  failReads = false;

  getItem(key: string): string | null {
    if (this.failReads) throw new Error('blocked');
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (value.length > this.quota) throw new Error('QuotaExceededError');
    this.items.set(key, value);
    this.writes++;
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }
}

describe('createCollector', () => {
  it('writes on the schedule and not before it', () => {
    const storage = new FakeStorage();
    const collector = createCollector({ storage, now: NOW });

    collector.note([plant('a')], NOW + 1000);
    expect(storage.writes).toBe(0);

    collector.note([plant('a')], NOW + WRITE_INTERVAL_MS);
    expect(storage.writes).toBe(1);
  });

  it('flushes on demand whatever the schedule thinks', () => {
    const storage = new FakeStorage();
    const collector = createCollector({ storage, now: NOW });
    collector.note([plant('a')], NOW + 1000);
    expect(collector.flush(NOW + 1000)).toBe(true);
    expect(storage.writes).toBe(1);
  });

  it('carries observations across a reload', () => {
    const storage = new FakeStorage();
    const first = createCollector({ storage, now: NOW });
    first.note([plant('a', 0.42)], NOW);
    first.flush(NOW);

    const second = createCollector({ storage, now: NOW + HOUR_MS });
    expect(second.record.fine['a'].vitality).toEqual([0.42]);
  });

  /**
   * The whole point, end to end: a session watches a day, the tab closes, and
   * the next session's freshly built buffers get that day back.
   */
  it('restores a past sitting into buffers a source could not backfill', () => {
    const storage = new FakeStorage();
    const first = createCollector({ storage, now: NOW - 30 * DAY_MS });
    first.note([plant('a', 0.17)], NOW - 30 * DAY_MS);
    first.flush(NOW - 30 * DAY_MS);

    const second = createCollector({ storage, now: NOW });
    const archive = { a: createHistory(DAY_MS, COARSE_RETAINED_SLOTS) };
    expect(second.restore({}, archive).coarse).toBe(1);
    expect(sampleAt(archive['a'], NOW - 30 * DAY_MS)!.vitality).toBeCloseTo(0.17);
  });

  it('prunes what is too old to restore on the way in, not on the way out', () => {
    const storage = new FakeStorage();
    const stale = emptyRecord(NOW);
    observe(stale, [plant('a')], NOW - (COARSE_RETAINED_SLOTS + 30) * DAY_MS);
    storage.items.set(STORAGE_KEY, encodeRecord(stale));

    const collector = createCollector({ storage, now: NOW });
    expect(collector.record.coarse['a']).toBeUndefined();
  });
});

describe('storage that refuses', () => {
  it('runs in memory with no storage at all', () => {
    const collector = createCollector({ storage: null, now: NOW });
    collector.note([plant('a')], NOW);
    expect(collector.flush(NOW)).toBe(false);
    expect(collector.record.fine['a']).toBeDefined();
  });

  it('stays bounded with nowhere to write, which is the only thing holding it', () => {
    const collector = createCollector({ storage: null, now: NOW, budgetBytes: 4000 });
    const nodes = Array.from({ length: 40 }, (_, i) => plant(`n${i}`));
    for (let h = 0; h < 200; h++) collector.note(nodes, NOW + h * HOUR_MS);
    expect(collectorBytes(collector)).toBeLessThanOrEqual(4000);
  });

  it('sheds and retries when the store says the value is too big', () => {
    const storage = new FakeStorage();
    const collector = createCollector({ storage, now: NOW, budgetBytes: 100_000 });
    const nodes = Array.from({ length: 30 }, (_, i) => plant(`n${i}`));
    for (let d = 0; d < 100; d++) collector.note(nodes, NOW - d * DAY_MS);

    storage.quota = Math.round(collectorBytes(collector) * 0.7);
    expect(collector.flush(NOW)).toBe(true);
    expect(collector.writtenBytes).toBeLessThanOrEqual(storage.quota);
  });

  it('clears the key rather than leaving a record it can never replace', () => {
    const storage = new FakeStorage();
    const collector = createCollector({ storage, now: NOW });
    collector.note([plant('a')], NOW);
    collector.flush(NOW);
    expect(storage.items.has(STORAGE_KEY)).toBe(true);

    storage.quota = 0;
    expect(collector.flush(NOW + HOUR_MS)).toBe(false);
    expect(storage.items.has(STORAGE_KEY)).toBe(false);
    expect(collector.writtenBytes).toBe(0);
  });

  it('starts empty when the stored value is something else entirely', () => {
    const storage = new FakeStorage();
    storage.items.set(STORAGE_KEY, '{"someone":"else"}');
    const collector = createCollector({ storage, now: NOW });
    expect(collector.record.fine).toEqual({});
    // And clears it, so it is not competing for the same quota next write.
    expect(storage.items.has(STORAGE_KEY)).toBe(false);
  });

  it('starts empty when reading throws', () => {
    const storage = new FakeStorage();
    storage.failReads = true;
    expect(createCollector({ storage, now: NOW }).record.fine).toEqual({});
  });
});

/**
 * The wiring, which is where the one rule that cannot be checked in isolation
 * lives: what counts as having reported is decided by the caller, so only the
 * caller can get it wrong.
 */
describe('wired into the store', () => {
  it('records what a commit committed', () => {
    const state = useEcosystem.getState();
    const target = Object.values(state.nodes).find((n) => n.kind === 'plant')!;
    const at = Date.now();

    state.commit({ [target.id]: { ...target, vitality: 0.33, updatedAt: at } }, at);
    expect(observations().fine[target.id]).toBeDefined();
    expect(observations().coarse[target.id]).toBeDefined();
  });

  /**
   * The mock gardens carry one plant whose adapter is dead. It neither drifts
   * nor refreshes its timestamp, and the whole value of it is that the app
   * agrees it has stopped. A collector that wrote it down every hour as
   * reporting the same number would be inventing the exact thing the design
   * spends most of its effort refusing to invent.
   */
  it('leaves the silent plant out, because it did not report', () => {
    const silent = Object.values(useEcosystem.getState().nodes).find(
      (node) => (node.raw as { silent?: boolean } | undefined)?.silent === true,
    );
    expect(silent, 'the mock gardens should still have a silent plant').toBeDefined();

    useEcosystem.getState().tick();

    const drifted = Object.values(useEcosystem.getState().nodes).filter(
      (node) => node.kind === 'plant' && (node.raw as { mock?: boolean } | undefined)?.mock,
    );
    expect(drifted.some((node) => observations().fine[node.id])).toBe(true);
    expect(observations().fine[silent!.id]).toBeUndefined();
  });
});

describe('the budget', () => {
  /**
   * The claim the constant is chosen against: two megabytes has to hold a
   * season of everything the app currently shows, or the number is decoration.
   */
  it('keeps a written season inside the budget and inside a real quota', () => {
    const storage = new FakeStorage();
    const collector = createCollector({ storage, now: NOW - COARSE_RETAINED_SLOTS * DAY_MS });
    const nodes = Array.from({ length: 124 }, (_, i) => plant(`garden/bed ${i}/plant-${i}`, i / 200));

    for (let d = COARSE_RETAINED_SLOTS - 1; d >= 0; d--) {
      collector.note(nodes, NOW - d * DAY_MS);
    }
    collector.flush(NOW);

    expect(collector.writtenBytes).toBeLessThan(RECORD_BUDGET_BYTES);
    const stored = decodeRecord(storage.items.get(STORAGE_KEY)!)!;
    expect(stored.schema).toBe(RECORD_SCHEMA);
    expect(stored.coarse['garden/bed 0/plant-0'].slots).toContain(slotAt(NOW, DAY_MS));
  });

  it('never writes more than the budget even when told to note far more', () => {
    const storage = new FakeStorage();
    const collector = createCollector({ storage, now: NOW, budgetBytes: 20_000 });
    const nodes = Array.from({ length: 60 }, (_, i) => plant(`n${i}`));
    for (let h = 0; h < 400; h++) collector.note(nodes, NOW + h * HOUR_MS);
    collector.flush(NOW + 400 * HOUR_MS);
    expect(collector.writtenBytes).toBeLessThanOrEqual(20_000);
    expect(recordBytes(collector.record)).toBeLessThanOrEqual(20_000);
  });
});
