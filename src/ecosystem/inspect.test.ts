import { describe, expect, it } from 'vitest';
import { MAX_ITEMS, fieldsOf, formatNumber, formatValue } from './inspect';

/** The rows as `key=value`, which is what the assertions are actually about. */
const rows = (raw: unknown) => fieldsOf(raw).map((f) => `${f.key}=${f.value}`);

describe('fieldsOf', () => {
  it('flattens a payload into rows, in the order the source wrote them', () => {
    expect(rows({ source: 'nfl', season: 2026, week: 14 })).toEqual([
      'source=nfl',
      'season=2026',
      'week=14',
    ]);
  });

  it('nests with a path and a depth', () => {
    const fields = fieldsOf({ roster: { size: 53, available: 48 } });
    expect(fields).toEqual([
      { key: 'roster', value: '', depth: 0 },
      { key: 'roster.size', value: '53', depth: 1 },
      { key: 'roster.available', value: '48', depth: 1 },
    ]);
  });

  it('shows absence rather than dropping it', () => {
    // A garden that greys a plant because nothing arrived must not have a panel
    // that quietly omits the fields it has no value for.
    expect(rows({ lastGame: null, idleDays: undefined })).toEqual([
      'lastGame=—',
      'idleDays=—',
    ]);
  });

  it('says an empty list is empty', () => {
    expect(rows({ injuries: [] })).toEqual(['injuries=none']);
  });

  it('joins a list of plain values instead of tabulating it', () => {
    expect(rows({ clubs: ['BUF', 'MIA', 'NE', 'NYJ'] })).toEqual([
      'clubs=BUF, MIA, NE, NYJ',
    ]);
  });

  it('expands a list of objects, then counts the rest', () => {
    const injuries = Array.from({ length: 7 }, (_, i) => ({ slot: `QB${i}` }));
    const keys = fieldsOf({ injuries }).map((f) => f.key);
    expect(keys).toContain('injuries[0].slot');
    expect(keys).toContain(`injuries[${MAX_ITEMS - 1}].slot`);
    expect(keys).not.toContain(`injuries[${MAX_ITEMS}].slot`);
    expect(rows({ injuries })).toContain('injuries[…]=3 more');
  });

  it('summarizes rather than descending forever', () => {
    const deep = { a: { b: { c: { d: 1, e: 2 } } } };
    expect(rows(deep)).toEqual(['a=', 'a.b=', 'a.b.c=d, e']);
  });

  it('stops at a limit, and says it stopped', () => {
    const wide = Object.fromEntries(
      Array.from({ length: 200 }, (_, i) => [`field${i}`, i]),
    );
    const fields = fieldsOf(wide, 20);
    expect(fields.length).toBeLessThanOrEqual(21);
    expect(fields[fields.length - 1]).toEqual({ key: '…', value: 'more', depth: 0 });
  });

  it('handles a payload that is not an object at all', () => {
    expect(fieldsOf('just a string')).toEqual([
      { key: '', value: 'just a string', depth: 0 },
    ]);
    expect(fieldsOf(undefined)).toEqual([{ key: '', value: '—', depth: 0 }]);
  });
});

describe('formatValue', () => {
  it('reads booleans as words', () => {
    expect(formatValue(true)).toBe('yes');
    expect(formatValue(false)).toBe('no');
  });

  it('turns an epoch under a temporal key into a date', () => {
    const at = Date.UTC(2026, 7, 8, 12, 0, 0);
    expect(formatValue(at, 'finalAt')).toBe(new Date(at).toLocaleString());
    expect(formatValue(at, 'lastGame.since')).toBe(new Date(at).toLocaleString());
  });

  it('leaves a big number alone when the key is not about time', () => {
    expect(formatValue(1786240000000, 'yards')).toBe('1786240000000');
  });

  it('leaves a small number alone even when the key is about time', () => {
    // Days idle is not an epoch, and a key alone is not enough to say it is.
    expect(formatValue(3, 'idleAt')).toBe('3');
  });

  it('does not mistake a word ending in those letters for a timestamp', () => {
    expect(formatValue(1786240000000, 'seat')).toBe('1786240000000');
  });
});

describe('formatNumber', () => {
  it('keeps whole numbers whole', () => {
    expect(formatNumber(53)).toBe('53');
    expect(formatNumber(-2)).toBe('-2');
  });

  it('rounds the float tail off', () => {
    expect(formatNumber(0.7333333333333)).toBe('0.733');
    expect(formatNumber(0.30000000000000004)).toBe('0.3');
  });
});
