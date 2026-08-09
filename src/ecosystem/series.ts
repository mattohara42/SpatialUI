import { sampleAt, type VitalsHistory } from './history';
import type { Vitals } from './types';

/**
 * History as a line, for the panel that opens when you ask about a plant.
 *
 * The scene reads history one moment at a time — `vitalsAt(cursor)` is the whole
 * of how scrubbing works — and that is right for a garden, where the answer to
 * "how is it going" is the plant standing in front of you. It is not enough for
 * the second question. *Which way is this going, and since when* is a question
 * about a shape, and a shape needs the samples either side of the one you are
 * standing on.
 *
 * So this reads the same buffers the scrub reads, in a window rather than at a
 * point, and it does it without inventing anything: a slot that was never
 * written comes back as `null` and stays a gap all the way to the drawn line.
 * That matters more here than anywhere else in the app. A sparkline that bridges
 * a hole in the data is a picture of a trend that did not happen, and the whole
 * reason this project keeps absence explicit — staleness, dust, `sampleAt`
 * returning null — is that silence must never be able to pass for a reading.
 *
 * Pure, no three.js and no React, so the arithmetic of a trend can be argued
 * with in a test rather than squinted at in a panel.
 */

/** Which of the four axes a line is drawn from. */
export type Axis = keyof Vitals;

export interface Series {
  axis: Axis;
  /** One entry per slot, oldest first. `null` is a slot nobody wrote. */
  values: (number | null)[];
  /** Timestamp of the first and last slot, and the gap between them. */
  from: number;
  to: number;
  stepMs: number;
}

/**
 * The last `count` slots of an axis, ending at (and including) the slot holding
 * `endAt`.
 *
 * Reading backwards from a moment rather than forwards from the buffer's start
 * is what makes this agree with the scrub: open the panel with the cursor three
 * days back and the line ends three days back, so the number under the pointer
 * and the end of the line are the same reading.
 */
export function seriesOf(
  history: VitalsHistory | undefined,
  axis: Axis,
  endAt: number,
  count: number,
): Series {
  const stepMs = history?.stepMs ?? 0;
  if (!history || count <= 0 || stepMs <= 0) {
    return { axis, values: [], from: endAt, to: endAt, stepMs };
  }

  const endSlot = Math.floor(endAt / stepMs);
  const startSlot = endSlot - count + 1;
  const values: (number | null)[] = [];
  for (let slot = startSlot; slot <= endSlot; slot++) {
    const sample = sampleAt(history, slot * stepMs);
    values.push(sample ? sample[axis] : null);
  }

  return {
    axis,
    values,
    from: startSlot * stepMs,
    to: endSlot * stepMs,
    stepMs,
  };
}

/** Whether a series has anything at all to draw. */
export function isEmpty(series: Series): boolean {
  return !series.values.some((value) => value !== null);
}

/**
 * How far the axis moved across the window: last reading minus first, over the
 * samples that exist. Null when fewer than two do, because one point is a
 * position and it takes two to be a direction.
 */
export function changeAcross(series: Series): number | null {
  const present = series.values.filter((value): value is number => value !== null);
  if (present.length < 2) return null;
  return present[present.length - 1] - present[0];
}

/** The span the values actually occupy, for scaling a line that is not 0..1. */
export function rangeOf(series: Series): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const value of series.values) {
    if (value === null) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return min === Infinity ? null : { min, max };
}

/**
 * An SVG path for a series, in a box `width` by `height`, with y measured down
 * from the top the way SVG does.
 *
 * Gaps break the path rather than bridging it: each run of consecutive readings
 * gets its own `M`, so a stretch nobody recorded shows as a stretch nobody
 * recorded. A single lone reading between two gaps is drawn as a dot-length
 * segment rather than dropped, because "one sample here" is information.
 *
 * The domain is fixed by the caller rather than taken from the data. Vitality
 * lives in 0..1 and a line auto-scaled to its own range would turn a plant
 * sitting flat at 0.9 into a dramatic mountain of noise — which is the single
 * most common way a sparkline lies.
 */
export function sparkPath(
  series: Series,
  width: number,
  height: number,
  domain: { min: number; max: number } = { min: 0, max: 1 },
): string {
  const n = series.values.length;
  if (n === 0) return '';

  const span = domain.max - domain.min || 1;
  const xAt = (i: number) => (n === 1 ? width / 2 : (i / (n - 1)) * width);
  const yAt = (value: number) =>
    height - ((clamp(value, domain.min, domain.max) - domain.min) / span) * height;

  let path = '';
  let run = 0;
  for (let i = 0; i < n; i++) {
    const value = series.values[i];
    if (value === null) {
      run = 0;
      continue;
    }
    const x = round(xAt(i));
    const y = round(yAt(value));
    if (run === 0) {
      // A lone reading gets a segment of its own so a round cap draws it as a
      // dot: one sample in a stretch of silence is information, and a bare
      // moveto would render as nothing at all.
      path += `M${x} ${y}L${round(x + 0.01)} ${y}`;
    } else {
      path += `L${x} ${y}`;
    }
    run++;
  }
  return path;
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

/** Two decimals is a tenth of a pixel at these sizes, and halves the path. */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}
