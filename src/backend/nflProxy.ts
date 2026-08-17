import type { FetchLike } from '../adapters/nfl/espn';

/**
 * The NFL proxy — the same trust boundary the Prometheus proxy is, shaped for a
 * feed that is many endpoints rather than one query.
 *
 * Prometheus permits one PromQL (`handleProxyRequest`); ESPN's adapter walks a
 * handful of resource paths (`/nfl/scoreboard`, `/nfl/summary`, a club's roster
 * and injuries), so the allowlist here is over *paths*, not queries. The rule is
 * the same one: the client names a `sourceId` and a path *shape* the proxy
 * recognizes, never a host. The base URL (and a token, if a deploy ever fronts
 * ESPN with one) lives server-side, so the client can only ever reach the feed an
 * operator registered, and cannot turn the proxy into an open relay by naming an
 * arbitrary path.
 *
 * It returns ESPN's JSON untouched. `espn.ts` upstream already knows how to read
 * it — scores as strings, ratios as "made-attempted", dates as ISO — and
 * re-parsing here would split that logic across two codebases. A pipe with an
 * allowlist, not a translator.
 */

export interface RegisteredNflSource {
  /** The id a client names in a proxy request, never a host. */
  id: string;
  /**
   * ESPN's football base, e.g.
   * `https://site.api.espn.com/apis/site/v2/sports/football`. No trailing slash
   * needed.
   */
  baseUrl: string;
  /** Bearer token, on the off chance a deploy fronts ESPN with an auth gateway. */
  token?: string;
}

export interface NflRegistry {
  resolve(id: string): RegisteredNflSource | null;
  all(): RegisteredNflSource[];
}

export function nflRegistry(sources: readonly RegisteredNflSource[]): NflRegistry {
  const byId = new Map(sources.map((s) => [s.id, s]));
  return {
    resolve: (id) => byId.get(id) ?? null,
    all: () => [...byId.values()],
  };
}

export interface NflProxyRequest {
  /** Which registered source, never a host. */
  sourceId: string;
  /** The ESPN-relative resource path the adapter built, e.g. `/nfl/summary?event=…`. */
  path: string;
}

export type NflProxyResult =
  | { ok: true; status: number; body: unknown }
  | { ok: false; status: number; error: string };

/**
 * The path shapes the adapter legitimately asks for. Anything else is a 403 — the
 * client is confined to the four resources the live source reads, so the proxy
 * cannot be steered at an arbitrary ESPN (or, via a crafted path, non-ESPN)
 * endpoint. Query strings are allowed and are not part of the match; the team
 * segment is constrained to the abbreviation characters a code uses.
 */
const PERMITTED_PATHS: readonly RegExp[] = [
  /^\/nfl\/scoreboard$/,
  /^\/nfl\/summary$/,
  /^\/nfl\/teams\/[A-Za-z0-9]{2,4}\/roster$/,
  /^\/nfl\/teams\/[A-Za-z0-9]{2,4}\/injuries$/,
];

function permitted(pathname: string): boolean {
  return PERMITTED_PATHS.some((re) => re.test(pathname));
}

/**
 * Handle one client request against the registry.
 *
 * Two refusals are the security of the thing:
 *
 * - **An unknown `sourceId` is a 404** — the allowlist is the boundary, so a
 *   host that was not registered is not nameable.
 * - **A path outside the permitted shapes is a 403** — otherwise a crafted path
 *   could point the server's fetch anywhere. The pathname is checked against the
 *   fixed set above with its query string stripped, so `?event=123` is fine but
 *   `/nfl/../../evil` is not.
 */
export async function handleNflProxyRequest(
  registry: NflRegistry,
  fetchImpl: FetchLike,
  request: NflProxyRequest,
): Promise<NflProxyResult> {
  const source = registry.resolve(request.sourceId);
  if (!source) {
    return { ok: false, status: 404, error: `unknown source: ${request.sourceId}` };
  }
  if (typeof request.path !== 'string' || request.path.length === 0) {
    return { ok: false, status: 400, error: 'missing path' };
  }

  // Parse against a dummy base so a relative path is a valid URL, and so a path
  // that tries to smuggle a host (`//evil.com/x`) or traverse (`/nfl/../x`) is
  // normalized before it is checked — the check then runs on the real pathname.
  let parsed: URL;
  try {
    parsed = new URL(request.path, 'http://proxy.invalid');
  } catch {
    return { ok: false, status: 400, error: 'invalid path' };
  }
  // A path that resolved to another origin cannot have come from the adapter.
  if (parsed.origin !== 'http://proxy.invalid' || !permitted(parsed.pathname)) {
    return { ok: false, status: 403, error: `path not permitted: ${parsed.pathname}` };
  }

  const base = source.baseUrl.replace(/\/$/, '');
  const url = `${base}${parsed.pathname}${parsed.search}`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (source.token) headers.Authorization = `Bearer ${source.token}`;

  try {
    const res = await fetchImpl(url, { headers });
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return {
        ok: false,
        status: res.ok ? 502 : res.status,
        error: `upstream returned a non-JSON body (status ${res.status})`,
      };
    }
    if (res.ok) return { ok: true, status: res.status, body };
    return { ok: false, status: res.status, error: `upstream responded ${res.status}` };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: err instanceof Error ? err.message : 'upstream fetch failed',
    };
  }
}
