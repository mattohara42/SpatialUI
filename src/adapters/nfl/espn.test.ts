import { describe, expect, it } from 'vitest';
import {
  fetchNflSnapshot,
  parseInjuries,
  parseRoster,
  parseScoreboardMeta,
  parseScoreboardResults,
  parseSummaryGame,
  teamIdFromAbbr,
  type FetchLike,
} from './espn';
import {
  INJURIES,
  ROSTER,
  SCOREBOARD_META,
  SUMMARY,
  SUMMARY_2,
  WEEK_SCOREBOARD,
} from './espn.fixtures';
import { gamesByTeam, recordOf, statsOf } from './derive';

describe('teamIdFromAbbr', () => {
  it('maps ESPN codes to our stable ids, including the aliases', () => {
    expect(teamIdFromAbbr('KC')).toBe('kc');
    expect(teamIdFromAbbr('kc')).toBe('kc');
    // ESPN uses WSH / LA / JAC where we use was / lar / jax.
    expect(teamIdFromAbbr('WSH')).toBe('was');
    expect(teamIdFromAbbr('LA')).toBe('lar');
    expect(teamIdFromAbbr('JAC')).toBe('jax');
  });

  it('returns null for a code we do not carry', () => {
    expect(teamIdFromAbbr('XXX')).toBeNull();
    expect(teamIdFromAbbr(undefined)).toBeNull();
  });
});

describe('parseScoreboardMeta', () => {
  it('reads the live season, seasontype, and current week', () => {
    expect(parseScoreboardMeta(SCOREBOARD_META)).toEqual({
      season: 2024,
      seasonType: 2,
      week: 3,
    });
  });

  it('is null-shaped rather than throwing on an empty body', () => {
    expect(parseScoreboardMeta({})).toEqual({ season: null, seasonType: null, week: null });
    expect(parseScoreboardMeta(undefined)).toEqual({ season: null, seasonType: null, week: null });
  });
});

describe('parseScoreboardResults', () => {
  it('emits final games and skips the one in progress', () => {
    const results = parseScoreboardResults(WEEK_SCOREBOARD);
    // Two of the three events are final; the SF/LAR game is still 'in'.
    expect(results.map((r) => r.id)).toEqual(['401671001', '401671002']);
  });

  it('carries the final score and resolves both team ids', () => {
    const [kcAtl, bufBal] = parseScoreboardResults(WEEK_SCOREBOARD);
    expect(kcAtl).toMatchObject({ homeId: 'kc', awayId: 'atl', homePoints: 27, awayPoints: 20 });
    expect(bufBal).toMatchObject({ homeId: 'buf', awayId: 'bal', homePoints: 10, awayPoints: 31 });
    expect(kcAtl.week).toBe(3);
    expect(kcAtl.kickoffAt).toBe(Date.parse('2024-09-22T17:00Z'));
  });
});

describe('parseSummaryGame', () => {
  it('builds a full box score for both teams, points from the header', () => {
    const game = parseSummaryGame(SUMMARY)!;
    expect(game.id).toBe('401671001');
    expect(game.homeId).toBe('kc');
    expect(game.awayId).toBe('atl');
    expect(game.home.points).toBe(27);
    expect(game.away.points).toBe(20);
  });

  it('parses the stat line, including the "made-attempted" ratios and the clock', () => {
    const game = parseSummaryGame(SUMMARY)!;
    expect(game.home).toMatchObject({
      yards: 368,
      passYards: 241,
      rushYards: 127,
      plays: 64,
      firstDowns: 22,
      thirdDownConversions: 6,
      thirdDownAttempts: 13,
      redZoneTouchdowns: 3,
      redZoneTrips: 4,
      turnovers: 1,
      sacksAllowed: 2,
      penalties: 5,
      penaltyYards: 40,
      timeOfPossessionSec: 31 * 60 + 24,
    });
  });

  it('defaults a missing stat to zero rather than throwing', () => {
    const thin = {
      header: {
        week: 1,
        competitions: [
          {
            id: 'g1',
            date: '2024-09-08T17:00Z',
            competitors: [
              { homeAway: 'home', score: '17', team: { abbreviation: 'DAL' } },
              { homeAway: 'away', score: '13', team: { abbreviation: 'NYG' } },
            ],
          },
        ],
      },
      boxscore: { teams: [] },
    };
    const game = parseSummaryGame(thin)!;
    expect(game.home.points).toBe(17);
    expect(game.home.yards).toBe(0);
    expect(game.home.timeOfPossessionSec).toBe(0);
  });

  it('returns null when it cannot tie the summary to two teams we carry', () => {
    expect(parseSummaryGame({ header: { competitions: [{ id: 'x', competitors: [] }] } })).toBeNull();
  });
});

describe('parseRoster', () => {
  it('turns athletes into slots carrying age and experience', () => {
    const roster = parseRoster(ROSTER, 'kc');
    expect(roster.length).toBe(7);
    for (const slot of roster) {
      expect(slot.id.startsWith('kc/')).toBe(true);
      expect(slot.age).toBeGreaterThan(0);
      expect(slot.experience).toBeGreaterThanOrEqual(0);
    }
    // A rookie carries zero years of service, which seasoning counts.
    expect(roster.some((s) => s.experience === 0)).toBe(true);
  });

  it('groups by position and marks the most experienced as starters', () => {
    const roster = parseRoster(ROSTER, 'kc');
    const qbs = roster.filter((s) => s.group === 'quarterback');
    expect(qbs.length).toBe(2);
    // One QB starts; the seven-year vet outranks the rookie for the split.
    const starterQb = qbs.find((s) => s.starter)!;
    expect(starterQb.experience).toBe(7);
    expect(qbs.filter((s) => s.starter).length).toBe(1);
  });
});

describe('parseInjuries', () => {
  it('maps recognized statuses and drops the rest', () => {
    const injuries = parseInjuries(INJURIES, 'kc', 1_700_000_000_000);
    // Out and Questionable are kept; "Probable-ish" is not a designation.
    expect(injuries.map((i) => i.status).sort()).toEqual(['out', 'questionable']);
    expect(injuries.every((i) => i.teamId === 'kc')).toBe(true);
    const out = injuries.find((i) => i.status === 'out')!;
    expect(out.since).toBe(Date.parse('2024-09-20T14:00Z'));
    expect(out.description).toBe('Hamstring');
  });
});

describe('fetchNflSnapshot', () => {
  // A fetch stub that routes by path to the right fixture — the socket, replaced.
  const routes: Record<string, unknown> = {
    '/nfl/scoreboard': SCOREBOARD_META,
    '/nfl/scoreboard?dates=2024&seasontype=2&week=1': WEEK_SCOREBOARD,
    '/nfl/scoreboard?dates=2024&seasontype=2&week=2': { events: [] },
    '/nfl/scoreboard?dates=2024&seasontype=2&week=3': WEEK_SCOREBOARD,
    '/nfl/summary?event=401671001': SUMMARY,
    '/nfl/summary?event=401671002': SUMMARY_2,
  };
  const stub: FetchLike = async (url) => {
    const path = url.replace(/^https:\/\/[^/]+\/apis\/site\/v2\/sports\/football/, '');
    const roster = path.endsWith('/roster');
    const injuries = path.endsWith('/injuries');
    const summary = path.startsWith('/nfl/summary');
    const body = roster
      ? ROSTER
      : injuries
        ? INJURIES
        : summary
          ? (routes[path] ?? { header: { competitions: [] }, boxscore: { teams: [] } })
          : (routes[path] ?? { events: [] });
    return { ok: true, status: 200, json: async () => body };
  };

  it('assembles a live-stamped season snapshot the derivations accept', async () => {
    const snapshot = await fetchNflSnapshot({ baseUrl: '' }, stub, 1_700_000_000_000);

    expect(snapshot.provenance.kind).toBe('live');
    expect(snapshot.season).toBe(2024);
    expect(snapshot.throughWeek).toBe(3);
    // WEEK_SCOREBOARD is returned for weeks 1 and 3, so its two final games
    // appear once per week: four games, all with resolved teams.
    expect(snapshot.games.length).toBe(4);
    expect(snapshot.teams.length).toBe(32);

    // The derivations run on it unchanged — the whole claim of the adapter.
    const byTeam = gamesByTeam(snapshot);
    const kc = recordOf(byTeam['kc']);
    expect(kc.wins).toBe(2); // KC beat ATL in both returned weeks.
    expect(kc.pointsFor).toBe(54);
    const kcStats = statsOf(byTeam['kc']);
    expect(kcStats.offense.yardsPerGame).toBe(368);
  });

  it('is incremental: a held game is not re-fetched', async () => {
    const seen: string[] = [];
    const counting: FetchLike = async (url, init) => {
      if (url.includes('/summary')) seen.push(url);
      return stub(url, init);
    };
    const first = await fetchNflSnapshot({ baseUrl: '' }, counting, 1_700_000_000_000);
    const summariesFirst = seen.length;
    expect(summariesFirst).toBeGreaterThan(0);

    seen.length = 0;
    const games: Record<string, (typeof first.games)[number]> = {};
    for (const g of first.games) games[g.id] = g;
    await fetchNflSnapshot({ baseUrl: '' }, counting, 1_700_000_000_000, { games });
    // Every game was already held, so no summary is fetched the second time.
    expect(seen.length).toBe(0);
  });

  it('can skip rosters and injuries to keep the walk to results only', async () => {
    const snapshot = await fetchNflSnapshot(
      { baseUrl: '', includeRosters: false, includeInjuries: false },
      stub,
      1_700_000_000_000,
    );
    expect(snapshot.teams.every((t) => t.roster.length === 0)).toBe(true);
    expect(snapshot.teams.every((t) => t.injuries.length === 0)).toBe(true);
  });
});
