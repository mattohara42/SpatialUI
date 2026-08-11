import type { PromQuery } from '../adapters/prometheus/query';
import type { PromMapping } from '../translation/prometheus';

/**
 * The registered-source allowlist — the whole reason the proxy is a trust
 * boundary and not a CORS shim.
 *
 * A client names *which source*, never a host. The base URL and the bearer token
 * live here, server-side, so a client can only reach a Prometheus an operator
 * registered, and the token never enters a bundle, a query string, or a node's
 * `raw` (see `adapters/prometheus/query.ts`, which reads it only inside the
 * fetch). This is what closes the request-forgery hole `docs/sources.md` names:
 * "pointing the app at a user-named host from the browser is a request-forgery
 * surface." With the host named here instead, it is not.
 */
export interface RegisteredPromSource {
  /** The id a client names in a proxy request, and the loop walks by. */
  id: string;
  /** Where to fetch and what to ask — carries the bearer token, if any. */
  query: PromQuery;
  /** How the fleet maps to a garden. */
  mapping: PromMapping;
  /** Scrape cadence for the poll/staleness schedule. Defaults to 60s downstream. */
  scrapeIntervalMs?: number;
}

export interface PromRegistry {
  /** Resolve a client-named id to its registered source, or null if unknown. */
  resolve(id: string): RegisteredPromSource | null;
  /** Every registered source, for the collector loop to walk. */
  all(): RegisteredPromSource[];
}

/**
 * A registry over a fixed list. Pure and synchronous — the config an operator
 * hands the process at startup, not something a client can extend at runtime,
 * which is the point.
 */
export function promRegistry(sources: readonly RegisteredPromSource[]): PromRegistry {
  const byId = new Map(sources.map((s) => [s.id, s]));
  return {
    resolve: (id) => byId.get(id) ?? null,
    all: () => [...byId.values()],
  };
}
