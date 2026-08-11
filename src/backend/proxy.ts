import type { FetchLike } from '../adapters/prometheus/query';
import type { PromRegistry } from './registry';

/**
 * The proxy — a `FetchLike` with a network on the far side, and nothing more.
 *
 * It does the one thing a browser is forbidden to (CORS forbids arbitrary hosts,
 * a token cannot live in a client, a user-named host is a forgery surface) and
 * refuses everything else. It resolves a client-named `sourceId` to a
 * server-held endpoint and token, forwards the query, and returns the wire
 * envelope *untouched* — `parseInstantVector`/`fetchPromSnapshot` upstream already
 * know how to read it (value-as-string, seconds-to-ms, error-envelope-throws),
 * and re-parsing here would split that logic across two codebases. It is a pipe
 * with an allowlist, not a translator.
 */
export interface ProxyRequest {
  /** Which registered source, never a host. */
  sourceId: string;
  /** The PromQL to run — must be the source's own metric query or `up`. */
  promql: string;
}

export type ProxyResult =
  | { ok: true; status: number; body: unknown }
  | { ok: false; status: number; error: string };

/**
 * Handle one client request against the registry.
 *
 * Two refusals are the security of the thing, not error-handling niceties:
 *
 * - **An unknown `sourceId` is a 404**, because the allowlist is the boundary: a
 *   client names a source, so a host it was not meant to reach is simply not
 *   nameable.
 * - **A PromQL that is neither the source's registered query nor `up` is a 403**,
 *   because otherwise the client could run arbitrary PromQL on the operator's
 *   server — an injection and information-leak surface. The source is *defined*
 *   by its query; those are the only two the client legitimately triggers
 *   (`fetchPromSnapshot` asks for the metric and, when `includeUp`, for `up`).
 */
export async function handleProxyRequest(
  registry: PromRegistry,
  fetchImpl: FetchLike,
  request: ProxyRequest,
): Promise<ProxyResult> {
  const source = registry.resolve(request.sourceId);
  if (!source) {
    return { ok: false, status: 404, error: `unknown source: ${request.sourceId}` };
  }
  if (typeof request.promql !== 'string' || request.promql.length === 0) {
    return { ok: false, status: 400, error: 'missing promql' };
  }

  const permitted = new Set([source.query.query, 'up']);
  if (!permitted.has(request.promql)) {
    return {
      ok: false,
      status: 403,
      error: `query not permitted for source ${source.id}`,
    };
  }

  const base = source.query.baseUrl.replace(/\/$/, '');
  const url = `${base}/api/v1/query?query=${encodeURIComponent(request.promql)}`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  // The token is attached here and never travels to the client: the client's
  // request carried only a `sourceId`.
  if (source.query.token) headers.Authorization = `Bearer ${source.query.token}`;

  try {
    const res = await fetchImpl(url, { headers });
    const body = await res.json();
    // The upstream status and envelope pass through untouched, so a client's
    // `fetchPromSnapshot` sees exactly what a direct fetch would — including a
    // `status: "error"` envelope, which it deliberately throws on rather than
    // reading as an empty garden.
    if (res.ok) return { ok: true, status: res.status, body };
    // A non-2xx upstream keeps its status so the client fails the same way a
    // direct fetch would; the server's own message rides along when it left one.
    return { ok: false, status: res.status, error: upstreamError(body) };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: err instanceof Error ? err.message : 'upstream fetch failed',
    };
  }
}

/** The server's own error text, when the envelope carried one. */
function upstreamError(body: unknown): string {
  if (body && typeof body === 'object' && 'error' in body) {
    return String((body as { error: unknown }).error);
  }
  return 'upstream error';
}
