import { describe, expect, it } from 'vitest';
import { createLru } from './lru';

describe('createLru', () => {
  it('returns what was put in, and undefined for what was not', () => {
    const lru = createLru<number>(3);
    lru.set('a', 1);
    expect(lru.get('a')).toBe(1);
    expect(lru.get('b')).toBeUndefined();
  });

  it('evicts the oldest when nothing has been touched, exactly as FIFO would', () => {
    const lru = createLru<number>(3);
    lru.set('a', 1);
    lru.set('b', 2);
    lru.set('c', 3);
    lru.set('d', 4);
    expect(lru.keys()).toEqual(['b', 'c', 'd']);
  });

  /**
   * The whole difference from the FIFO it replaces, and the failure it fixes: a
   * plant you are standing in front of stays resident while a season's worth of
   * scrubbed-past buckets churn through the cache behind it.
   */
  it('keeps a hot entry through more churn than the cache can hold', () => {
    const lru = createLru<number>(4);
    lru.set('hot', 0);

    for (let i = 0; i < 50; i++) {
      lru.set(`cold-${i}`, i);
      expect(lru.get('hot')).toBe(0);
    }
    expect(lru.has('hot')).toBe(true);
    expect(lru.size).toBe(4);
  });

  it('drops a hot entry once it stops being asked for', () => {
    const lru = createLru<number>(3);
    lru.set('hot', 0);
    lru.get('hot');
    lru.set('a', 1);
    lru.set('b', 2);
    lru.set('c', 3);
    expect(lru.has('hot')).toBe(false);
  });

  it('moves an entry to the young end when it is read', () => {
    const lru = createLru<number>(3);
    lru.set('a', 1);
    lru.set('b', 2);
    lru.set('c', 3);
    lru.get('a');
    expect(lru.keys()).toEqual(['b', 'c', 'a']);
  });

  /** `Map.set` on an existing key keeps its original position; this must not. */
  it('moves an entry to the young end when it is overwritten', () => {
    const lru = createLru<number>(3);
    lru.set('a', 1);
    lru.set('b', 2);
    lru.set('a', 9);
    expect(lru.keys()).toEqual(['b', 'a']);
    expect(lru.get('a')).toBe(9);
    expect(lru.size).toBe(2);
  });

  it('does not touch on `has`, so asking what is resident cannot change it', () => {
    const lru = createLru<number>(2);
    lru.set('a', 1);
    lru.set('b', 2);
    lru.has('a');
    lru.set('c', 3);
    expect(lru.has('a')).toBe(false);
  });

  it('never exceeds its bound', () => {
    const lru = createLru<number>(5);
    for (let i = 0; i < 200; i++) lru.set(`k${i}`, i);
    expect(lru.size).toBe(5);
    expect(lru.keys()).toEqual(['k195', 'k196', 'k197', 'k198', 'k199']);
  });

  it('works at the degenerate size of one', () => {
    const lru = createLru<number>(1);
    lru.set('a', 1);
    lru.set('b', 2);
    expect(lru.keys()).toEqual(['b']);
  });

  it('refuses a size that cannot hold anything', () => {
    expect(() => createLru<number>(0)).toThrow(RangeError);
  });

  it('empties on clear', () => {
    const lru = createLru<number>(3);
    lru.set('a', 1);
    lru.clear();
    expect(lru.size).toBe(0);
    expect(lru.get('a')).toBeUndefined();
  });
});
