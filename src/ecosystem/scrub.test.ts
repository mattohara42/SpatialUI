import { describe, expect, it } from 'vitest';
import { HOUR_MS } from './history';
import {
  LIVE_SNAP_MS,
  SCRUB_WINDOW_MS,
  clampScrub,
  cursorFor,
  scrubBy,
} from './scrub';

const NOW = 1_700_000_000_000;

describe('clampScrub', () => {
  it('refuses the future', () => {
    expect(clampScrub(NOW + HOUR_MS, NOW)).toBe(NOW);
  });

  it('stops at the oldest time we kept', () => {
    expect(clampScrub(NOW - 300 * HOUR_MS, NOW)).toBe(NOW - SCRUB_WINDOW_MS);
  });

  it('leaves a time inside the window alone', () => {
    expect(clampScrub(NOW - 5 * HOUR_MS, NOW)).toBe(NOW - 5 * HOUR_MS);
  });

  it('stays inside the buffer the history ring actually holds', () => {
    // A scrub that runs past recorded history would show a flat line and read
    // as a healthy garden, which is the failure the whole staleness story is
    // about. The window is deliberately shorter than the week we keep.
    expect(SCRUB_WINDOW_MS).toBeLessThan(168 * HOUR_MS);
  });
});

describe('cursorFor', () => {
  it('returns to live when the drag comes back to the present', () => {
    expect(cursorFor(NOW, NOW)).toBeNull();
    expect(cursorFor(NOW + HOUR_MS, NOW)).toBeNull();
    expect(cursorFor(NOW - LIVE_SNAP_MS / 2, NOW)).toBeNull();
  });

  it('holds a timestamp once the drag is clearly in the past', () => {
    expect(cursorFor(NOW - 2 * HOUR_MS, NOW)).toBe(NOW - 2 * HOUR_MS);
  });

  it('clamps before deciding, so the far end is a time and not live', () => {
    expect(cursorFor(NOW - 500 * HOUR_MS, NOW)).toBe(NOW - SCRUB_WINDOW_MS);
  });
});

describe('scrubBy', () => {
  it('steps back from live', () => {
    expect(scrubBy(null, -HOUR_MS, NOW)).toBe(NOW - HOUR_MS);
  });

  it('steps on from wherever the cursor already sits', () => {
    expect(scrubBy(NOW - 6 * HOUR_MS, 2 * HOUR_MS, NOW)).toBe(NOW - 4 * HOUR_MS);
  });

  it('lands back on live when stepping forward past the present', () => {
    expect(scrubBy(NOW - HOUR_MS, 3 * HOUR_MS, NOW)).toBeNull();
  });

  it('goes nowhere at the far end rather than running off it', () => {
    const floor = NOW - SCRUB_WINDOW_MS;
    expect(scrubBy(floor, -10 * HOUR_MS, NOW)).toBe(floor);
  });

  it('is reversible step for step in the middle of the window', () => {
    let cursor = scrubBy(null, -12 * HOUR_MS, NOW);
    for (let i = 0; i < 6; i++) cursor = scrubBy(cursor, -HOUR_MS, NOW);
    for (let i = 0; i < 6; i++) cursor = scrubBy(cursor, HOUR_MS, NOW);
    expect(cursor).toBe(NOW - 12 * HOUR_MS);
  });
});
