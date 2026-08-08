import { describe, expect, it } from 'vitest';
import { DAY_MS, HOUR_MS, createHistory, record } from './history';
import {
  LIVE_SNAP_MS,
  SCRUB_WINDOW_MS,
  SEASON_WINDOW_MS,
  clampScrub,
  cursorFor,
  scrubBy,
  windowFor,
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

describe('windowFor', () => {
  /** A coarse buffer holding `days` of dailies ending now. */
  const archive = (days: number) => {
    const buffer = createHistory(DAY_MS, 140);
    for (let d = days - 1; d >= 0; d--) {
      record(buffer, NOW - d * DAY_MS, {
        vitality: 0.5,
        activity: 0.5,
        maturity: 0.5,
        trend: 0,
      });
    }
    return buffer;
  };

  it('keeps the two day window for a garden that archived nothing', () => {
    expect(windowFor(undefined, NOW)).toBe(SCRUB_WINDOW_MS);
    expect(windowFor(createHistory(DAY_MS, 140), NOW)).toBe(SCRUB_WINDOW_MS);
  });

  it('opens up to exactly what was recorded, and no further', () => {
    // Ninety days of dailies is a window of ninety days: the scrub reaches the
    // start of the season and stops, rather than running on into a flat line
    // that would look like ninety more days of data.
    // The reach runs to the start of the oldest day recorded, so ninety days of
    // samples is a window of eighty-nine and a bit — however far through today
    // "now" happens to be.
    const window = windowFor(archive(90), NOW);
    expect(window / DAY_MS).toBeGreaterThan(89);
    expect(window / DAY_MS).toBeLessThan(90);
    expect(window).toBeLessThan(SEASON_WINDOW_MS);
  });

  it('never exceeds the season cap even when more was kept', () => {
    expect(windowFor(archive(140), NOW)).toBeLessThanOrEqual(SEASON_WINDOW_MS);
  });

  it('never shrinks below the day window for a barely-filled archive', () => {
    expect(windowFor(archive(1), NOW)).toBe(SCRUB_WINDOW_MS);
  });

  it('is what lets the cursor reach a season back at all', () => {
    const window = windowFor(archive(100), NOW);
    expect(clampScrub(NOW - 80 * DAY_MS, NOW, window)).toBe(NOW - 80 * DAY_MS);
    // And the default window would have refused the same request.
    expect(clampScrub(NOW - 80 * DAY_MS, NOW)).toBe(NOW - SCRUB_WINDOW_MS);
  });
});
