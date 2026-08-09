import type { Conference, DivisionName, NflTeam } from './types';

/**
 * The thirty-two franchises, their alignment, and their colours.
 *
 * This is the one part of the NFL data that is genuinely fixed: alignment
 * changes about once a decade, and founding years never do. The season snapshot
 * next door is generated, but this table is not — it is real, so the league you
 * walk into is laid out the way the league actually is.
 *
 * `founded` is the year the franchise began play in its original league. The ten
 * AFL clubs carry their AFL year (1960 for most of them) and the Browns and
 * 49ers carry their AAFC year, because "when did this thing start existing" is
 * the question maturity is asking and the merger did not restart anyone.
 */

interface TeamSeed {
  id: string;
  abbr: string;
  location: string;
  nickname: string;
  founded: number;
  primary: string;
  secondary: string;
}

/** Keyed by conference and division so the alignment is data, not a field to typo. */
const ALIGNMENT: Record<Conference, Record<DivisionName, TeamSeed[]>> = {
  AFC: {
    East: [
      { id: 'buf', abbr: 'BUF', location: 'Buffalo', nickname: 'Bills', founded: 1960, primary: '#00338d', secondary: '#c60c30' },
      { id: 'mia', abbr: 'MIA', location: 'Miami', nickname: 'Dolphins', founded: 1966, primary: '#008e97', secondary: '#fc4c02' },
      { id: 'ne', abbr: 'NE', location: 'New England', nickname: 'Patriots', founded: 1960, primary: '#002a5c', secondary: '#c60c30' },
      { id: 'nyj', abbr: 'NYJ', location: 'New York', nickname: 'Jets', founded: 1960, primary: '#125740', secondary: '#ffffff' },
    ],
    North: [
      { id: 'bal', abbr: 'BAL', location: 'Baltimore', nickname: 'Ravens', founded: 1996, primary: '#241773', secondary: '#9e7c0c' },
      { id: 'cin', abbr: 'CIN', location: 'Cincinnati', nickname: 'Bengals', founded: 1968, primary: '#fb4f14', secondary: '#000000' },
      { id: 'cle', abbr: 'CLE', location: 'Cleveland', nickname: 'Browns', founded: 1946, primary: '#311d00', secondary: '#ff3c00' },
      { id: 'pit', abbr: 'PIT', location: 'Pittsburgh', nickname: 'Steelers', founded: 1933, primary: '#ffb612', secondary: '#101820' },
    ],
    South: [
      { id: 'hou', abbr: 'HOU', location: 'Houston', nickname: 'Texans', founded: 2002, primary: '#03202f', secondary: '#a71930' },
      { id: 'ind', abbr: 'IND', location: 'Indianapolis', nickname: 'Colts', founded: 1953, primary: '#002c5f', secondary: '#a2aaad' },
      { id: 'jax', abbr: 'JAX', location: 'Jacksonville', nickname: 'Jaguars', founded: 1995, primary: '#006778', secondary: '#d7a22a' },
      { id: 'ten', abbr: 'TEN', location: 'Tennessee', nickname: 'Titans', founded: 1960, primary: '#0c2340', secondary: '#4b92db' },
    ],
    West: [
      { id: 'den', abbr: 'DEN', location: 'Denver', nickname: 'Broncos', founded: 1960, primary: '#fb4f14', secondary: '#002244' },
      { id: 'kc', abbr: 'KC', location: 'Kansas City', nickname: 'Chiefs', founded: 1960, primary: '#e31837', secondary: '#ffb81c' },
      { id: 'lv', abbr: 'LV', location: 'Las Vegas', nickname: 'Raiders', founded: 1960, primary: '#000000', secondary: '#a5acaf' },
      { id: 'lac', abbr: 'LAC', location: 'Los Angeles', nickname: 'Chargers', founded: 1960, primary: '#0080c6', secondary: '#ffc20e' },
    ],
  },
  NFC: {
    East: [
      { id: 'dal', abbr: 'DAL', location: 'Dallas', nickname: 'Cowboys', founded: 1960, primary: '#003594', secondary: '#869397' },
      { id: 'nyg', abbr: 'NYG', location: 'New York', nickname: 'Giants', founded: 1925, primary: '#0b2265', secondary: '#a71930' },
      { id: 'phi', abbr: 'PHI', location: 'Philadelphia', nickname: 'Eagles', founded: 1933, primary: '#004c54', secondary: '#a5acaf' },
      { id: 'was', abbr: 'WAS', location: 'Washington', nickname: 'Commanders', founded: 1932, primary: '#5a1414', secondary: '#ffb612' },
    ],
    North: [
      { id: 'chi', abbr: 'CHI', location: 'Chicago', nickname: 'Bears', founded: 1920, primary: '#0b162a', secondary: '#c83803' },
      { id: 'det', abbr: 'DET', location: 'Detroit', nickname: 'Lions', founded: 1930, primary: '#0076b6', secondary: '#b0b7bc' },
      { id: 'gb', abbr: 'GB', location: 'Green Bay', nickname: 'Packers', founded: 1919, primary: '#203731', secondary: '#ffb612' },
      { id: 'min', abbr: 'MIN', location: 'Minnesota', nickname: 'Vikings', founded: 1961, primary: '#4f2683', secondary: '#ffc62f' },
    ],
    South: [
      { id: 'atl', abbr: 'ATL', location: 'Atlanta', nickname: 'Falcons', founded: 1966, primary: '#a71930', secondary: '#000000' },
      { id: 'car', abbr: 'CAR', location: 'Carolina', nickname: 'Panthers', founded: 1995, primary: '#0085ca', secondary: '#101820' },
      { id: 'no', abbr: 'NO', location: 'New Orleans', nickname: 'Saints', founded: 1967, primary: '#d3bc8d', secondary: '#101820' },
      { id: 'tb', abbr: 'TB', location: 'Tampa Bay', nickname: 'Buccaneers', founded: 1976, primary: '#d50a0a', secondary: '#ff7900' },
    ],
    West: [
      { id: 'ari', abbr: 'ARI', location: 'Arizona', nickname: 'Cardinals', founded: 1920, primary: '#97233f', secondary: '#000000' },
      { id: 'lar', abbr: 'LAR', location: 'Los Angeles', nickname: 'Rams', founded: 1936, primary: '#003594', secondary: '#ffa300' },
      { id: 'sf', abbr: 'SF', location: 'San Francisco', nickname: '49ers', founded: 1946, primary: '#aa0000', secondary: '#b3995d' },
      { id: 'sea', abbr: 'SEA', location: 'Seattle', nickname: 'Seahawks', founded: 1976, primary: '#002244', secondary: '#69be28' },
    ],
  },
};

export const CONFERENCES: Conference[] = ['AFC', 'NFC'];
export const DIVISION_NAMES: DivisionName[] = ['East', 'North', 'South', 'West'];

/** All thirty-two, in alignment order: AFC before NFC, East North South West. */
export const NFL_TEAMS: NflTeam[] = CONFERENCES.flatMap((conference) =>
  DIVISION_NAMES.flatMap((division) =>
    ALIGNMENT[conference][division].map((seed) => ({
      id: seed.id,
      abbr: seed.abbr,
      location: seed.location,
      nickname: seed.nickname,
      conference,
      division,
      founded: seed.founded,
      colors: { primary: seed.primary, secondary: seed.secondary },
    })),
  ),
);

/** 'AFC East' — the division's name as anyone says it, and the bed's label. */
export function divisionLabel(team: {
  conference: Conference;
  division: DivisionName;
}): string {
  return `${team.conference} ${team.division}`;
}

/** 'afc-east' — the id half of the same thing. */
export function divisionKey(team: {
  conference: Conference;
  division: DivisionName;
}): string {
  return `${team.conference.toLowerCase()}-${team.division.toLowerCase()}`;
}

