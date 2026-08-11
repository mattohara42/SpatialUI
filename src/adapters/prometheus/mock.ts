import { parseInstantVector } from './query';
import type { PromQuery } from './query';
import type { PromApiResponse, PromSnapshot, PromVectorEntry } from './types';
import type { PromMapping } from '../../translation/prometheus';

/**
 * A Prometheus server that is not there — the mock behind the wired-in source.
 *
 * `docs/sources.md` calls Prometheus the archetype and the right first real
 * source, and the whole adapter was shaped so the *only* thing a networked run
 * adds is a real socket. This file is that socket's stand-in: a `FetchLike` that
 * answers `/api/v1/query` with a synthetic fleet in the exact wire shape a real
 * server returns — value as a string, timestamp in seconds, labels under
 * `metric` — so `fetchPromSnapshot` parses it, `translatePromSnapshot` maps it,
 * and nothing in the path can tell it did not come off a wire. Swap
 * `mockPromFetch` for `globalThis.fetch` and a `PromQuery` at a real endpoint and
 * the same source is live, with nothing else changed.
 *
 * The fleet moves: latencies walk on a slow per-instance curve, so trend is a
 * real delta across refreshes rather than a flat zero, and one replica is held
 * *down* — `up{} == 0` with its last sample frozen in the past — so the garden
 * shows the one thing only Prometheus states about itself, a target greying into
 * staleness with a critical blight while its neighbours stay fresh.
 */

const PROM_METRIC = 'probe_duration_seconds';

/** The mock endpoint. Obviously not real, so a glance at the HUD says "stand-in". */
const MOCK_ENDPOINT = 'https://prometheus.mock.local';

/** The fleet: instances grouped by job, and whether each is reporting. */
interface Target {
  instance: string;
  job: string;
  /** Healthy latency floor in seconds; the walk moves around it. */
  baseLatency: number;
  /** A permanently-down target: `up 0`, last sample frozen, greys into staleness. */
  down?: boolean;
}

const FLEET: Target[] = [
  { instance: 'api-1:8080', job: 'api', baseLatency: 0.04 },
  { instance: 'api-2:8080', job: 'api', baseLatency: 0.05 },
  { instance: 'api-3:8080', job: 'api', baseLatency: 0.09 },
  { instance: 'worker-1:9000', job: 'worker', baseLatency: 0.07 },
  { instance: 'worker-2:9000', job: 'worker', baseLatency: 0.12 },
  { instance: 'db-primary:5432', job: 'db', baseLatency: 0.025 },
  { instance: 'db-replica:5432', job: 'db', baseLatency: 0.9, down: true },
];

/** How long a down target's last sample sits in the past — well past the grace. */
const DOWN_SAMPLE_AGE_MS = 5 * 60_000;

/** The query to point the wired-in source at. `baseUrl` is the mock host. */
export const PROM_MOCK_QUERY: PromQuery = {
  baseUrl: MOCK_ENDPOINT,
  query: PROM_METRIC,
  includeUp: true,
};

/**
 * The mapping the wired-in source reads the fleet through. Latency in seconds,
 * lower is better — so the scale runs backwards (`min` above `max`): 20ms reads
 * as thriving, a full second as dying. Instances name the plants, jobs the beds.
 */
export const PROM_MOCK_MAPPING: PromMapping = {
  gardenId: 'prometheus',
  gardenLabel: 'Prometheus',
  idLabel: 'instance',
  bedLabel: 'job',
  vitality: { min: 1.0, max: 0.02 },
  polarity: 'nurture',
  planting: 'conifer-stand',
  domain: 'devops',
};

/** A stable hash of a string onto [0, 1), for deterministic per-target variation. */
function hash01(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/** A target's latency at a moment: a slow sine around its floor, plus fine noise. */
function latencyAt(target: Target, now: number): number {
  const phase = hash01(target.instance) * Math.PI * 2;
  // ~6-minute period, so successive 2s scrapes move a little and trend is real.
  const swing = Math.sin(now / 60_000 + phase);
  const noise = (hash01(`${target.instance}:${Math.floor(now / 2000)}`) - 0.5) * 0.01;
  return Math.max(0.005, target.baseLatency * (1 + 0.4 * swing) + noise);
}

function vectorEntry(name: string, target: Target, value: number, at: number): PromVectorEntry {
  return {
    metric: { __name__: name, instance: target.instance, job: target.job },
    value: [at / 1000, String(value)],
  };
}

/**
 * The wire response for one query as of `now`. `up` returns the liveness vector;
 * anything else returns the latency fleet. A down target reports `up 0` now and a
 * latency sample frozen at its last good scrape, which is what makes it read as
 * silent rather than as a plant sitting at a stale value.
 */
export function syntheticPromResponse(promql: string, now: number): PromApiResponse {
  const isUp = promql.trim() === 'up';
  const result: PromVectorEntry[] = FLEET.map((target) => {
    if (isUp) {
      return vectorEntry('up', target, target.down ? 0 : 1, now);
    }
    const at = target.down ? now - DOWN_SAMPLE_AGE_MS : now;
    return vectorEntry(PROM_METRIC, target, latencyAt(target, at), at);
  });
  return { status: 'success', data: { resultType: 'vector', result } };
}

/**
 * A `FetchLike` that answers from the synthetic fleet instead of a socket. The
 * time is the mock's own clock (real wall-clock by default), so samples land
 * "now" and the wired-in source stays fresh; a test can pin it for determinism.
 */
export function mockPromFetch(clock: () => number = Date.now) {
  return async (url: string) => {
    const query = new URL(url).searchParams.get('query') ?? '';
    const response = syntheticPromResponse(query, clock());
    return { ok: true, status: 200, json: async () => response };
  };
}

/**
 * A parsed snapshot, built synchronously — the seam that primes the source at
 * composition, before any async refresh can land. It is exactly what
 * `mockPromFetch` + `fetchPromSnapshot` produce, without the promise, so the
 * garden is populated on the first synchronous `read`.
 */
export function syntheticPromSnapshot(now: number = Date.now()): PromSnapshot {
  return {
    fetchedAt: now,
    series: parseInstantVector(syntheticPromResponse(PROM_METRIC, now)),
    up: parseInstantVector(syntheticPromResponse('up', now)),
    provenance: {
      kind: 'captured',
      query: PROM_METRIC,
      endpoint: MOCK_ENDPOINT,
      note: 'Synthetic Prometheus fleet — mock fetch, no server. See adapters/prometheus/mock.ts.',
    },
  };
}
