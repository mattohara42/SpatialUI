import {
  availabilityAt,
  gamesByTeam,
  gamesThrough,
  importanceOf,
  recordOf,
  seasoningOf,
  statsOf,
  type Availability,
  type Injury,
  type NflSeasonSnapshot,
  type NflTeam,
  type NflTeamSeason,
  type Seasoning,
  type TeamGame,
  type TeamRecord,
  type TeamStats,
  divisionKey,
  divisionLabel,
} from '../adapters/nfl';
import {
  DAY_MS as HISTORY_DAY_MS,
  DEFAULT_ARCHIVE_CAPACITY,
  HOUR_MS,
  createHistory,
  record as recordVitals,
  type VitalsHistory,
} from '../ecosystem/history';
import { inkFor, luminanceOf, type Emblem } from '../ecosystem/labels';
import type { PlantingType } from '../ecosystem/planting';
import type {
  Blight,
  BlightSeverity,
  EcosystemEdge,
  EcosystemNode,
  Vitals,
} from '../ecosystem/types';

/**
 * The league as a garden.
 *
 * This is the only file where football and plants meet. Above it the adapter
 * knows nothing about growth; below it the scene knows nothing about football.
 * Everything contentious about the mapping is therefore here, in one place, with
 * the reasoning next to it — which is exactly what `DESIGN.md` asks of a
 * translator, since normalization is where false comparability gets created.
 *
 * The shape:
 *
 * - **The league is the garden.** One environment, one meaning for vitality, all
 *   thirty-two clubs in one field of view. Two conference gardens would make the
 *   comparison everyone actually wants — how does the AFC West stack up against
 *   the NFC North — impossible by construction.
 * - **The divisions are the beds.** Eight of them, each a distinct planting, so
 *   a division reads as a composed unit and you learn where you are by what is
 *   growing there. Conference is not a bed but a *row of beds*: the model has
 *   one container level between garden and plant, and bed ids sort
 *   conference-first so the AFC fills the front row and the NFC the back. The
 *   alternative — beds inside beds — would buy a label and cost the layout its
 *   flat structure.
 * - **The teams are the plants.** Thirty-two, four to a bed.
 *
 * And what the four health axes are made of, which is the part that has to be
 * defensible rather than merely plausible:
 *
 * | axis | football | why |
 * | --- | --- | --- |
 * | vitality | record, point differential, roster availability | how the season is going *and* what it has left to go on with |
 * | activity | scoring pace and snaps | how eventful this team's games are |
 * | maturity | starter experience, roster age, franchise age | how long-established — never how good |
 * | trend | recent form against season form, plus the streak | a 4-9 team that has won three straight is a different thing from one that has lost three |
 *
 * The load-bearing decision is that **injuries lower vitality but do not touch
 * maturity**, and **age and experience raise maturity but never vitality**. An
 * old roster is a big tree, not a healthy one; a hurt roster is a wilting tree,
 * not a small one. Cross those two and the garden stops being readable — every
 * ageing team would look sick and every young one would look like a seedling in
 * trouble.
 */

export const NFL_GARDEN_ID = 'nfl';

const DAY_MS = 24 * HOUR_MS;

/**
 * How long a club can go without a result before the garden calls it silent.
 *
 * Seven days, because that is how often clubs play. It separates the two cases
 * cleanly rather than by a hair: a club that played this week is at most about
 * five days old even if its game was the Thursday one, and a club on a bye is at
 * least eight. Over the line the only clubs left are the ones idle — or a feed
 * that has stopped, and the garden deliberately cannot tell those apart, because
 * both mean the same thing to a reader: what you are looking at is old.
 *
 * This is the staleness state (grey, still, dusty) reached by the data genuinely
 * being stale rather than by a mock hand-editing a timestamp — two clubs a week
 * stand there greyed and motionless because they did not play.
 *
 * ## Why the league stayed flat when the market did not
 *
 * Staleness now takes a `StaleSchedule` — a source-supplied "when should I next
 * have heard something" — and the market uses it to cut its detection latency
 * from four days to two hours. The league is registered as a bare duration
 * anyway, which is the degenerate schedule (nothing is ever due; the whole
 * duration is tolerance), and that is deliberate on two counts.
 *
 * The first is that this feed cannot answer the question. `NflSeasonSnapshot`
 * carries games that have been *played*; a fixture list is not in the shape, so
 * there is no next kickoff to point at. A cadence — last final plus seven days —
 * is the most the snapshot supports, and a cadence expressed as tolerance is
 * this constant.
 *
 * The second is that the league wants the flat behaviour even where it could do
 * better. A bye is legitimate silence, so a schedule would clear it, and clearing
 * it would take the greying off exactly the two clubs a week that make the state
 * reachable here at all. That trade is the right way round for a market, where
 * the shut hours are most of the week and greying through them destroys the
 * signal. It is the wrong way round for a league, where the reader's question is
 * "is what I am looking at current" and a bye and a dead feed answer it
 * identically. Same contract, opposite answer, because the sources differ — which
 * is the entire argument for the contract being per-source.
 */
export const NFL_STALE_AFTER_MS = 7 * DAY_MS;

/** Hours of hourly history backfilled per team. A week, matching the default. */
const DEFAULT_HISTORY_HOURS = 168;

/**
 * A planting per division.
 *
 * Signal-free and constant, like every planting: it says nothing about how the
 * division is doing and never moves with a result. It is here because eight beds
 * is the first data set with room to show the whole vocabulary at once, and
 * because a fixed assignment is *learnable* — the vineyard is the NFC East, the
 * way the reader of a real garden knows where the beans are. Health still reads
 * through droop, density, and colour within whatever form a club wears.
 *
 * The assignment is arbitrary but it is not free, and this is the one constraint
 * on it: plantings do not all show ill health equally harshly. A struggling tree
 * sheds to bare twigs, which is the bleakest state the renderer has; a struggling
 * topiary goes shaggy and a struggling vegetable simply bears less. Since a
 * conference is a row, giving one row all four tree plantings would make that
 * whole conference look worse than the other one for no reason at all — a visual
 * difference carrying no signal, which is the exact thing plantings promise not
 * to be. So each conference gets two of the tree forms and two of the soft ones.
 */
const DIVISION_PLANTINGS: Record<string, PlantingType> = {
  'afc-east': 'orchard',
  'afc-north': 'conifer-stand',
  'afc-south': 'vegetable-rows',
  'afc-west': 'topiary',
  'nfc-east': 'vineyard',
  'nfc-north': 'grove',
  'nfc-south': 'hedge',
  'nfc-west': 'flower-border',
};

export interface NflTranslationOptions {
  /** The moment to translate as of. Defaults to the snapshot's fetch time. */
  asOf?: number;
  historyHours?: number;
}

/** What a translator hands the store: flat records, no state machinery. */
export interface TranslatedEcosystem {
  nodes: Record<string, EcosystemNode>;
  edges: Record<string, EcosystemEdge>;
  /** Hourly for a week. */
  history: Record<string, VitalsHistory>;
  /** Daily for the season — what the season scrub reads. */
  archive: Record<string, VitalsHistory>;
}

/** Everything the league says about one club at one moment. */
export interface TeamReading {
  vitals: Vitals;
  record: TeamRecord;
  stats: TeamStats;
  availability: Availability;
  seasoning: Seasoning;
  played: TeamGame[];
}

export function translateNflSnapshot(
  snapshot: NflSeasonSnapshot,
  options: NflTranslationOptions = {},
): TranslatedEcosystem {
  const { asOf = snapshot.fetchedAt, historyHours = DEFAULT_HISTORY_HOURS } = options;

  const byTeam = gamesByTeam(snapshot);
  const nodes: Record<string, EcosystemNode> = {};
  const edges: Record<string, EcosystemEdge> = {};
  const history: Record<string, VitalsHistory> = {};
  const archive: Record<string, VitalsHistory> = {};

  nodes[NFL_GARDEN_ID] = {
    id: NFL_GARDEN_ID,
    parentId: null,
    gardenId: NFL_GARDEN_ID,
    label: 'NFL',
    domain: 'sports',
    kind: 'garden',
    polarity: 'nurture',
    vitality: 1,
    activity: 0.5,
    maturity: 1,
    trend: 0,
    blights: [],
    updatedAt: asOf,
    raw: {
      source: 'nfl',
      season: snapshot.season,
      throughWeek: snapshot.throughWeek,
      fetchedAt: snapshot.fetchedAt,
      provenance: snapshot.provenance,
    },
  };

  // Beds first, so a team node can be parented as it is built.
  const divisions = groupByDivision(snapshot.teams);
  for (const [key, teams] of divisions) {
    const bedId = bedIdFor(key);
    nodes[bedId] = {
      id: bedId,
      parentId: NFL_GARDEN_ID,
      gardenId: NFL_GARDEN_ID,
      label: divisionLabel(teams[0].team),
      domain: 'sports',
      kind: 'bed',
      polarity: 'nurture',
      plantingType: DIVISION_PLANTINGS[key] ?? 'orchard',
      vitality: 1,
      activity: 0.5,
      maturity: 1,
      trend: 0,
      blights: [],
      updatedAt: asOf,
      raw: {
        source: 'nfl',
        conference: teams[0].team.conference,
        division: teams[0].team.division,
        clubs: teams.map((t) => t.team.abbr),
      },
    };
  }

  const readings: Record<string, TeamReading> = {};

  for (const [key, teams] of divisions) {
    for (const team of teams) {
      const id = teamNodeId(team.team.id);
      const games = byTeam[team.team.id] ?? [];
      // Sorted by onset, which is what lets the history backfill memoize a
      // reading on the count of active injuries: with a sorted list, a count is
      // a prefix, and a prefix is the set.
      const injuries = [...team.injuries].sort((a, b) => a.since - b.since);
      const reading = readTeam(team, games, injuries, asOf);
      readings[team.team.id] = reading;

      const lastGame = reading.played[reading.played.length - 1] ?? null;

      nodes[id] = {
        id,
        parentId: bedIdFor(key),
        gardenId: NFL_GARDEN_ID,
        label: `${team.team.location} ${team.team.nickname}`,
        emblem: emblemFor(team.team),
        domain: 'sports',
        kind: 'plant',
        polarity: 'nurture',
        ...reading.vitals,
        blights: blightsFor(team, reading, asOf),
        // When the club's numbers last changed, which is the end of its last
        // game — not when the feed was polled. Polling time would make a club on
        // a bye look as fresh as one that played yesterday, which is the exact
        // failure (silence looking like health) the staleness state exists for.
        updatedAt: lastGame?.finalAt ?? snapshot.fetchedAt,
        raw: rawFor(team, reading, snapshot, asOf),
      };

      history[id] = backfill(team, games, injuries, asOf, HOUR_MS, historyHours);
      // The season at a day a slot. Same function, same memo, coarser step:
      // reaching four months back costs one more call, because the derivations
      // never cared how far back they were asked about.
      archive[id] = backfill(
        team,
        games,
        injuries,
        asOf,
        HISTORY_DAY_MS,
        DEFAULT_ARCHIVE_CAPACITY,
      );
    }

    // Rivalries: every pair inside a division, drawn as root grafts. Undirected
    // and `correlates`, because division rivals are not dependencies — they are
    // tied together by a table where one club's win is another's lost ground.
    for (const [a, b] of pairs(teams)) {
      const id = `${bedIdFor(key)}/${a.team.id}~${b.team.id}`;
      const gap = Math.abs(
        readings[a.team.id].record.winPct - readings[b.team.id].record.winPct,
      );
      edges[id] = {
        id,
        gardenId: NFL_GARDEN_ID,
        sourceId: teamNodeId(a.team.id),
        targetId: teamNodeId(b.team.id),
        kind: 'correlates',
        // Closer in the table is a tighter coupling: two clubs at 9-4 are in the
        // same race, and one at 11-2 with one at 3-10 are not.
        strength: 0.25 + 0.75 * (1 - gap),
        directed: false,
      };
    }
  }

  rollUpContainers(nodes);
  return { nodes, edges, history, archive };
}

/** `nfl/team/kc`, stable across restarts, so a club always grows the same plant. */
export function teamNodeId(teamId: string): string {
  return `${NFL_GARDEN_ID}/team/${teamId}`;
}

/**
 * The mark a club's tag wears: its abbreviation in its own colours.
 *
 * This is the league's answer to the question every source has to answer for
 * itself — *what does this thing look like when it is named* — and it is the
 * reason the emblem is chosen in translation rather than derived in the
 * renderer. A club has a real abbreviation and two real colours; deriving `DC`
 * for the Dallas Cowboys off the label, as the default would, throws away
 * something the source already knows.
 *
 * It is not a crest. The wordmarks and logos are trademarks and the project
 * loads no image assets at all — the same rule the generated textures keep — so
 * a club is drawn as its letters on its primary colour, which is what a plant
 * tag would carry anyway. Alignment and colours are real; nothing here implies
 * the crest.
 *
 * The secondary colour is used as ink only when it will actually survive on the
 * primary. Half the league's pairs are a colour and near-white, which reads;
 * the other half are two darks, and Ravens purple on Ravens gold is a smear at
 * tag size. Luminance decides, per club, which is why this is a function rather
 * than two fields copied across.
 */
export function emblemFor(team: NflTeam): Emblem {
  const { primary, secondary } = team.colors;
  const contrast = Math.abs(luminanceOf(primary) - luminanceOf(secondary));
  return {
    mark: team.abbr,
    color: primary,
    ink: contrast > 0.35 ? secondary : inkFor(primary),
  };
}

/**
 * `nfl/afc-east`. The conference is first in the key on purpose: `layout.ts`
 * sorts beds by id, so conference-first ordering is what puts a conference in
 * each row of the garden.
 */
export function bedIdFor(divisionKeyValue: string): string {
  return `${NFL_GARDEN_ID}/${divisionKeyValue}`;
}

/**
 * One club's vitals at a moment.
 *
 * Exported because it is the interesting half of this module and the thing worth
 * testing directly: given a season and a timestamp, what does the plant look
 * like? History is this function in a loop.
 */
export function readTeam(
  team: NflTeamSeason,
  games: TeamGame[],
  injuries: Injury[],
  asOf: number,
): TeamReading {
  const played = gamesThrough(games, asOf);
  const record = recordOf(played);
  const stats = statsOf(played);
  const availability = availabilityAt(team.roster, injuries, asOf);
  const seasoning = seasoningOf(team.roster);

  return {
    vitals: {
      vitality: vitalityOf(record, availability),
      activity: activityOf(stats),
      maturity: maturityOf(team, seasoning),
      trend: trendOf(record),
    },
    record,
    stats,
    availability,
    seasoning,
    played,
  };
}

/**
 * How the season is going, and what the club has left to go on with.
 *
 * Record is the headline and carries the most weight, but a record alone is a
 * lagging measure: a 7-6 team that has been outscored by sixty points is not the
 * same object as a 7-6 team that has outscored everyone, and the differential is
 * what separates them. Availability is the third term because it is the only one
 * that is about *now* rather than about what already happened — losing a
 * quarterback in the first quarter of Sunday's game changes what the club is
 * before it changes anything in the standings, and the plant should wilt then
 * rather than three weeks later.
 *
 * Availability is remapped before it is used. Raw, it sits between about 0.8 and
 * 1.0 — a roster is mostly never fully hurt — and feeding that in directly would
 * spend a quarter of vitality on a term that barely moves. 0.72 is the floor
 * because that is roughly a club that has lost its quarterback and two other
 * starters, which is as bad as an injury report realistically gets.
 */
export function vitalityOf(record: TeamRecord, availability: Availability): number {
  // ±14 points a game is the practical span of a season's differential; beyond
  // it the club is historically good or historically bad and the axis has
  // nothing left to say.
  const form = shrink(record.winPct, record.played);
  const margin = shrink(clamp01(0.5 + record.pointDiffPerGame / 28), record.played);
  const healthy = clamp01((availability.available - 0.72) / 0.28);

  return calibrate(0.45 * form + 0.3 * margin + 0.25 * healthy);
}

/**
 * Weight the evidence by how much of it there is.
 *
 * A club that is 2-0 is not twice the club that is 12-1, and before the season
 * scrub existed nobody could see the difference: the live view is always deep
 * into a season, so the small-sample end of the axis was never on screen.
 * Walking a season back showed an undefeated club in week two standing at the
 * absolute top of the scale, which is a claim the data cannot support.
 *
 * Three notional games at .500, so a record has to survive contact with a few
 * more weeks before it reaches the ends of the axis. It converges quickly — by
 * midseason the correction is a rounding error — and it removes the special case
 * that used to handle nought games, because a club that has not played is simply
 * one whose evidence is all prior.
 *
 * Availability deliberately gets no such treatment. An injury is known the
 * moment it happens; there is no sample size to wait for.
 */
function shrink(value: number, played: number, prior = 3): number {
  return (value * played + 0.5 * prior) / (played + prior);
}

/**
 * The composite is a position in the league; vitality is a state of health, and
 * they are not the same number.
 *
 * Half of any league is below .500 by construction, so feeding the composite
 * straight through would leave half the garden wilting every week — and a wilted
 * plant means *this is in trouble*, not *this is mid-table*. It is the failure
 * DESIGN.md already recorded once, when the infrastructure garden read as dead
 * because deciduous trees at middling health are bare twigs, which is the
 * bleakest state the renderer has.
 *
 * The axis contract says 0 is dying and 1 is thriving, and dying is a winless
 * club with a wrecked roster — a place no real club stands. So average has to
 * sit above the midpoint, and this curve is that calibration: an 0.50 composite
 * reads 0.65, the worst club in a normal season lands near 0.47 rather than
 * 0.30, and the top of the table still reaches past 0.9. It is monotonic, so it
 * moves where the plants sit without ever reordering them, and it is one line in
 * one place rather than a thumb on each of the three terms above.
 */
function calibrate(composite: number): number {
  return clamp01(Math.pow(clamp01(composite), 0.62));
}

/**
 * How much is happening. Not how *well* it is going — that is vitality's job,
 * and a shootout the club lost 38-35 is a busy plant, not a healthy one.
 *
 * Combined points is the better half of it: it counts both offences, so a club
 * in high-scoring games is animated whichever end of them it is on. Snap count
 * is the tempo underneath — a fast, pass-happy offence runs seventy plays a game
 * and a run-heavy one under sixty.
 */
export function activityOf(stats: TeamStats): number {
  const scoring = clamp01((stats.efficiency.combinedPointsPerGame - 34) / 22);
  const tempo = clamp01((stats.offense.playsPerGame - 55) / 18);
  return clamp01(0.6 * scoring + 0.4 * tempo);
}

/**
 * How long-established the club is — the axis that drives trunk thickness and
 * height, and the one it would be easiest to accidentally make mean "good".
 *
 * It never touches results. A roster of veterans is an old tree whether it is
 * 12-1 or 1-12, and an expansion franchise with a rookie quarterback is a young
 * one either way. Starter experience leads because it is the sharpest reading of
 * a roster's stage; average age across all fifty-three is the broader, duller
 * version of the same thing and gets less weight; franchise age is the slow term
 * that separates the Packers from the Texans no matter who is playing.
 */
export function maturityOf(
  team: NflTeamSeason,
  seasoning: Seasoning,
): number {
  const experience = clamp01(seasoning.starterAvgExperience / 7.5);
  const age = clamp01((seasoning.avgAge - 23.5) / 5);
  // 1920 to 2002 spans the league: the Bears and Cardinals at one end, the
  // Texans at the other.
  const franchise = clamp01((2002 - team.team.founded) / 82);
  return clamp01(0.4 * experience + 0.25 * age + 0.35 * franchise);
}

/**
 * Which way the season is moving. Signed, and deliberately *not* the derivative
 * of vitality: a 4-9 club that has won three in a row is trending up while its
 * vitality is still low, and that difference — the level against the delta — is
 * the whole reason `trend` is its own axis.
 */
export function trendOf(record: TeamRecord): number {
  if (record.played === 0) return 0;
  const recent =
    record.lastFive.reduce((sum, r) => sum + (r === 'W' ? 1 : r === 'T' ? 0.5 : 0), 0) /
    record.lastFive.length;
  const form = (recent - record.winPct) * 2.2;
  const streak = record.streak / 4;
  return clamp(0.65 * form + 0.35 * streak, -1, 1);
}

/**
 * Injuries and losing runs as blights.
 *
 * Severity is status times what is missing, not status alone: a starting
 * quarterback on injured reserve is a critical problem and a fourth safety being
 * questionable is not news. The routine end of the report — a healthy backup
 * listed questionable — is dropped entirely rather than emitted as `info`,
 * because a garden where every plant carries five badges has no badges.
 *
 * Nothing here is `remediable`. That flag means an adapter has a safe automated
 * action behind it, and there is no webhook that unpulls a hamstring.
 */
export function blightsFor(
  team: NflTeamSeason,
  reading: TeamReading,
  asOf: number,
): Blight[] {
  const blights: Blight[] = [];

  for (const injury of reading.availability.active) {
    const severity = severityOf(injury);
    if (severity === null) continue;
    const missed =
      injury.gamesMissed > 0 ? `, ${injury.gamesMissed} game${injury.gamesMissed === 1 ? '' : 's'} missed` : '';
    blights.push({
      id: `${injury.id}/blight`,
      severity,
      message: `${injury.slot} ${statusWord(injury)} — ${injury.description}${missed}`,
      since: injury.since,
    });
  }

  // A run of defeats is a fact about the club that no single injury explains,
  // and it is the thing a fan would name first.
  const { streak, lastFive } = reading.record;
  if (streak <= -3) {
    const startedAt =
      reading.played[reading.played.length + streak]?.finalAt ?? asOf;
    blights.push({
      id: `${team.team.id}/skid`,
      severity: streak <= -5 ? 'error' : 'warn',
      message: `lost ${-streak} straight${lastFive.length ? ` (last five ${lastFive.join('')})` : ''}`,
      since: startedAt,
    });
  }

  return blights;
}

/** Null means "not worth a badge", which most of an injury report is. */
function severityOf(injury: Injury): BlightSeverity | null {
  const weight = importanceOf(injury.slot);
  const sidelined = injury.status === 'out' || injury.status === 'ir';

  // Only the quarterback clears 12, so `critical` stays the thing it should be:
  // rare, and the one absence that redefines a season.
  if (sidelined) {
    if (weight >= 12) return 'critical';
    if (weight >= 5) return 'error';
    return weight >= 2.5 ? 'warn' : 'info';
  }
  if (injury.status === 'doubtful') {
    if (weight >= 12) return 'error';
    return weight >= 5 ? 'warn' : 'info';
  }
  // questionable
  if (weight >= 12) return 'warn';
  return weight >= 4 ? 'info' : null;
}

function statusWord(injury: Injury): string {
  return injury.status === 'ir' ? 'on injured reserve' : injury.status;
}

/**
 * The domain payload the inspection HUD renders and the renderer never reads.
 *
 * Deliberately everything: the full stat sheet, both sides of the ball, the
 * roster's age and service profile, the live injury report, and where the
 * numbers came from. The four axes are a lossy summary by design — this is what
 * you get when you walk up to the plant and ask what happened.
 */
function rawFor(
  team: NflTeamSeason,
  reading: TeamReading,
  snapshot: NflSeasonSnapshot,
  asOf: number,
): unknown {
  const last = reading.played[reading.played.length - 1] ?? null;
  return {
    source: 'nfl',
    provenance: snapshot.provenance,
    season: snapshot.season,
    team: team.team,
    record: reading.record,
    stats: reading.stats,
    roster: {
      ...reading.seasoning,
      size: team.roster.length,
      available: reading.availability.available,
      startersOut: reading.availability.startersOut,
    },
    injuries: reading.availability.active.map((injury) => ({
      slot: injury.slot,
      position: injury.position,
      status: injury.status,
      description: injury.description,
      gamesMissed: injury.gamesMissed,
      since: injury.since,
    })),
    lastGame: last && {
      week: last.week,
      opponent: last.opponentId.toUpperCase(),
      home: last.home,
      result: last.result,
      score: `${last.own.points}-${last.opponent.points}`,
      finalAt: last.finalAt,
    },
    idleDays: last ? (asOf - last.finalAt) / DAY_MS : null,
    // Roster entries are depth-chart slots, not people. Stated in the payload
    // the HUD shows, not only in a source comment, so nobody reads `QB1 out` as
    // a claim about a named player.
    note: 'roster entries are depth-chart slots; no player identities are modelled',
  };
}

/**
 * Vitals over time, produced by asking the same question at each step.
 *
 * The scrub then shows what the league actually looked like: cross Sunday
 * evening going backwards and the results unwind — a club that won stands
 * shorter, an injury sustained in the fourth quarter is gone, and the division
 * bed reads as the table did on Saturday. Step out to a day a slot and the same
 * walk covers the season: the club that is 10-3 now was 4-4 in October, and the
 * plant was smaller.
 *
 * Two things make this cheap. A club's vitals only move when a game goes final
 * or an injury is reported, so a reading is keyed on how many of each have
 * happened; and the injuries are sorted by onset, so "how many are active" is
 * exactly which ones are. A week of hourly samples collapses to three or four
 * computations per club, and a season of daily ones to about fourteen.
 */
function backfill(
  team: NflTeamSeason,
  games: TeamGame[],
  injuries: Injury[],
  asOf: number,
  stepMs: number,
  steps: number,
): VitalsHistory {
  const buffer = createHistory(stepMs, Math.max(1, steps));
  const cache = new Map<string, Vitals>();
  // Nothing is recorded before the season started. A club with no games has no
  // record and no differential, so every slot before week one would hold the
  // same opening-day number for all thirty-two — a flat line that looks like
  // data, which is the one thing the scrub window is written to keep off the
  // end of. Left unwritten, it instead bounds how far back the cursor may go.
  const seasonStart = games.length > 0 ? games[0].finalAt : asOf;

  for (let h = steps - 1; h >= 0; h--) {
    const at = asOf - h * stepMs;
    if (at < seasonStart) continue;
    const played = countBefore(games.map((g) => g.finalAt), at);
    const hurt = countBefore(injuries.map((i) => i.since), at);
    const key = `${played}:${hurt}`;

    let vitals = cache.get(key);
    if (!vitals) {
      vitals = readTeam(team, games, injuries, at).vitals;
      cache.set(key, vitals);
    }
    recordVitals(buffer, at, vitals);
  }

  return buffer;
}

/** How many of a sorted-enough list of timestamps have passed. */
function countBefore(timestamps: number[], at: number): number {
  let count = 0;
  for (const t of timestamps) if (t <= at) count++;
  return count;
}

/**
 * A bed summarizes its clubs and the garden summarizes its beds, so a division
 * reads at a glance and the league does too. `updatedAt` takes the newest child
 * rather than an average: a division is as current as its most recent result,
 * and averaging timestamps would make a bed with one club on a bye look half
 * stale when it is not.
 */
function rollUpContainers(nodes: Record<string, EcosystemNode>): void {
  const childIds: Record<string, string[]> = {};
  for (const node of Object.values(nodes)) {
    if (node.parentId) (childIds[node.parentId] ??= []).push(node.id);
  }

  // Beds before the garden, and by id rather than by reference: rolling up a bed
  // replaces the node, so a list of objects captured beforehand would summarize
  // the league from eight beds that had not been summarized yet.
  const beds = Object.values(nodes).filter((n) => n.kind === 'bed');
  for (const bed of beds) rollUp(nodes, bed.id, childIds[bed.id] ?? []);
  if (nodes[NFL_GARDEN_ID]) {
    rollUp(nodes, NFL_GARDEN_ID, childIds[NFL_GARDEN_ID] ?? []);
  }
}

function rollUp(
  nodes: Record<string, EcosystemNode>,
  id: string,
  childIds: string[],
): void {
  const children = childIds.map((childId) => nodes[childId]);
  if (children.length === 0) return;
  nodes[id] = {
    ...nodes[id],
    vitality: mean(children.map((c) => c.vitality)),
    activity: mean(children.map((c) => c.activity)),
    maturity: mean(children.map((c) => c.maturity)),
    trend: mean(children.map((c) => c.trend)),
    updatedAt: Math.max(...children.map((c) => c.updatedAt)),
  };
}

/** Clubs grouped by division key, in alignment order. */
function groupByDivision(teams: NflTeamSeason[]): [string, NflTeamSeason[]][] {
  const groups = new Map<string, NflTeamSeason[]>();
  for (const team of teams) {
    const key = divisionKey(team.team);
    const group = groups.get(key);
    if (group) group.push(team);
    else groups.set(key, [team]);
  }
  return [...groups.entries()];
}

function pairs<T>(items: T[]): [T, T][] {
  const out: [T, T][] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) out.push([items[i], items[j]]);
  }
  return out;
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / (values.length || 1);
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

function clamp01(n: number): number {
  return clamp(n, 0, 1);
}
