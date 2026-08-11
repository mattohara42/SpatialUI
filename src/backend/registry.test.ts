import { describe, expect, it } from 'vitest';
import { promRegistry } from './registry';
import { PROM_MOCK_MAPPING, PROM_MOCK_QUERY } from '../adapters/prometheus/mock';

describe('promRegistry', () => {
  const registry = promRegistry([
    { id: 'prometheus', query: PROM_MOCK_QUERY, mapping: PROM_MOCK_MAPPING },
  ]);

  it('resolves a registered id', () => {
    expect(registry.resolve('prometheus')?.id).toBe('prometheus');
  });

  it('returns null for an unregistered id rather than throwing', () => {
    expect(registry.resolve('nope')).toBeNull();
  });

  it('lists every registered source for the loop to walk', () => {
    expect(registry.all().map((s) => s.id)).toEqual(['prometheus']);
  });
});
