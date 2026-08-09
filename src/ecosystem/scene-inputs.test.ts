import { describe, expect, it } from 'vitest';
import {
  FALLBACK_STALE_AFTER_MS,
  afterQuietFor,
  changedSince,
  isStale,
  scheduleFor,
  staleness,
  type StaleSchedule,
} from './staleness';
import { layoutGarden } from './layout';
import { nodesInGarden } from './graph';
import { HOUR_MS, record } from './history';
import { generateMockEcosystem } from '../mock/mockEcosystemData';
import { syntheticNflSource } from '../adapters/nfl';
import { translateNflSnapshot } from '../translation/nfl';
import { syntheticMarketSource } from '../adapters/market';
import { translateMarketSnapshot } from '../translation/market';
import { MARK_LIMIT, emblemOf, luminanceOf } from './labels';
import type { EcosystemNode } from './types';

const node = (overrides: Partial<EcosystemNode> = {}): EcosystemNode => ({
  id: 'n',
  parentId: null,
  gardenId: 'g',
  label: 'n',
  domain: 'devops',
  kind: 'plant',
  polarity: 'nurture',
  vitality: 0.9,
  activity: 0.5,
  maturity: 0.5,
  trend: 0,
  blights: [],
  updatedAt: 0,
  ...overrides,
});

describe('staleness', () => {
  it('is zero for a node updated just now', () => {
    expect(staleness(node({ updatedAt: 1000 }), 1000, 60_000)).toBe(0);
  });

  it('crosses one exactly at the threshold', () => {
    expect(staleness(node({ updatedAt: 0 }), 60_000, 60_000)).toBe(1);
    expect(isStale(node({ updatedAt: 0 }), 60_000, 60_000)).toBe(false);
    expect(isStale(node({ updatedAt: 0 }), 60_001, 60_000)).toBe(true);
  });

  it('keeps growing so the visual can deepen with neglect', () => {
    expect(staleness(node({ updatedAt: 0 }), 600_000, 60_000)).toBe(10);
  });

  it('never reports a future timestamp as stale', () => {
    expect(staleness(node({ updatedAt: 5000 }), 1000, 60_000)).toBe(0);
  });
});

describe('staleness against a schedule', () => {
  // A stand-in for any source with a session: it prints on the hour from
  // midnight until six, then says nothing for eighteen hours.
  const HOUR = 60 * 60_000;
  const DAY = 24 * HOUR;
  const SESSION_END = 6 * HOUR;

  const hourly: StaleSchedule = {
    dueAfter: (last) => {
      const next = last + HOUR;
      const dayStart = Math.floor(next / DAY) * DAY;
      // Inside the session, the next hour. Past the close, the first bar of
      // tomorrow's — which is the whole point: the shut hours are not owed.
      return next <= dayStart + SESSION_END ? next : dayStart + DAY + HOUR;
    },
    graceMs: 2 * HOUR,
  };

  // The last print of the day, followed by a legitimate nineteen hour silence.
  const lastPrint = SESSION_END;
  const nextDue = DAY + HOUR;
  const overnight = node({ updatedAt: lastPrint });

  it('is free while the source is legitimately shut, however long that runs', () => {
    // A flat threshold able to sit through this without greying would have to be
    // at least nineteen hours wide, and would then take nineteen hours to notice
    // a death. That is the trade the schedule dissolves.
    expect(staleness(overnight, lastPrint + 3 * HOUR, hourly)).toBe(0);
    expect(staleness(overnight, lastPrint + 12 * HOUR, hourly)).toBe(0);
    expect(staleness(overnight, nextDue, hourly)).toBe(0);
  });

  it('starts counting from the moment something was actually due', () => {
    expect(staleness(overnight, nextDue + HOUR, hourly)).toBe(0.5);
    expect(staleness(overnight, nextDue + 2 * HOUR, hourly)).toBe(1);
    // Tight where it matters: three hours after the reopen, not nineteen plus.
    expect(isStale(overnight, nextDue + 3 * HOUR, hourly)).toBe(true);
    // Still growing afterwards, so the dust keeps deepening with the neglect.
    expect(staleness(overnight, nextDue + 8 * HOUR, hourly)).toBe(4);
  });

  it('reports a still-open session as fresh right up to the next bar', () => {
    // Mid-session, one bar ago. Nothing is due until the hour is out.
    const midSession = node({ updatedAt: 2 * HOUR });
    expect(staleness(midSession, 3 * HOUR, hourly)).toBe(0);
    expect(staleness(midSession, 5 * HOUR, hourly)).toBe(1);
  });

  it('treats a bare duration as the schedule with nothing ever scheduled', () => {
    // The old model is a value of the new type rather than a second code path,
    // which is what lets a source with no forward calendar keep using it.
    const flat = afterQuietFor(60_000);
    const quiet = node({ updatedAt: 0 });
    expect(staleness(quiet, 90_000, flat)).toBe(staleness(quiet, 90_000, 60_000));
    expect(staleness(quiet, 90_000, flat)).toBe(1.5);
  });

  it('reports nothing rather than dividing by a zero grace', () => {
    expect(staleness(node({ updatedAt: 0 }), 10_000, 0)).toBe(0);
  });

  it('leaves an unregistered garden on the old arithmetic exactly', () => {
    // The mock gardens never register a policy, so they fall back — and the
    // fallback must still be the plain ratio it always was, or introducing the
    // schedule would have quietly moved every garden that did not ask for it.
    const quiet = node({ updatedAt: 0 });
    const fallback = scheduleFor('a-garden-nobody-registered');
    expect(fallback.graceMs).toBe(FALLBACK_STALE_AFTER_MS);
    for (const now of [0, 1_000, FALLBACK_STALE_AFTER_MS, 4 * FALLBACK_STALE_AFTER_MS]) {
      expect(staleness(quiet, now, fallback)).toBe(now / FALLBACK_STALE_AFTER_MS);
    }
  });
});

describe('changedSince', () => {
  // Deliberately a healthy plant with no existing blights. Picking the first
  // plant instead once made these tests pass or fail on whether the mock happened
  // to make it sick, which is a test reading its own inputs wrong.
  const build = () => {
    const state = generateMockEcosystem({ historyHours: 48 });
    const gardenId = state.activeGardenId!;
    const plant = nodesInGarden(state, gardenId).find(
      (n) => n.kind === 'plant' && n.blights.length === 0 && n.vitality > 0.7,
    )!;
    expect(plant).toBeDefined();
    return { state, gardenId, plant };
  };

  it('reports a plant that moved and ignores one that did not', () => {
    const { state, gardenId, plant } = build();
    const since = state.revision - 24 * HOUR_MS;
    record(state.history[plant.id], since, { ...plant, vitality: 0.1 });

    const moved = changedSince(state, gardenId, since).find(
      (c) => c.nodeId === plant.id,
    );
    expect(moved).toBeDefined();
    expect(moved!.from).toBeCloseTo(0.1, 5);
    expect(moved!.to).toBeCloseTo(plant.vitality, 5);
  });

  it('honours the minimum delta so noise does not fill the summary', () => {
    const { state, gardenId, plant } = build();
    const since = state.revision - 24 * HOUR_MS;
    record(state.history[plant.id], since, {
      ...plant,
      vitality: plant.vitality - 0.001,
    });
    const changes = changedSince(state, gardenId, since, 0.05);
    expect(changes.find((c) => c.nodeId === plant.id)).toBeUndefined();
  });

  it('surfaces a plant that crashed and recovered, which a live view hides', () => {
    const { state, gardenId, plant } = build();
    const since = state.revision - 6 * HOUR_MS;
    record(state.history[plant.id], since, { ...plant, vitality: 0.02 });
    const change = changedSince(state, gardenId, since).find(
      (c) => c.nodeId === plant.id,
    )!;
    expect(change.delta).toBeGreaterThan(0.4);
  });

  it('stays inside the requested garden', () => {
    const { state, gardenId } = build();
    const ids = new Set(
      changedSince(state, gardenId, state.revision - 48 * HOUR_MS).map(
        (c) => c.nodeId,
      ),
    );
    for (const id of ids) expect(state.nodes[id].gardenId).toBe(gardenId);
  });
});

describe('layoutGarden', () => {
  const state = generateMockEcosystem();
  const gardenId = state.activeGardenId!;
  const layout = layoutGarden(nodesInGarden(state, gardenId));

  it('places every plant in the garden exactly once', () => {
    const plants = nodesInGarden(state, gardenId).filter(
      (n) => n.kind === 'plant',
    );
    expect(layout.plants).toHaveLength(plants.length);
    expect(new Set(layout.plants.map((p) => p.nodeId)).size).toBe(plants.length);
  });

  it('gives the graft renderer an endpoint for every plant', () => {
    for (const plant of layout.plants) {
      expect(layout.positionOf[plant.nodeId]).toEqual(plant.position);
    }
  });

  it('separates beds along x without overlapping them', () => {
    const sorted = [...layout.beds].sort((a, b) => a.center[0] - b.center[0]);
    for (let i = 1; i < sorted.length; i++) {
      const prevRight = sorted[i - 1].center[0] + sorted[i - 1].size[0] / 2;
      const thisLeft = sorted[i].center[0] - sorted[i].size[0] / 2;
      expect(thisLeft).toBeGreaterThan(prevRight);
    }
  });

  it('is deterministic', () => {
    const again = layoutGarden(nodesInGarden(state, gardenId));
    expect(again).toEqual(layout);
  });

  it('scales plant height with maturity within a bed', () => {
    // Height now folds in the planting's own height scale, so a mature hedge
    // plant can stand shorter than a young conifer. The maturity relationship
    // therefore holds within a bed, where the scale is constant, not across the
    // whole garden.
    const nodes = nodesInGarden(state, gardenId);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const beds = nodes.filter((n) => n.kind === 'bed');

    for (const bed of beds) {
      const placements = layout.plants.filter(
        (p) => byId.get(p.nodeId)?.parentId === bed.id,
      );
      if (placements.length < 2) continue;

      const tallest = placements.reduce((a, b) =>
        a.growthScale > b.growthScale ? a : b,
      );
      const oldest = placements.reduce((a, b) =>
        (byId.get(a.nodeId)!.maturity > byId.get(b.nodeId)!.maturity ? a : b),
      );
      expect(tallest.nodeId).toBe(oldest.nodeId);
    }
  });
});

describe('every plant is named', () => {
  /**
   * The emblem is a decision translation makes, and this is where the project
   * asks for it. A plant with no emblem still renders — `emblemOf` falls back —
   * but the fallback exists so a half-written adapter shows something, not so
   * an adapter can skip the choice, and a source that silently took initials it
   * never picked would be the kind of default nobody notices until a demo.
   */
  const sources = [
    ['mock gardens', generateMockEcosystem().nodes],
    ['the league', translateNflSnapshot(syntheticNflSource().snapshot()).nodes],
    ['the book', translateMarketSnapshot(syntheticMarketSource().snapshot()).nodes],
  ] as const;

  for (const [name, nodes] of sources) {
    it(`${name}: every plant carries an emblem translation chose`, () => {
      const plants = Object.values(nodes).filter((n) => n.kind === 'plant');
      expect(plants.length).toBeGreaterThan(0);
      for (const plant of plants) {
        expect(plant.emblem, `${plant.id} has no emblem`).toBeDefined();
        expect(plant.emblem!.mark.length).toBeGreaterThan(0);
        expect(plant.emblem!.mark.length).toBeLessThanOrEqual(MARK_LIMIT);
      }
    });

    it(`${name}: every mark is legible on its own plate`, () => {
      for (const plant of Object.values(nodes).filter((n) => n.kind === 'plant')) {
        const { color, ink } = emblemOf(plant);
        expect(
          Math.abs(luminanceOf(color) - luminanceOf(ink)),
          `${plant.label}: ${ink} on ${color}`,
        ).toBeGreaterThan(0.2);
      }
    });
  }

  it('the league uses its own abbreviations rather than derived initials', () => {
    const nodes = translateNflSnapshot(syntheticNflSource().snapshot()).nodes;
    const cowboys = Object.values(nodes).find((n) => n.label.includes('Cowboys'));
    // Deriving initials off the label would give DC, which is not what anyone
    // calls them: the whole point of choosing in translation is that the source
    // already knows the answer.
    expect(cowboys?.emblem?.mark).toBe('DAL');
  });
});
