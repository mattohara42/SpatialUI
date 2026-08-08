/**
 * Deterministic randomness. A node with a given id always grows the same plant,
 * so a telemetry tick never reshuffles the geometry under the user's hands.
 */

export type Rng = () => number;

/** FNV-1a. Turns a node id into a 32-bit seed. */
export function hashString(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32. Small, fast, good enough for geometry. Not for crypto. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngFromSeed(seed: string): Rng {
  return mulberry32(hashString(seed));
}

/** Uniform in [-1, 1). */
export function signed(rng: Rng): number {
  return rng() * 2 - 1;
}
