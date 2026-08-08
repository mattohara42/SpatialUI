import { describe, expect, it } from 'vitest';
import {
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
  it('backfills every plant and ends at the present value', () => {
    const state = generateMockEcosystem({ historyHours: 48 });
    const plants = Object.values(state.nodes).filter((n) => n.kind === 'plant');
    expect(plants.length).toBeGreaterThan(0);
    for (const plant of plants) {
      const buffer = state.history[plant.id];
      expect(buffer).toBeDefined();
      expect(sampleAt(buffer, state.revision)?.vitality).toBeCloseTo(
        plant.vitality,
        5,
      );
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
