/**
 * Captured-shape ESPN responses, trimmed to the fields the parsers read.
 *
 * These stand in for the socket exactly the way `adapters/prometheus/mock.ts`
 * does: they are the wire shape a real ESPN response has, so the parsers can be
 * exercised offline and a live run swaps them for the network and changes
 * nothing else. They are hand-trimmed rather than a full capture — every field a
 * parser reads is present and named as ESPN names it; the hundreds it ignores
 * are dropped so the fixture stays legible.
 *
 * If a live deploy finds a shape these got wrong, the fix is here and in the
 * parser, not in the source or the translation — which is the entire reason the
 * fetch/parse boundary exists.
 */

/** A bare scoreboard: what names the live season and current week. */
export const SCOREBOARD_META = {
  season: { year: 2024, type: 2 },
  week: { number: 3 },
  events: [],
};

/** One week's scoreboard, with two final games and one still in progress. */
export const WEEK_SCOREBOARD = {
  season: { year: 2024, type: 2 },
  week: { number: 3 },
  events: [
    {
      id: '401671001',
      date: '2024-09-22T17:00Z',
      week: { number: 3 },
      competitions: [
        {
          id: '401671001',
          date: '2024-09-22T17:00Z',
          status: { type: { completed: true, state: 'post' } },
          competitors: [
            { homeAway: 'home', score: '27', team: { abbreviation: 'KC' } },
            { homeAway: 'away', score: '20', team: { abbreviation: 'ATL' } },
          ],
        },
      ],
    },
    {
      id: '401671002',
      date: '2024-09-22T20:25Z',
      week: { number: 3 },
      competitions: [
        {
          id: '401671002',
          date: '2024-09-22T20:25Z',
          status: { type: { completed: true, state: 'post' } },
          competitors: [
            { homeAway: 'home', score: '10', team: { abbreviation: 'BUF' } },
            { homeAway: 'away', score: '31', team: { abbreviation: 'BAL' } },
          ],
        },
      ],
    },
    {
      // In progress — must be skipped: no result on the board yet.
      id: '401671003',
      date: '2024-09-23T00:20Z',
      week: { number: 3 },
      competitions: [
        {
          id: '401671003',
          date: '2024-09-23T00:20Z',
          status: { type: { completed: false, state: 'in' } },
          competitors: [
            { homeAway: 'home', score: '14', team: { abbreviation: 'SF' } },
            { homeAway: 'away', score: '7', team: { abbreviation: 'LAR' } },
          ],
        },
      ],
    },
  ],
};

/** A box-score summary for game 401671001 (KC 27, ATL 20). */
export const SUMMARY = {
  header: {
    week: 3,
    season: { year: 2024 },
    competitions: [
      {
        id: '401671001',
        date: '2024-09-22T17:00Z',
        competitors: [
          { homeAway: 'home', score: '27', team: { abbreviation: 'KC' } },
          { homeAway: 'away', score: '20', team: { abbreviation: 'ATL' } },
        ],
      },
    ],
  },
  boxscore: {
    teams: [
      {
        team: { abbreviation: 'KC' },
        statistics: [
          { name: 'firstDowns', displayValue: '22' },
          { name: 'thirdDownEff', displayValue: '6-13' },
          { name: 'totalYards', displayValue: '368' },
          { name: 'netPassingYards', displayValue: '241' },
          { name: 'rushingYards', displayValue: '127' },
          { name: 'totalOffensivePlays', displayValue: '64' },
          { name: 'redZoneAttempts', displayValue: '3-4' },
          { name: 'turnovers', displayValue: '1' },
          { name: 'sacksYardsLost', displayValue: '2-14' },
          { name: 'totalPenaltiesYards', displayValue: '5-40' },
          { name: 'possessionTime', displayValue: '31:24' },
        ],
      },
      {
        team: { abbreviation: 'ATL' },
        statistics: [
          { name: 'firstDowns', displayValue: '18' },
          { name: 'thirdDownEff', displayValue: '4-12' },
          { name: 'totalYards', displayValue: '311' },
          { name: 'netPassingYards', displayValue: '198' },
          { name: 'rushingYards', displayValue: '113' },
          { name: 'totalOffensivePlays', displayValue: '58' },
          { name: 'redZoneAttempts', displayValue: '2-3' },
          { name: 'turnovers', displayValue: '2' },
          { name: 'sacksYardsLost', displayValue: '3-21' },
          { name: 'totalPenaltiesYards', displayValue: '7-55' },
          { name: 'possessionTime', displayValue: '28:36' },
        ],
      },
    ],
  },
};

/** A second box-score summary, for game 401671002 (BAL 31 at BUF 10). */
export const SUMMARY_2 = {
  header: {
    week: 3,
    season: { year: 2024 },
    competitions: [
      {
        id: '401671002',
        date: '2024-09-22T20:25Z',
        competitors: [
          { homeAway: 'home', score: '10', team: { abbreviation: 'BUF' } },
          { homeAway: 'away', score: '31', team: { abbreviation: 'BAL' } },
        ],
      },
    ],
  },
  boxscore: {
    teams: [
      {
        team: { abbreviation: 'BUF' },
        statistics: [
          { name: 'firstDowns', displayValue: '15' },
          { name: 'thirdDownEff', displayValue: '3-11' },
          { name: 'totalYards', displayValue: '287' },
          { name: 'netPassingYards', displayValue: '180' },
          { name: 'rushingYards', displayValue: '107' },
          { name: 'totalOffensivePlays', displayValue: '55' },
          { name: 'redZoneAttempts', displayValue: '1-2' },
          { name: 'turnovers', displayValue: '3' },
          { name: 'sacksYardsLost', displayValue: '4-30' },
          { name: 'totalPenaltiesYards', displayValue: '6-45' },
          { name: 'possessionTime', displayValue: '26:12' },
        ],
      },
      {
        team: { abbreviation: 'BAL' },
        statistics: [
          { name: 'firstDowns', displayValue: '24' },
          { name: 'thirdDownEff', displayValue: '8-14' },
          { name: 'totalYards', displayValue: '401' },
          { name: 'netPassingYards', displayValue: '156' },
          { name: 'rushingYards', displayValue: '245' },
          { name: 'totalOffensivePlays', displayValue: '67' },
          { name: 'redZoneAttempts', displayValue: '4-4' },
          { name: 'turnovers', displayValue: '0' },
          { name: 'sacksYardsLost', displayValue: '1-7' },
          { name: 'totalPenaltiesYards', displayValue: '4-35' },
          { name: 'possessionTime', displayValue: '33:48' },
        ],
      },
    ],
  },
};

/** A trimmed roster: a few players across position groups, with age/experience. */
export const ROSTER = {
  athletes: [
    {
      position: 'offense',
      items: [
        {
          id: '3139477',
          age: 29,
          experience: { years: 7 },
          position: { abbreviation: 'QB' },
        },
        {
          id: '4362887',
          age: 23,
          experience: { years: 1 },
          position: { abbreviation: 'QB' },
        },
        {
          id: '4241457',
          age: 25,
          experience: { years: 3 },
          position: { abbreviation: 'WR' },
        },
        {
          id: '2976212',
          age: 34,
          experience: { years: 11 },
          position: { abbreviation: 'LT' },
        },
      ],
    },
    {
      position: 'defense',
      items: [
        {
          id: '3055899',
          age: 28,
          experience: { years: 6 },
          position: { abbreviation: 'DT' },
        },
        {
          id: '4570099',
          age: 22,
          experience: { years: 0 },
          position: { abbreviation: 'CB' },
        },
      ],
    },
    {
      position: 'specialTeam',
      items: [
        {
          id: '2473037',
          age: 35,
          experience: { years: 12 },
          position: { abbreviation: 'K' },
        },
      ],
    },
  ],
};

/** A trimmed injury report: one out, one questionable, one unrecognized status. */
export const INJURIES = {
  injuries: [
    {
      injuries: [
        {
          id: 'inj-1',
          status: 'Out',
          date: '2024-09-20T14:00Z',
          athlete: { position: { abbreviation: 'WR' } },
          details: { type: 'Hamstring' },
        },
        {
          id: 'inj-2',
          status: 'Questionable',
          date: '2024-09-21T14:00Z',
          athlete: { position: { abbreviation: 'CB' } },
          type: { description: 'Ankle' },
        },
        {
          // An unrecognized status is dropped rather than guessed.
          id: 'inj-3',
          status: 'Probable-ish',
          date: '2024-09-21T14:00Z',
          athlete: { position: { abbreviation: 'TE' } },
        },
      ],
    },
  ],
};
