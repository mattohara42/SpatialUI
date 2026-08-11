import type { EcosystemNode } from './types';

/**
 * A bed summarizes its plants, and a garden its beds.
 *
 * So a job, a division, or a sector reads at a glance without walking into it,
 * and the whole garden reads from the table. The container takes the mean of its
 * children's four axes, and — deliberately, not the mean — the *newest* child's
 * `updatedAt`: a bed is as current as its freshest member, so one silent plant
 * cannot drag the whole bed's clock back and make its live neighbours look stale
 * by association.
 *
 * Pure over the node map, keyed on nothing but `parentId`, so any translator can
 * finish by calling it. Lifted out of `translation/prometheus.ts`, where it was
 * written, once a second declarative source (`translation/declarative.ts`)
 * needed exactly the same summary.
 */
export function rollUpContainers(nodes: Record<string, EcosystemNode>): void {
  const childIds: Record<string, string[]> = {};
  for (const node of Object.values(nodes)) {
    if (node.parentId) (childIds[node.parentId] ??= []).push(node.id);
  }

  const beds = Object.values(nodes).filter((n) => n.kind === 'bed');
  for (const bed of beds) rollUp(nodes, bed.id, childIds[bed.id] ?? []);
  const garden = Object.values(nodes).find((n) => n.kind === 'garden');
  if (garden) rollUp(nodes, garden.id, childIds[garden.id] ?? []);
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

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / (values.length || 1);
}
