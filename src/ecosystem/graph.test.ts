import { describe, expect, it } from 'vitest';
import {
  buildAdjacency,
  edgesInGarden,
  findInvalidEdges,
  nodesInGarden,
  reachableFrom,
  topologyKey,
} from './graph';
import { signalHealth } from './types';
import type { EcosystemEdge } from './types';
import { generateMockEcosystem, tickMockEcosystem } from '../mock/mockEcosystemData';
import { mulberry32 } from '../lsystem/random';

const edge = (
  sourceId: string,
  targetId: string,
  directed = true,
): EcosystemEdge => ({
  id: `${sourceId}->${targetId}`,
  gardenId: 'g',
  sourceId,
  targetId,
  kind: 'depends',
  strength: 1,
  directed,
});

describe('mock ecosystem', () => {
  const state = generateMockEcosystem();

  it('emits no invalid or cross-garden edges', () => {
    expect(findInvalidEdges(state)).toEqual([]);
  });

  it('keeps every node inside exactly one garden', () => {
    for (const node of Object.values(state.nodes)) {
      expect(state.nodes[node.gardenId]?.kind).toBe('garden');
    }
  });

  it('survives a tick without breaking edge integrity', () => {
    const next = tickMockEcosystem(state, 0.04, mulberry32(7));
    expect(findInvalidEdges(next)).toEqual([]);
    expect(next.revision).toBeGreaterThanOrEqual(state.revision);
  });

  it('scopes filtering to the active garden', () => {
    const gardenId = state.activeGardenId!;
    const nodes = nodesInGarden(state, gardenId);
    const edges = edgesInGarden(state, gardenId);
    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes.every((n) => n.gardenId === gardenId)).toBe(true);
    expect(edges.every((e) => e.gardenId === gardenId)).toBe(true);
    expect(nodes.length).toBeLessThan(Object.keys(state.nodes).length);
  });
});

describe('polarity', () => {
  it('inverts vitality for suppress nodes', () => {
    const state = generateMockEcosystem();
    const weed = Object.values(state.nodes).find(
      (n) => n.polarity === 'suppress' && n.kind === 'plant',
    )!;
    expect(signalHealth(weed)).toBeCloseTo(1 - weed.vitality, 10);
  });
});

describe('graph helpers', () => {
  it('indexes both endpoints of every edge', () => {
    const adjacency = buildAdjacency([edge('a', 'b'), edge('b', 'c')]);
    expect(adjacency.b).toHaveLength(2);
    expect(adjacency.a).toEqual(['a->b']);
  });

  it('walks directed edges forward only', () => {
    const edges = [edge('a', 'b'), edge('b', 'c'), edge('z', 'a')];
    expect([...reachableFrom('a', edges)].sort()).toEqual(['b', 'c']);
  });

  it('walks undirected edges both ways', () => {
    const edges = [edge('a', 'b', false), edge('z', 'a', false)];
    expect([...reachableFrom('a', edges)].sort()).toEqual(['b', 'z']);
  });

  it('respects a depth limit', () => {
    const edges = [edge('a', 'b'), edge('b', 'c'), edge('c', 'd')];
    expect([...reachableFrom('a', edges, 2)].sort()).toEqual(['b', 'c']);
  });

  it('terminates on a cycle', () => {
    const edges = [edge('a', 'b'), edge('b', 'a')];
    expect([...reachableFrom('a', edges)]).toEqual(['b']);
  });

  it('ignores strength when keying topology', () => {
    const a = { ...edge('a', 'b'), strength: 0.1 };
    const b = { ...edge('a', 'b'), strength: 0.9 };
    expect(topologyKey([a])).toBe(topologyKey([b]));
  });

  it('is order independent', () => {
    const one = [edge('a', 'b'), edge('b', 'c')];
    expect(topologyKey(one)).toBe(topologyKey([...one].reverse()));
  });

  it('flags edges pointing at missing nodes', () => {
    const state = generateMockEcosystem();
    const broken = { ...edge('nope', 'also-nope'), gardenId: 'infrastructure' };
    const dirty = { ...state, edges: { ...state.edges, [broken.id]: broken } };
    expect(findInvalidEdges(dirty)).toHaveLength(1);
  });
});
