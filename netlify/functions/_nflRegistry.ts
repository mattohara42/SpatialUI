import { nflRegistry, type RegisteredNflSource } from '../../src/backend/nflProxy';

/**
 * The NFL registry, built from server-side environment.
 *
 * The client only ever names the source id `nfl` (see `NFL_SOURCE_ID` in
 * `state/sources.ts`); the host it actually reaches lives here, in Netlify's
 * environment. For ESPN's free feed that host is a constant and needs no secret,
 * so a plain deploy sets nothing beyond `VITE_NFL_PROXY_URL` and gets the public
 * feed; the token is here only for a deploy that fronts ESPN with an auth
 * gateway of its own.
 *
 * The leading underscore keeps Netlify from publishing this as its own endpoint;
 * it is a shared module the proxy function imports.
 */

// `process` exists in the functions runtime; the app carries no `@types/node`,
// and these files live outside the app's `tsc` include anyway.
declare const process: { env: Record<string, string | undefined> };

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/football';

export function nflRegistryFromEnv() {
  const source: RegisteredNflSource = {
    // Must match the client's NFL_SOURCE_ID — the name the proxy POST carries.
    id: 'nfl',
    baseUrl: process.env.NFL_ENDPOINT ?? ESPN_BASE,
    token: process.env.NFL_TOKEN,
  };
  return nflRegistry([source]);
}
