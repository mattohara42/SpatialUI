/**
 * A least-recently-used cache, which is what the geometry cache should have
 * been evicting by all along.
 *
 * The cache it replaces held the same 600 entries and evicted the oldest
 * *inserted*. That is fine while nothing is churning and wrong the moment
 * something is: scrubbing a season walks a plant through maturity buckets it
 * will not want again, and each one of those inserts pushes out whatever went in
 * first — which, on a garden that has been open a while, is a plant standing in
 * front of you. The next frame rebuilds it, and the one after that evicts it
 * again. Keyed on last use instead, the same 600 entries hold the working set
 * and the churn evicts itself.
 *
 * Built on `Map` because its iteration order is insertion order, so "least
 * recently used" is `keys().next()` provided every hit re-inserts. That is the
 * whole implementation and the reason there is no linked list here.
 *
 * Generic and free of geometry, three.js, and React, like everything else under
 * `lsystem/`, so it can be tested without generating a plant.
 */
export interface Lru<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  has(key: string): boolean;
  readonly size: number;
  readonly max: number;
  /** Keys from least to most recently used. For tests and diagnostics. */
  keys(): string[];
  clear(): void;
}

export function createLru<T>(max: number): Lru<T> {
  if (max < 1) throw new RangeError(`an LRU needs room for at least one entry, got ${max}`);
  const entries = new Map<string, T>();

  return {
    get(key) {
      const value = entries.get(key);
      if (value === undefined) return undefined;
      // The touch. Deleting and re-inserting moves the entry to the young end,
      // which is the only thing separating this from the FIFO it replaces.
      entries.delete(key);
      entries.set(key, value);
      return value;
    },

    set(key, value) {
      // Re-setting an existing key must move it too, and `Map.set` alone does
      // not: an overwrite keeps the original insertion position.
      entries.delete(key);
      entries.set(key, value);
      while (entries.size > max) {
        entries.delete(entries.keys().next().value as string);
      }
    },

    /** Deliberately does not touch. A test asking what is resident should not change it. */
    has: (key) => entries.has(key),

    get size() {
      return entries.size;
    },

    max,

    keys: () => [...entries.keys()],

    clear: () => entries.clear(),
  };
}
