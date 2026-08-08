import { describe, expect, it } from 'vitest';
import { GAME_DURATION_MS, generateNflSnapshot, seasonYear } from './season';
import { NFL_TEAMS, divisionKey } from './teams';
import { DEPTH_CHART } from './roster';

/**
 * The snapshot is generated, so the interesting tests are not "are these the
 * real scores" — they are not — but "is this the shape a real feed has, and are
 * the invariants a season cannot violate actually held". A synthetic source that
 * quietly produces impossible data is worse than no source at all, because
 * everything downstream gets tuned against the impossibility.
 */

const NOW = Date.UTC(2025, 11, 8, 18, 0, 0);
const snapshot = generateNflSnapshot(NOW);

describe('the league', () => {
  it('has all thirty-two clubs, four to a division', () => {
    expect(snapshot.teams).toHaveLength(32);

    const counts = new Map<string, number>();
    for (const { team } of snapshot.teams) {
      const key = divisionKey(team);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(8);
    for (const count of counts.values()) expect(count).toBe(4);
  });

  it('gives every club a unique id and abbreviation', () => {
    expect(new Set(NFL_TEAMS.map((t) => t.id)).size).toBe(32);
    expect(new Set(NFL_TEAMS.map((t) => t.abbr)).size).toBe(32);
  });

  it('founds every club between 1919 and the last expansion', () => {
    for (const team of NFL_TEAMS) {
      expect(team.founded).toBeGreaterThanOrEqual(1919);
      expect(team.founded).toBeLessThanOrEqual(2002);
    }
  });
});

describe('the schedule', () => {
  it('never asks a club to play twice in a week', () => {
    const seen = new Map<number, Set<string>>();
    for (const game of snapshot.games) {
      const week = seen.get(game.week) ?? new Set<string>();
      expect(week.has(game.homeId)).toBe(false);
      expect(week.has(game.awayId)).toBe(false);
      week.add(game.homeId);
      week.add(game.awayId);
      seen.set(game.week, week);
    }
  });

  it('leaves somebody idle every week, which is what a bye is', () => {
    for (let week = 1; week <= snapshot.throughWeek; week++) {
      const playing = snapshot.games.filter((g) => g.week === week);
      expect(playing.length).toBeLessThan(16);
      expect(playing.length).toBeGreaterThan(12);
    }
  });

  it('has already been played: no game kicks off in the future', () => {
    for (const game of snapshot.games) {
      expect(game.kickoffAt + GAME_DURATION_MS).toBeLessThanOrEqual(NOW);
    }
  });

  it('puts the most recent kickoff inside the scrub window, so time scrub crosses a result', () => {
    const latest = Math.max(...snapshot.games.map((g) => g.kickoffAt));
    const hoursAgo = (NOW - latest) / 3_600_000;
    expect(hoursAgo).toBeGreaterThan(3);
    expect(hoursAgo).toBeLessThan(47);
  });

  it('runs chronologically, the order every derivation assumes', () => {
    for (let i = 1; i < snapshot.games.length; i++) {
      expect(snapshot.games[i].kickoffAt).toBeGreaterThanOrEqual(
        snapshot.games[i - 1].kickoffAt,
      );
    }
  });
});

describe('box scores', () => {
  it('spends exactly sixty minutes of clock in every game', () => {
    for (const game of snapshot.games) {
      expect(game.home.timeOfPossessionSec + game.away.timeOfPossessionSec).toBe(3600);
    }
  });

  it('never records a score football cannot produce', () => {
    for (const game of snapshot.games) {
      for (const line of [game.home, game.away]) {
        expect(line.points).toBeGreaterThanOrEqual(0);
        expect(line.points).not.toBe(1);
        expect(line.points).not.toBe(2);
      }
    }
  });

  it('keeps derived counts inside their own totals', () => {
    for (const game of snapshot.games) {
      for (const line of [game.home, game.away]) {
        expect(line.passYards + line.rushYards).toBe(line.yards);
        expect(line.thirdDownConversions).toBeLessThanOrEqual(line.thirdDownAttempts);
        expect(line.redZoneTouchdowns).toBeLessThanOrEqual(line.redZoneTrips);
        expect(line.penaltyYards).toBeGreaterThanOrEqual(line.penalties);
      }
    }
  });

  it('balances the league: every win is somebody else’s loss', () => {
    let wins = 0;
    let losses = 0;
    let ties = 0;
    for (const game of snapshot.games) {
      if (game.home.points === game.away.points) ties += 2;
      else {
        wins++;
        losses++;
      }
    }
    expect(wins).toBe(losses);
    expect(ties % 2).toBe(0);
  });

  it('scores more when it gains more, so a stat line reads as one game', () => {
    // Not a strict rule — teams do score on short fields — but across a season
    // the correlation has to be there or every club ends up with the same
    // profile under different labels.
    const lines = snapshot.games.flatMap((g) => [g.home, g.away]);
    const high = lines.filter((l) => l.points >= 28);
    const low = lines.filter((l) => l.points <= 13);
    expect(mean(high.map((l) => l.yards))).toBeGreaterThan(
      mean(low.map((l) => l.yards)),
    );
    expect(mean(high.map((l) => l.turnovers))).toBeLessThan(
      mean(low.map((l) => l.turnovers)),
    );
  });
});

describe('rosters and the injury report', () => {
  it('carries a full depth chart for every club', () => {
    for (const { team, roster } of snapshot.teams) {
      expect(roster).toHaveLength(DEPTH_CHART.length);
      expect(new Set(roster.map((r) => r.slot)).size).toBe(DEPTH_CHART.length);
      expect(roster.every((r) => r.id.startsWith(`${team.id}/`))).toBe(true);
    }
  });

  it('fields eleven starters on each side plus the three specialists', () => {
    // Twenty-five, not twenty-six: the third corner starts and the third
    // linebacker does not, because nickel is the base defence.
    expect(DEPTH_CHART.filter((s) => s.starter)).toHaveLength(25);
  });

  it('ages every player plausibly, and in step with their service', () => {
    for (const { roster } of snapshot.teams) {
      for (const slot of roster) {
        expect(slot.age).toBeGreaterThanOrEqual(21);
        expect(slot.age).toBeLessThan(42);
        expect(slot.experience).toBeGreaterThanOrEqual(0);
        // Nobody debuts before twenty-one, so age minus service cannot drop below it.
        expect(slot.age - slot.experience).toBeGreaterThanOrEqual(21);
      }
    }
  });

  it('makes starters the more experienced group, on average', () => {
    const roster = snapshot.teams.flatMap((t) => t.roster);
    const starters = mean(roster.filter((r) => r.starter).map((r) => r.experience));
    const depth = mean(roster.filter((r) => !r.starter).map((r) => r.experience));
    expect(starters).toBeGreaterThan(depth);
  });

  it('reports injuries against real slots, in the past, one entry each', () => {
    for (const { team, roster, injuries } of snapshot.teams) {
      const slots = new Set(roster.map((r) => r.slot));
      const seen = new Set<string>();
      for (const injury of injuries) {
        expect(slots.has(injury.slot)).toBe(true);
        expect(injury.teamId).toBe(team.id);
        expect(injury.since).toBeLessThanOrEqual(NOW);
        expect(seen.has(injury.slot)).toBe(false);
        seen.add(injury.slot);
      }
    }
  });

  it('dates most injuries to a game, so scrubbing back can undo them', () => {
    const injuries = snapshot.teams.flatMap((t) => t.injuries);
    expect(injuries.length).toBeGreaterThan(32);
    const kickoffs = new Set(snapshot.games.map((g) => g.kickoffAt));
    const duringAGame = injuries.filter((injury) =>
      [...kickoffs].some(
        (k) => injury.since >= k + 3_600_000 && injury.since <= k + 3 * 3_600_000,
      ),
    );
    expect(duringAGame.length).toBe(injuries.length);
  });
});

describe('provenance and determinism', () => {
  it('says in the data that the data is generated', () => {
    expect(snapshot.provenance.kind).toBe('synthetic');
    expect(snapshot.provenance.note).toMatch(/generated/i);
    expect(snapshot.provenance.seed).toBeTypeOf('number');
  });

  it('produces identical output for the same clock and seed', () => {
    expect(generateNflSnapshot(NOW)).toEqual(snapshot);
  });

  it('produces different results under a different seed', () => {
    const other = generateNflSnapshot(NOW, { seed: 99 });
    expect(other.games[0].home.points).not.toBe(snapshot.games[0].home.points);
  });

  it('files a date in the new year under the season that started in the autumn', () => {
    expect(seasonYear(Date.UTC(2025, 11, 20))).toBe(2025);
    expect(seasonYear(Date.UTC(2026, 0, 10))).toBe(2025);
    expect(seasonYear(Date.UTC(2026, 8, 14))).toBe(2026);
  });
});

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / (values.length || 1);
}
