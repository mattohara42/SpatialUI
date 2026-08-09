import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  HOUR_MS,
  createHistory,
  historyBytes,
  historyExtent,
  record,
  sampleAt,
  vitalsAt,
} from './history';
import type { EcosystemNode } from './types';
import { generateMockEcosystem, tickMockEcosystem } from '../mock/mockEcosystemData';
import { mulberry32 } from '../lsystem/random';

const vitals = (vitality: number) => ({
  vitality,
  activity: 0.5,
  maturity: 0.5,
  trend: 0,
});

const node = (overrides: Partial<EcosystemNode> = {}): EcosystemNode => ({
  id: 'n',
  parentId: null,
  gardenId: 'g',
  label: 'n',
  domain: 'devops',
  kind: 'plant',
  polarity: 'nurture',
  vitality: 0.9,
  activity: 0.5,
  maturity: 0.5,
  trend: 0,
  blights: [],
  updatedAt: 0,
  ...overrides,
});

describe('VitalsHistory', () => {
  it('reads back what was written at the same hour', () => {
    const h = createHistory(HOUR_MS, 24);
    const t = 10 * HOUR_MS;
    record(h, t, vitals(0.42));
    expect(sampleAt(h, t)?.vitality).toBeCloseTo(0.42, 5);
    expect(sampleAt(h, t + HOUR_MS - 1)?.vitality).toBeCloseTo(0.42, 5);
  });

  it('returns null for a slot that was never written', () => {
    const h = createHistory(HOUR_MS, 24);
    record(h, 10 * HOUR_MS, vitals(0.4));
    expect(sampleAt(h, 11 * HOUR_MS)).toBeNull();
  });

  it('reports a gap as absent rather than shifting older data forward', () => {
    const h = createHistory(HOUR_MS, 4);
    record(h, 0, vitals(0.1));
    record(h, 3 * HOUR_MS, vitals(0.4));
    expect(sampleAt(h, HOUR_MS)).toBeNull();
    expect(sampleAt(h, 2 * HOUR_MS)).toBeNull();
    expect(sampleAt(h, 3 * HOUR_MS)?.vitality).toBeCloseTo(0.4, 5);
  });

  it('overwrites the oldest slot once it wraps', () => {
    const h = createHistory(HOUR_MS, 4);
    for (let i = 0; i < 6; i++) record(h, i * HOUR_MS, vitals(i / 10));
    expect(sampleAt(h, 0)).toBeNull();
    expect(sampleAt(h, HOUR_MS)).toBeNull();
    expect(sampleAt(h, 5 * HOUR_MS)?.vitality).toBeCloseTo(0.5, 5);
  });

  it('takes the last write inside one hour', () => {
    const h = createHistory(HOUR_MS, 4);
    record(h, 0, vitals(0.1));
    record(h, 60_000, vitals(0.8));
    expect(sampleAt(h, 0)?.vitality).toBeCloseTo(0.8, 5);
  });

  it('reports its extent for sizing a scrub control', () => {
    const h = createHistory(HOUR_MS, 8);
    expect(historyExtent(h)).toBeNull();
    record(h, 4 * HOUR_MS, vitals(0.5));
    record(h, 6 * HOUR_MS, vitals(0.5));
    expect(historyExtent(h)).toEqual({
      from: 4 * HOUR_MS,
      to: 7 * HOUR_MS - 1,
    });
  });

  it('stays inside the stated memory budget', () => {
    expect(historyBytes(createHistory(HOUR_MS, 168))).toBe(3360);
  });
});

describe('vitalsAt', () => {
  const h = createHistory(HOUR_MS, 24);
  record(h, 5 * HOUR_MS, vitals(0.2));

  it('returns live values when the cursor is null', () => {
    expect(vitalsAt(node(), h, null).vitality).toBeCloseTo(0.9, 5);
  });

  it('returns the historical sample when the cursor is set', () => {
    expect(vitalsAt(node(), h, 5 * HOUR_MS).vitality).toBeCloseTo(0.2, 5);
  });

  it('falls back to live when the cursor lands in a gap', () => {
    expect(vitalsAt(node(), h, 9 * HOUR_MS).vitality).toBeCloseTo(0.9, 5);
  });

  it('falls back to live when a node has no history at all', () => {
    expect(vitalsAt(node(), undefined, 5 * HOUR_MS).vitality).toBeCloseTo(0.9, 5);
  });
});

describe('mock history', () => {
  it('backfills every plant, ending at the value each last reported', () => {
    const state = generateMockEcosystem({ historyHours: 48 });
    const plants = Object.values(state.nodes).filter((n) => n.kind === 'plant');
    expect(plants.length).toBeGreaterThan(0);
    for (const plant of plants) {
      const buffer = state.history[plant.id];
      expect(buffer).toBeDefined();
      expect(sampleAt(buffer, plant.updatedAt)?.vitality).toBeCloseTo(
        plant.vitality,
        5,
      );
    }
  });

  it('leaves a gap where a silent plant stopped reporting', () => {
    // The mock gives each garden one plant with a dead adapter, so the scene has
    // something to draw its staleness state on. Its history has to stop when it
    // did: a series that quietly kept going would make the silence invisible to
    // a scrub, which is the same failure the staleness cue exists to prevent.
    const state = generateMockEcosystem({ historyHours: 48 });
    const silent = Object.values(state.nodes).filter(
      (n) => n.kind === 'plant' && n.updatedAt < state.revision,
    );
    expect(silent.length).toBeGreaterThan(0);

    for (const plant of silent) {
      expect(sampleAt(state.history[plant.id], plant.updatedAt)).not.toBeNull();
      expect(sampleAt(state.history[plant.id], state.revision)).toBeNull();
    }
  });

  it('leaves a silent plant behind as the rest of the garden ticks', () => {
    const state = generateMockEcosystem({ historyHours: 48 });
    const before = Object.values(state.nodes).filter(
      (n) => n.kind === 'plant' && n.updatedAt < state.revision,
    );
    const next = tickMockEcosystem(state, 0.04, mulberry32(9));

    for (const plant of before) {
      // Same timestamp, same vitality: a dead adapter reports nothing, so the
      // node ages while everything around it refreshes.
      expect(next.nodes[plant.id].updatedAt).toBe(plant.updatedAt);
      expect(next.nodes[plant.id].vitality).toBe(plant.vitality);
      expect(next.revision).toBeGreaterThan(plant.updatedAt);
    }
  });

  it('starts live, not scrubbed', () => {
    expect(generateMockEcosystem().cursor).toBeNull();
  });

  it('keeps recording as the ecosystem ticks', () => {
    const state = generateMockEcosystem({ historyHours: 48 });
    const next = tickMockEcosystem(state, 0.04, mulberry32(3));
    const plant = Object.values(next.nodes).find((n) => n.kind === 'plant')!;
    expect(sampleAt(next.history[plant.id], next.revision)?.vitality).toBeCloseTo(
      plant.vitality,
      5,
    );
  });
});

describe('the archive tier', () => {
  const node = (): EcosystemNode => ({
    id: 'n',
    parentId: null,
    gardenId: 'g',
    label: 'n',
    domain: 'devops',
    kind: 'plant',
    polarity: 'nurture',
    vitality: 0.9,
    activity: 0.5,
    maturity: 0.5,
    trend: 0,
    blights: [],
    updatedAt: 0,
  });

  const NOW = 1_700_000_000_000;

  const filled = (stepMs: number, steps: number, vitality: number) => {
    const buffer = createHistory(stepMs, steps);
    for (let i = 0; i < steps; i++) {
      record(buffer, NOW - i * stepMs, {
        vitality,
        activity: 0.5,
        maturity: 0.5,
        trend: 0,
      });
    }
    return buffer;
  };

  it('prefers the fine grain wherever it has an answer', () => {
    const fine = filled(HOUR_MS, 168, 0.2);
    const coarse = filled(DAY_MS, 140, 0.8);
    expect(vitalsAt(node(), fine, NOW - 3 * HOUR_MS, coarse).vitality).toBeCloseTo(0.2, 5);
  });

  it('falls through to the archive once the week runs out', () => {
    const fine = filled(HOUR_MS, 168, 0.2);
    const coarse = filled(DAY_MS, 140, 0.8);
    expect(vitalsAt(node(), fine, NOW - 40 * DAY_MS, coarse).vitality).toBeCloseTo(0.8, 5);
  });

  it('falls back to live rather than inventing a past neither tier holds', () => {
    const fine = filled(HOUR_MS, 168, 0.2);
    const coarse = filled(DAY_MS, 140, 0.8);
    // Two years back is beyond both buffers.
    expect(vitalsAt(node(), fine, NOW - 730 * DAY_MS, coarse).vitality).toBe(0.9);
  });

  it('works with no archive at all, which is what most adapters will have', () => {
    const fine = filled(HOUR_MS, 168, 0.2);
    expect(vitalsAt(node(), fine, NOW - 40 * DAY_MS).vitality).toBe(0.9);
  });

  it('is live at a null cursor whatever either tier holds', () => {
    const coarse = filled(DAY_MS, 140, 0.8);
    expect(vitalsAt(node(), filled(HOUR_MS, 168, 0.2), null, coarse).vitality).toBe(0.9);
  });

  it('costs a fraction of what hourly would over the same span', () => {
    // The reason for two grains rather than one long fine buffer: a season at a
    // day a slot is a rounding error next to a season of hours.
    const season = historyBytes(createHistory(DAY_MS, 140));
    const hourly = historyBytes(createHistory(HOUR_MS, 140 * 24));
    expect(season * 20).toBeLessThan(hourly);
    expect(season).toBeLessThan(3000);
  });
});

describe('the mock gardens archive too', () => {
  it('backfills a season of dailies alongside the week of hours', () => {
    const state = generateMockEcosystem({ historyHours: 48, archiveDays: 90 });
    const plant = Object.values(state.nodes).find((n) => n.kind === 'plant')!;
    expect(state.archive[plant.id].stepMs).toBe(DAY_MS);
    expect(sampleAt(state.archive[plant.id], Date.now() - 60 * DAY_MS)).not.toBeNull();
  });

  it('drifts further over a season than over a week, so the walk is not a flat line', () => {
    const state = generateMockEcosystem({ archiveDays: 120 });
    const plant = Object.values(state.nodes).find((n) => n.kind === 'plant')!;
    const now = sampleAt(state.archive[plant.id], Date.now())!;
    const then = sampleAt(state.archive[plant.id], Date.now() - 100 * DAY_MS)!;
    expect(Math.abs(now.vitality - then.vitality)).toBeGreaterThan(0.05);
  });
});

describe('the silent plant', () => {
  it('goes quiet for longer than a history step, whatever the clock says', () => {
    // The gap only exists if the last reading and now fall in different slots.
    // A silence shorter than one step lands in the same slot for part of every
    // hour, and for those minutes a scrub would show a reading where there was
    // none — silence passing for health, in the one place built to prevent it.
    const state = generateMockEcosystem({ historyHours: 48 });
    const silent = Object.values(state.nodes).filter(
      (n) => n.kind === 'plant' && (n.raw as { silent?: boolean })?.silent,
    );
    expect(silent.length).toBeGreaterThan(0);
    for (const plant of silent) {
      expect(state.revision - plant.updatedAt).toBeGreaterThan(HOUR_MS);
    }
  });
});
