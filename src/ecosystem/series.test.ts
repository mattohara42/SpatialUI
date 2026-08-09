import { describe, expect, it } from 'vitest';
import { HOUR_MS, createHistory, record } from './history';
import {
  changeAcross,
  isEmpty,
  rangeOf,
  seriesOf,
  sparkPath,
  type Series,
} from './series';

/** A history with a reading at each of the given hour offsets from `end`. */
function historyOf(end: number, samples: [hoursBack: number, vitality: number][]) {
  const history = createHistory(HOUR_MS, 24);
  for (const [back, vitality] of samples) {
    record(history, end - back * HOUR_MS, {
      vitality,
      activity: vitality / 2,
      maturity: 0.5,
      trend: 0,
    });
  }
  return history;
}

const END = 1_700_000_000_000;

/**
 * History is stored in `Float32Array`s, so a reading comes back a few parts in
 * ten million off what went in. Compare readings at that precision and gaps
 * exactly, since a gap is the thing that must never be approximated.
 */
function expectReadings(values: (number | null)[], expected: (number | null)[]) {
  expect(values).toHaveLength(expected.length);
  values.forEach((value, i) => {
    const want = expected[i];
    if (want === null) expect(value).toBeNull();
    else expect(value).toBeCloseTo(want, 6);
  });
}

describe('seriesOf', () => {
  it('reads backwards from the moment asked about', () => {
    const history = historyOf(END, [
      [0, 0.9],
      [1, 0.8],
      [2, 0.7],
    ]);
    const series = seriesOf(history, 'vitality', END, 3);
    expectReadings(series.values, [0.7, 0.8, 0.9]);
    expect(series.to - series.from).toBe(2 * HOUR_MS);
    expect(series.stepMs).toBe(HOUR_MS);
  });

  it('agrees with the scrub: ask about a past moment and the line ends there', () => {
    const history = historyOf(END, [
      [0, 0.9],
      [1, 0.8],
      [2, 0.7],
    ]);
    const series = seriesOf(history, 'vitality', END - HOUR_MS, 2);
    expectReadings(series.values, [0.7, 0.8]);
  });

  it('leaves a slot nobody wrote as a gap, and never bridges it', () => {
    const history = historyOf(END, [
      [0, 0.9],
      [2, 0.7],
    ]);
    const series = seriesOf(history, 'vitality', END, 3);
    expectReadings(series.values, [0.7, null, 0.9]);
  });

  it('reads whichever axis it was asked for', () => {
    const history = historyOf(END, [[0, 0.8]]);
    expectReadings(seriesOf(history, 'activity', END, 1).values, [0.4]);
    expectReadings(seriesOf(history, 'maturity', END, 1).values, [0.5]);
  });

  it('survives a node with no history at all', () => {
    const series = seriesOf(undefined, 'vitality', END, 12);
    expect(series.values).toEqual([]);
    expect(isEmpty(series)).toBe(true);
    expect(sparkPath(series, 100, 20)).toBe('');
    expect(changeAcross(series)).toBeNull();
  });

  it('asks for nothing when asked for nothing', () => {
    const history = historyOf(END, [[0, 0.9]]);
    expect(seriesOf(history, 'vitality', END, 0).values).toEqual([]);
  });
});

describe('changeAcross', () => {
  it('is the move from the first reading to the last', () => {
    const series = seriesOf(
      historyOf(END, [
        [0, 0.9],
        [2, 0.6],
      ]),
      'vitality',
      END,
      3,
    );
    expect(changeAcross(series)).toBeCloseTo(0.3, 6);
  });

  it('measures across the gaps rather than through them', () => {
    const series = seriesOf(
      historyOf(END, [
        [0, 0.4],
        [5, 0.8],
      ]),
      'vitality',
      END,
      6,
    );
    expect(changeAcross(series)).toBeCloseTo(-0.4, 6);
  });

  it('is null for one reading, because one point is not a direction', () => {
    const series = seriesOf(historyOf(END, [[0, 0.9]]), 'vitality', END, 4);
    expect(changeAcross(series)).toBeNull();
  });
});

describe('rangeOf', () => {
  it('ignores the gaps', () => {
    const series = seriesOf(
      historyOf(END, [
        [0, 0.9],
        [3, 0.2],
      ]),
      'vitality',
      END,
      4,
    );
    const range = rangeOf(series);
    expect(range?.min).toBeCloseTo(0.2, 6);
    expect(range?.max).toBeCloseTo(0.9, 6);
  });

  it('is null when there is nothing to bound', () => {
    expect(rangeOf(seriesOf(undefined, 'vitality', END, 4))).toBeNull();
  });
});

describe('sparkPath', () => {
  const line = (values: (number | null)[]): Series => ({
    axis: 'vitality',
    values,
    from: 0,
    to: 0,
    stepMs: HOUR_MS,
  });

  it('spans the box, with y measured down the way SVG does', () => {
    const path = sparkPath(line([0, 1]), 100, 20);
    expect(path).toBe('M0 20L0.01 20L100 0');
  });

  it('scales to the domain it was given, not to the data', () => {
    // A plant sitting flat at 0.9 must look flat. Auto-scaling to its own range
    // is how a sparkline turns noise into a mountain.
    const flat = sparkPath(line([0.9, 0.91, 0.9]), 100, 20);
    const ys = [...flat.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1);
  });

  it('breaks the line at a gap instead of drawing across it', () => {
    const path = sparkPath(line([1, null, 0]), 100, 20);
    expect(path.match(/M/g)).toHaveLength(2);
    expect(path).toContain('M100 20');
  });

  it('draws a lone reading as something rather than nothing', () => {
    const path = sparkPath(line([null, 0.5, null]), 100, 20);
    expect(path).toBe('M50 10L50.01 10');
  });

  it('clamps out-of-domain readings instead of drawing outside the box', () => {
    const path = sparkPath(line([-2, 3]), 100, 20);
    const ys = [...path.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(20);
    }
  });

  it('centres a single sample rather than pinning it to the left edge', () => {
    expect(sparkPath(line([0.5]), 100, 20)).toBe('M50 10L50.01 10');
  });

  it('draws nothing for a series of nothing', () => {
    expect(sparkPath(line([null, null]), 100, 20)).toBe('');
  });
});
