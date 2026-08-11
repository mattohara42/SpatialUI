import type { PromApiResponse } from './types';

/**
 * Recorded Prometheus query responses, in the exact wire shape the HTTP API
 * returns — value as a string, timestamp in seconds, labels under `metric`.
 *
 * These stand in for a live server the way the synthetic snapshots stand in for
 * a live feed everywhere else: this environment cannot reach a Prometheus, so
 * the shape it *would* return is pinned here and the parser and translator are
 * tested against it. Set `PROM_LIVE_URL` and the same tests run against a real
 * server instead (see `prometheus.live.test.ts`) — the point of the split is
 * that nothing but the source of these bytes changes.
 *
 * Shapes and label conventions mirror a public demo instance (jobs `prometheus`,
 * `node`, `blackbox`; instances as host:port). Values are illustrative.
 */

/** `up` across two jobs, with one node target down. Real `up{}` payload shape. */
export const UP_RESPONSE: PromApiResponse = {
  status: 'success',
  data: {
    resultType: 'vector',
    result: [
      {
        metric: { __name__: 'up', instance: 'demo:9090', job: 'prometheus' },
        value: [1_723_334_400, '1'],
      },
      {
        metric: { __name__: 'up', instance: 'node-a:9100', job: 'node' },
        value: [1_723_334_400, '1'],
      },
      {
        metric: { __name__: 'up', instance: 'node-b:9100', job: 'node' },
        value: [1_723_334_400, '0'],
      },
    ],
  },
};

/**
 * A latency gauge in seconds across the same targets. Lower is better, which the
 * mapping expresses by putting `min` above `max` — the down node still carries a
 * value here (its last scrape), and it is `up` that says not to trust it.
 */
export const LATENCY_RESPONSE: PromApiResponse = {
  status: 'success',
  data: {
    resultType: 'vector',
    result: [
      {
        metric: { __name__: 'probe_duration_seconds', instance: 'demo:9090', job: 'prometheus' },
        value: [1_723_334_400, '0.042'],
      },
      {
        metric: { __name__: 'probe_duration_seconds', instance: 'node-a:9100', job: 'node' },
        value: [1_723_334_400, '0.180'],
      },
      {
        metric: { __name__: 'probe_duration_seconds', instance: 'node-b:9100', job: 'node' },
        value: [1_723_334_400, '0.950'],
      },
    ],
  },
};

/** The same latency one poll later: node-a has spiked, demo has eased. */
export const LATENCY_RESPONSE_LATER: PromApiResponse = {
  status: 'success',
  data: {
    resultType: 'vector',
    result: [
      {
        metric: { __name__: 'probe_duration_seconds', instance: 'demo:9090', job: 'prometheus' },
        value: [1_723_334_460, '0.030'],
      },
      {
        metric: { __name__: 'probe_duration_seconds', instance: 'node-a:9100', job: 'node' },
        value: [1_723_334_460, '0.620'],
      },
      {
        metric: { __name__: 'probe_duration_seconds', instance: 'node-b:9100', job: 'node' },
        value: [1_723_334_460, '0.950'],
      },
    ],
  },
};

/** A recording rule that divided by zero: `+Inf` is a real answer, not a plant. */
export const NONFINITE_RESPONSE: PromApiResponse = {
  status: 'success',
  data: {
    resultType: 'vector',
    result: [
      {
        metric: { __name__: 'ratio', instance: 'a:9100', job: 'node' },
        value: [1_723_334_400, '0.5'],
      },
      { metric: { __name__: 'ratio', instance: 'b:9100', job: 'node' }, value: [1_723_334_400, '+Inf'] },
      { metric: { __name__: 'ratio', instance: 'c:9100', job: 'node' }, value: [1_723_334_400, 'NaN'] },
    ],
  },
};

/** What the API returns for a broken query — no `data`, a message instead. */
export const ERROR_RESPONSE: PromApiResponse = {
  status: 'error',
  errorType: 'bad_data',
  error: 'invalid parameter "query": parse error: unexpected end of input',
};
