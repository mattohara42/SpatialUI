import { describe, expect, it } from 'vitest';
import { normalPixels } from './textures';

/** Build an achromatic source (R=G=B) from a per-texel luminance byte function. */
function source(size: number, lum: (x: number, y: number) => number): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const p = (y * size + x) * 4;
      const b = lum(x, y);
      px[p] = px[p + 1] = px[p + 2] = b;
      px[p + 3] = 255;
    }
  }
  return px;
}

/** Unpack a byte-encoded normal at (x,y) back to a vector in [-1, 1]. */
function normalAt(px: Uint8Array, size: number, x: number, y: number) {
  const p = (y * size + x) * 4;
  return [px[p] / 255 * 2 - 1, px[p + 1] / 255 * 2 - 1, px[p + 2] / 255 * 2 - 1];
}

describe('normalPixels', () => {
  it('points straight up on a flat surface', () => {
    const size = 8;
    const out = normalPixels(source(size, () => 180), 8, size);
    for (let i = 0; i < size * size; i++) {
      expect(out[i * 4]).toBe(128); // x -> 0.5
      expect(out[i * 4 + 1]).toBe(128); // y -> 0.5
      expect(out[i * 4 + 2]).toBe(255); // z -> 1
      expect(out[i * 4 + 3]).toBe(255); // opaque
    }
  });

  it('emits unit-length normals', () => {
    const size = 16;
    // A lumpy field so slopes are non-trivial everywhere.
    const out = normalPixels(
      source(size, (x, y) => 128 + Math.round(60 * Math.sin(x) * Math.cos(y))),
      6,
      size,
    );
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const [nx, ny, nz] = normalAt(out, size, x, y);
        // Within 8-bit quantization of unit length; the pack loses a little.
        expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 1);
      }
    }
  });

  it('leans away from a rising slope', () => {
    const size = 16;
    // Brightness rises with x: a ramp going uphill toward +x. The surface normal
    // should lean back toward -x, so its x component is negative off the ramp.
    const out = normalPixels(source(size, (x) => Math.round((x / (size - 1)) * 255)), 8, size);
    // Sample an interior column, away from the wrap seam at x=0.
    const [nx] = normalAt(out, size, 8, 8);
    expect(nx).toBeLessThan(0);
  });

  it('is stronger relief at higher strength', () => {
    const size = 16;
    const field = source(size, (x) => Math.round((x / (size - 1)) * 255));
    const soft = normalAt(normalPixels(field, 2, size), size, 8, 8);
    const hard = normalAt(normalPixels(field, 10, size), size, 8, 8);
    // More strength tilts the normal further off vertical: a larger |x| lean.
    expect(Math.abs(hard[0])).toBeGreaterThan(Math.abs(soft[0]));
  });
});
