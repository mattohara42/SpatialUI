import { describe, expect, it } from 'vitest';
import { liveNflSource } from './live';
import type { FetchLike } from './espn';
import {
  INJURIES,
  ROSTER,
  SCOREBOARD_META,
  SUMMARY,
  SUMMARY_2,
  WEEK_SCOREBOARD,
} from './espn.fixtures';
import { NFL_GARDEN_ID } from '../../translation/nfl';

const NOW = Date.UTC(2024, 8, 23, 12, 0, 0);

/** The same path-routing stub the parser tests use, as a source's fetchImpl. */
function espnStub(onSummary?: (url: string) => void): FetchLike {
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
    if (path.startsWith('/nfl/summary')) onSummary?.(url);
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

describe('liveNflSource', () => {
  it('reads an empty garden before its first refresh', () => {
    const source = liveNflSource({ baseUrl: '', fetchImpl: espnStub() });
    const garden = source.read(NOW);
    expect(source.snapshot).toBeNull();
    expect(Object.keys(garden.nodes)).toHaveLength(0);
  });

  it('refreshes from ESPN and reads a full, live-stamped garden', async () => {
    const source = liveNflSource({ baseUrl: '', fetchImpl: espnStub() });
    await source.refresh(NOW);

    expect(source.snapshot?.provenance.kind).toBe('live');

    const garden = source.read(NOW);
    const plants = Object.values(garden.nodes).filter((n) => n.kind === 'plant');
    const beds = Object.values(garden.nodes).filter((n) => n.kind === 'bed');
    // The whole league lays out: thirty-two clubs in eight divisions, same as the
    // synthetic source — the mapping did not change to go live.
    expect(plants).toHaveLength(32);
    expect(beds).toHaveLength(8);

    for (const plant of plants) {
      expect(plant.gardenId).toBe(NFL_GARDEN_ID);
      expect(plant.vitality).toBeGreaterThanOrEqual(0);
      expect(plant.vitality).toBeLessThanOrEqual(1);
      expect(plant.emblem).toBeDefined();
    }
  });

  it('is pollable and registered under the NFL garden', () => {
    const source = liveNflSource({ baseUrl: '', fetchImpl: espnStub() });
    expect(source.pollable).toBe(true);
    expect(source.gardenId).toBe(NFL_GARDEN_ID);
  });

  it('does not re-fetch box scores it already holds across refreshes', async () => {
    const summaries: string[] = [];
    const source = liveNflSource({
      baseUrl: '',
      fetchImpl: espnStub((url) => summaries.push(url)),
    });

    await source.refresh(NOW);
    const firstCount = summaries.length;
    expect(firstCount).toBeGreaterThan(0);

    summaries.length = 0;
    await source.refresh(NOW + 60_000);
    // The games were already final and held, so the second refresh fetches no
    // summaries — the accumulation that keeps a poll cheap.
    expect(summaries).toHaveLength(0);
  });

  it('adopts a snapshot without fetching — the backend seam', async () => {
    const source = liveNflSource({ baseUrl: '', fetchImpl: espnStub() });
    // Build a snapshot through a normal refresh, then hand it to a fresh source
    // via adopt and confirm read reflects it with no network of its own.
    await source.refresh(NOW);
    const snapshot = source.snapshot!;

    const adopter = liveNflSource({ baseUrl: '', fetchImpl: undefined });
    adopter.adopt(snapshot);
    const garden = adopter.read(NOW);
    expect(Object.values(garden.nodes).filter((n) => n.kind === 'plant')).toHaveLength(32);
  });
});
