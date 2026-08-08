import { describe, expect, it } from 'vitest';
import { changedSince, isStale, staleness } from './staleness';
import { layoutGarden } from './layout';
import { nodesInGarden } from './graph';
import { HOUR_MS, record } from './history';
import { generateMockEcosystem } from '../mock/mockEcosystemData';
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

  it('scales plant height with maturity', () => {
    const nodes = nodesInGarden(state, gardenId);
    const tallest = layout.plants.reduce((a, b) =>
      a.growthScale > b.growthScale ? a : b,
    );
    const oldest = nodes
      .filter((n) => n.kind === 'plant')
      .reduce((a, b) => (a.maturity > b.maturity ? a : b));
    expect(tallest.nodeId).toBe(oldest.id);
  });
});
