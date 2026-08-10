import { describe, expect, it } from 'vitest';
import { buildTimeline, fractionOf, reachOf, timeAt } from './timeline';
import { DAY_MS, HOUR_MS, createHistory, record } from './history';
import type { EcosystemNode } from './types';

const NOW = Date.UTC(2026, 3, 15, 12, 0);
const WEEK = 7 * DAY_MS;
const SEASON = 120 * DAY_MS;

const sample = (vitality = 0.6): EcosystemNode =>
  ({
    id: 'n',
    parentId: null,
    gardenId: 'g',
    label: 'n',
    domain: 'devops',
    kind: 'plant',
    polarity: 'nurture',
    vitality,
    activity: 0.5,
    maturity: 0.5,
    trend: 0,
    blights: [],
    updatedAt: NOW,
  }) as EcosystemNode;

/** A buffer holding `count` slots of `stepMs`, ending at `NOW`. */
function filled(stepMs: number, count: number, capacity = count) {
  const buffer = createHistory(stepMs, capacity);
  for (let i = count - 1; i >= 0; i--) record(buffer, NOW - i * stepMs, sample());
  return buffer;
}

describe('the timeline model', () => {
  it('spans the window the garden can honestly show', () => {
    const timeline = buildTimeline(NOW, SEASON, WEEK, null);
    expect(timeline.to).toBe(NOW);
    expect(timeline.to - timeline.from).toBe(SEASON);
  });

  it('marks where hours become days', () => {
    const timeline = buildTimeline(NOW, SEASON, WEEK, null);
    expect(timeline.fineFrom).toBe(NOW - WEEK);
    // And it sits inside the strip, near the present end of a season.
    expect(fractionOf(timeline, timeline.fineFrom!)).toBeCloseTo(1 - WEEK / SEASON, 6);
  });

  it('tells "no hourly record" apart from "hourly all the way back"', () => {
    // The distinction the null carries. A boundary at `from` is a real claim —
    // every moment in the window has an hourly reading — and must not be how a
    // garden with no fine buffer at all is drawn.
    expect(buildTimeline(NOW, SEASON, 0, null).fineFrom).toBeNull();
    expect(buildTimeline(NOW, SEASON, SEASON, null).fineFrom).toBe(NOW - SEASON);
  });

  it('never draws the grain boundary outside the strip', () => {
    // A fine buffer reaching further back than the archive is possible; the
    // boundary is a mark on this strip, so it is clamped to it.
    const timeline = buildTimeline(NOW, WEEK, SEASON, null);
    expect(timeline.fineFrom).toBe(timeline.from);
  });

  it('puts the present at the right-hand edge and the floor at the left', () => {
    const timeline = buildTimeline(NOW, SEASON, WEEK, null);
    expect(fractionOf(timeline, NOW)).toBe(1);
    expect(fractionOf(timeline, timeline.from)).toBe(0);
    // Anything older than the floor pins to the edge rather than running off it.
    expect(fractionOf(timeline, NOW - 2 * SEASON)).toBe(0);
    expect(fractionOf(timeline, NOW + DAY_MS)).toBe(1);
  });

  it('round-trips a position through the pointer mapping', () => {
    const timeline = buildTimeline(NOW, SEASON, WEEK, null);
    for (const fraction of [0, 0.25, 0.5, 0.937, 1]) {
      expect(fractionOf(timeline, timeAt(timeline, fraction))).toBeCloseTo(fraction, 10);
    }
  });

  it('clamps a pointer that leaves the strip', () => {
    const timeline = buildTimeline(NOW, SEASON, WEEK, null);
    expect(timeAt(timeline, -3)).toBe(timeline.from);
    expect(timeAt(timeline, 4)).toBe(NOW);
  });

  it('survives a garden with no window at all rather than dividing by zero', () => {
    const timeline = buildTimeline(NOW, 0, 0, null);
    expect(timeline.from).toBe(NOW);
    expect(fractionOf(timeline, NOW)).toBe(1);
  });
});

describe('how far back a garden reaches', () => {
  it('takes the shortest reach, because the garden is shown as a whole', () => {
    const long = filled(HOUR_MS, 168);
    const short = filled(HOUR_MS, 5);
    expect(reachOf([long, short], NOW)).toBe(reachOf([short], NOW));
    expect(reachOf([long, short], NOW)).toBeCloseTo(4 * HOUR_MS, -3);
  });

  it('claims nothing for a garden where any plant kept nothing', () => {
    // The failure this prevents: one well-recorded plant advertising a week of
    // hourly history that the bed around it does not have.
    expect(reachOf([filled(HOUR_MS, 168), undefined], NOW)).toBe(0);
    expect(reachOf([filled(HOUR_MS, 168), createHistory(HOUR_MS, 168)], NOW)).toBe(0);
  });

  it('claims nothing for an empty garden', () => {
    expect(reachOf([], NOW)).toBe(0);
  });

  it('reads a gapped record by its oldest slot, not its slot count', () => {
    // Backfills leave unrecorded slots unwritten, so a buffer with holes in it
    // still reaches as far back as its oldest real sample.
    const gapped = createHistory(HOUR_MS, 168);
    record(gapped, NOW - 100 * HOUR_MS, sample());
    record(gapped, NOW, sample());
    expect(reachOf([gapped], NOW)).toBeCloseTo(100 * HOUR_MS, -3);
  });
});
