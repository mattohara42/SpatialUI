import type { EcosystemEdge, EcosystemNode, EcosystemState } from './types';

/**
 * Pure graph helpers. No React, no three.js, same rule as the L-System module.
 */

export function nodesInGarden(
  state: EcosystemState,
  gardenId: string,
): EcosystemNode[] {
  return Object.values(state.nodes).filter((n) => n.gardenId === gardenId);
}

export function edgesInGarden(
  state: EcosystemState,
  gardenId: string,
): EcosystemEdge[] {
  return Object.values(state.edges).filter((e) => e.gardenId === gardenId);
}

/** Edge ids touching each node, for hover highlighting and blast-radius queries. */
export function buildAdjacency(edges: EcosystemEdge[]): Record<string, string[]> {
  const adjacency: Record<string, string[]> = {};
  for (const edge of edges) {
    (adjacency[edge.sourceId] ??= []).push(edge.id);
    (adjacency[edge.targetId] ??= []).push(edge.id);
  }
  return adjacency;
}

/**
 * Everything reachable from a node by following directed edges outward, or all
 * edges when undirected. This is what answers "what else breaks if this dies",
 * which is most of the reason to draw the connections at all.
 */
export function reachableFrom(
  startId: string,
  edges: EcosystemEdge[],
  maxDepth = Infinity,
): Set<string> {
  const outgoing: Record<string, string[]> = {};
  for (const e of edges) {
    (outgoing[e.sourceId] ??= []).push(e.targetId);
    if (!e.directed) (outgoing[e.targetId] ??= []).push(e.sourceId);
  }

  const seen = new Set<string>();
  let frontier = [startId];
  let depth = 0;

  while (frontier.length > 0 && depth < maxDepth) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbour of outgoing[id] ?? []) {
        if (neighbour === startId || seen.has(neighbour)) continue;
        seen.add(neighbour);
        next.push(neighbour);
      }
    }
    frontier = next;
    depth += 1;
  }
  return seen;
}

/**
 * Edges pointing at nodes that do not exist, or crossing gardens. Adapters get
 * this wrong constantly, usually by referencing something that was deleted
 * upstream, and a dangling edge is a crash in the renderer rather than a
 * cosmetic bug. Call this on every commit in development.
 */
export function findInvalidEdges(state: EcosystemState): EcosystemEdge[] {
  return Object.values(state.edges).filter((e) => {
    const source = state.nodes[e.sourceId];
    const target = state.nodes[e.targetId];
    if (!source || !target) return true;
    return source.gardenId !== e.gardenId || target.gardenId !== e.gardenId;
  });
}

/**
 * Stable key describing which edges exist and where they attach, ignoring
 * strength.
 *
 * Root grafts are curved and cannot be instanced usefully, so they get merged
 * into one geometry that is rebuilt only when topology changes. Strength and
 * flow animate in the shader against a static mesh. Memoize the merge on this
 * key and a strength wobble costs nothing.
 */
export function topologyKey(edges: EcosystemEdge[]): string {
  return edges
    .map((e) => `${e.sourceId}>${e.targetId}:${e.kind}`)
    .sort()
    .join('|');
}
