import { describe, expect, it } from 'vitest';
import {
  SIGNAL_DEADBAND,
  SIGNAL_FULL_AT,
  SIGNAL_PER_PLANT,
  cycle,
  plumeCount,
  plumeDirection,
  plumeStrength,
} from './signal';
import { generateNflSnapshot } from '../adapters/nfl';
import { translateNflSnapshot } from '../translation/nfl';
import { generateMarketSnapshot } from '../adapters/market';
import { translateMarketSnapshot } from '../translation/market';
import { signalTrend } from '../ecosystem/types';
import type { EcosystemNode } from '../ecosystem/types';

describe('plumeStrength', () => {
  it('is silent inside the deadband, in both directions', () => {
    expect(plumeStrength(0)).toBe(0);
    expect(plumeStrength(SIGNAL_DEADBAND)).toBe(0);
    expect(plumeStrength(-SIGNAL_DEADBAND)).toBe(0);
    expect(plumeStrength(SIGNAL_DEADBAND * 0.5)).toBe(0);
  });

  it('reads the size of the move, not its direction', () => {
    expect(plumeStrength(0.4)).toBe(plumeStrength(-0.4));
  });

  it('ramps continuously rather than stepping', () => {
    const a = plumeStrength(SIGNAL_DEADBAND + 0.01);
    const b = plumeStrength((SIGNAL_DEADBAND + SIGNAL_FULL_AT) / 2);
    const c = plumeStrength(SIGNAL_FULL_AT);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(0.1);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(c).toBe(1);
  });

  it('holds at full past the top of the ramp', () => {
    expect(plumeStrength(0.9)).toBe(1);
    expect(plumeStrength(1)).toBe(1);
  });
});

describe('plumeCount', () => {
  it('draws nothing at all below the deadband', () => {
    expect(plumeCount(0.05)).toBe(0);
  });

  it('never exceeds the reserved capacity', () => {
    expect(plumeCount(1)).toBe(SIGNAL_PER_PLANT);
    expect(plumeCount(-1)).toBe(SIGNAL_PER_PLANT);
  });
});

describe('plumeDirection', () => {
  it('is zero inside the deadband, so nothing is drawn either way', () => {
    expect(plumeDirection(0)).toBe(0);
    expect(plumeDirection(SIGNAL_DEADBAND)).toBe(0);
    expect(plumeDirection(-SIGNAL_DEADBAND)).toBe(0);
  });

  it('follows the sign once the move is worth showing', () => {
    expect(plumeDirection(0.4)).toBe(1);
    expect(plumeDirection(-0.4)).toBe(-1);
  });
});

describe('cycle', () => {
  it('carries a speck up its column and wraps back to the base', () => {
    expect(cycle(1, 0, 2, 0.5)).toBeCloseTo(1.5);
    expect(cycle(1.9, 0, 2, 0.5)).toBeCloseTo(0.4);
  });

  it('carries one down and wraps back to the top', () => {
    expect(cycle(1, 0, 2, -0.5)).toBeCloseTo(0.5);
    expect(cycle(0.1, 0, 2, -0.5)).toBeCloseTo(1.6);
  });

  it('stays inside the column for a step far larger than the span', () => {
    // A backgrounded tab resuming hands the frame loop a huge delta.
    const up = cycle(1, 0, 2, 97.3);
    const down = cycle(1, 0, 2, -97.3);
    expect(up).toBeGreaterThanOrEqual(0);
    expect(up).toBeLessThanOrEqual(2);
    expect(down).toBeGreaterThanOrEqual(0);
    expect(down).toBeLessThanOrEqual(2);
  });

  it('holds a degenerate column at its base rather than dividing by zero', () => {
    expect(cycle(5, 1, 1, 0.5)).toBe(1);
  });
});

describe('signalTrend', () => {
  const node = (trend: number, polarity: 'grow' | 'suppress'): EcosystemNode =>
    ({ trend, polarity }) as EcosystemNode;

  it('passes a growing thing through unchanged', () => {
    expect(signalTrend(node(0.4, 'grow'))).toBe(0.4);
  });

  it('inverts a thing you want gone, so a spreading outbreak reads as falling', () => {
    expect(signalTrend(node(0.4, 'suppress'))).toBe(-0.4);
    expect(signalTrend(node(-0.4, 'suppress'))).toBe(0.4);
  });
});

/**
 * The calibration, against the real pipelines rather than against an argument.
 *
 * The deadband is the whole design of this cue: too low and every plant plumes,
 * which is wallpaper; too high and the gardens whose trend axis runs narrow say
 * nothing at all. What the threshold has to deliver is *both kinds of plant in
 * the same garden* — movers and non-movers — and that is what is asserted here,
 * rather than a count that would be a second copy of the tuning.
 *
 * The clock is fixed because the generators are pure in `now` and their seed.
 */
describe('calibration against the real gardens', () => {
  const NOW = Date.UTC(2025, 11, 8, 18, 0, 0);

  const plantsOf = (nodes: Record<string, EcosystemNode>) =>
    Object.values(nodes).filter((n) => n.kind === 'plant');

  const split = (nodes: Record<string, EcosystemNode>) => {
    const directions = plantsOf(nodes).map((n) => plumeDirection(signalTrend(n)));
    return {
      rising: directions.filter((d) => d > 0).length,
      falling: directions.filter((d) => d < 0).length,
      quiet: directions.filter((d) => d === 0).length,
    };
  };

  it('leaves the league with risers, fallers, and plants saying nothing', () => {
    const { nodes } = translateNflSnapshot(generateNflSnapshot(NOW));
    const { rising, falling, quiet } = split(nodes);
    expect(rising).toBeGreaterThan(0);
    expect(falling).toBeGreaterThan(0);
    expect(quiet).toBeGreaterThan(0);
  });

  it('still says something in the book, whose trend axis runs much narrower', () => {
    const { nodes } = translateMarketSnapshot(generateMarketSnapshot(NOW), { asOf: NOW });
    const { rising, falling, quiet } = split(nodes);
    expect(rising + falling).toBeGreaterThan(0);
    expect(quiet).toBeGreaterThan(0);
  });
});
