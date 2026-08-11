import type { FetchLike } from '../adapters/prometheus/query';

/**
 * The client half of the proxy — the single-argument swap the whole design
 * promised.
 *
 * `promSource` fetches through an injected `fetchImpl` (`adapters/prometheus`),
 * and today `SOURCES` points that at `mockPromFetch`. This returns a `FetchLike`
 * that instead POSTs to *our own* proxy, naming a `sourceId` and the PromQL —
 * never a third-party host, never a token. Swap it in and the same source is
 * live, with nothing else changed:
 *
 * ```ts
 * fetchImpl: PROM_PROXY_URL
 *   ? promProxyFetch(PROM_PROXY_URL, 'prometheus')
 *   : mockPromFetch(),
 * ```
 *
 * `fetchPromSnapshot` calls this once for the metric query and once for `up`, so
 * each POST carries the one PromQL the proxy will permit for the named source.
 */

/** The transport a proxy fetch sends over — the platform `fetch`, or a test stub. */
export type ProxyTransport = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export function promProxyFetch(
  proxyUrl: string,
  sourceId: string,
  transport?: ProxyTransport,
): FetchLike {
  const send: ProxyTransport =
    transport ?? ((url, init) => (globalThis.fetch as unknown as ProxyTransport)(url, init));

  return async (url, init) => {
    // `fetchPromSnapshot` builds a `/api/v1/query?query=<promql>` URL; the proxy
    // wants the PromQL as data, so lift it back out and post it. The proxy
    // resolves `sourceId` to the real host — the client names neither, so its
    // `baseUrl` may well be empty or a bare path; parse against a base so a
    // relative URL is still valid rather than throwing `Invalid URL`.
    const promql = new URL(url, 'http://proxy.invalid').searchParams.get('query') ?? '';
    return send(proxyUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sourceId, promql }),
      signal: init?.signal,
    });
  };
}
