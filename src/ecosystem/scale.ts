/**
 * The one arithmetic every source shares: a raw quantity onto [0, 1].
 *
 * `vitality`, `activity`, and `maturity` are all *comparisons* — 0 is dying, 1
 * is thriving — never raw gauges. A request rate of 4000/s is neither good nor
 * bad until someone says what the floor and the ceiling are. An `AxisScale` is
 * that statement, and `scale` is the only place a value crosses from a number
 * into a reading.
 *
 * This lived inside `translation/prometheus.ts` when Prometheus was the only
 * declarative source. It is domain-agnostic — a latency, a win percentage, and a
 * fundraising total all land the same way — so it belongs here, where the
 * declarative interpreter and the Prometheus one can share it rather than each
 * carry a copy.
 */

/**
 * How a raw value lands on an axis in [0, 1].
 *
 * Put `min` *above* `max` to say "lower is better" — a latency, an error rate, a
 * drawdown. No second flag is needed: the arithmetic simply runs backwards, so
 * the value that reads as 0 is always `min` and the value that reads as 1 is
 * always `max`, whichever is numerically larger.
 */
export interface AxisScale {
  /** The value that reads as 0 (dying). */
  min: number;
  /** The value that reads as 1 (thriving). Below `min` when lower is better. */
  max: number;
}

export function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

export function clamp01(n: number): number {
  return clamp(n, 0, 1);
}

/**
 * Clamp a value onto [0, 1] under a scale. Runs backwards when `min > max`, so
 * an error rate and a request rate use the same function and differ only in
 * which end the operator called good.
 *
 * A degenerate scale (`min === max`) has no gradient to read, so it returns the
 * midpoint rather than dividing by zero — a flat "no opinion" is the honest
 * answer when the config gave the axis nothing to vary over.
 */
export function scale(value: number, { min, max }: AxisScale): number {
  if (max === min) return 0.5;
  return clamp01((value - min) / (max - min));
}
