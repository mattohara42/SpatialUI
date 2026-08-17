import { describe, expect, it } from 'vitest';
import {
  handleNflProxyRequest,
  nflRegistry,
  type NflProxyRequest,
} from './nflProxy';
import { nflProxyFetch } from './nflProxyFetch';
import type { ProxyTransport } from './proxyFetch';
import { liveNflSource } from '../adapters/nfl/live';
import type { FetchLike } from '../adapters/nfl/espn';
import {
  INJURIES,
  ROSTER,
  SCOREBOARD_META,
  SUMMARY,
  SUMMARY_2,
  WEEK_SCOREBOARD,
} from '../adapters/nfl/espn.fixtures';

/** ESPN stand-in: routes a full URL (base + path) to the right fixture. */
function espnStub(): FetchLike {
  const routes: Record<string, unknown> = {
    '/nfl/scoreboard': SCOREBOARD_META,
    '/nfl/scoreboard?dates=2024&seasontype=2&week=1': WEEK_SCOREBOARD,
    '/nfl/scoreboard?dates=2024&seasontype=2&week=2': { events: [] },
    '/nfl/scoreboard?dates=2024&seasontype=2&week=3': WEEK_SCOREBOARD,
    '/nfl/summary?event=401671001': SUMMARY,
    '/nfl/summary?event=401671002': SUMMARY_2,
  };
  return async (url) => {
    const path = url.replace(/^https:\/\/[^/]+\/apis\/site\/v2\/sports\/football/, '');
    const body = path.endsWith('/roster')
      ? ROSTER
      : path.endsWith('/injuries')
        ? INJURIES
        : path.startsWith('/nfl/summary')
          ? (routes[path] ?? { header: { competitions: [] }, boxscore: { teams: [] } })
          : (routes[path] ?? { events: [] });
    return { ok: true, status: 200, json: async () => body };
  };
}

const registry = nflRegistry([
  { id: 'nfl', baseUrl: 'https://site.api.espn.com/apis/site/v2/sports/football' },
]);

describe('handleNflProxyRequest', () => {
  const call = (request: NflProxyRequest) => handleNflProxyRequest(registry, espnStub(), request);

  it('404s an unknown source — the allowlist is the boundary', async () => {
    const res = await call({ sourceId: 'nope', path: '/nfl/scoreboard' });
    expect(res).toMatchObject({ ok: false, status: 404 });
  });

  it('passes through the permitted resource paths', async () => {
    for (const path of [
      '/nfl/scoreboard',
      '/nfl/scoreboard?dates=2024&seasontype=2&week=1',
      '/nfl/summary?event=401671001',
      '/nfl/teams/KC/roster',
      '/nfl/teams/BUF/injuries',
    ]) {
      const res = await call({ sourceId: 'nfl', path });
      expect(res.ok, path).toBe(true);
    }
  });

  it('403s a path outside the permitted shapes', async () => {
    const res = await call({ sourceId: 'nfl', path: '/nfl/news' });
    expect(res).toMatchObject({ ok: false, status: 403 });
  });

  it('403s a traversal or a smuggled host rather than fetching it', async () => {
    const traverse = await call({ sourceId: 'nfl', path: '/nfl/../../v1/secret' });
    expect(traverse.ok).toBe(false);
    const host = await call({ sourceId: 'nfl', path: '//evil.example.com/nfl/scoreboard' });
    expect(host).toMatchObject({ ok: false, status: 403 });
  });

  it('attaches a server-held token the client never sees', async () => {
    let seenAuth: string | undefined;
    const spy: FetchLike = async (_url, init) => {
      seenAuth = init?.headers?.Authorization;
      return { ok: true, status: 200, json: async () => ({}) };
    };
    const tokened = nflRegistry([{ id: 'nfl', baseUrl: 'https://x', token: 'secret' }]);
    await handleNflProxyRequest(tokened, spy, { sourceId: 'nfl', path: '/nfl/scoreboard' });
    expect(seenAuth).toBe('Bearer secret');
  });
});

describe('nflProxyFetch end to end', () => {
  it('drives a live garden through the proxy, provenance preserved', async () => {
    // The transport is the proxy: a POST is resolved against the registry with an
    // ESPN stub on its far side, exactly as the Netlify function would.
    const upstream = espnStub();
    const transport: ProxyTransport = async (_url, init) => {
      const { sourceId, path } = JSON.parse(init.body) as NflProxyRequest;
      const result = await handleNflProxyRequest(registry, upstream, { sourceId, path });
      return {
        ok: result.ok,
        status: result.status,
        json: async () => (result.ok ? result.body : { error: result.error }),
      };
    };

    const source = liveNflSource({
      baseUrl: '',
      fetchImpl: nflProxyFetch('/api/proxy/nfl', 'nfl', transport),
    });

    await source.refresh(Date.UTC(2024, 8, 23, 12, 0, 0));
    // The whole point of the proxy: nothing about the source or the mapping
    // changed, and the snapshot is still stamped live.
    expect(source.snapshot?.provenance.kind).toBe('live');

    const garden = source.read(Date.UTC(2024, 8, 23, 12, 0, 0));
    const plants = Object.values(garden.nodes).filter((n) => n.kind === 'plant');
    expect(plants).toHaveLength(32);
  });
});
