import type { EcosystemNode } from '../ecosystem/types';
import {
  createCollector,
  type Collector,
  type CollectorStorage,
} from '../state/collector';
import type { LiveSource } from '../state/sources';
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

  // The loop's own poll clock, not the garden's node state. Deciding "due" off
  // plant nodes (the way the client's `dueSources` does) is wrong for an
  // unattended loop: a source that primes empty has no plants to measure, so it
  // would never be re-asked and its garden would wedge dead forever. A per-source
  // last-fetch time makes the poll a property of the source, so an empty source
  // is re-asked on its own cadence and recovers the moment it has something.
  const lastFetchAt = new Map<LiveSource, number>();
  // Each source's latest translated nodes, replaced whole on every read rather
  // than merged into one accumulator — so a target that disappears from a source
  // (a decommissioned instance) leaves with it, instead of ghosting on as a
  // permanently-stale plant that keeps getting re-recorded.
  const slices = new Map<LiveSource, Record<string, EcosystemNode>>();

  const nodes: Record<string, EcosystemNode> = {};
  const rebuildNodes = (): void => {
    for (const key of Object.keys(nodes)) delete nodes[key];
    for (const slice of slices.values()) Object.assign(nodes, slice);
  };

  const dueAt = (source: LiveSource, last: number): number =>
    typeof source.policy === 'number'
      ? last + source.policy
      : source.policy.dueAfter(last);

  return {
    nodes,
    collector,

    async tick(at = Date.now()) {
      const advanced: string[] = [];
      for (const source of sources) {
        const last = lastFetchAt.get(source);
        // Never fetched → prime it. Fetched but not pollable → leave it as it is.
        // Otherwise ask again once the source's own schedule says a reading is owed.
        if (last !== undefined && (!source.pollable || at < dueAt(source, last))) {
          continue;
        }
        try {
          if (source.refresh) await source.refresh(at);
          // `read` sits inside the try alongside `refresh`: a translation error is
          // as much "this source did not advance" as a fetch failure, and must not
          // abort the tick and discard every other source that already advanced.
          slices.set(source, source.read(at).nodes);
        } catch {
          // A failed fetch or translation simply does not advance; staleness greys
          // the garden, the honest reading of a feed that stopped answering.
          continue;
        }
        lastFetchAt.set(source, at);
        advanced.push(source.gardenId);
      }

      rebuildNodes();

      // Record only the sources that advanced. Noting the whole node view would
      // write a fresh sample at `at` for silent sources' plants too, inventing
      // continuity for a feed that never spoke this tick.
      if (advanced.length > 0) {
        const fresh: EcosystemNode[] = [];
        for (const source of sources) {
          if (!advanced.includes(source.gardenId)) continue;
          const slice = slices.get(source);
          if (slice) fresh.push(...Object.values(slice));
        }
        collector.note(fresh, at);
      }
      return advanced;
    },

    flush(at = Date.now()) {
      return collector.flush(at);
    },
  };
}
