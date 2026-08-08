/**
 * The raw shape of an NFL feed.
 *
 * This is the adapter layer, so nothing here knows what a plant is. These are
 * the records a real source emits — a schedule of games with two box scores
 * each, a roster of positions with ages and years of service, and an injury
 * report — and `translation/nfl.ts` is the only place they meet the ecosystem
 * vocabulary.
 *
 * Two shape decisions carry most of the weight.
 *
 * **Box scores, not season totals.** A feed that hands you "yards per game" has
 * already thrown away the thing the garden needs most: when each number changed.
 * Storing the per-game lines and summing them means every season stat is a
 * derivation (`derive.ts`), and the same derivation evaluated at an earlier
 * timestamp is history — so time scrub costs nothing extra and can never
 * disagree with the live view.
 *
 * **Roster slots, not named players.** Entries are depth-chart positions (`QB1`,
 * `LT`, `CB3`) carrying an age and a years-of-service count. The snapshot in
 * `season.ts` is generated rather than fetched, and inventing injuries for real
 * named people would be a fabrication about someone rather than a stand-in for
 * data. A live adapter can add a `player` field alongside `slot` without any of
 * the derivations or the translation noticing.
 */

export type Conference = 'AFC' | 'NFC';

export type DivisionName = 'East' | 'North' | 'South' | 'West';

/**
 * A franchise. Identity only: nothing here moves week to week, which is why the
 * translation reads it for maturity and labels and never for health.
 */
export interface NflTeam {
  /** Lowercase, stable, used as the node id suffix and the geometry seed. */
  id: string;
  /** Conventional two or three letter code. */
  abbr: string;
  /** 'Kansas City'. */
  location: string;
  /** 'Chiefs'. */
  nickname: string;
  conference: Conference;
  division: DivisionName;
  /**
   * The year the franchise began play, using its original league — AFL clubs
   * carry their AFL year and the two AAFC clubs carry theirs. It is the only
   * honest single number for "how long has this existed", and it feeds the
   * franchise-age part of maturity.
   */
  founded: number;
  /**
   * Team colours, for the inspection HUD only. Explicitly *not* a render input:
   * colour in this scene is a redundant encoding of health (DESIGN.md), and
   * thirty-two team palettes arriving through the back door would quietly make
   * hue mean something again.
   */
  colors: { primary: string; secondary: string };
}

/** Broad position groups, coarse enough that every feed agrees on them. */
export type PositionGroup =
  | 'quarterback'
  | 'backfield'
  | 'receiver'
  | 'offensive-line'
  | 'defensive-line'
  | 'linebacker'
  | 'secondary'
  | 'specialist';

/**
 * One depth-chart slot. Age and experience are the two career numbers the
 * request named, and they are what makes a roster old or young rather than good
 * or bad — so they feed maturity, never vitality.
 */
export interface RosterSlot {
  /** `kc/QB1`. */
  id: string;
  /** Depth-chart label: 'QB1', 'LT', 'CB3'. */
  slot: string;
  /** Position abbreviation: 'QB', 'LT', 'CB'. */
  position: string;
  group: PositionGroup;
  /** True for the eleven on each side of the ball, plus the three specialists. */
  starter: boolean;
  /** Years old. */
  age: number;
  /** Completed seasons of service. 0 is a rookie. */
  experience: number;
  /** Career games started, for the HUD. */
  gamesStarted: number;
}

/**
 * Injury designations as a feed reports them. `ir` is the season-ending one and
 * `questionable` is the routine Friday listing, which is why severity is a
 * function of status and slot importance rather than of status alone.
 */
export type InjuryStatus = 'questionable' | 'doubtful' | 'out' | 'ir';

export interface Injury {
  id: string;
  teamId: string;
  /** The depth-chart slot that is hurt, matching `RosterSlot.slot`. */
  slot: string;
  position: string;
  status: InjuryStatus;
  /** Body part or mechanism, as a report gives it: 'hamstring', 'concussion'. */
  description: string;
  /**
   * Epoch ms the injury was first reported. Load-bearing rather than
   * decorative: an injury sustained in Sunday's game does not exist when the
   * cursor is scrubbed back to Saturday, so a team's plant genuinely stands
   * healthier before the snap that hurt it.
   */
  since: number;
  /** Games already missed with it. */
  gamesMissed: number;
}

/**
 * One team's line from one game. Every stat the garden reads is either in here
 * or summed from it — "every stat available" means every stat that has a
 * per-game truth, which is what makes them all scrubbable.
 */
export interface TeamBoxScore {
  points: number;
  yards: number;
  passYards: number;
  rushYards: number;
  plays: number;
  firstDowns: number;
  thirdDownAttempts: number;
  thirdDownConversions: number;
  redZoneTrips: number;
  redZoneTouchdowns: number;
  /** Giveaways: interceptions thrown plus fumbles lost. */
  turnovers: number;
  /** Sacks this team's own quarterback took. */
  sacksAllowed: number;
  penalties: number;
  penaltyYards: number;
  timeOfPossessionSec: number;
}

/**
 * A played game, holding both teams' lines. Held once at league level rather
 * than twice per team, so a result can never disagree with itself — the failure
 * mode of every per-team standings feed.
 */
export interface NflGame {
  id: string;
  /** 1-based week of the regular season. */
  week: number;
  /** Epoch ms of kickoff. */
  kickoffAt: number;
  homeId: string;
  awayId: string;
  home: TeamBoxScore;
  away: TeamBoxScore;
}

/** A franchise plus the two things about it that change: who plays, who is hurt. */
export interface NflTeamSeason {
  team: NflTeam;
  roster: RosterSlot[];
  injuries: Injury[];
}

/**
 * Where a snapshot came from. Recorded in the data rather than in a comment,
 * because the one thing a viewer must never have to guess is whether the numbers
 * on the screen are real.
 */
export interface Provenance {
  /** `synthetic` for the generated snapshot; a live adapter names its feed. */
  kind: 'synthetic' | 'live';
  /** Human-readable line, rendered on the HUD alongside the stats. */
  note: string;
  /** Seed for `synthetic`, so a snapshot is reproducible from its provenance. */
  seed?: number;
}

/** Everything one fetch of the league returns. */
export interface NflSeasonSnapshot {
  /** Calendar year the season started in. */
  season: number;
  /** Weeks completed. Games beyond it have not been played and are not here. */
  throughWeek: number;
  /** Epoch ms the snapshot was taken. */
  fetchedAt: number;
  teams: NflTeamSeason[];
  games: NflGame[];
  provenance: Provenance;
}

/**
 * What a source has to provide. One method, because a season snapshot is the
 * whole state of the league and there is nothing a caller could usefully ask for
 * a slice of.
 *
 * A live adapter (ESPN, nflverse, a paid feed) implements this and nothing
 * downstream changes. That is the entire reason the raw shapes above are
 * feed-shaped rather than convenient.
 */
export interface NflSource {
  readonly name: string;
  snapshot(now?: number): NflSeasonSnapshot;
}
