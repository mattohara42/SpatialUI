/**
 * The Prometheus adapter's raw shapes — feed-shaped, not convenient.
 *
 * Two layers live here and the split is the whole point. The `Prom*Response`
 * types are the wire: exactly what `GET /api/v1/query` returns, down to the
 * value-as-string that Prometheus really sends. `PromSnapshot` is what the
 * adapter hands upward once it has parsed that wire — instant samples with real
 * numbers and millisecond stamps — and it is the only thing `translation`
 * ever sees. A live adapter and a captured fixture produce byte-identical
 * `PromSnapshot`s, which is what lets the translator be tested offline against
 * the same shape it will meet in production.
 */

/** Where a snapshot came from. The one thing a viewer must never have to guess. */
export interface PromProvenance {
  /** `live` once a real server answered; `captured` for a recorded response. */
  kind: 'live' | 'captured';
  /** The PromQL that produced `series`. Rendered on the HUD. */
  query: string;
  /** The server, when one answered. Absent for a captured fixture. */
  endpoint?: string;
  /** Human-readable line, shown alongside the numbers. */
  note: string;
}

/**
 * One instant reading of one series: its label set, its value, and when the
 * server says that value is for. `at` is epoch **ms** — Prometheus reports
 * seconds, and the parser is the single place that conversion happens.
 */
export interface PromSample {
  labels: Record<string, string>;
  value: number;
  at: number;
}

/**
 * Everything one poll of a Prometheus source returns.
 *
 * `series` is the mapped metric — the thing that becomes vitality. `up` is the
 * target-liveness vector (`up{}`), kept apart because it answers a different
 * question: not "how is this doing" but "is this target even reporting", which
 * is staleness stated by the source itself rather than inferred from a clock.
 */
export interface PromSnapshot {
  /** Epoch ms the poll was taken. */
  fetchedAt: number;
  series: PromSample[];
  /** Present when the source was asked for `up{}` alongside its metric. */
  up?: PromSample[];
  provenance: PromProvenance;
}

/** A single entry in a Prometheus instant-vector result. */
export interface PromVectorEntry {
  metric: Record<string, string>;
  /** `[unixSeconds, "value"]`. The value is a string; Inf/NaN are possible. */
  value: [number, string];
}

/** A single entry in a Prometheus range-matrix result. */
export interface PromMatrixEntry {
  metric: Record<string, string>;
  values: Array<[number, string]>;
}

/** The envelope every Prometheus query API returns, success or error. */
export interface PromApiResponse {
  status: 'success' | 'error';
  /** Present on success. `resultType` discriminates vector from matrix. */
  data?: {
    resultType: 'vector' | 'matrix' | 'scalar' | 'string';
    result: PromVectorEntry[] | PromMatrixEntry[];
  };
  /** Present on error. */
  errorType?: string;
  error?: string;
  /** Non-fatal warnings the server attaches to a successful response. */
  warnings?: string[];
}
