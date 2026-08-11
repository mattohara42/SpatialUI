import { describe, expect, it } from 'vitest';
import { TEXTURE_MEAN, roughnessPixels } from './textures';

/** An achromatic source (R=G=B) from a per-texel luminance byte function. */
function source(size: number, lum: (i: number) => number): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const b = lum(i);
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = b;
    px[i * 4 + 3] = 255;
  }
  return px;
}

const rough = (px: Uint8Array, i: number) => px[i * 4] / 255;

describe('roughnessPixels', () => {
  it('sits at the base where the source is at its mean', () => {
    const size = 4;
    const meanByte = Math.round(TEXTURE_MEAN * 255);
    const out = roughnessPixels(source(size, () => meanByte), 0.88, 1.2, size);
    for (let i = 0; i < size * size; i++) expect(rough(out, i)).toBeCloseTo(0.88, 2);
  });

  it('roughens the crevices and smooths the high ground', () => {
    const size = 2;
    // Two texels: one dark (crevice), one bright (ridge).
    const px = source(size, (i) => (i === 0 ? 60 : 230));
    const out = roughnessPixels(px, 0.85, 1.2, size);
    expect(rough(out, 0)).toBeGreaterThan(0.85); // dark -> rougher
    expect(rough(out, 1)).toBeLessThan(0.85); // bright -> smoother
  });

  it('opaque, achromatic, and clamped into a sane band', () => {
    const size = 8;
    const out = roughnessPixels(source(size, (i) => (i * 37) % 256), 0.9, 3, size);
    for (let i = 0; i < size * size; i++) {
      const p = i * 4;
      expect(out[p]).toBe(out[p + 1]);
      expect(out[p + 1]).toBe(out[p + 2]);
      expect(out[p + 3]).toBe(255);
      const r = out[p] / 255;
      expect(r).toBeGreaterThanOrEqual(0.4 - 1e-9);
      expect(r).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('spreads wider at higher gain', () => {
    const size = 2;
    const px = source(size, (i) => (i === 0 ? 40 : 240));
    const soft = roughnessPixels(px, 0.8, 0.4, size);
    const hard = roughnessPixels(px, 0.8, 1.5, size);
    const spread = (o: Uint8Array) => Math.abs(rough(o, 0) - rough(o, 1));
    expect(spread(hard)).toBeGreaterThan(spread(soft));
  });
});
