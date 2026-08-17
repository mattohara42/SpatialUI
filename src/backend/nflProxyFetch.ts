import type { FetchLike } from '../adapters/nfl/espn';
import type { ProxyTransport } from './proxyFetch';

/**
 * The client half of the NFL proxy — the single-argument swap, for ESPN.
 *
 * `liveNflSource` fetches through an injected `fetchImpl` (`adapters/nfl/espn.ts`).
 * Offline that is the platform `fetch` against ESPN directly; in a deploy it is
 * this, which POSTs to *our own* proxy instead, naming a `sourceId` and the
 * ESPN-relative path — never a third-party host. The adapter builds
 * `${baseUrl}${path}` with an empty `baseUrl` in proxy mode, so the URL handed
 * here is already the bare `/nfl/...` path; lift the pathname and query back out
 * and post them.
 *
 * Shares `ProxyTransport` with the Prometheus client so the two proxies send over
 * the same wire and a test can stub either the same way.
 */
export function nflProxyFetch(
  proxyUrl: string,
  sourceId: string,
  transport?: ProxyTransport,
): FetchLike {
  const send: ProxyTransport =
    transport ?? ((url, init) => (globalThis.fetch as unknown as ProxyTransport)(url, init));

  return async (url, init) => {
    // Parse against a dummy base so a relative `/nfl/...` path is a valid URL; the
    // proxy resolves `sourceId` to the real ESPN host, so the client names only
    // the path shape the allowlist permits.
    const parsed = new URL(url, 'http://proxy.invalid');
    const path = `${parsed.pathname}${parsed.search}`;
    return send(proxyUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sourceId, path }),
      signal: init?.signal,
    });
  };
}
