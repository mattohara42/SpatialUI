import type { EcosystemEdge, EcosystemNode } from '../ecosystem/types';
import type { VitalsHistory } from '../ecosystem/history';
import { scheduleFor, type StalePolicy } from '../ecosystem/staleness';
import { syntheticNflSource } from '../adapters/nfl';
import { syntheticMarketSource } from '../adapters/market';
import { syntheticWorldSource } from '../adapters/world';
import {
  MARKET_GARDEN_ID,
  MARKET_STALE_SCHEDULE,
  translateMarketSnapshot,
} from '../translation/market';
import {
  NFL_GARDEN_ID,
  NFL_STALE_AFTER_MS,
  translateNflSnapshot,
} from '../translation/nfl';
import {
  WORLD_GARDEN_ID,
  WORLD_STALE_SCHEDULE,
  translateWorldSnapshot,
} from '../translation/world';
import { promSource } from '../adapters/prometheus';
import type { FetchLike } from '../adapters/prometheus/query';
import {
  PROM_MOCK_MAPPING,
  PROM_MOCK_QUERY,
  mockPromFetch,
  syntheticPromSnapshot,
} from '../adapters/prometheus/mock';
import { promProxyFetch } from '../backend/proxyFetch';

/**
 * The real sources, and the one question that turned out to have two uses.
 *
 * `StaleSchedule.dueAfter` was written to answer "should I have heard something
 * by now" for the staleness state. It is word for word the question a poll asks
 * — "is there anything new to fetch" — so a source that can say when it will
 * next speak has already said when to ask it again, and this module is the two
 * uses meeting. Nothing here schedules anything on a clock of its own.
 *
 * Sharpening staleness is what made this necessary rather than merely tidy. Both
 * sources snapshot once and, before this, never again; under the old four-day
 * threshold a garden that never refreshed still read as fresh, and under a
 * two-bar grace it correctly reads as dead. The garden was right and the app was
 * wrong, so the app polls.
 */

export interface TranslatedGarden {
  nodes: Record<string, EcosystemNode>;
  edges: Record<string, EcosystemEdge>;
  history: Record<string, VitalsHistory>;
  archive: Record<string, VitalsHistory>;
}

export interface LiveSource {
  gardenId: string;
  /** When this source should next be heard from. Registered against the garden. */
  policy: StalePolicy;
  /** Ask the source, and translate what it says, as of `now`. */
  read(now: number): TranslatedGarden;
  /**
   * Advance an async source: fetch the next reading and adopt it, so the *next*
   * `read` reflects it. Present only on sources whose feed is a network fetch
   * rather than a generator — Prometheus is the first — because `read` is
   * synchronous by contract and a fetch is not. The beat kicks this
   * fire-and-forget (see `ecosystemStore.poll`); a fetch that fails simply does
   * not advance, and staleness greys the garden, which is the honest reading of a
   * feed that stopped answering. It is the seam a backend's collector loop would
   * drive on the scrape interval; in the app today a mock fetch stands in for the
   * server. Absent on generator sources, whose `read` already answers as-of now.
   */
  refresh?(now?: number): void | Promise<void>;
  /**
   * Whether asking again is meaningful.
   *
   * Not every generated source can be re-asked. The league's season is anchored
   * to the moment it was first generated — its most recent kickoff is always 26
   * hours ago, which is what keeps a game inside the scrub window — so asking
   * again at a later time does not extend the season, it *slides* it, and every
   * result the history already recorded moves with it. That is a property of the
   * fiction rather than of the design, and a live adapter simply does not have
   * it. The market's tape was given an anchor precisely so it would not.
   *
   * It costs nothing here: the league's next reading is due a week out, so a
   * source that cannot be re-asked inside that window has nothing to be asked
   * for.
   */
  pollable: boolean;
}

const nfl = syntheticNflSource();
const market = syntheticMarketSource();
const world = syntheticWorldSource();

/** The id an operator registers this source under, server-side (see
 *  `backend/registry.ts`). The client names it; the host and token live there. */
export const PROM_SOURCE_ID = 'prometheus';

/**
 * A configured proxy URL, or nothing. `VITE_PROM_PROXY_URL` is the one switch
 * that takes Prometheus live: set it, and the source fetches through the backend
 * proxy against a real server; leave it unset — the default, and every test — and
 * it stays on the mock so the app runs with no egress.
 */
const PROM_PROXY_URL = import.meta.env.VITE_PROM_PROXY_URL as string | undefined;

/**
 * Prometheus's fetch: the backend proxy when a URL is configured, else the mock.
 *
 * Exported as a plain function of the URL so the choice is testable without
 * booting Vite's `import.meta.env` — the whole "going live is one argument"
 * claim, made assertable. `promProxyFetch` POSTs `{ sourceId, promql }` to the
 * proxy, naming neither a host nor a token; `mockPromFetch` answers from the
 * synthetic fleet in-process.
 */
export function promFetchImpl(
  proxyUrl: string | undefined,
  sourceId: string = PROM_SOURCE_ID,
): FetchLike {
  return proxyUrl ? promProxyFetch(proxyUrl, sourceId) : mockPromFetch();
}

/**
 * Prometheus — the first source in `SOURCES` whose feed is a real HTTP fetch
 * rather than a generator, the archetype `docs/sources.md` was written for.
 *
 * `read` translates the snapshot it holds; `refresh` fetches the next one, and
 * the beat kicks that fire-and-forget so the fleet stays live. Where it fetches
 * from is now a matter of configuration: unset `VITE_PROM_PROXY_URL` and it reads
 * the mock (`mockPromFetch`) in-process, because a browser cannot reach an
 * arbitrary server and this environment has no egress; set it and the same source
 * pulls live through the backend proxy — one switch, nothing else changed, which
 * was the whole point of the `fetchImpl` seam.
 */
const prometheus = promSource({
  query: PROM_MOCK_QUERY,
  mapping: PROM_MOCK_MAPPING,
  fetchImpl: promFetchImpl(PROM_PROXY_URL),
  // A brisk scrape so the fleet visibly moves; due one interval after the last
  // sample (see `promStaleSchedule`), so it re-reads on that cadence rather than
  // on every beat, and greys only after two intervals of silence.
  scrapeIntervalMs: 15_000,
});
// Prime with the synthetic snapshot only when running offline, so the garden is
// populated on the first `read` before any refresh lands. A proxied source starts
// empty and fills on its first live refresh instead — showing mock data behind a
// live label would be exactly the dishonesty the provenance marker exists to stop.
if (!PROM_PROXY_URL) prometheus.adopt(syntheticPromSnapshot());

export const SOURCES: readonly LiveSource[] = [
  {
    gardenId: NFL_GARDEN_ID,
    policy: NFL_STALE_AFTER_MS,
    read: (now) => translateNflSnapshot(nfl.snapshot(now), { asOf: now }),
    pollable: false,
  },
  {
    gardenId: MARKET_GARDEN_ID,
    policy: MARKET_STALE_SCHEDULE,
    read: (now) => translateMarketSnapshot(market.snapshot(now), { asOf: now }),
    pollable: true,
  },
  {
    gardenId: WORLD_GARDEN_ID,
    policy: WORLD_STALE_SCHEDULE,
    read: (now) => translateWorldSnapshot(world.snapshot(now), { asOf: now }),
    // Re-askable, and by construction rather than by an anchor bolted on. Both
    // halves of this source depend only on the window asked about: releases are
    // walked from a fixed year, and the feed is seeded per country-day. So a
    // later reading is a superset of an earlier one and the recorded past does
    // not move under it — the property `pollable` is really asserting.
    pollable: true,
  },
  prometheus,
];

/**
 * When a garden should next have something new in it.
 *
 * Taken from the *freshest* plant, not the stalest. A source is a single feed:
 * if the thing that spoke most recently was due to speak again and has not, the
 * feed owes us something. Taking the stalest instead would let one halted symbol
 * — which is legitimately silent and permanently overdue — demand a poll every
 * two seconds forever.
 */
export function dueAt(
  nodes: Record<string, EcosystemNode>,
  gardenId: string,
  policy: StalePolicy = scheduleFor(gardenId),
): number | null {
  let freshest = -Infinity;
  for (const node of Object.values(nodes)) {
    if (node.gardenId !== gardenId || node.kind !== 'plant') continue;
    if (node.updatedAt > freshest) freshest = node.updatedAt;
  }
  if (freshest === -Infinity) return null;

  return typeof policy === 'number' ? freshest + policy : policy.dueAfter(freshest);
}

/**
 * The sources with something owed, at `now`.
 *
 * Pure, and separate from the store on purpose: whether a poll is due is the
 * whole of the decision, and it should be assertable without standing up a
 * zustand singleton whose sources snapshot at module load.
 */
export function dueSources(
  nodes: Record<string, EcosystemNode>,
  now: number,
  sources: readonly LiveSource[] = SOURCES,
): LiveSource[] {
  return sources.filter((source) => {
    if (!source.pollable) return false;
    const due = dueAt(nodes, source.gardenId, source.policy);
    return due !== null && now >= due;
  });
}
