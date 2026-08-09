import { describe, expect, it } from 'vitest';
import {
  availabilityAt,
  gamesByTeam,
  gamesThrough,
  pythagorean,
  recordOf,
  seasoningOf,
  statsOf,
  type TeamGame,
} from './derive';
import { GAME_DURATION_MS, generateNflSnapshot } from './season';
import { DEPTH_CHART, TOTAL_IMPORTANCE } from './roster';
import type { Injury, RosterSlot, TeamBoxScore } from './types';

const NOW = Date.UTC(2025, 11, 8, 18, 0, 0);
const HOUR = 3_600_000;

const line = (overrides: Partial<TeamBoxScore> = {}): TeamBoxScore => ({
  points: 20,
  yards: 340,
  passYards: 220,
  rushYards: 120,
  plays: 62,
  firstDowns: 19,
  thirdDownAttempts: 13,
  thirdDownConversions: 5,
  redZoneTrips: 3,
  redZoneTouchdowns: 2,
  turnovers: 1,
  sacksAllowed: 2,
  penalties: 6,
  penaltyYards: 55,
  timeOfPossessionSec: 1800,
  ...overrides,
});

const game = (
  week: number,
  own: number,
  against: number,
  kickoffAt = week * 7 * 24 * HOUR,
): TeamGame => ({
  gameId: `w${week}`,
  week,
  kickoffAt,
  finalAt: kickoffAt + GAME_DURATION_MS,
  opponentId: 'opp',
  home: true,
  own: line({ points: own }),
  opponent: line({ points: against }),
  result: own > against ? 'W' : own < against ? 'L' : 'T',
});

describe('a game becomes history when it is final, not when it kicks off', () => {
  const games = [game(1, 24, 17)];

  it('does not count a game that is still being played', () => {
    expect(gamesThrough(games, games[0].kickoffAt + HOUR)).toHaveLength(0);
  });

  it('counts it once the clock has run out', () => {
    expect(gamesThrough(games, games[0].finalAt)).toHaveLength(1);
  });
});

describe('recordOf', () => {
  it('counts a tie as half a win, the way the table does', () => {
    const record = recordOf([game(1, 20, 20), game(2, 24, 10)]);
    expect(record.wins).toBe(1);
    expect(record.ties).toBe(1);
    expect(record.winPct).toBe(0.75);
  });

  it('reports a run of wins as a positive streak and a slump as a negative one', () => {
    expect(recordOf([game(1, 10, 20), game(2, 24, 10), game(3, 30, 3)]).streak).toBe(2);
    expect(recordOf([game(1, 30, 3), game(2, 10, 20), game(3, 6, 9)]).streak).toBe(-2);
  });

  it('breaks a streak on a tie rather than counting through it', () => {
    expect(recordOf([game(1, 24, 10), game(2, 17, 17)]).streak).toBe(0);
  });

  it('lists the last five most recent first, and no more than five', () => {
    const games = [1, 2, 3, 4, 5, 6].map((w) => game(w, w % 2 === 0 ? 24 : 10, 17));
    const record = recordOf(games);
    expect(record.lastFive).toHaveLength(5);
    expect(record.lastFive[0]).toBe('W'); // week six, 24-17
  });

  it('answers for a club that has not played without dividing by zero', () => {
    const record = recordOf([]);
    expect(record.winPct).toBe(0);
    expect(record.pointDiffPerGame).toBe(0);
    expect(record.streak).toBe(0);
  });
});

describe('statsOf', () => {
  const games = [game(1, 28, 14), game(2, 10, 24)];
  const stats = statsOf(games);

  it('averages a club’s own lines per game', () => {
    expect(stats.offense.pointsPerGame).toBe(19);
    expect(stats.defense.pointsAllowedPerGame).toBe(19);
    expect(stats.offense.yardsPerGame).toBe(340);
  });

  it('reads the opponent’s giveaways as this defence’s takeaways', () => {
    // Both lines carry one turnover in the fixture, so a defence that faced two
    // games has two takeaways to its name.
    expect(stats.defense.takeawaysPerGame).toBe(1);
    expect(stats.efficiency.turnoverMargin).toBe(0);
  });

  it('counts third downs as a rate over the season, not an average of rates', () => {
    const uneven = [
      { ...game(1, 20, 20), own: line({ thirdDownAttempts: 20, thirdDownConversions: 10 }) },
      { ...game(2, 20, 20), own: line({ thirdDownAttempts: 4, thirdDownConversions: 0 }) },
    ];
    // 10 of 24, not the mean of 50% and 0%.
    expect(statsOf(uneven).offense.thirdDownPct).toBeCloseTo(10 / 24, 5);
  });

  it('turns the point differential into the wins it implies', () => {
    expect(pythagorean(100, 100)).toBeCloseTo(0.5, 5);
    expect(pythagorean(400, 200)).toBeGreaterThan(0.75);
    expect(pythagorean(0, 0)).toBe(0.5);
    expect(stats.efficiency.pythagoreanWins).toBeCloseTo(1, 5);
  });

  it('returns zeroes rather than NaN for a club with no games', () => {
    const empty = statsOf([]);
    expect(empty.offense.pointsPerGame).toBe(0);
    expect(empty.offense.thirdDownPct).toBe(0);
    expect(empty.efficiency.pythagoreanWins).toBe(0);
  });
});

describe('availabilityAt', () => {
  const roster: RosterSlot[] = DEPTH_CHART.map((spec) => ({
    id: `t/${spec.slot}`,
    slot: spec.slot,
    position: spec.position,
    group: spec.group,
    starter: spec.starter,
    age: 26,
    experience: 4,
    gamesStarted: 40,
  }));

  const injury = (slot: string, status: Injury['status'], since: number): Injury => ({
    id: `t/${slot}`,
    teamId: 't',
    slot,
    position: slot,
    status,
    description: 'knee',
    since,
    gamesMissed: 1,
  });

  it('is whole when nobody is hurt', () => {
    expect(availabilityAt(roster, [], NOW).available).toBe(1);
  });

  it('does not know about an injury that has not happened yet', () => {
    const later = [injury('QB1', 'out', NOW + HOUR)];
    expect(availabilityAt(roster, later, NOW).available).toBe(1);
    expect(availabilityAt(roster, later, NOW + 2 * HOUR).available).toBeLessThan(1);
  });

  it('costs far more to lose the quarterback than the third tight end', () => {
    const qb = availabilityAt(roster, [injury('QB1', 'out', NOW - HOUR)], NOW);
    const te = availabilityAt(roster, [injury('TE3', 'out', NOW - HOUR)], NOW);
    expect(1 - qb.available).toBeGreaterThan((1 - te.available) * 10);
    expect(qb.available).toBeCloseTo(1 - 20 / TOTAL_IMPORTANCE, 5);
  });

  it('discounts questionable, because questionable usually plays', () => {
    const out = availabilityAt(roster, [injury('WR1', 'out', NOW - HOUR)], NOW);
    const doubt = availabilityAt(roster, [injury('WR1', 'doubtful', NOW - HOUR)], NOW);
    const maybe = availabilityAt(roster, [injury('WR1', 'questionable', NOW - HOUR)], NOW);
    expect(out.available).toBeLessThan(doubt.available);
    expect(doubt.available).toBeLessThan(maybe.available);
    expect(maybe.available).toBeLessThan(1);
  });

  it('counts sidelined starters, and names the most expensive absence', () => {
    const report = [
      injury('QB1', 'ir', NOW - HOUR),
      injury('LT', 'out', NOW - HOUR),
      injury('WR5', 'questionable', NOW - HOUR),
    ];
    const availability = availabilityAt(roster, report, NOW);
    expect(availability.startersOut).toBe(2);
    expect(availability.worst?.slot).toBe('QB1');
    expect(availability.active).toHaveLength(3);
  });
});

describe('seasoningOf', () => {
  it('separates the starters’ service from the whole roster’s', () => {
    const roster: RosterSlot[] = DEPTH_CHART.map((spec) => ({
      id: `t/${spec.slot}`,
      slot: spec.slot,
      position: spec.position,
      group: spec.group,
      starter: spec.starter,
      age: spec.starter ? 29 : 23,
      experience: spec.starter ? 7 : 1,
      gamesStarted: 0,
    }));

    const seasoning = seasoningOf(roster);
    expect(seasoning.starterAvgExperience).toBe(7);
    expect(seasoning.avgExperience).toBeLessThan(7);
    expect(seasoning.avgAge).toBeLessThan(seasoning.starterAvgAge);
    expect(seasoning.rookies).toBe(0);
  });
});

describe('against a whole generated season', () => {
  const snapshot = generateNflSnapshot(NOW);
  const byTeam = gamesByTeam(snapshot);

  it('gives every club its own games, from both sides of the fixture', () => {
    expect(Object.keys(byTeam)).toHaveLength(32);
    const total = Object.values(byTeam).reduce((sum, g) => sum + g.length, 0);
    expect(total).toBe(snapshot.games.length * 2);
  });

  it('agrees with itself about who won', () => {
    for (const game of snapshot.games) {
      const home = byTeam[game.homeId].find((g) => g.gameId === game.id)!;
      const away = byTeam[game.awayId].find((g) => g.gameId === game.id)!;
      expect(home.own.points).toBe(away.opponent.points);
      if (home.result === 'W') expect(away.result).toBe('L');
      if (home.result === 'L') expect(away.result).toBe('W');
      if (home.result === 'T') expect(away.result).toBe('T');
    }
  });

  it('adds every club’s wins up to every club’s losses', () => {
    const records = Object.values(byTeam).map((games) =>
      recordOf(gamesThrough(games, NOW)),
    );
    const wins = records.reduce((sum, r) => sum + r.wins, 0);
    const losses = records.reduce((sum, r) => sum + r.losses, 0);
    expect(wins).toBe(losses);
  });

  it('leaves the whole league scoring what it concedes', () => {
    const records = Object.values(byTeam).map((games) =>
      recordOf(gamesThrough(games, NOW)),
    );
    const scored = records.reduce((sum, r) => sum + r.pointsFor, 0);
    const conceded = records.reduce((sum, r) => sum + r.pointsAgainst, 0);
    expect(scored).toBe(conceded);
  });

  it('produces a table with a top and a bottom rather than thirty-two identical clubs', () => {
    const winPcts = Object.values(byTeam)
      .map((games) => recordOf(gamesThrough(games, NOW)).winPct)
      .sort((a, b) => a - b);
    expect(winPcts[0]).toBeLessThan(0.35);
    expect(winPcts[winPcts.length - 1]).toBeGreaterThan(0.65);
  });

  it('has clubs idle for over a week — the byes the staleness state reads', () => {
    const idle = Object.values(byTeam).filter((games) => {
      const played = gamesThrough(games, NOW);
      return NOW - played[played.length - 1].finalAt > 7 * 24 * HOUR;
    });
    expect(idle.length).toBeGreaterThan(0);
    expect(idle.length).toBeLessThan(6);
  });
});
