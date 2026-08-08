import { NFL_TEAMS } from './teams';
import { DEPTH_CHART } from './roster';
import type {
  Injury,
  InjuryStatus,
  NflGame,
  NflSeasonSnapshot,
  NflSource,
  NflTeamSeason,
  RosterSlot,
  TeamBoxScore,
} from './types';
import { mulberry32, rngFromSeed, type Rng } from '../../lsystem/random';

/**
 * A synthetic season, in the shape a real feed would deliver it.
 *
 * The league's alignment next door is real. The results here are not: outbound
 * network access is closed in this environment, so there is no live feed to
 * fetch and every number below is generated from a seed. It says so in the
 * snapshot's `provenance`, which the HUD shows, because a garden that looks like
 * it is telling you about Sunday had better not be inventing Sunday quietly.
 *
 * What it is *for* is that the shape is real. Games hold two box scores, box
 * scores sum into season stats, injuries carry an onset, and a live adapter
 * implementing `NflSource` swaps in without translation, layout, or the scene
 * changing a line. The seams that would actually hurt to get wrong — the ones
 * about time and about consistency — are exercised here rather than discovered
 * against a paid API.
 *
 * Three properties are held on purpose, because the rest of the pipeline leans
 * on them:
 *
 * 1. **Results are stored once.** A game holds both teams' lines, so a win can
 *    never disagree with the matching loss.
 * 2. **The calendar ends near now.** The most recent kickoff sits inside the two
 *    day scrub window (`ecosystem/scrub.ts`), so dragging the sun back actually
 *    crosses a game and the garden visibly stands as it did before the results.
 * 3. **Byes are real.** Two clubs are idle each week, and an idle club's data
 *    genuinely stops updating — which is the staleness state, arrived at
 *    honestly rather than by hand-editing a timestamp.
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

/** Regulation is sixty minutes, and both teams' possession must add up to it. */
const GAME_SECONDS = 3600;

/** Roughly how long a game takes, wall clock. Used for "last updated". */
export const GAME_DURATION_MS = 3 * HOUR_MS + 10 * 60_000;

/** Weeks of the season already played in the snapshot. */
const WEEKS_PLAYED = 14;

/**
 * How long ago the most recent kickoff was.
 *
 * Twenty-six hours puts it inside the 47 hour scrub window with room either
 * side, so a user who drags the sun back one full day lands before the week's
 * results with the previous week's standings still on the plants. Any larger and
 * the scrub runs out of window before it reaches a game; any smaller and there
 * is nothing to see between the game and now.
 */
const LAST_KICKOFF_AGO_MS = 26 * HOUR_MS;

/**
 * Kickoff spread within a week, as offsets back from that week's last game:
 * Monday night, the late Sunday window, the early Sunday window, Thursday.
 * Games in a week therefore land on different sides of a scrub cursor, the same
 * way they do on a real weekend.
 */
const SLOT_OFFSETS_MS = [0, 3 * HOUR_MS, 6 * HOUR_MS, 4 * DAY_MS];

/** Two placeholders in the pairing wheel are what create bye weeks. */
const BYE = '__bye__';

export interface SnapshotOptions {
  seed?: number;
  /** Weeks completed. */
  weeks?: number;
}

/**
 * The generated source. `snapshot(now)` is pure in `now` and the seed, so two
 * calls at the same instant produce byte-identical data and tests can pin a
 * clock.
 */
export function syntheticNflSource(options: SnapshotOptions = {}): NflSource {
  return {
    name: 'synthetic-nfl',
    snapshot: (now = Date.now()) => generateNflSnapshot(now, options),
  };
}

export function generateNflSnapshot(
  now: number = Date.now(),
  options: SnapshotOptions = {},
): NflSeasonSnapshot {
  const { seed = 20_260_101, weeks = WEEKS_PLAYED } = options;

  // One rating per club, fixed for the season: how good this team is. Every
  // score in the schedule is drawn around the gap between two of them, which is
  // what makes standings come out ordered rather than uniformly random — a
  // league where all thirty-two finish 7-7 would exercise nothing.
  const ratings: Record<string, number> = {};
  for (const team of NFL_TEAMS) {
    const rng = mulberry32(seed ^ hash(team.id));
    ratings[team.id] = 0.28 + rng() * 0.58;
  }

  const lastKickoff = now - LAST_KICKOFF_AGO_MS;
  const games = buildSchedule(weeks, lastKickoff, ratings, seed);

  const teams: NflTeamSeason[] = NFL_TEAMS.map((team) => {
    const roster = buildRoster(team.id, seed);
    return {
      team,
      roster,
      injuries: buildInjuries(team.id, roster, games, now, seed),
    };
  });

  return {
    season: seasonYear(now),
    throughWeek: weeks,
    fetchedAt: now,
    teams,
    games,
    provenance: {
      kind: 'synthetic',
      seed,
      note:
        'Generated season. Alignment, franchises and founding years are real; ' +
        'results, rosters and injuries are seeded fiction standing in for a ' +
        'live feed. Roster entries are depth-chart slots, not named players. ' +
        'The calendar is anchored to load time so the latest kickoff falls ' +
        'inside the scrub window, so the week number will not line up with the ' +
        'real one.',
    },
  };
}

/**
 * The season runs September to January, so a date in the first half of the
 * calendar year belongs to the season that started the previous autumn.
 */
export function seasonYear(at: number): number {
  const date = new Date(at);
  return date.getUTCMonth() >= 2 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
}

/**
 * Pairings by the circle method over thirty-four slots: the thirty-two clubs
 * plus two byes. One slot is held fixed and the rest rotate a place a week, so
 * every week is a legal set of pairings — nobody plays twice, and whoever draws
 * a placeholder is idle.
 *
 * It is not the real formula. The NFL plays division rivals home and away and
 * rotates the rest on a multi-year cycle, which no round robin reproduces; what
 * this gives is a valid, varied, deterministic calendar with byes in it, and
 * that is the whole of what the pipeline downstream needs from a schedule. A
 * live adapter brings the real one along with the real results.
 */
function buildSchedule(
  weeks: number,
  lastKickoff: number,
  ratings: Record<string, number>,
  seed: number,
): NflGame[] {
  const wheel = [...NFL_TEAMS.map((t) => t.id), BYE, BYE];
  const size = wheel.length;
  const games: NflGame[] = [];

  for (let week = 1; week <= weeks; week++) {
    // Week `weeks` is the most recent, and its last kickoff is the anchor.
    const weekAnchor = lastKickoff - (weeks - week) * WEEK_MS;
    const rotation = rotate(wheel.slice(1), week - 1);
    const ordered = [wheel[0], ...rotation];

    let slot = 0;
    for (let i = 0; i < size / 2; i++) {
      const a = ordered[i];
      const b = ordered[size - 1 - i];
      if (a === BYE || b === BYE) continue;

      // Alternate which side hosts, so home advantage does not accrue to the
      // same half of the wheel all season.
      const homeFirst = (week + i) % 2 === 0;
      const homeId = homeFirst ? a : b;
      const awayId = homeFirst ? b : a;
      const kickoffAt = weekAnchor - SLOT_OFFSETS_MS[slot % SLOT_OFFSETS_MS.length];
      slot++;

      games.push(
        playGame(
          `${homeId}-${awayId}-w${week}`,
          week,
          kickoffAt,
          homeId,
          awayId,
          ratings,
          seed,
        ),
      );
    }
  }

  // Chronological, which is the order every derivation wants and the order a
  // real feed returns.
  return games.sort((x, y) => x.kickoffAt - y.kickoffAt);
}

function rotate<T>(items: T[], by: number): T[] {
  const at = ((by % items.length) + items.length) % items.length;
  return [...items.slice(at), ...items.slice(0, at)];
}

/**
 * One game's two box scores.
 *
 * Points come from the rating gap plus home advantage plus noise; everything
 * else is drawn *around the points*, because the correlations are what make a
 * stat line read as football. A team that scored 34 gained yards, converted
 * third downs, and finished drives; one that scored 9 did not. Uncorrelated
 * fields would give every team the same season profile with different labels.
 */
function playGame(
  id: string,
  week: number,
  kickoffAt: number,
  homeId: string,
  awayId: string,
  ratings: Record<string, number>,
  seed: number,
): NflGame {
  const rng = mulberry32(seed ^ hash(id));
  const edge = ratings[homeId] - ratings[awayId];

  let homePoints = scoreFor(0.5 + edge / 2, rng, 2.2);
  let awayPoints = scoreFor(0.5 - edge / 2, rng, 0);

  // Ties happen about once a season, not once a week. Break them toward the
  // better team, and keep one in eight as a genuine draw so the tie path in the
  // standings code is exercised by real data rather than only by a unit test.
  if (homePoints === awayPoints && rng() > 0.125) {
    if (edge >= 0) homePoints += 3;
    else awayPoints += 3;
  }

  const homePossession = Math.round(
    GAME_SECONDS * (0.42 + rng() * 0.16),
  );

  return {
    id,
    week,
    kickoffAt,
    homeId,
    awayId,
    home: boxScore(homePoints, homePossession, rng),
    // Possession is the one field that must agree between the two lines: the
    // clock only ran once.
    away: boxScore(awayPoints, GAME_SECONDS - homePossession, rng),
  };
}

/** A plausible NFL score for a team of this quality. Never 1 or 2, which are impossible. */
function scoreFor(quality: number, rng: Rng, homeAdvantage: number): number {
  const gauss = (rng() + rng() + rng() - 1.5) * 2; // ~N(0,1), cheap and bounded
  const points = 21 + (quality - 0.5) * 30 + homeAdvantage + gauss * 6.5;
  const rounded = Math.max(0, Math.round(points));
  return rounded === 1 || rounded === 2 ? 3 : Math.min(rounded, 52);
}

function boxScore(points: number, possessionSec: number, rng: Rng): TeamBoxScore {
  const yards = clamp(Math.round(210 + points * 7.4 + (rng() - 0.5) * 90), 90, 620);
  const passShare = 0.5 + rng() * 0.26;
  const passYards = Math.round(yards * passShare);
  const plays = clamp(Math.round(52 + possessionSec / 110 + (rng() - 0.5) * 10), 44, 82);
  const thirdDownAttempts = clamp(Math.round(17 - points * 0.12 + (rng() - 0.5) * 4), 8, 20);
  const conversionRate = clamp(0.18 + points * 0.009 + (rng() - 0.5) * 0.12, 0.05, 0.72);
  const redZoneTrips = clamp(Math.round(points / 8.5 + (rng() - 0.5) * 1.6), 0, 8);
  const penalties = clamp(Math.round(5.5 + (rng() - 0.5) * 5), 1, 14);

  return {
    points,
    yards,
    passYards,
    rushYards: yards - passYards,
    plays,
    firstDowns: clamp(Math.round(9 + points * 0.42 + (rng() - 0.5) * 5), 5, 35),
    thirdDownAttempts,
    thirdDownConversions: Math.round(thirdDownAttempts * conversionRate),
    redZoneTrips,
    // Scoring drives that ended in seven rather than three: the efficiency stat
    // people actually argue about.
    redZoneTouchdowns: Math.min(
      redZoneTrips,
      Math.round(redZoneTrips * clamp(0.25 + points * 0.012, 0.1, 0.9)),
    ),
    turnovers: clamp(Math.round(2.6 - points * 0.045 + rng() * 1.6), 0, 6),
    sacksAllowed: clamp(Math.round(3.4 - points * 0.04 + (rng() - 0.5) * 2.4), 0, 9),
    penalties,
    // Tied to the count rather than drawn on its own: a flag is worth five to
    // fifteen yards, so the two fields cannot drift into nonsense.
    penaltyYards: Math.round(penalties * (7 + rng() * 6)),
    timeOfPossessionSec: possessionSec,
  };
}

/**
 * Fifty-three slots with an age and a service record.
 *
 * Experience is drawn from where the slot sits on the depth chart — starters are
 * the ones who have been here, backups skew rookie — and age follows experience
 * plus the age they entered the league at. That correlation is the point:
 * age and experience are two views of the same career, and a roster of
 * thirty-year-old rookies would make maturity meaningless.
 */
function buildRoster(teamId: string, seed: number): RosterSlot[] {
  const rng = mulberry32(seed ^ hash(`${teamId}/roster`));

  return DEPTH_CHART.map((spec) => {
    // Starters average about five seasons in, depth about two.
    const base = spec.starter ? 4.4 : 1.8;
    const experience = Math.max(0, Math.round(base + (rng() + rng() - 1) * 3.4));
    const enteredAt = 21 + Math.round(rng() * 2); // draft age, 21 to 23
    return {
      id: `${teamId}/${spec.slot}`,
      slot: spec.slot,
      position: spec.position,
      group: spec.group,
      starter: spec.starter,
      experience,
      age: enteredAt + experience,
      gamesStarted: spec.starter
        ? Math.round(experience * (9 + rng() * 7))
        : Math.round(experience * rng() * 5),
    };
  });
}

/**
 * The injury report.
 *
 * Onset is the field that matters. Most injuries happen in games, so most of
 * these are stamped an hour or two into a specific kickoff — which means
 * scrubbing the cursor back past that kickoff removes them, and the team stands
 * there as it did before the snap. An injury report with a made-up "reported
 * yesterday" timestamp would have looked identical in the live view and been a
 * lie the moment anyone dragged the sun.
 */
function buildInjuries(
  teamId: string,
  roster: RosterSlot[],
  games: NflGame[],
  now: number,
  seed: number,
): Injury[] {
  const rng = rngFromSeed(`${seed}/${teamId}/injuries`);
  const played = games.filter((g) => g.homeId === teamId || g.awayId === teamId);
  if (played.length === 0) return [];

  const count = 2 + Math.floor(rng() * 5); // two to six, a normal Friday report
  const injuries: Injury[] = [];
  const used = new Set<string>();

  for (let i = 0; i < count; i++) {
    const slot = roster[Math.floor(rng() * roster.length)];
    if (used.has(slot.slot)) continue;
    used.add(slot.slot);

    // Weighted toward the recent weeks, so most of the report is current and a
    // couple of the injuries are long-term absences from earlier in the season.
    const backWeeks = Math.floor(rng() * rng() * Math.min(6, played.length));
    const game = played[played.length - 1 - backWeeks];
    const since = game.kickoffAt + HOUR_MS + Math.floor(rng() * 2 * HOUR_MS);
    if (since > now) continue;

    injuries.push({
      id: `${teamId}/${slot.slot}/${game.week}`,
      teamId,
      slot: slot.slot,
      position: slot.position,
      status: statusFor(backWeeks, rng),
      description: AILMENTS[Math.floor(rng() * AILMENTS.length)],
      since,
      gamesMissed: backWeeks,
    });
  }

  return injuries;
}

/**
 * Designation by how long ago it happened: a fresh knock is questionable and
 * clears up, an injury still on the report six weeks later is the kind that
 * ends a season.
 */
function statusFor(backWeeks: number, rng: Rng): InjuryStatus {
  if (backWeeks >= 4) return rng() < 0.7 ? 'ir' : 'out';
  if (backWeeks >= 2) return rng() < 0.5 ? 'out' : 'doubtful';
  return rng() < 0.55 ? 'questionable' : rng() < 0.6 ? 'doubtful' : 'out';
}

const AILMENTS = [
  'hamstring',
  'ankle',
  'knee',
  'shoulder',
  'concussion',
  'groin',
  'calf',
  'ribs',
  'foot',
  'back',
  'elbow',
  'illness',
];

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

/** FNV-1a over a string, for per-entity seeds. */
function hash(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
