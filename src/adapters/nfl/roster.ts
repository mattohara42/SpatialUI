import type { PositionGroup } from './types';

/**
 * The depth chart, and how much each slot on it matters.
 *
 * A roster is fifty-three slots, and losing one of them is not one fifty-third
 * of a football team. A starting quarterback is most of the season and a fourth
 * safety is a special-teams snap, so availability has to be weighted or an
 * injury report reads as noise. `importance` is that weight, in arbitrary units
 * that only ever get compared to each other (`derive.ts` normalizes by the
 * total), which is why the numbers can be argued about without anything
 * breaking.
 *
 * The one number worth defending: QB1 at 20 is roughly a fifth of the whole
 * roster's weight. That is deliberate and it is the shape of the sport — no
 * other position's absence moves a season the same way — and it is what makes a
 * quarterback injury visibly wilt a plant while a backup guard does not.
 */

export interface SlotSpec {
  slot: string;
  position: string;
  group: PositionGroup;
  starter: boolean;
  importance: number;
}

export const DEPTH_CHART: SlotSpec[] = [
  // Offence ------------------------------------------------------------------
  { slot: 'QB1', position: 'QB', group: 'quarterback', starter: true, importance: 20 },
  { slot: 'QB2', position: 'QB', group: 'quarterback', starter: false, importance: 3 },
  { slot: 'QB3', position: 'QB', group: 'quarterback', starter: false, importance: 0.5 },

  { slot: 'RB1', position: 'RB', group: 'backfield', starter: true, importance: 4 },
  { slot: 'RB2', position: 'RB', group: 'backfield', starter: false, importance: 1.5 },
  { slot: 'RB3', position: 'RB', group: 'backfield', starter: false, importance: 0.6 },
  { slot: 'FB1', position: 'FB', group: 'backfield', starter: false, importance: 0.6 },

  { slot: 'WR1', position: 'WR', group: 'receiver', starter: true, importance: 6 },
  { slot: 'WR2', position: 'WR', group: 'receiver', starter: true, importance: 4 },
  { slot: 'WR3', position: 'WR', group: 'receiver', starter: true, importance: 2.5 },
  { slot: 'WR4', position: 'WR', group: 'receiver', starter: false, importance: 1 },
  { slot: 'WR5', position: 'WR', group: 'receiver', starter: false, importance: 0.6 },
  { slot: 'WR6', position: 'WR', group: 'receiver', starter: false, importance: 0.4 },

  { slot: 'TE1', position: 'TE', group: 'receiver', starter: true, importance: 3.5 },
  { slot: 'TE2', position: 'TE', group: 'receiver', starter: false, importance: 1 },
  { slot: 'TE3', position: 'TE', group: 'receiver', starter: false, importance: 0.4 },

  { slot: 'LT', position: 'LT', group: 'offensive-line', starter: true, importance: 6 },
  { slot: 'LG', position: 'LG', group: 'offensive-line', starter: true, importance: 3 },
  { slot: 'C', position: 'C', group: 'offensive-line', starter: true, importance: 4 },
  { slot: 'RG', position: 'RG', group: 'offensive-line', starter: true, importance: 3 },
  { slot: 'RT', position: 'RT', group: 'offensive-line', starter: true, importance: 4 },
  { slot: 'OL6', position: 'OL', group: 'offensive-line', starter: false, importance: 1.2 },
  { slot: 'OL7', position: 'OL', group: 'offensive-line', starter: false, importance: 0.7 },
  { slot: 'OL8', position: 'OL', group: 'offensive-line', starter: false, importance: 0.5 },
  { slot: 'OL9', position: 'OL', group: 'offensive-line', starter: false, importance: 0.4 },

  // Defence ------------------------------------------------------------------
  { slot: 'DE1', position: 'DE', group: 'defensive-line', starter: true, importance: 5 },
  { slot: 'DE2', position: 'DE', group: 'defensive-line', starter: true, importance: 4 },
  { slot: 'DE3', position: 'DE', group: 'defensive-line', starter: false, importance: 1.2 },
  { slot: 'DE4', position: 'DE', group: 'defensive-line', starter: false, importance: 0.6 },
  { slot: 'DE5', position: 'DE', group: 'defensive-line', starter: false, importance: 0.4 },

  { slot: 'DT1', position: 'DT', group: 'defensive-line', starter: true, importance: 4 },
  { slot: 'DT2', position: 'DT', group: 'defensive-line', starter: true, importance: 3 },
  { slot: 'DT3', position: 'DT', group: 'defensive-line', starter: false, importance: 1 },
  { slot: 'DT4', position: 'DT', group: 'defensive-line', starter: false, importance: 0.5 },

  { slot: 'LB1', position: 'LB', group: 'linebacker', starter: true, importance: 4 },
  { slot: 'LB2', position: 'LB', group: 'linebacker', starter: true, importance: 3 },
  // Not a starter, and the third corner below is, because nickel is the base
  // defence now: five defensive backs and two linebackers is what most clubs
  // line up in most of the time.
  { slot: 'LB3', position: 'LB', group: 'linebacker', starter: false, importance: 2.5 },
  { slot: 'LB4', position: 'LB', group: 'linebacker', starter: false, importance: 1 },
  { slot: 'LB5', position: 'LB', group: 'linebacker', starter: false, importance: 0.6 },
  { slot: 'LB6', position: 'LB', group: 'linebacker', starter: false, importance: 0.4 },

  { slot: 'CB1', position: 'CB', group: 'secondary', starter: true, importance: 5 },
  { slot: 'CB2', position: 'CB', group: 'secondary', starter: true, importance: 4 },
  { slot: 'CB3', position: 'CB', group: 'secondary', starter: true, importance: 2.5 },
  { slot: 'CB4', position: 'CB', group: 'secondary', starter: false, importance: 1 },
  { slot: 'CB5', position: 'CB', group: 'secondary', starter: false, importance: 0.5 },
  { slot: 'CB6', position: 'CB', group: 'secondary', starter: false, importance: 0.4 },

  { slot: 'S1', position: 'S', group: 'secondary', starter: true, importance: 3.5 },
  { slot: 'S2', position: 'S', group: 'secondary', starter: true, importance: 3 },
  { slot: 'S3', position: 'S', group: 'secondary', starter: false, importance: 1 },
  { slot: 'S4', position: 'S', group: 'secondary', starter: false, importance: 0.5 },

  // Specialists --------------------------------------------------------------
  { slot: 'K', position: 'K', group: 'specialist', starter: true, importance: 2 },
  { slot: 'P', position: 'P', group: 'specialist', starter: true, importance: 1.2 },
  { slot: 'LS', position: 'LS', group: 'specialist', starter: true, importance: 0.8 },
];

/** Sum of every slot's importance, the denominator availability divides by. */
export const TOTAL_IMPORTANCE = DEPTH_CHART.reduce(
  (sum, spec) => sum + spec.importance,
  0,
);

const BY_SLOT: Record<string, SlotSpec> = Object.fromEntries(
  DEPTH_CHART.map((spec) => [spec.slot, spec]),
);

/**
 * How much of a team is missing when this slot is. Unknown slots weigh a token
 * amount rather than zero, so a feed that invents a position still moves the
 * number a little instead of silently reporting a fully available roster.
 */
export function importanceOf(slot: string): number {
  return BY_SLOT[slot]?.importance ?? 0.5;
}
