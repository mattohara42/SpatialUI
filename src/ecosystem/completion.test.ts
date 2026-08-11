import { describe, expect, it } from 'vitest';
import { DAY_MS, HOUR_MS } from './history';
import {
  COMPLETION_WINDOW_MS,
  MAX_SHOWN,
  RIPEN_MS,
  age01,
  deadwood,
  fruit,
  ripeness,
  shownCompletions,
  tally,
} from './completion';
import type { Completion } from './types';

const NOW = 1_000 * DAY_MS;

function done(at: number, id = `d${at}`): Completion {
  return { id, at, outcome: 'done', label: id, evidence: 'test' };
}
function failed(at: number, id = `f${at}`): Completion {
  return { id, at, outcome: 'failed', label: id, evidence: 'test' };
}

describe('shownCompletions', () => {
  it('is empty for undefined or none', () => {
    expect(shownCompletions(undefined, NOW)).toEqual([]);
    expect(shownCompletions([], NOW)).toEqual([]);
  });

  it('keeps only what has happened and not yet aged out', () => {
    const list = [
      done(NOW + HOUR_MS), // future: not yet
      done(NOW - HOUR_MS), // recent: shown
      done(NOW - COMPLETION_WINDOW_MS + HOUR_MS), // just inside: shown
      done(NOW - COMPLETION_WINDOW_MS - HOUR_MS), // aged out: gone
    ];
    const shown = shownCompletions(list, NOW);
    expect(shown.map((c) => c.at)).toEqual([NOW - HOUR_MS, NOW - COMPLETION_WINDOW_MS + HOUR_MS]);
  });

  it('is newest first', () => {
    const shown = shownCompletions([done(NOW - 3 * HOUR_MS), done(NOW - HOUR_MS), done(NOW - 2 * HOUR_MS)], NOW);
    expect(shown.map((c) => c.at)).toEqual([NOW - HOUR_MS, NOW - 2 * HOUR_MS, NOW - 3 * HOUR_MS]);
  });

  it('caps at MAX_SHOWN, keeping the newest', () => {
    const many = Array.from({ length: MAX_SHOWN + 5 }, (_, i) => done(NOW - (i + 1) * 60_000, `d${i}`));
    const shown = shownCompletions(many, NOW);
    expect(shown).toHaveLength(MAX_SHOWN);
    // The newest is the one a minute ago; the oldest kept is MAX_SHOWN minutes ago.
    expect(shown[0].at).toBe(NOW - 60_000);
    expect(shown[shown.length - 1].at).toBe(NOW - MAX_SHOWN * 60_000);
  });

  it('unwinds under a scrub: a build in the cursor-future is absent', () => {
    const list = [done(NOW)];
    expect(shownCompletions(list, NOW - HOUR_MS)).toEqual([]);
    expect(shownCompletions(list, NOW)).toHaveLength(1);
  });
});

describe('age01', () => {
  it('runs from 0 at completion to 1 at the window edge, clamped', () => {
    expect(age01(NOW, NOW)).toBe(0);
    expect(age01(NOW - COMPLETION_WINDOW_MS / 2, NOW)).toBeCloseTo(0.5, 6);
    expect(age01(NOW - COMPLETION_WINDOW_MS, NOW)).toBe(1);
    expect(age01(NOW - 2 * COMPLETION_WINDOW_MS, NOW)).toBe(1);
    expect(age01(NOW + HOUR_MS, NOW)).toBe(0);
  });
});

describe('ripeness', () => {
  it('greens fast and then holds ripe', () => {
    expect(ripeness(NOW, NOW)).toBe(0);
    expect(ripeness(NOW - RIPEN_MS / 2, NOW)).toBeCloseTo(0.5, 6);
    expect(ripeness(NOW - RIPEN_MS, NOW)).toBe(1);
    expect(ripeness(NOW - 10 * RIPEN_MS, NOW)).toBe(1);
  });
});

describe('fruit and deadwood', () => {
  it('split shown completions by outcome', () => {
    const shown = shownCompletions([done(NOW - HOUR_MS), failed(NOW - 2 * HOUR_MS), done(NOW - 3 * HOUR_MS)], NOW);
    expect(fruit(shown).map((c) => c.outcome)).toEqual(['done', 'done']);
    expect(deadwood(shown).map((c) => c.outcome)).toEqual(['failed']);
  });
});

describe('tally', () => {
  it('counts outcomes in the window regardless of the shown cap', () => {
    const many = [
      ...Array.from({ length: MAX_SHOWN + 4 }, (_, i) => done(NOW - (i + 1) * 60_000, `d${i}`)),
      failed(NOW - 90_000, 'fa'),
      failed(NOW - 95_000, 'fb'),
    ];
    const t = tally(many, NOW);
    expect(t.done).toBe(MAX_SHOWN + 4);
    expect(t.failed).toBe(2);
  });

  it('ignores future and aged-out completions', () => {
    const t = tally([done(NOW + HOUR_MS), done(NOW - HOUR_MS), failed(NOW - COMPLETION_WINDOW_MS - HOUR_MS)], NOW);
    expect(t).toEqual({ done: 1, failed: 0 });
  });

  it('is zero for none', () => {
    expect(tally(undefined, NOW)).toEqual({ done: 0, failed: 0 });
  });
});
