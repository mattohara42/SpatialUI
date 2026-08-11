import type {
  PromApiResponse,
  PromSample,
  PromSnapshot,
  PromVectorEntry,
} from './types';

/**
 * The fetch/parse half of the Prometheus adapter.
 *
 * Nothing here knows what a plant is. It turns the query API's wire format into
 * `PromSample`s and stops, which is the boundary every adapter keeps: this file
 * is free to talk HTTP and parse strings, and the translator above it is free
 * to decide what a value *means* to a garden. The two never leak into each
 * other, so the parser can be exercised against a recorded response and the
 * translator against the parsed shape, offline, with no server in the room.
 */

/** How to reach a Prometheus server and what to ask it. */
export interface PromQuery {
  /** Base URL, e.g. `https://prometheus.demo.prometheus.io`. No trailing slash needed. */
  baseUrl: string;
  /** The PromQL instant query that becomes the garden's plants. */
  query: string;
  /**
   * Also fetch `up{}` so target-down reads as staleness rather than a healthy
   * plant sitting at whatever its last value was. On by default because the
   * whole reason to prefer Prometheus first is that it states its own liveness.
   */
  includeUp?: boolean;
  /** Bearer token, when the server wants one. Never logged, never stored on a node. */
  token?: string;
}

/**
 * The one dependency this module has on the outside world, injected rather than
 * imported so a test can hand it a recorded response and a live run can hand it
 * the platform `fetch`. Its shape is the standard `fetch`, narrowed to what we
 * use, so `globalThis.fetch` satisfies it with no adapter.
 */
export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/**
 * Parse a Prometheus instant-vector response into samples.
 *
 * The three things that make this more than `JSON.parse`, each a real property
 * of the wire rather than a defensive habit:
 *
 * - **The value is a string, and the timestamp is in seconds.** `["1.5e9",
 *   "0.97"]` is a number and a time, and this is the only place that decoding
 *   happens — everything above it sees a `number` and epoch **ms**.
 * - **Non-finite values are real answers.** A gauge can legitimately be `NaN`
 *   or `+Inf` (a division by zero in a recording rule, say). Those are dropped
 *   rather than passed on as a plant at vitality NaN, which would render as a
 *   hole. A dropped series is a series the garden simply does not show, which
 *   is the honest reading of "the server has no number for this right now".
 * - **An error envelope is not data.** `status: "error"` carries no `data`, and
 *   turning it into an empty garden would be the app inventing silence. It
 *   throws, with the server's own message, so the caller can tell a dead query
 *   from an empty one.
 */
export function parseInstantVector(response: PromApiResponse): PromSample[] {
  if (response.status === 'error') {
    throw new Error(
      `Prometheus query failed: ${response.errorType ?? 'error'}: ${response.error ?? 'no detail'}`,
    );
  }
  const data = response.data;
  if (!data || data.resultType !== 'vector') {
    throw new Error(
      `Expected an instant vector, got ${data?.resultType ?? 'no data'}`,
    );
  }

  const samples: PromSample[] = [];
  for (const entry of data.result as PromVectorEntry[]) {
    const [seconds, raw] = entry.value;
    const value = Number(raw);
    // NaN/±Inf are legitimate Prometheus answers and not plants. See above.
    if (!Number.isFinite(value)) continue;
    samples.push({
      labels: entry.metric,
      value,
      at: Math.round(seconds * 1000),
    });
  }
  return samples;
}

/**
 * Fetch a Prometheus source and return the parsed snapshot.
 *
 * Async, and that is the seam's one real friction with a live source: every
 * source in `SOURCES` today answers `read(now)` synchronously because it is a
 * generator, and a network fetch cannot. `promSource` (see `index.ts`) resolves
 * that by holding the last snapshot and translating *that* synchronously, with
 * `refresh` the async call that fills it — which is also why a live Prometheus
 * garden needs the same background loop the observation record was shaped for.
 * That loop is a backend, not a translator, which is exactly the boundary
 * `docs/sources.md` draws.
 */
export async function fetchPromSnapshot(
  query: PromQuery,
  fetchImpl: FetchLike,
  now: number = Date.now(),
): Promise<PromSnapshot> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (query.token) headers.Authorization = `Bearer ${query.token}`;

  const series = parseInstantVector(
    await getJson(query.baseUrl, query.query, headers, fetchImpl),
  );

  let up: PromSample[] | undefined;
  if (query.includeUp !== false) {
    up = parseInstantVector(await getJson(query.baseUrl, 'up', headers, fetchImpl));
  }

  return {
    fetchedAt: now,
    series,
    up,
    provenance: {
      kind: 'live',
      query: query.query,
      endpoint: query.baseUrl,
      note: `Live Prometheus at ${query.baseUrl}. Values as reported by the server.`,
    },
  };
}

async function getJson(
  baseUrl: string,
  promql: string,
  headers: Record<string, string>,
  fetchImpl: FetchLike,
): Promise<PromApiResponse> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/v1/query?query=${encodeURIComponent(promql)}`;
  const res = await fetchImpl(url, { headers });
  if (!res.ok) {
    throw new Error(`Prometheus responded ${res.status} for ${promql}`);
  }
  return (await res.json()) as PromApiResponse;
}
