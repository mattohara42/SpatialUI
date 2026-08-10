import { describe, expect, it } from 'vitest';
import {
  MAX_WRITE_INTERVAL_MS,
  RECORD_BUDGET_BYTES,
  STORAGE_KEY,
  WRITE_DUTY,
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
  /** Busy-waited, to stand in for a large synchronous `localStorage` write. */
  writeDelayMs = 0;

  reads = 0;

  getItem(key: string): string | null {
    if (this.failReads) throw new Error('blocked');
    this.reads++;
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (value.length > this.quota) throw new Error('QuotaExceededError');
    if (this.writeDelayMs > 0) {
      const until = performance.now() + this.writeDelayMs;
      while (performance.now() < until) {
        /* a real localStorage write blocks the thread, so this one does too */
      }
    }
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

  /**
   * A fixed interval was wrong at the top of the range: at the budget, encoding
   * and writing is about 90ms of synchronous main thread, and every thirty
   * seconds that is a hitch. The gap is grown from what a write actually costs.
   */
  it('holds the floor while writes are cheap', () => {
    const storage = new FakeStorage();
    const collector = createCollector({ storage, now: NOW });
    collector.note([plant('a')], NOW);
    collector.flush(NOW);
    expect(collector.intervalMs).toBe(WRITE_INTERVAL_MS);
  });

  it('backs off when a write is expensive, and stops writing every beat', () => {
    const storage = new FakeStorage();
    storage.writeDelayMs = 40;
    const collector = createCollector({ storage, now: NOW });

    collector.note([plant('a')], NOW);
    collector.flush(NOW);
    expect(collector.intervalMs).toBeGreaterThan(WRITE_INTERVAL_MS);
    expect(collector.intervalMs).toBeLessThanOrEqual(MAX_WRITE_INTERVAL_MS);

    // A beat that would have written under the old fixed interval now does not.
    const writes = storage.writes;
    collector.note([plant('a')], NOW + WRITE_INTERVAL_MS);
    expect(storage.writes).toBe(writes);

    collector.note([plant('a')], NOW + collector.intervalMs);
    expect(storage.writes).toBe(writes + 1);
  });

  it('never backs off past its cap, however slow the store is', () => {
    const storage = new FakeStorage();
    // Just past MAX_WRITE_INTERVAL_MS / WRITE_DUTY, which is where the cap bites.
    storage.writeDelayMs = MAX_WRITE_INTERVAL_MS / WRITE_DUTY + 20;
    const collector = createCollector({ storage, now: NOW });
    collector.flush(NOW);
    expect(collector.intervalMs).toBe(MAX_WRITE_INTERVAL_MS);
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

/**
 * Pages come in multiples, and one key is shared by all of them. Before the
 * merge, the last tab to write discarded everything every other tab had seen
 * since it loaded — silently, which is the worst way for a record to be wrong.
 */
describe('two tabs', () => {
  it('keeps what the other tab saw, whichever writes last', () => {
    const storage = new FakeStorage();
    const a = createCollector({ storage, now: NOW });
    a.note([plant('watched-by-a')], NOW);
    a.flush(NOW);

    const b = createCollector({ storage, now: NOW + HOUR_MS });
    b.note([plant('watched-by-b')], NOW + HOUR_MS);
    b.flush(NOW + HOUR_MS);

    a.note([plant('watched-by-a')], NOW + 2 * HOUR_MS);
    a.flush(NOW + 2 * HOUR_MS);

    const stored = decodeRecord(storage.items.get(STORAGE_KEY)!)!;
    expect(Object.keys(stored.fine).sort()).toEqual(['watched-by-a', 'watched-by-b']);
  });

  it('picks up the other tab\'s slots for a node both are watching', () => {
    const storage = new FakeStorage();
    const a = createCollector({ storage, now: NOW });
    const b = createCollector({ storage, now: NOW });

    a.note([plant('shared')], NOW);
    a.flush(NOW);
    b.note([plant('shared')], NOW + HOUR_MS);
    b.flush(NOW + HOUR_MS);

    const stored = decodeRecord(storage.items.get(STORAGE_KEY)!)!;
    expect(stored.fine['shared'].slots).toHaveLength(2);
  });

  /**
   * The cost of the merge is a decode, and the ordinary case is one tab. Reading
   * back a value nothing has touched must not pay for it.
   */
  /**
   * The merge costs a decode and the ordinary case is a single tab, so a value
   * the collector recognises as its own is skipped on `savedAt` and length
   * alone. Proved by planting an impostor with the same signature and a
   * different body: a collector taking the fast path never sees it.
   */
  it('skips the decode when the stored value looks like its own', () => {
    const storage = new FakeStorage();
    const collector = createCollector({ storage, now: NOW });
    collector.note([plant('node-a')], NOW);
    collector.flush(NOW);

    const impostor = storage.items.get(STORAGE_KEY)!.replaceAll('node-a', 'node-b');
    expect(impostor).toHaveLength(storage.items.get(STORAGE_KEY)!.length);
    storage.items.set(STORAGE_KEY, impostor);

    collector.flush(NOW); // same savedAt, so the same signature
    expect(collector.record.fine['node-b']).toBeUndefined();
  });

  it('does decode once the signature no longer matches', () => {
    const storage = new FakeStorage();
    const collector = createCollector({ storage, now: NOW });
    collector.note([plant('node-a')], NOW);
    collector.flush(NOW);

    const other = emptyRecord(NOW + 1);
    observe(other, [plant('node-b')], NOW);
    other.savedAt = NOW + 1;
    storage.items.set(STORAGE_KEY, encodeRecord(other));

    collector.flush(NOW + HOUR_MS);
    expect(collector.record.fine['node-b']).toBeDefined();
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
