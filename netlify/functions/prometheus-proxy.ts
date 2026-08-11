import { handleProxyRequest } from '../../src/backend/proxy';
import type { FetchLike } from '../../src/adapters/prometheus/query';
import { registryFromEnv } from './_registry';

/**
 * The proxy, as a Netlify Function — the fetch a browser is forbidden to make.
 *
 * The client POSTs `{ sourceId, promql }` here (see `promProxyFetch`); this
 * resolves the id against the env-built registry, does the upstream fetch with
 * the server-held token, and returns the Prometheus envelope untouched. All of
 * the actual logic — the 404 for an unknown source, the 403 for a query outside
 * the allowlist, the passthrough — lives in the tested `handleProxyRequest`; this
 * file is only the HTTP skin around it.
 *
 * Uses the Web-standard `Request`/`Response` and an in-file `config.path`, so it
 * needs no `@netlify/functions` import to route at `/api/proxy/prometheus` —
 * which is what the client's `VITE_PROM_PROXY_URL` should point at.
 */
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  let payload: { sourceId?: unknown; promql?: unknown };
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const result = await handleProxyRequest(
    registryFromEnv(),
    // Global `fetch` is the platform fetch in the functions runtime; it satisfies
    // the narrow `FetchLike` the adapter uses.
    fetch as unknown as FetchLike,
    {
      sourceId: String(payload.sourceId ?? ''),
      promql: String(payload.promql ?? ''),
    },
  );

  if (result.ok) return Response.json(result.body, { status: result.status });
  return Response.json({ error: result.error }, { status: result.status });
}

export const config = { path: '/api/proxy/prometheus' };
