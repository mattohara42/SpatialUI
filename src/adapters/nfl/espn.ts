import { GAME_DURATION_MS } from './season';
import { NFL_TEAMS } from './teams';
import type {
  Injury,
  InjuryStatus,
  NflGame,
  NflSeasonSnapshot,
  NflTeamSeason,
  PositionGroup,
  Provenance,
  RosterSlot,
  TeamBoxScore,
} from './types';

/**
 * The fetch/parse half of a *live* NFL adapter, against ESPN's public API.
 *
 * This is the sibling of `adapters/prometheus/query.ts`: it talks HTTP and
 * parses ESPN's wire JSON into the feed-shaped records `types.ts` defines, and
 * it stops there. Nothing here knows what a plant is — `translation/nfl.ts` is
 * still the only place football meets the ecosystem, and `derive.ts` still turns
 * box scores into standings. What this file adds is the one thing the synthetic
 * source stood in for: the numbers coming off a socket instead of a seed.
 *
 * Why ESPN, and why these shapes:
 *
 * - **It is free and keyless.** `site.api.espn.com` answers without a token, so
 *   the trust boundary the backend proxy enforces is about CORS and SSRF, not a
 *   secret — a live NFL garden is the cheapest real feed to stand up.
 * - **Results carry their own truth.** The scoreboard gives final scores and the
 *   box-score summary gives the per-game stat line, so `NflGame` is filled the
 *   way `types.ts` insists — box scores, not season totals — and every standing
 *   stays a derivation that can be scrubbed.
 * - **Identity stays local.** The thirty-two franchises, their alignment and
 *   their founding years live in `teams.ts` and are *not* fetched: alignment
 *   changes once a decade and founding years never, so the feed only supplies
 *   the parts that move (results, rosters, injuries) and the layout is ground
 *   truth rather than something a feed could get wrong.
 *
 * The seam friction is the same one Prometheus met and named: `NflSource.snapshot`
 * is synchronous and a fetch is not. `live.ts` resolves it exactly as `promSource`
 * does — hold the last snapshot, translate *that* synchronously, and let an async
 * `refresh` fill it. So this file is only the async fetch/parse; the sync source
 * is next door.
 *
 * What a live run adds over the tests is a real socket and nothing else: every
 * parser below is exercised against captured ESPN shapes in `espn.test.ts`, so a
 * shape surprise in production is a fixture to update and a parser to widen, not
 * a path to rebuild.
 */

/**
 * The one dependency on the outside world, injected rather than imported — the
 * same narrow `fetch` shape the Prometheus adapter uses, so `globalThis.fetch`
 * satisfies it directly and a test (or the backend proxy) can hand it a recorded
 * response instead.
 */
export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** How to reach ESPN and how much of the league to fetch. */
export interface EspnConfig {
  /**
   * Base URL the resource paths hang off. The real feed is
   * `https://site.api.espn.com/apis/site/v2/sports/football`; through the backend
   * proxy this is empty (or a bare path) and `nflProxyFetch` re-homes each path.
   */
  baseUrl?: string;
  /**
   * The season year to read, e.g. `2024`. Defaults to whatever the current
   * scoreboard reports, so an unconfigured source follows the live season.
   */
  season?: number;
  /**
   * Fetch roster age/experience (→ maturity). On by default; it costs one
   * request per club, so a deploy that only wants live standings can turn it off
   * and let maturity fall back to what the caller already holds.
   */
  includeRosters?: boolean;
  /**
   * Fetch the injury report (→ availability and blight). On by default; also one
   * request per club.
   */
  includeInjuries?: boolean;
}

/** ESPN's abbreviations mostly match ours; the handful that do not, aliased. */
const ESPN_ABBR_ALIAS: Record<string, string> = {
  WSH: 'was',
  LA: 'lar',
  JAC: 'jax',
};

const TEAM_BY_ABBR: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const team of NFL_TEAMS) map[team.abbr.toUpperCase()] = team.id;
  return map;
})();

/** ESPN abbreviation → our stable team id, or null for a code we do not carry. */
export function teamIdFromAbbr(abbr: string | undefined): string | null {
  if (!abbr) return null;
  const up = abbr.toUpperCase();
  return TEAM_BY_ABBR[up] ?? ESPN_ABBR_ALIAS[up] ?? null;
}

// --- ESPN wire shapes (only the fields this adapter reads) -------------------

interface EspnScoreboard {
  season?: { year?: number; type?: number };
  week?: { number?: number };
  events?: EspnEvent[];
}

interface EspnEvent {
  id?: string;
  date?: string;
  week?: { number?: number };
  season?: { year?: number };
  competitions?: EspnCompetition[];
}

interface EspnCompetition {
  id?: string;
  date?: string;
  status?: { type?: { completed?: boolean; state?: string } };
  competitors?: EspnCompetitor[];
}

interface EspnCompetitor {
  homeAway?: string;
  score?: string | number;
  team?: { abbreviation?: string };
}

interface EspnSummary {
  header?: {
    competitions?: Array<{
      id?: string;
      date?: string;
      competitors?: Array<{
        homeAway?: string;
        score?: string | number;
        team?: { abbreviation?: string };
      }>;
    }>;
    week?: number;
    season?: { year?: number };
  };
  boxscore?: {
    teams?: Array<{
      team?: { abbreviation?: string };
      statistics?: Array<{ name?: string; label?: string; displayValue?: string }>;
    }>;
  };
}

interface EspnRoster {
  athletes?: Array<{
    // ESPN groups the roster by side of the ball; each group carries `items`.
    position?: string;
    items?: EspnAthlete[];
  }>;
}

interface EspnAthlete {
  id?: string;
  age?: number;
  experience?: { years?: number };
  position?: { abbreviation?: string };
  starter?: boolean;
  statistics?: Array<{ name?: string; displayValue?: string }>;
}

interface EspnInjuries {
  injuries?: Array<{
    // ESPN nests one team's report; `injuries` is the list of hurt athletes.
    injuries?: EspnInjuryEntry[];
  }>;
}

interface EspnInjuryEntry {
  id?: string;
  status?: string;
  date?: string;
  athlete?: { position?: { abbreviation?: string } };
  details?: { type?: string; detail?: string };
  type?: { description?: string };
}

// --- Parsers -----------------------------------------------------------------

/**
 * Pull the season year, seasontype, and current week out of a scoreboard.
 *
 * A source that was not told a season reads it here, so it follows the live one
 * rather than freezing on the year it was configured. Regular season is type 2;
 * the walk over weeks below only asks for played weeks of it.
 */
export function parseScoreboardMeta(json: unknown): {
  season: number | null;
  seasonType: number | null;
  week: number | null;
} {
  const board = (json ?? {}) as EspnScoreboard;
  return {
    season: board.season?.year ?? null,
    seasonType: board.season?.type ?? null,
    week: board.week?.number ?? null,
  };
}

/**
 * Final games in a scoreboard, as the id/week/kickoff/scores the box-score
 * fetch then fills. Games that have not finished are skipped: an in-progress
 * game has not changed the standings, and `derive.ts` only counts a game once
 * it was final, so emitting it early would put a result on the board that has
 * not happened.
 */
export function parseScoreboardResults(json: unknown): Array<{
  id: string;
  week: number;
  kickoffAt: number;
  homeId: string;
  awayId: string;
  homePoints: number;
  awayPoints: number;
}> {
  const board = (json ?? {}) as EspnScoreboard;
  const out: ReturnType<typeof parseScoreboardResults> = [];

  for (const event of board.events ?? []) {
    const comp = event.competitions?.[0];
    if (!comp) continue;
    if (comp.status?.type?.completed !== true) continue;

    const home = comp.competitors?.find((c) => c.homeAway === 'home');
    const away = comp.competitors?.find((c) => c.homeAway === 'away');
    const homeId = teamIdFromAbbr(home?.team?.abbreviation);
    const awayId = teamIdFromAbbr(away?.team?.abbreviation);
    if (!homeId || !awayId) continue;

    const id = event.id ?? comp.id;
    if (!id) continue;

    out.push({
      id,
      week: event.week?.number ?? board.week?.number ?? 0,
      kickoffAt: parseDate(comp.date ?? event.date),
      homeId,
      awayId,
      homePoints: toNumber(home?.score),
      awayPoints: toNumber(away?.score),
    });
  }
  return out;
}

/**
 * Turn a box-score summary into one `NflGame` — both teams' full lines.
 *
 * Points come from the header (the authoritative final score), and the rest of
 * the line from `boxscore.teams[].statistics`, whose names are ESPN's. Any stat
 * the summary omits parses to zero rather than throwing: a missing detail should
 * cost that one number, not the whole game, and `derive.ts` sums lines so a zero
 * is simply nothing added. `null` means the summary could not be tied to two
 * teams we carry — the caller drops it.
 */
export function parseSummaryGame(
  json: unknown,
  fallback?: { id?: string; week?: number; kickoffAt?: number },
): NflGame | null {
  const summary = (json ?? {}) as EspnSummary;
  const headerComp = summary.header?.competitions?.[0];

  const headerHome = headerComp?.competitors?.find((c) => c.homeAway === 'home');
  const headerAway = headerComp?.competitors?.find((c) => c.homeAway === 'away');

  const boxTeams = summary.boxscore?.teams ?? [];
  // The box-score block does not carry homeAway, so tie its two entries back to
  // the header by abbreviation.
  const homeAbbr = headerHome?.team?.abbreviation;
  const awayAbbr = headerAway?.team?.abbreviation;
  const homeId = teamIdFromAbbr(homeAbbr);
  const awayId = teamIdFromAbbr(awayAbbr);
  if (!homeId || !awayId) return null;

  const homeStats = boxTeams.find(
    (t) => t.team?.abbreviation?.toUpperCase() === homeAbbr?.toUpperCase(),
  );
  const awayStats = boxTeams.find(
    (t) => t.team?.abbreviation?.toUpperCase() === awayAbbr?.toUpperCase(),
  );

  const id = headerComp?.id ?? fallback?.id;
  if (!id) return null;

  return {
    id,
    week: summary.header?.week ?? fallback?.week ?? 0,
    kickoffAt: parseDate(headerComp?.date) || fallback?.kickoffAt || 0,
    homeId,
    awayId,
    home: boxScoreFrom(homeStats?.statistics, toNumber(headerHome?.score)),
    away: boxScoreFrom(awayStats?.statistics, toNumber(headerAway?.score)),
  };
}

/**
 * Build one team's line from ESPN's stat array. Every field defaults to zero, so
 * a feed that drops a stat costs that number and nothing else. Points come from
 * the score argument rather than the stat block, because the score is the one
 * number that must be exact and the header is its authoritative home.
 */
function boxScoreFrom(
  stats: Array<{ name?: string; label?: string; displayValue?: string }> | undefined,
  points: number,
): TeamBoxScore {
  const by: Record<string, string> = {};
  for (const stat of stats ?? []) {
    if (stat.name) by[stat.name] = stat.displayValue ?? '';
  }

  const thirdDown = pair(by, 'thirdDownEff');
  const redZone = pair(by, 'redZoneAttempts', 'redzoneAttempts', 'redZoneEff');
  const sacks = pair(by, 'sacksYardsLost', 'sacks');
  const penalties = pair(by, 'totalPenaltiesYards', 'penaltiesYards');

  return {
    points,
    yards: num(by, 'totalYards'),
    passYards: num(by, 'netPassingYards', 'passingYards'),
    rushYards: num(by, 'rushingYards'),
    plays: num(by, 'totalOffensivePlays', 'totalPlays', 'offensivePlays'),
    firstDowns: num(by, 'firstDowns'),
    thirdDownAttempts: thirdDown[1],
    thirdDownConversions: thirdDown[0],
    redZoneTrips: redZone[1],
    redZoneTouchdowns: redZone[0],
    turnovers: num(by, 'turnovers', 'totalTurnovers'),
    sacksAllowed: sacks[0],
    penalties: penalties[0],
    penaltyYards: penalties[1],
    timeOfPossessionSec: clock(by['possessionTime']),
  };
}

/** Coarse position groups, keyed off the slot abbreviation ESPN reports. */
const GROUP_BY_POSITION: Record<string, PositionGroup> = {
  QB: 'quarterback',
  RB: 'backfield',
  FB: 'backfield',
  WR: 'receiver',
  TE: 'receiver',
  LT: 'offensive-line',
  LG: 'offensive-line',
  C: 'offensive-line',
  RG: 'offensive-line',
  RT: 'offensive-line',
  OT: 'offensive-line',
  OG: 'offensive-line',
  OL: 'offensive-line',
  G: 'offensive-line',
  T: 'offensive-line',
  DE: 'defensive-line',
  DT: 'defensive-line',
  NT: 'defensive-line',
  DL: 'defensive-line',
  EDGE: 'defensive-line',
  LB: 'linebacker',
  ILB: 'linebacker',
  OLB: 'linebacker',
  MLB: 'linebacker',
  CB: 'secondary',
  S: 'secondary',
  FS: 'secondary',
  SS: 'secondary',
  DB: 'secondary',
  K: 'specialist',
  P: 'specialist',
  LS: 'specialist',
};

function groupFor(position: string | undefined): PositionGroup {
  if (!position) return 'specialist';
  return GROUP_BY_POSITION[position.toUpperCase()] ?? 'specialist';
}

/**
 * Turn an ESPN roster into `RosterSlot`s, the maturity input.
 *
 * The one honest gap from the synthetic source: ESPN's roster is a *list of
 * players*, not a *depth chart*, so it carries no `QB1`/`LT`/`CB3` slot and no
 * reliable starter flag. Maturity reads age and experience (never who is better),
 * and both are per-player, so the axis is fully fed; what is approximated is the
 * `starter` split, derived here by taking the most experienced player in each
 * position group as its starters. That is coarser than a real depth chart and is
 * called out as such — it moves the starter-average terms a little, never the
 * league table, which is why it is an acceptable stand-in until a depth-chart
 * endpoint is wired.
 */
export function parseRoster(json: unknown, teamId: string): RosterSlot[] {
  const roster = (json ?? {}) as EspnRoster;
  const slots: RosterSlot[] = [];
  let index = 0;

  // Count how many of each position group to mark as starters — one deep for
  // most, more where the game fields more (see STARTERS_BY_GROUP).
  const byGroup: Record<string, EspnAthlete[]> = {};
  for (const group of roster.athletes ?? []) {
    for (const athlete of group.items ?? []) {
      const g = groupFor(athlete.position?.abbreviation);
      (byGroup[g] ??= []).push(athlete);
    }
  }

  for (const [group, athletes] of Object.entries(byGroup)) {
    // Most experience first, so the "starters" are the established players — the
    // approximation the doc-comment above owns.
    const sorted = [...athletes].sort(
      (a, b) => (b.experience?.years ?? 0) - (a.experience?.years ?? 0),
    );
    const starterCount = STARTERS_BY_GROUP[group as PositionGroup] ?? 1;

    sorted.forEach((athlete, i) => {
      const position = athlete.position?.abbreviation ?? group.slice(0, 2).toUpperCase();
      slots.push({
        id: `${teamId}/slot${index++}`,
        slot: `${position}${i + 1}`,
        position,
        group: group as PositionGroup,
        starter: i < starterCount || athlete.starter === true,
        age: Math.round(athlete.age ?? 0),
        experience: Math.max(0, Math.round(athlete.experience?.years ?? 0)),
        gamesStarted: num2(athlete.statistics, 'gamesStarted'),
      });
    });
  }

  return slots;
}

/** How many of each group take the field, for the starter approximation. */
const STARTERS_BY_GROUP: Record<PositionGroup, number> = {
  quarterback: 1,
  backfield: 1,
  receiver: 3,
  'offensive-line': 5,
  'defensive-line': 4,
  linebacker: 3,
  secondary: 4,
  specialist: 3,
};

/** ESPN status strings → the four designations `types.ts` names. */
const INJURY_STATUS: Record<string, InjuryStatus> = {
  out: 'out',
  doubtful: 'doubtful',
  questionable: 'questionable',
  'injured-reserve': 'ir',
  'injured reserve': 'ir',
  ir: 'ir',
  'day-to-day': 'questionable',
};

function injuryStatus(raw: string | undefined): InjuryStatus | null {
  if (!raw) return null;
  const key = raw.toLowerCase().trim();
  return INJURY_STATUS[key] ?? (key.includes('reserve') ? 'ir' : null);
}

/**
 * Parse one club's injury report. An entry whose status is not one of the four
 * designations is dropped rather than guessed — a plant's blight has to name a
 * real status, and inventing one would put a wilt on a healthy tree.
 */
export function parseInjuries(json: unknown, teamId: string, now: number): Injury[] {
  const report = (json ?? {}) as EspnInjuries;
  const out: Injury[] = [];
  let index = 0;

  for (const block of report.injuries ?? []) {
    for (const entry of block.injuries ?? []) {
      const status = injuryStatus(entry.status);
      if (!status) continue;
      const position = entry.athlete?.position?.abbreviation ?? '';
      out.push({
        id: entry.id ?? `${teamId}/injury${index++}`,
        teamId,
        // No depth-chart slot from ESPN; the position doubles as the slot label,
        // which is what availability keys importance off.
        slot: position,
        position,
        status,
        description:
          entry.details?.type ?? entry.type?.description ?? entry.details?.detail ?? 'undisclosed',
        since: parseDate(entry.date) || now,
        gamesMissed: 0,
      });
    }
  }
  return out;
}

// --- Orchestration -----------------------------------------------------------

/** What a caller already holds, so `refresh` fetches only what is new. */
export interface KnownState {
  /** Games already in hand, by id — their box scores are not re-fetched. */
  games?: Record<string, NflGame>;
  /** Rosters already in hand, by team id — reused when rosters are skipped. */
  rosters?: Record<string, RosterSlot[]>;
}

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/football';

/**
 * Fetch a whole `NflSeasonSnapshot` from ESPN.
 *
 * The shape of the walk, and why it is bounded rather than naive:
 *
 * 1. **One scoreboard** with no week names the live season and current week.
 * 2. **A scoreboard per played week** lists that week's final games — cheap,
 *    at most eighteen requests.
 * 3. **A box-score summary per game the caller does not already hold.** This is
 *    the only per-game fetch, and it is *incremental*: `known.games` are reused,
 *    so a refresh mid-season fetches the dozen-odd new finals, not the season.
 * 4. **A roster and an injury report per club**, when enabled — the maturity and
 *    blight inputs. One request each; skip them and the caller's prior rosters
 *    carry over.
 *
 * A failed sub-fetch does not sink the snapshot: the game, roster, or report it
 * would have added is simply absent, and staleness/availability read the gap
 * honestly. The whole thing is `provenance.kind === 'live'`, the tripwire the
 * HUD's "simulated" marker keys off.
 */
export async function fetchNflSnapshot(
  config: EspnConfig,
  fetchImpl: FetchLike,
  now: number = Date.now(),
  known: KnownState = {},
): Promise<NflSeasonSnapshot> {
  const base = config.baseUrl ?? ESPN_BASE;
  const get = async (path: string): Promise<unknown> => {
    const res = await fetchImpl(`${base}${path}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`ESPN responded ${res.status} for ${path}`);
    return res.json();
  };

  // 1. Learn the season and current week from a bare scoreboard.
  const head = parseScoreboardMeta(await get('/nfl/scoreboard'));
  const season = config.season ?? head.season ?? new Date(now).getUTCFullYear();
  const throughWeek = head.week ?? 0;

  // 2. Walk played weeks of the regular season for their final results.
  const results: Array<ReturnType<typeof parseScoreboardResults>[number]> = [];
  for (let week = 1; week <= Math.max(throughWeek, 1); week++) {
    try {
      const board = await get(`/nfl/scoreboard?dates=${season}&seasontype=2&week=${week}`);
      results.push(...parseScoreboardResults(board));
    } catch {
      // A week that will not load is a week we do not add — the rest stand.
    }
  }

  // 3. Box scores, incrementally: reuse what the caller holds, fetch the rest.
  const games: NflGame[] = [];
  const knownGames = known.games ?? {};
  for (const result of results) {
    const held = knownGames[result.id];
    if (held) {
      games.push(held);
      continue;
    }
    try {
      const summary = await get(`/nfl/summary?event=${result.id}`);
      const game = parseSummaryGame(summary, {
        id: result.id,
        week: result.week,
        kickoffAt: result.kickoffAt,
      });
      if (game) games.push(game);
    } catch {
      // Fall back to a points-only line from the scoreboard, so the result still
      // counts toward the record even if its detail line did not load.
      games.push(pointsOnlyGame(result));
    }
  }

  // 4. Rosters and injuries per club, when asked for.
  const teams: NflTeamSeason[] = [];
  for (const team of NFL_TEAMS) {
    let roster: RosterSlot[] = known.rosters?.[team.id] ?? [];
    if (config.includeRosters !== false) {
      try {
        roster = parseRoster(await get(`/nfl/teams/${team.abbr}/roster`), team.id);
      } catch {
        // Keep whatever roster the caller carried over.
      }
    }

    let injuries: Injury[] = [];
    if (config.includeInjuries !== false) {
      try {
        injuries = parseInjuries(await get(`/nfl/teams/${team.abbr}/injuries`), team.id, now);
      } catch {
        injuries = [];
      }
    }

    teams.push({ team, roster, injuries });
  }

  const provenance: Provenance = {
    kind: 'live',
    note: `Live ESPN feed for the ${season} season, through week ${throughWeek}. Results, rosters, and injuries as reported.`,
  };

  return { season, throughWeek, fetchedAt: now, teams, games, provenance };
}

/** A game with only the final score — the fallback when a box score will not load. */
function pointsOnlyGame(result: {
  id: string;
  week: number;
  kickoffAt: number;
  homeId: string;
  awayId: string;
  homePoints: number;
  awayPoints: number;
}): NflGame {
  return {
    id: result.id,
    week: result.week,
    kickoffAt: result.kickoffAt,
    homeId: result.homeId,
    awayId: result.awayId,
    home: emptyBoxScore(result.homePoints),
    away: emptyBoxScore(result.awayPoints),
  };
}

function emptyBoxScore(points: number): TeamBoxScore {
  return {
    points,
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
}

// --- Small parse helpers -----------------------------------------------------

/** ESPN dates are ISO strings; a missing or unparseable one is 0, not a crash. */
function parseDate(iso: string | undefined): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

/** A score or count as a number, tolerant of the string ESPN often sends. */
function toNumber(value: string | number | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** First stat present under any of the candidate names, as a number. */
function num(by: Record<string, string>, ...names: string[]): number {
  for (const name of names) {
    if (name in by) return toNumber(by[name]);
  }
  return 0;
}

/** Same, for a stat that lives on an athlete's own statistics array. */
function num2(
  stats: Array<{ name?: string; displayValue?: string }> | undefined,
  name: string,
): number {
  for (const stat of stats ?? []) {
    if (stat.name === name) return toNumber(stat.displayValue);
  }
  return 0;
}

/**
 * ESPN reports "made-attempted" ratios as `"5-13"`; return `[made, attempted]`.
 * A single number ("3") reads as `[3, 0]`, an absent stat as `[0, 0]`.
 */
function pair(by: Record<string, string>, ...names: string[]): [number, number] {
  for (const name of names) {
    if (!(name in by)) continue;
    const parts = by[name].split('-');
    const made = toNumber(parts[0]);
    const attempted = parts.length > 1 ? toNumber(parts[1]) : 0;
    return [made, attempted];
  }
  return [0, 0];
}

/** "31:24" possession time → seconds. */
function clock(value: string | undefined): number {
  if (!value) return 0;
  const [m, s] = value.split(':');
  return toNumber(m) * 60 + toNumber(s);
}

// `GAME_DURATION_MS` is imported so a live game's `finalAt` in derive stays the
// same offset from kickoff the synthetic source uses; re-exported for parity with
// the season module's public surface.
export { GAME_DURATION_MS };
