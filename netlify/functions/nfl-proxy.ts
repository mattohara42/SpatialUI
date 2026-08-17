import { handleNflProxyRequest } from '../../src/backend/nflProxy';
import type { FetchLike } from '../../src/adapters/nfl/espn';
import { nflRegistryFromEnv } from './_nflRegistry';

/**
 * The NFL proxy, as a Netlify Function — the fetch a browser is forbidden to make
 * against ESPN.
 *
 * The client POSTs `{ sourceId, path }` here (see `nflProxyFetch`); this resolves
 * the id against the env-built registry, checks the path against the allowlist,
 * does the upstream fetch, and returns ESPN's JSON untouched. All of the real
 * logic — the 404 for an unknown source, the 403 for a path outside the four
 * permitted resources, the passthrough — is the tested `handleNflProxyRequest`;
 * this file is only the HTTP skin.
 *
 * Uses the Web-standard `Request`/`Response` and an in-file `config.path`, so it
 * needs no `@netlify/functions` import to route at `/api/proxy/nfl` — which is
 * what the client's `VITE_NFL_PROXY_URL` should point at.
 */
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  let payload: { sourceId?: unknown; path?: unknown };
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const result = await handleNflProxyRequest(
    nflRegistryFromEnv(),
    // Global `fetch` is the platform fetch in the functions runtime; it satisfies
    // the narrow `FetchLike` the adapter uses.
    fetch as unknown as FetchLike,
    {
      sourceId: String(payload.sourceId ?? ''),
      path: String(payload.path ?? ''),
    },
  );

  if (result.ok) return Response.json(result.body, { status: result.status });
  return Response.json({ error: result.error }, { status: result.status });
}

export const config = { path: '/api/proxy/nfl' };
