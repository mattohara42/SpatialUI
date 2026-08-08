import { describe, expect, it } from 'vitest';
import {
  NFL_GARDEN_ID,
  NFL_STALE_AFTER_MS,
  maturityOf,
  readTeam,
  teamNodeId,
  translateNflSnapshot,
  trendOf,
  vitalityOf,
} from './nfl';
import {
  gamesByTeam,
  generateNflSnapshot,
  recordOf,
  type Availability,
  type TeamRecord,
} from '../adapters/nfl';
import { findInvalidEdges } from '../ecosystem/graph';
import { sampleAt } from '../ecosystem/history';
import { isStale, staleness } from '../ecosystem/staleness';
import { PLANTINGS } from '../ecosystem/planting';
import { layoutGarden } from '../ecosystem/layout';
import type { EcosystemNode, EcosystemState } from '../ecosystem/types';

/**
 * The translator is where football turns into a garden, so these tests are about
 * the mapping being *defensible* — the axes carrying what they claim to carry —
 * as much as about the records being well formed. The formulas are the argument
 * the whole garden rests on: if maturity quietly tracked results, the scene
 * would read beautifully and mean nothing.
 */

const NOW = Date.UTC(2025, 11, 8, 18, 0, 0);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const snapshot = generateNflSnapshot(NOW);
const league = translateNflSnapshot(snapshot);
const nodes = Object.values(league.nodes);
const plants = nodes.filter((n) => n.kind === 'plant');
const beds = nodes.filter((n) => n.kind === 'bed');

const state: EcosystemState = {
  ...league,
  activeGardenId: NFL_GARDEN_ID,
  cursor: null,
  revision: NOW,
};

describe('the shape of the league', () => {
  it('is one garden, eight division beds, thirty-two clubs', () => {
    expect(nodes.filter((n) => n.kind === 'garden')).toHaveLength(1);
    expect(beds).toHaveLength(8);
    expect(plants).toHaveLength(32);
  });

  it('puts everything in the one garden and every club in a bed', () => {
    for (const node of nodes) expect(node.gardenId).toBe(NFL_GARDEN_ID);
    for (const plant of plants) {
      const bed = league.nodes[plant.parentId!];
      expect(bed?.kind).toBe('bed');
      expect(bed.parentId).toBe(NFL_GARDEN_ID);
    }
    for (const bed of beds) expect(countChildren(nodes, bed.id)).toBe(4);
  });

  it('labels beds the way people say them and clubs by their name', () => {
    expect(beds.map((b) => b.label).sort()).toEqual([
      'AFC East',
      'AFC North',
      'AFC South',
      'AFC West',
      'NFC East',
      'NFC North',
      'NFC South',
      'NFC West',
    ]);
    expect(league.nodes[teamNodeId('gb')].label).toBe('Green Bay Packers');
  });

  it('plants each division differently, and none of them as weeds', () => {
    const plantings = beds.map((b) => b.plantingType!);
    expect(new Set(plantings).size).toBe(8);
    for (const planting of plantings) {
      expect(PLANTINGS[planting].invasive).toBe(false);
      expect(PLANTINGS[planting].live).toBe(true);
    }
  });

  it('keeps every club nurture-polarity: no club is a weed', () => {
    // Suppress polarity means "you want this gone". Nobody's league table works
    // that way, and a garden of weeds would spend the one load-bearing shape
    // read on nothing.
    for (const node of nodes) expect(node.polarity).toBe('nurture');
  });
});

describe('rivalries', () => {
  it('grafts every pair inside a division and nothing across one', () => {
    // Four clubs is six pairs, eight divisions is forty-eight.
    expect(Object.keys(league.edges)).toHaveLength(48);
    for (const edge of Object.values(league.edges)) {
      const source = league.nodes[edge.sourceId];
      const target = league.nodes[edge.targetId];
      expect(source.parentId).toBe(target.parentId);
      expect(edge.kind).toBe('correlates');
      expect(edge.directed).toBe(false);
      expect(edge.strength).toBeGreaterThan(0);
      expect(edge.strength).toBeLessThanOrEqual(1);
    }
  });

  it('passes the validity check the renderer would crash on', () => {
    expect(findInvalidEdges(state)).toEqual([]);
  });

  it('ties clubs closer together when they are closer in the table', () => {
    const strengths = Object.values(league.edges).map((edge) => ({
      gap: Math.abs(
        (league.nodes[edge.sourceId].raw as RawTeam).record.winPct -
          (league.nodes[edge.targetId].raw as RawTeam).record.winPct,
      ),
      strength: edge.strength,
    }));
    const tight = strengths.filter((s) => s.gap < 0.1);
    const distant = strengths.filter((s) => s.gap > 0.4);
    expect(tight.length).toBeGreaterThan(0);
    expect(distant.length).toBeGreaterThan(0);
    expect(mean(tight.map((s) => s.strength))).toBeGreaterThan(
      mean(distant.map((s) => s.strength)),
    );
  });
});

describe('the four axes', () => {
  it('stays inside the range the renderer assumes', () => {
    for (const node of nodes) {
      expect(node.vitality).toBeGreaterThanOrEqual(0);
      expect(node.vitality).toBeLessThanOrEqual(1);
      expect(node.activity).toBeGreaterThanOrEqual(0);
      expect(node.activity).toBeLessThanOrEqual(1);
      expect(node.maturity).toBeGreaterThanOrEqual(0);
      expect(node.maturity).toBeLessThanOrEqual(1);
      expect(node.trend).toBeGreaterThanOrEqual(-1);
      expect(node.trend).toBeLessThanOrEqual(1);
    }
  });

  it('spends the range rather than bunching every club in the middle', () => {
    const vitality = plants.map((p) => p.vitality).sort((a, b) => a - b);
    expect(vitality[0]).toBeLessThan(0.55);
    expect(vitality[vitality.length - 1]).toBeGreaterThan(0.85);
  });

  it('reads a mid-table club as healthy, not as half dead', () => {
    // Half a league sits below .500 by construction. If that mapped to the
    // middle of the axis, half the garden would be wilting every week and wilt
    // would stop meaning "in trouble" — the failure the infrastructure garden
    // already taught us once.
    const table: TeamRecord = {
      ...recordOf([]),
      played: 12,
      wins: 6,
      losses: 6,
      winPct: 0.5,
      pointDiffPerGame: 0,
    };
    const middling = vitalityOf(table, {
      available: 0.95,
      active: [],
      startersOut: 0,
      worst: null,
    });
    expect(middling).toBeGreaterThan(0.6);
    expect(middling).toBeLessThan(0.8);
  });

  it('still leaves most of the garden standing up, with a minority struggling', () => {
    const struggling = plants.filter((p) => p.vitality < 0.55);
    expect(struggling.length).toBeGreaterThan(0);
    expect(struggling.length).toBeLessThan(plants.length / 2);
  });

  it('sorts the table: the best record is a healthier plant than the worst', () => {
    const byRecord = [...plants].sort(
      (a, b) => (a.raw as RawTeam).record.winPct - (b.raw as RawTeam).record.winPct,
    );
    expect(byRecord[byRecord.length - 1].vitality).toBeGreaterThan(byRecord[0].vitality);
  });

  it('wilts a club for losing its quarterback, without touching the standings', () => {
    const record = recordOf([]);
    const healthy = { available: 1, active: [], startersOut: 0, worst: null };
    const noQb = { available: 0.845, active: [], startersOut: 1, worst: null };
    const table: TeamRecord = { ...record, played: 10, wins: 5, losses: 5, winPct: 0.5 };
    expect(vitalityOf(table, noQb as Availability)).toBeLessThan(
      vitalityOf(table, healthy as Availability),
    );
  });

  it('does not read an unplayed season as a field of dying plants', () => {
    const opening = vitalityOf(recordOf([]), {
      available: 1,
      active: [],
      startersOut: 0,
      worst: null,
    });
    expect(opening).toBeGreaterThan(0.5);
    expect(opening).toBeLessThan(0.8);
  });

  it('keeps maturity a fact about the roster and the franchise, never about results', () => {
    // The same club read at two points in a season it went on to lose: the tree
    // is the same size, because how long a club has existed and how many seasons
    // its starters have played did not change when it lost on Sunday.
    const team = snapshot.teams.find((t) => t.team.id === 'gb')!;
    const games = gamesByTeam(snapshot)[team.team.id];
    const injuries = [...team.injuries].sort((a, b) => a.since - b.since);

    const early = readTeam(team, games, injuries, NOW - 40 * DAY);
    const late = readTeam(team, games, injuries, NOW);
    expect(early.record.played).toBeLessThan(late.record.played);
    expect(late.vitals.maturity).toBe(early.vitals.maturity);
  });

  it('makes the older franchise with the more experienced starters the bigger tree', () => {
    const veteran = maturityOf(
      { team: { founded: 1920 } as never, roster: [], injuries: [] },
      { avgAge: 27, avgExperience: 5, starterAvgAge: 29, starterAvgExperience: 7, rookies: 2 },
    );
    const expansion = maturityOf(
      { team: { founded: 2002 } as never, roster: [], injuries: [] },
      { avgAge: 24, avgExperience: 2, starterAvgAge: 25, starterAvgExperience: 2, rookies: 12 },
    );
    expect(veteran).toBeGreaterThan(expansion);
  });

  it('trends up on a club playing better than its record, and down on a slump', () => {
    const base = recordOf([]);
    const rising: TeamRecord = {
      ...base,
      played: 13,
      wins: 4,
      losses: 9,
      winPct: 4 / 13,
      streak: 3,
      lastFive: ['W', 'W', 'W', 'L', 'L'],
    };
    const sliding: TeamRecord = {
      ...base,
      played: 13,
      wins: 9,
      losses: 4,
      winPct: 9 / 13,
      streak: -3,
      lastFive: ['L', 'L', 'L', 'W', 'W'],
    };
    expect(trendOf(rising)).toBeGreaterThan(0.2);
    expect(trendOf(sliding)).toBeLessThan(-0.2);
    // And the level and the delta genuinely disagree, which is the whole reason
    // trend is its own axis.
    expect(rising.winPct).toBeLessThan(sliding.winPct);
  });
});

describe('injuries as blights', () => {
  const blights = plants.flatMap((p) => p.blights);

  it('reports something for most clubs, without burying the garden in badges', () => {
    expect(blights.length).toBeGreaterThan(32);
    for (const plant of plants) expect(plant.blights.length).toBeLessThanOrEqual(8);
  });

  it('reserves critical for the quarterback', () => {
    const critical = blights.filter((b) => b.severity === 'critical');
    expect(critical.length).toBeGreaterThan(0);
    for (const blight of critical) expect(blight.message.startsWith('QB1')).toBe(true);
  });

  it('never claims an injury is remediable, because no webhook heals a hamstring', () => {
    for (const blight of blights) expect(blight.remediable).toBeUndefined();
  });

  it('dates a blight to when the injury happened, so history can undo it', () => {
    for (const blight of blights) {
      expect(blight.since).toBeLessThanOrEqual(NOW);
      expect(blight.since).toBeGreaterThan(NOW - 200 * DAY);
    }
  });

  it('calls out a losing run as its own problem', () => {
    const skids = blights.filter((b) => b.message.startsWith('lost '));
    expect(skids.length).toBeGreaterThan(0);
    for (const skid of skids) expect(skid.message).toMatch(/lost \d+ straight/);
  });

  it('does not carry an injury that had not happened yet', () => {
    const team = snapshot.teams.find((t) => t.injuries.length > 0)!;
    const injuries = [...team.injuries].sort((a, b) => a.since - b.since);
    const games = gamesByTeam(snapshot)[team.team.id];
    const before = readTeam(team, games, injuries, injuries[0].since - HOUR);
    const after = readTeam(team, games, injuries, injuries[0].since + HOUR);
    expect(before.availability.active.length).toBeLessThan(after.availability.active.length);
    expect(before.availability.available).toBeGreaterThan(after.availability.available);
  });
});

describe('a club is as fresh as its last result', () => {
  it('timestamps a club to the end of its game, not to the poll', () => {
    for (const plant of plants) {
      expect(plant.updatedAt).toBeLessThan(snapshot.fetchedAt);
    }
  });

  it('leaves the clubs that played this week reading as current', () => {
    const fresh = plants.filter((p) => !isStale(p, NOW, NFL_STALE_AFTER_MS));
    expect(fresh.length).toBeGreaterThan(25);
  });

  it('greys out the clubs on a bye, which is the staleness state told the truth', () => {
    const idle = plants.filter((p) => isStale(p, NOW, NFL_STALE_AFTER_MS));
    expect(idle.length).toBeGreaterThan(0);
    expect(idle.length).toBeLessThan(6);
    for (const club of idle) {
      // Comfortably over rather than a hair over, so the reading is not an
      // artefact of where the threshold landed.
      expect(staleness(club, NOW, NFL_STALE_AFTER_MS)).toBeGreaterThan(1.05);
    }
  });

  it('keeps a division as current as its most recent game', () => {
    for (const bed of beds) {
      const clubs = plants.filter((p) => p.parentId === bed.id);
      expect(bed.updatedAt).toBe(Math.max(...clubs.map((c) => c.updatedAt)));
    }
  });
});

describe('history', () => {
  it('backfills a week of hourly vitals for every club', () => {
    for (const plant of plants) {
      const buffer = league.history[plant.id];
      expect(buffer).toBeDefined();
      expect(buffer.capacity).toBe(168);
      expect(sampleAt(buffer, NOW)).not.toBeNull();
      expect(sampleAt(buffer, NOW - 160 * HOUR)).not.toBeNull();
    }
  });

  it('ends exactly where the live node stands, so scrubbing to now is a no-op', () => {
    for (const plant of plants) {
      const sample = sampleAt(league.history[plant.id], NOW)!;
      expect(sample.vitality).toBeCloseTo(plant.vitality, 5);
      expect(sample.trend).toBeCloseTo(plant.trend, 5);
    }
  });

  it('moves the garden when the cursor crosses the weekend’s results', () => {
    const moved = plants.filter((plant) => {
      const now = sampleAt(league.history[plant.id], NOW)!;
      const before = sampleAt(league.history[plant.id], NOW - 40 * HOUR)!;
      return Math.abs(now.vitality - before.vitality) > 0.005;
    });
    // Most of the league played inside the window; a scrub across it has to
    // show that, or time scrub in this garden is decoration.
    expect(moved.length).toBeGreaterThan(16);
  });

  it('holds still between games rather than drifting for something to do', () => {
    // Two hours apart with no kickoff between them is the same league.
    for (const plant of plants.slice(0, 8)) {
      const a = sampleAt(league.history[plant.id], NOW - HOUR)!;
      const b = sampleAt(league.history[plant.id], NOW - 2 * HOUR)!;
      expect(a.vitality).toBeCloseTo(b.vitality, 6);
    }
  });
});

describe('rollups and layout', () => {
  it('summarizes a division as the average of its clubs', () => {
    for (const bed of beds) {
      const clubs = plants.filter((p) => p.parentId === bed.id);
      expect(bed.vitality).toBeCloseTo(mean(clubs.map((c) => c.vitality)), 6);
      expect(bed.trend).toBeCloseTo(mean(clubs.map((c) => c.trend)), 6);
    }
  });

  it('summarizes the league as the average of its divisions', () => {
    const garden = league.nodes[NFL_GARDEN_ID];
    expect(garden.vitality).toBeCloseTo(mean(beds.map((b) => b.vitality)), 6);
  });

  it('stands the league in two rows a person can look at', () => {
    const layout = layoutGarden(nodes);
    expect(layout.beds).toHaveLength(8);
    expect(layout.plants).toHaveLength(32);
    // Twenty metres across rather than thirty-five in a line.
    expect(layout.size[0]).toBeLessThan(24);
    expect(layout.size[1]).toBeGreaterThan(5);
  });

  it('gives each conference a row, which is the only place conference is visible', () => {
    const layout = layoutGarden(nodes);
    const depth = (id: string) => layout.beds.find((b) => b.nodeId.includes(id))!.center[2];
    const afc = ['afc-east', 'afc-north', 'afc-south', 'afc-west'].map(depth);
    const nfc = ['nfc-east', 'nfc-north', 'nfc-south', 'nfc-west'].map(depth);
    expect(Math.max(...afc)).toBeLessThan(Math.min(...nfc));
  });

  it('does not overlap two beds standing in the same row', () => {
    const layout = layoutGarden(nodes);
    const rows = new Map<number, typeof layout.beds>();
    for (const bed of layout.beds) {
      const key = Math.round(bed.center[2] - bed.size[1] / 2);
      rows.set(key, [...(rows.get(key) ?? []), bed]);
    }
    for (const row of rows.values()) {
      const sorted = [...row].sort((a, b) => a.center[0] - b.center[0]);
      for (let i = 1; i < sorted.length; i++) {
        const previousRight = sorted[i - 1].center[0] + sorted[i - 1].size[0] / 2;
        expect(sorted[i].center[0] - sorted[i].size[0] / 2).toBeGreaterThan(previousRight);
      }
    }
  });
});

describe('what the HUD gets', () => {
  const raw = league.nodes[teamNodeId('kc')].raw as RawTeam;

  it('carries the whole stat sheet, both sides of the ball', () => {
    expect(raw.stats.offense.pointsPerGame).toBeGreaterThan(0);
    expect(raw.stats.defense.yardsAllowedPerGame).toBeGreaterThan(0);
    expect(raw.stats.efficiency.pythagoreanWins).toBeGreaterThan(0);
    expect(raw.stats.discipline.penaltiesPerGame).toBeGreaterThan(0);
  });

  it('carries the age and service profile the axes summarized away', () => {
    expect(raw.roster.size).toBe(53);
    expect(raw.roster.avgAge).toBeGreaterThan(21);
    expect(raw.roster.avgExperience).toBeGreaterThanOrEqual(0);
  });

  it('says where the numbers came from, on the record', () => {
    expect(raw.provenance.kind).toBe('synthetic');
    expect(raw.note).toMatch(/depth-chart slots/);
  });

  it('names no players, because none are modelled', () => {
    for (const plant of plants) {
      const payload = plant.raw as RawTeam;
      for (const injury of payload.injuries) {
        expect(injury).not.toHaveProperty('player');
        expect(injury).not.toHaveProperty('name');
      }
    }
  });
});

interface RawTeam {
  record: TeamRecord;
  stats: {
    offense: { pointsPerGame: number };
    defense: { yardsAllowedPerGame: number };
    discipline: { penaltiesPerGame: number };
    efficiency: { pythagoreanWins: number };
  };
  roster: { size: number; avgAge: number; avgExperience: number };
  injuries: unknown[];
  provenance: { kind: string };
  note: string;
}

function countChildren(all: EcosystemNode[], parentId: string): number {
  return all.filter((n) => n.parentId === parentId).length;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / (values.length || 1);
}
