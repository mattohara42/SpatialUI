import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  MAX_CONTRAST,
  TEXTURE_MEAN,
  TEXTURE_SIZE,
  barkPixels,
  grain,
  liftForTexture,
  SOIL_FURROWS,
  soilPixels,
  surfaceTexture,
  turfPixels,
} from './textures';

const GENERATORS = [
  ['turf', turfPixels],
  ['soil', soilPixels],
  ['bark', barkPixels],
] as const;

/** Mean brightness of a map, in multiplier units (0..1). */
function meanOf(pixels: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < pixels.length; i += 4) sum += pixels[i];
  return sum / (pixels.length / 4) / 255;
}

/** Average absolute difference between neighbours a given step apart, walking
 *  the given axis and wrapping. Used to compare a seam against the interior. */
function neighbourDelta(
  pixels: Uint8Array,
  axis: 'x' | 'y',
  at: (i: number) => number,
  size = TEXTURE_SIZE,
): number {
  let sum = 0;
  for (let i = 0; i < size; i++) {
    const a = axis === 'x' ? pixels[(i * size + at(i)) * 4] : pixels[(at(i) * size + i) * 4];
    const bIndex = at(i) + 1;
    const b =
      axis === 'x'
        ? pixels[(i * size + (bIndex % size)) * 4]
        : pixels[((bIndex % size) * size + i) * 4];
    sum += Math.abs(a - b);
  }
  return sum / size;
}

/** Mean absolute neighbour difference along an axis, over the whole map. */
function roughness(pixels: Uint8Array, axis: 'x' | 'y', size = TEXTURE_SIZE): number {
  let sum = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const here = pixels[(y * size + x) * 4];
      const next =
        axis === 'x'
          ? pixels[(y * size + ((x + 1) % size)) * 4]
          : pixels[(((y + 1) % size) * size + x) * 4];
      sum += Math.abs(here - next);
    }
  }
  return sum / (size * size);
}

/** The average of every row (or column) of the map. */
function profile(pixels: Uint8Array, of: 'row' | 'column', size = TEXTURE_SIZE): number[] {
  const means: number[] = [];
  for (let a = 0; a < size; a++) {
    let sum = 0;
    for (let b = 0; b < size; b++) {
      const i = of === 'row' ? a * size + b : b * size + a;
      sum += pixels[i * 4];
    }
    means.push(sum / size);
  }
  return means;
}

/** How strongly a profile repeats at a given number of cycles: one DFT bin. */
function bandAmplitude(values: number[], cycles: number): number {
  let re = 0;
  let im = 0;
  for (let i = 0; i < values.length; i++) {
    const angle = (2 * Math.PI * cycles * i) / values.length;
    re += values[i] * Math.cos(angle);
    im += values[i] * Math.sin(angle);
  }
  return Math.hypot(re, im) / values.length;
}

describe('generated surface maps', () => {
  for (const [name, generate] of GENERATORS) {
    describe(name, () => {
      it('fills a full RGBA buffer', () => {
        const pixels = generate();
        expect(pixels.length).toBe(TEXTURE_SIZE * TEXTURE_SIZE * 4);
      });

      it('is achromatic and opaque, so it can never tint what it textures', () => {
        const pixels = generate();
        for (let i = 0; i < pixels.length; i += 4) {
          expect(pixels[i + 1]).toBe(pixels[i]);
          expect(pixels[i + 2]).toBe(pixels[i]);
          expect(pixels[i + 3]).toBe(255);
        }
      });

      it('averages to TEXTURE_MEAN, so the lifted base colour cancels out', () => {
        expect(meanOf(generate())).toBeCloseTo(TEXTURE_MEAN, 2);
      });

      it('never clips at either end', () => {
        const pixels = generate();
        for (let i = 0; i < pixels.length; i += 4) {
          expect(pixels[i]).toBeGreaterThan(0);
          expect(pixels[i]).toBeLessThan(255);
        }
      });

      it('stays inside the contrast budget', () => {
        const pixels = generate();
        for (let i = 0; i < pixels.length; i += 4) {
          expect(Math.abs(pixels[i] / 255 - TEXTURE_MEAN)).toBeLessThanOrEqual(
            MAX_CONTRAST + 1 / 255,
          );
        }
      });

      it('is deterministic for a seed and different across seeds', () => {
        expect(generate(7)).toEqual(generate(7));
        expect(generate(7)).not.toEqual(generate(8));
      });

      it('tiles without a seam, on both axes', () => {
        const pixels = generate();
        // The wrap-around edge must be no rougher than the map's own interior,
        // or repeating it draws a visible grid.
        const seamX = neighbourDelta(pixels, 'x', () => TEXTURE_SIZE - 1);
        const seamY = neighbourDelta(pixels, 'y', () => TEXTURE_SIZE - 1);
        expect(seamX).toBeLessThanOrEqual(roughness(pixels, 'x') * 1.5 + 1);
        expect(seamY).toBeLessThanOrEqual(roughness(pixels, 'y') * 1.5 + 1);
      });

      it('actually varies', () => {
        expect(roughness(generate(), 'x') + roughness(generate(), 'y')).toBeGreaterThan(0);
      });
    });
  }

  it('turf has no direction: it clumps rather than lying one way', () => {
    const pixels = turfPixels();
    const across = roughness(pixels, 'x');
    const down = roughness(pixels, 'y');
    expect(Math.abs(across - down) / Math.max(across, down)).toBeLessThan(0.35);
  });

  it('bark streaks along the limb: it varies across v more than along it', () => {
    const pixels = barkPixels();
    // u runs around the trunk, v along it, so grain means rough across, smooth
    // along.
    expect(roughness(pixels, 'x')).toBeGreaterThan(roughness(pixels, 'y') * 2);
  });

  it('soil bands into furrows, at the spacing it claims to', () => {
    // Banding is a low-frequency property, so it does not show in per-pixel
    // roughness: the crumb noise is far louder pixel to pixel than the furrow it
    // rides on. What must be true is that the row averages repeat at the furrow
    // frequency and at no other, which is what makes the ridges land on tile
    // boundaries and stops a bed showing a half furrow at its edge.
    const rows = profile(soilPixels(), 'row');
    const atFurrow = bandAmplitude(rows, SOIL_FURROWS);
    for (let cycles = 1; cycles <= 8; cycles++) {
      if (cycles === SOIL_FURROWS) continue;
      expect(atFurrow).toBeGreaterThan(bandAmplitude(rows, cycles));
    }
  });

  it('soil does not band the other way: its columns carry no furrow', () => {
    const columns = profile(soilPixels(), 'column');
    const rows = profile(soilPixels(), 'row');
    expect(bandAmplitude(columns, SOIL_FURROWS)).toBeLessThan(
      bandAmplitude(rows, SOIL_FURROWS) / 3,
    );
  });
});

describe('liftForTexture', () => {
  it('cancels the map mean, so a textured surface keeps its tuned brightness', () => {
    const flat = new THREE.Color('#5c6e3a');
    const lifted = liftForTexture('#5c6e3a');
    expect(lifted.r * TEXTURE_MEAN).toBeCloseTo(flat.r, 6);
    expect(lifted.g * TEXTURE_MEAN).toBeCloseTo(flat.g, 6);
    expect(lifted.b * TEXTURE_MEAN).toBeCloseTo(flat.b, 6);
  });

  it('lifts in linear space, not in sRGB bytes', () => {
    // A gamma-space lift would land on the sRGB midpoint of the two; a linear
    // one lands above it, and getting this backwards is a silent 20% error.
    const lifted = liftForTexture('#808080');
    expect(lifted.r).toBeCloseTo(new THREE.Color('#808080').r / TEXTURE_MEAN, 6);
  });

  it('brightens rather than dims', () => {
    expect(liftForTexture('#ffffff').r).toBeGreaterThan(1);
  });
});

describe('surfaceTexture', () => {
  it('repeats, filters, and mips, so a tiled ground does not crawl', () => {
    const texture = surfaceTexture(turfPixels(), [4, 6]);
    expect(texture.wrapS).toBe(THREE.RepeatWrapping);
    expect(texture.wrapT).toBe(THREE.RepeatWrapping);
    expect(texture.repeat.x).toBe(4);
    expect(texture.repeat.y).toBe(6);
    expect(texture.generateMipmaps).toBe(true);
    expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    // `needsUpdate` is write-only on a three Texture; the version counter is
    // what it bumps, and a zero version means the upload never happens.
    expect(texture.version).toBeGreaterThan(0);
    texture.dispose();
  });

  it('leaves the bytes as linear multipliers rather than sRGB colours', () => {
    const texture = surfaceTexture(turfPixels(), [1, 1]);
    expect(texture.colorSpace).toBe(THREE.NoColorSpace);
    texture.dispose();
  });
});

describe('grain', () => {
  it('stays inside the requested amount', () => {
    for (let i = 0; i < 500; i++) {
      const value = grain('plant-a', i, 0.15);
      expect(value).toBeGreaterThanOrEqual(1 - 0.15);
      expect(value).toBeLessThanOrEqual(1 + 0.15);
    }
  });

  it('is stable, so a leaf does not shimmer between frames', () => {
    expect(grain('plant-a', 12, 0.15)).toBe(grain('plant-a', 12, 0.15));
  });

  it('differs by index and by seed', () => {
    expect(grain('plant-a', 12, 0.15)).not.toBe(grain('plant-a', 13, 0.15));
    expect(grain('plant-a', 12, 0.15)).not.toBe(grain('plant-b', 12, 0.15));
  });

  it('averages to 1, so a canopy is not quietly darkened or brightened', () => {
    let sum = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) sum += grain('plant-a', i, 0.15);
    expect(sum / n).toBeCloseTo(1, 2);
  });

  it('is a no-op at zero amount', () => {
    expect(grain('plant-a', 3, 0)).toBe(1);
  });
});
