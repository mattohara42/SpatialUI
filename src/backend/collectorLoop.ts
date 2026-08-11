import type { EcosystemNode } from '../ecosystem/types';
import {
  createCollector,
  type Collector,
  type CollectorStorage,
} from '../state/collector';
import { dueSources, type LiveSource } from '../state/sources';
import { promSource } from '../adapters/prometheus';
import type { FetchLike } from '../adapters/prometheus/query';
import type { PromRegistry } from './registry';

/**
 * The collector loop — the client's poll, moved somewhere it outlives a tab.
 *
 * `collector.ts` names this as the missing half: the poll keeps the live reading
 * true while a tab is open and "dies with the tab along with everything it
 * learned." This is the same loop with two changes, both forced by running
 * unattended rather than on a render beat:
 *
 * - **`refresh` is awaited, not fire-and-forget.** The client kicks the next
 *   fetch and reads the snapshot it already holds, because it has a frame to
 *   paint; here nothing is watching, so the tick waits for the fetch and records
 *   what it brought back.
 * - **The record is the product, not a side effect.** Each tick writes the same
 *   `ObservedRecord` bytes `localStorage` holds today (`encodeRecord` is a plain
 *   stringify), served back to a connecting client through the collector's own
 *   restore path. Moving the loop server-side is a change of *where it runs*, not
 *   of *what it writes*.
 *
 * Everything else is reused verbatim: `dueSources` decides the cadence (so the
 * loop asks on exactly the schedule the garden does), `promSource` is the source,
 * and `createCollector` is the record. The loop adds no new judgement.
 */
export interface CollectorLoop {
  /**
   * One tick: refresh whatever the schedule owes, translate it, and record it.
   * Returns the garden ids that advanced. Await it — `refresh` is a real fetch.
   */
  tick(now?: number): Promise<string[]>;
  /** Write the record out now, whatever the write schedule thinks. */
  flush(now?: number): boolean;
  /** The nodes the loop currently holds — the live picture it records from. */
  readonly nodes: Record<string, EcosystemNode>;
  /** The collector, for its record and byte accounting. */
  readonly collector: Collector;
}

export interface CollectorLoopOptions {
  registry: PromRegistry;
  /**
   * Reaches the real Prometheus. In tests, inject `mockPromFetch`; in a deploy,
   * the platform `fetch`. This is *not* the client's proxy — the backend fetches
   * upstream directly, and the proxy is the separate seam a browser reads through.
   */
  fetchImpl: FetchLike;
  /** Where the record persists. Null runs the loop in memory (still bounded). */
  storage?: CollectorStorage | null;
  now?: number;
}

/** Build a `LiveSource` per registered source, all sharing one upstream fetch. */
export function sourcesFromRegistry(
  registry: PromRegistry,
  fetchImpl: FetchLike,
): LiveSource[] {
  return registry.all().map((s) =>
    promSource({
      query: s.query,
      mapping: s.mapping,
      scrapeIntervalMs: s.scrapeIntervalMs,
      fetchImpl,
    }),
  );
}

export function createCollectorLoop(options: CollectorLoopOptions): CollectorLoop {
  const { registry, fetchImpl, storage = null, now = Date.now() } = options;
  const sources = sourcesFromRegistry(registry, fetchImpl);
  const collector = createCollector({ storage, now });
  const nodes: Record<string, EcosystemNode> = {};

  const hasSpoken = (gardenId: string): boolean =>
    Object.values(nodes).some((n) => n.gardenId === gardenId);

  return {
    nodes,
    collector,

    async tick(at = Date.now()) {
      // A source that has never spoken cannot be "due" — `dueAt` returns null
      // with no plants to measure — so prime it once, then honor the schedule
      // for the rest. This is what the client does by adopting a synthetic
      // snapshot at construction; the loop does it by fetching once.
      const due: LiveSource[] = sources.filter((s) => !hasSpoken(s.gardenId));
      for (const s of dueSources(nodes, at, sources)) {
        if (!due.includes(s)) due.push(s);
      }

      const advanced: string[] = [];
      for (const source of due) {
        try {
          if (source.refresh) await source.refresh(at);
        } catch {
          // A failed fetch simply does not advance; staleness greys the garden,
          // which is the honest reading of a feed that stopped answering.
          continue;
        }
        Object.assign(nodes, source.read(at).nodes);
        advanced.push(source.gardenId);
      }

      // Record only what advanced, mirroring the client's commit-only-when-due:
      // re-noting unchanged nodes would be busywork, and `observe` keeps plants
      // only, so beds and gardens in `nodes` are ignored either way.
      if (advanced.length > 0) collector.note(Object.values(nodes), at);
      return advanced;
    },

    flush(at = Date.now()) {
      return collector.flush(at);
    },
  };
}
