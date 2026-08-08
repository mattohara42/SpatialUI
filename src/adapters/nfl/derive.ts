import { GAME_DURATION_MS } from './season';
import { TOTAL_IMPORTANCE, importanceOf } from './roster';
import type {
  Injury,
  NflGame,
  NflSeasonSnapshot,
  RosterSlot,
  TeamBoxScore,
} from './types';

/**
 * Everything a season means, derived from the box scores.
 *
 * Nothing here is stored in the snapshot, and that is the design: a standings
 * table, a stat sheet, and an availability number are all *functions of the
 * games played so far*, so every one of them takes an `asOf` and answers for any
 * moment in the season. History then costs nothing to produce and cannot
 * disagree with the live view, because they are the same function called twice.
 *
 * The alternative — a feed that hands you season totals and a separate history
 * series — is the arrangement where the plant you are looking at and the plant
 * you scrub back to were computed by different code, and one of them is wrong.
 *
 * Still no plants in this file. It converts NFL into NFL.
 */

export type GameResult = 'W' | 'L' | 'T';

/** One game from one team's side, with the opponent's line kept alongside. */
export interface TeamGame {
  gameId: string;
  week: number;
  kickoffAt: number;
  /** Epoch ms the result became final, which is when the data actually changed. */
  finalAt: number;
  opponentId: string;
  home: boolean;
  own: TeamBoxScore;
  opponent: TeamBoxScore;
  result: GameResult;
}

export interface TeamRecord {
  wins: number;
  losses: number;
  ties: number;
  played: number;
  pointsFor: number;
  pointsAgainst: number;
  /** Ties count a half, the way the league table does. */
  winPct: number;
  pointDiff: number;
  pointDiffPerGame: number;
  /** Signed run of the same result: +3 is three straight wins. */
  streak: number;
  /** Most recent first. */
  lastFive: GameResult[];
}

export interface TeamStats {
  offense: {
    pointsPerGame: number;
    yardsPerGame: number;
    passYardsPerGame: number;
    rushYardsPerGame: number;
    playsPerGame: number;
    firstDownsPerGame: number;
    thirdDownPct: number;
    redZoneTdPct: number;
    turnoversPerGame: number;
    sacksAllowedPerGame: number;
    timeOfPossessionSec: number;
  };
  defense: {
    pointsAllowedPerGame: number;
    yardsAllowedPerGame: number;
    passYardsAllowedPerGame: number;
    rushYardsAllowedPerGame: number;
    thirdDownStopPct: number;
    takeawaysPerGame: number;
    sacksPerGame: number;
  };
  discipline: {
    penaltiesPerGame: number;
    penaltyYardsPerGame: number;
  };
  efficiency: {
    turnoverMargin: number;
    /** Points scored plus points allowed, per game: how eventful the games are. */
    combinedPointsPerGame: number;
    /**
     * Wins the point differential says the team deserves, by the Pythagorean
     * expectation with the exponent football uses (2.37). Where it disagrees
     * with the actual record is where luck lives.
     */
    pythagoreanWins: number;
  };
}

export interface Availability {
  /** 0 to 1, weighted by what each missing slot is worth. */
  available: number;
  /** Injuries in effect at the timestamp asked about. */
  active: Injury[];
  startersOut: number;
  /** The single most expensive absence, for the headline blight. */
  worst: Injury | null;
}

export interface Seasoning {
  avgAge: number;
  avgExperience: number;
  starterAvgAge: number;
  starterAvgExperience: number;
  rookies: number;
}

/**
 * How much of a team is missing, by designation. Out and injured reserve are a
 * full loss; doubtful mostly does not play; questionable is a coin flip that
 * usually plays, so it drags a little rather than a lot.
 */
const STATUS_LOSS: Record<Injury['status'], number> = {
  ir: 1,
  out: 1,
  doubtful: 0.75,
  questionable: 0.25,
};

/** Every team's games, chronological, indexed once so callers stop re-scanning. */
export function gamesByTeam(snapshot: NflSeasonSnapshot): Record<string, TeamGame[]> {
  const byTeam: Record<string, TeamGame[]> = {};
  for (const team of snapshot.teams) byTeam[team.team.id] = [];

  for (const game of snapshot.games) {
    push(byTeam, game, true);
    push(byTeam, game, false);
  }

  for (const games of Object.values(byTeam)) {
    games.sort((a, b) => a.kickoffAt - b.kickoffAt);
  }
  return byTeam;
}

function push(
  byTeam: Record<string, TeamGame[]>,
  game: NflGame,
  asHome: boolean,
): void {
  const teamId = asHome ? game.homeId : game.awayId;
  const own = asHome ? game.home : game.away;
  const opponent = asHome ? game.away : game.home;
  (byTeam[teamId] ??= []).push({
    gameId: game.id,
    week: game.week,
    kickoffAt: game.kickoffAt,
    finalAt: game.kickoffAt + GAME_DURATION_MS,
    opponentId: asHome ? game.awayId : game.homeId,
    home: asHome,
    own,
    opponent,
    result:
      own.points > opponent.points ? 'W' : own.points < opponent.points ? 'L' : 'T',
  });
}

/**
 * Games that were final by a timestamp.
 *
 * Final, not kicked off: a game in progress has not changed the standings yet,
 * and treating kickoff as the moment of change would make every Sunday afternoon
 * show results that had not happened.
 */
export function gamesThrough(games: TeamGame[], asOf: number): TeamGame[] {
  return games.filter((g) => g.finalAt <= asOf);
}

export function recordOf(games: TeamGame[]): TeamRecord {
  let wins = 0;
  let losses = 0;
  let ties = 0;
  let pointsFor = 0;
  let pointsAgainst = 0;

  for (const game of games) {
    if (game.result === 'W') wins++;
    else if (game.result === 'L') losses++;
    else ties++;
    pointsFor += game.own.points;
    pointsAgainst += game.opponent.points;
  }

  const played = games.length;
  const recent = [...games].reverse();

  let streak = 0;
  for (const game of recent) {
    if (game.result === 'T') break;
    const step = game.result === 'W' ? 1 : -1;
    if (streak !== 0 && Math.sign(streak) !== step) break;
    streak += step;
  }

  return {
    wins,
    losses,
    ties,
    played,
    pointsFor,
    pointsAgainst,
    winPct: played === 0 ? 0 : (wins + ties * 0.5) / played,
    pointDiff: pointsFor - pointsAgainst,
    pointDiffPerGame: played === 0 ? 0 : (pointsFor - pointsAgainst) / played,
    streak,
    lastFive: recent.slice(0, 5).map((g) => g.result),
  };
}

export function statsOf(games: TeamGame[]): TeamStats {
  const played = games.length || 1;
  const own = sum(games.map((g) => g.own));
  const opp = sum(games.map((g) => g.opponent));

  const pointsFor = own.points / played;
  const pointsAgainst = opp.points / played;

  return {
    offense: {
      pointsPerGame: pointsFor,
      yardsPerGame: own.yards / played,
      passYardsPerGame: own.passYards / played,
      rushYardsPerGame: own.rushYards / played,
      playsPerGame: own.plays / played,
      firstDownsPerGame: own.firstDowns / played,
      thirdDownPct: ratio(own.thirdDownConversions, own.thirdDownAttempts),
      redZoneTdPct: ratio(own.redZoneTouchdowns, own.redZoneTrips),
      turnoversPerGame: own.turnovers / played,
      sacksAllowedPerGame: own.sacksAllowed / played,
      timeOfPossessionSec: own.timeOfPossessionSec / played,
    },
    defense: {
      pointsAllowedPerGame: pointsAgainst,
      yardsAllowedPerGame: opp.yards / played,
      passYardsAllowedPerGame: opp.passYards / played,
      rushYardsAllowedPerGame: opp.rushYards / played,
      // The opponent's failures on third down are this defence's stops.
      thirdDownStopPct: 1 - ratio(opp.thirdDownConversions, opp.thirdDownAttempts),
      // And the opponent's giveaways are this defence's takeaways.
      takeawaysPerGame: opp.turnovers / played,
      sacksPerGame: opp.sacksAllowed / played,
    },
    discipline: {
      penaltiesPerGame: own.penalties / played,
      penaltyYardsPerGame: own.penaltyYards / played,
    },
    efficiency: {
      turnoverMargin: (opp.turnovers - own.turnovers) / played,
      combinedPointsPerGame: pointsFor + pointsAgainst,
      pythagoreanWins: pythagorean(own.points, opp.points) * games.length,
    },
  };
}

/**
 * Pythagorean expectation. Football's exponent is about 2.37 rather than
 * baseball's 2, which is the empirical fit and the reason it is worth using at
 * all instead of eyeballing the differential.
 */
export function pythagorean(pointsFor: number, pointsAgainst: number): number {
  if (pointsFor <= 0 && pointsAgainst <= 0) return 0.5;
  const f = Math.pow(pointsFor, 2.37);
  const a = Math.pow(pointsAgainst, 2.37);
  return f / (f + a);
}

/**
 * Roster availability at a moment, weighted by what is missing.
 *
 * An injury counts once it has been reported and keeps counting: a snapshot's
 * report is the set of people currently unavailable, so there is no return date
 * to model. That is a real limitation and it is the right one to have —
 * inventing recoveries would make the history lie in the direction that flatters
 * the team.
 */
export function availabilityAt(
  roster: RosterSlot[],
  injuries: Injury[],
  asOf: number,
): Availability {
  const active = injuries.filter((injury) => injury.since <= asOf);
  const starters = new Set(roster.filter((r) => r.starter).map((r) => r.slot));

  let lost = 0;
  let startersOut = 0;
  let worst: Injury | null = null;
  let worstCost = 0;

  for (const injury of active) {
    const cost = importanceOf(injury.slot) * STATUS_LOSS[injury.status];
    lost += cost;
    if (starters.has(injury.slot) && STATUS_LOSS[injury.status] >= 0.75) startersOut++;
    if (cost > worstCost) {
      worstCost = cost;
      worst = injury;
    }
  }

  return {
    available: Math.max(0, 1 - lost / TOTAL_IMPORTANCE),
    active,
    startersOut,
    worst,
  };
}

/**
 * How old and how experienced the roster is. Both, deliberately: they are two
 * views of one career and they come apart in the interesting cases — a
 * twenty-eight year old rookie and a twenty-eight year old in his seventh season
 * are not the same team-building situation.
 */
export function seasoningOf(roster: RosterSlot[]): Seasoning {
  const starters = roster.filter((r) => r.starter);
  return {
    avgAge: mean(roster.map((r) => r.age)),
    avgExperience: mean(roster.map((r) => r.experience)),
    starterAvgAge: mean(starters.map((r) => r.age)),
    starterAvgExperience: mean(starters.map((r) => r.experience)),
    rookies: roster.filter((r) => r.experience === 0).length,
  };
}

/** When this team's data last changed: the end of its most recent finished game. */
export function lastFinalAt(games: TeamGame[], asOf: number): number | null {
  const played = gamesThrough(games, asOf);
  return played.length === 0 ? null : played[played.length - 1].finalAt;
}

/**
 * True when a team has not played in over a week and a half — a bye, or the
 * feed having stopped. The garden cannot tell those apart and should not
 * pretend to: both mean the same thing, which is that what you are looking at
 * is old.
 */
export function idleSince(games: TeamGame[], asOf: number): number {
  const last = lastFinalAt(games, asOf);
  return last === null ? 0 : asOf - last;
}

function sum(lines: TeamBoxScore[]): TeamBoxScore {
  const total: TeamBoxScore = {
    points: 0,
    yards: 0,
    passYards: 0,
    rushYards: 0,
    plays: 0,
    firstDowns: 0,
    thirdDownAttempts: 0,
    thirdDownConversions: 0,
    redZoneTrips: 0,
    redZoneTouchdowns: 0,
    turnovers: 0,
    sacksAllowed: 0,
    penalties: 0,
    penaltyYards: 0,
    timeOfPossessionSec: 0,
  };
  for (const line of lines) {
    for (const key of Object.keys(total) as (keyof TeamBoxScore)[]) {
      total[key] += line[key];
    }
  }
  return total;
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}
