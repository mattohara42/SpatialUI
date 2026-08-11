/**
 * The Prometheus adapter's public face.
 *
 * The source `docs/sources.md` names as the archetype and the right first real
 * one: a PromQL query returns series, gauges and counters map to vitality and
 * activity, `up{}` is staleness the source states about itself, and labels are
 * the natural bed grouping. What has kept it deferred is the one thing this
 * environment still does not have — outbound network to a real server — which
 * is why the pieces here are shaped so that the *only* thing a networked run
 * adds is a real `fetch`: the parser, the mapping, and the translation are all
 * exercised offline against captured responses in the tests, and a live run
 * swaps the recorded response for a socket and changes nothing else.
 */

export * from './types';
export {
  fetchPromSnapshot,
  parseInstantVector,
  type FetchLike,
  type PromQuery,
} from './query';

import type { LiveSource, TranslatedGarden } from '../../state/sources';
import {
  promStaleSchedule,
  translatePromSnapshot,
  type PromMapping,
} from '../../translation/prometheus';
import { fetchPromSnapshot, type FetchLike, type PromQuery } from './query';
import type { PromSnapshot } from './types';

/**
 * A Prometheus `LiveSource`, and the honest resolution of the one seam friction.
 *
 * `LiveSource.read(now)` is synchronous, because every source so far is a
 * generator. A network fetch is not, so this source separates the two: `read`
 * translates the **last snapshot it holds**, synchronously, and `refresh` is the
 * async call that fetches a new one. Between them sits the previous poll's
 * vitality, threaded into translation so trend is a real delta across refreshes
 * rather than a flat zero.
 *
 * The gap this leaves is deliberate and named: something has to *call* `refresh`
 * on the scrape interval, and in a shut browser tab nothing can. That caller is
 * the unattended collector loop `docs/sources.md` describes — a backend, not a
 * translator — and the observation record already stores in the shape it wants.
 * So a live Prometheus garden is this source plus that loop, and this source is
 * the whole of the part that lives in the client.
 */
export interface PromSource extends LiveSource {
  /** Fetch a fresh snapshot and adopt it. The async half `read` cannot be. */
  refresh(now?: number): Promise<void>;
  /** Adopt a snapshot without fetching — the seam the tests drive, and the
   *  seam a backend that already fetched would hand results back through. */
  adopt(snapshot: PromSnapshot): void;
  /** The snapshot `read` is currently translating, or null before the first. */
  readonly snapshot: PromSnapshot | null;
}

export interface PromSourceConfig {
  query: PromQuery;
  mapping: PromMapping;
  /** Scrape interval, for the staleness/poll schedule. Defaults to 60s. */
  scrapeIntervalMs?: number;
  /** Injected for tests; defaults to the platform `fetch`. */
  fetchImpl?: FetchLike;
}

export function promSource(config: PromSourceConfig): PromSource {
  const scrapeIntervalMs = config.scrapeIntervalMs ?? 60_000;
  const fetchImpl =
    config.fetchImpl ?? (globalThis.fetch as unknown as FetchLike | undefined);

  let held: PromSnapshot | null = null;
  // The previous poll's scaled vitality per node, so trend survives a refresh.
  let previous: Record<string, number> = {};

  const translate = (now: number): TranslatedGarden => {
    if (!held) {
      // No snapshot yet: an empty garden with only its root, which is the honest
      // picture of a source that has been declared but not yet heard from.
      return {
        nodes: {},
        edges: {},
        history: {},
        archive: {},
      };
    }
    const out = translatePromSnapshot(held, config.mapping, { asOf: now, previous });
    previous = {};
    for (const node of Object.values(out.nodes)) {
      if (node.kind === 'plant') previous[node.id] = node.vitality;
    }
    return out;
  };

  return {
    gardenId: config.mapping.gardenId,
    policy: promStaleSchedule(scrapeIntervalMs),
    pollable: true,
    read: (now) => translate(now),
    adopt(snapshot) {
      held = snapshot;
    },
    async refresh(now = Date.now()) {
      if (!fetchImpl) throw new Error('promSource: no fetch available in this runtime');
      held = await fetchPromSnapshot(config.query, fetchImpl, now);
    },
    get snapshot() {
      return held;
    },
  };
}
