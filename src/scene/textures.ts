import * as THREE from 'three';
import { hashString, mulberry32, type Rng } from '../lsystem/random';

/**
 * Surface grain, at two scales.
 *
 * Everything in the garden is drawn in one flat colour per surface: the ground
 * is a single green, a bed is a single brown, every leaf on a plant is the exact
 * same value. That reads as plastic up close, and it is the thing that most
 * makes the scene look like a diagram rather than a place. Two fixes, the same
 * idea at different scales:
 *
 *   *within* a surface   a texture map, generated here as pixels
 *   *between* instances  a per-instance multiplier (see `grain`)
 *
 * Both obey one rule: **they modulate luminance and never hue.** A texture is
 * achromatic — r, g, and b are the same byte — so it darkens and lightens the
 * colour a material was already tuned to and never moves it around the wheel.
 * That is what keeps this free against the channel budget in DESIGN.md: colour
 * is deliberately not load-bearing here, and a texture that tinted as well as
 * textured would quietly start carrying signal. Grain is decoration, and
 * decoration is only affordable while it means nothing.
 *
 * Textures are generated, not loaded. No image files, no fetch, no decode: a
 * seeded PRNG fills a byte buffer and it goes straight into a DataTexture. That
 * keeps the app self-contained and deterministic — the same garden looks the
 * same on every machine and in every test run — and it costs a few hundred
 * microseconds once at mount.
 */

/**
 * Edge length of every generated texture, in pixels. Small on purpose: these
 * carry low-contrast noise, not detail, and 128² RGBA is 64KB per surface. Going
 * bigger would buy nothing a viewer could see and cost real memory in a headset.
 */
export const TEXTURE_SIZE = 128;

/**
 * The average brightness of every generated map.
 *
 * A `map` multiplies the material colour and a byte tops out at 1.0, so a
 * texture can only ever darken. Applying one to an existing material therefore
 * dims it by the map's mean — which would silently re-tune every colour in the
 * scene, each of which was picked by eye against the lighting rig. The fix is to
 * fix the mean here and lift the base colour by its inverse (see
 * `liftForTexture`), so a textured surface has the same average appearance as
 * the flat one it replaced and the grain rides on top of it.
 */
export const TEXTURE_MEAN = 0.76;

/** The most a map may deviate from the mean before it would clip at white. */
export const MAX_CONTRAST = 1 - TEXTURE_MEAN;

/**
 * The base colour to give a material that is about to wear a generated map.
 *
 * Returns a `THREE.Color` in the renderer's linear working space, brightened by
 * the inverse of `TEXTURE_MEAN`. Components can exceed 1, which is legal —
 * `material.color` is a float multiplier, not a display colour — and is exactly
 * what cancels the map's mean back out.
 *
 * Passing a hex string is what does the sRGB-to-linear conversion: the map's
 * bytes are consumed as linear values (see `surfaceTexture`), so the lift has to
 * happen in linear space too or the cancellation is wrong by a gamma curve.
 */
export function liftForTexture(hex: string): THREE.Color {
  return new THREE.Color(hex).multiplyScalar(1 / TEXTURE_MEAN);
}

/**
 * One band of noise. `fx` and `fy` are lattice cells across and down, so they
 * can differ: bark is many cells across the trunk and one along it, which is
 * what makes a streak rather than a blotch. Both must divide evenly into the
 * wrap, which they do by construction — the lattice indexes modulo itself, so
 * every octave tiles and so does their sum.
 */
type Octave = readonly [fx: number, fy: number, amplitude: number];

/** Smoothstep, so lattice cells blend into each other rather than creasing. */
function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** `fx × fy` random lattice values in [0,1). */
function latticeOf(fx: number, fy: number, rng: Rng): Float32Array {
  const values = new Float32Array(fx * fy);
  for (let i = 0; i < values.length; i++) values[i] = rng();
  return values;
}

/**
 * Bilinear value noise, sampled at (u,v) in [0,1) and wrapping at the edges.
 * The wrap is the whole point: a map that does not tile shows its seams as a
 * grid the moment it is repeated across a ground plane, and a visible grid on
 * the ground is precisely the kind of pattern a reader would try to interpret.
 */
function sampleLattice(
  values: Float32Array,
  fx: number,
  fy: number,
  u: number,
  v: number,
): number {
  const x = u * fx;
  const y = v * fy;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);

  const ix0 = ((x0 % fx) + fx) % fx;
  const iy0 = ((y0 % fy) + fy) % fy;
  const ix1 = (ix0 + 1) % fx;
  const iy1 = (iy0 + 1) % fy;

  const a = values[iy0 * fx + ix0];
  const b = values[iy0 * fx + ix1];
  const c = values[iy1 * fx + ix0];
  const d = values[iy1 * fx + ix1];
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
}

/**
 * Summed octaves as a `size × size` field of roughly 0..1, normalized by total
 * amplitude. One RNG feeds every octave in order, so a seed reproduces the whole
 * stack exactly.
 */
function fieldOf(size: number, seed: number, octaves: readonly Octave[]): Float32Array {
  const rng = mulberry32(seed);
  const bands = octaves.map(([fx, fy, amplitude]) => ({
    fx,
    fy,
    amplitude,
    values: latticeOf(fx, fy, rng),
  }));
  const total = bands.reduce((sum, b) => sum + b.amplitude, 0) || 1;

  const field = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      let sum = 0;
      for (const band of bands) {
        sum += band.amplitude * sampleLattice(band.values, band.fx, band.fy, u, v);
      }
      field[y * size + x] = sum / total;
    }
  }
  return field;
}

/**
 * A field to achromatic RGBA bytes centred exactly on `TEXTURE_MEAN`.
 *
 * Normalizing on peak deviation rather than on the raw range is what makes the
 * mean exact: the field is recentred on its own average and then scaled so its
 * furthest excursion lands on `contrast`. Typical pixels sit well inside that,
 * which is the intent — the grain should be felt rather than seen.
 */
function encode(field: Float32Array, contrast: number): Uint8Array {
  if (contrast > MAX_CONTRAST) {
    throw new Error(
      `contrast ${contrast} would clip at white; max is ${MAX_CONTRAST}`,
    );
  }

  let mean = 0;
  for (let i = 0; i < field.length; i++) mean += field[i];
  mean /= field.length;

  let peak = 0;
  for (let i = 0; i < field.length; i++) {
    const deviation = Math.abs(field[i] - mean);
    if (deviation > peak) peak = deviation;
  }
  const scale = peak > 0 ? contrast / peak : 0;

  const pixels = new Uint8Array(field.length * 4);
  for (let i = 0; i < field.length; i++) {
    const value = TEXTURE_MEAN + (field[i] - mean) * scale;
    const byte = Math.round(value * 255);
    const p = i * 4;
    pixels[p] = byte;
    pixels[p + 1] = byte;
    pixels[p + 2] = byte;
    pixels[p + 3] = 255;
  }
  return pixels;
}

/**
 * Turf. Clumped at a few scales and mottled at none in particular, because grass
 * has no direction: any visible lay to it would read as a pattern pointing
 * somewhere, and the ground is the one surface in the scene the eye crosses
 * constantly on its way to the plants.
 */
export function turfPixels(seed = 0x7a1f, size = TEXTURE_SIZE): Uint8Array {
  // Weighted toward the fine end. An earlier version led with the coarse
  // octaves and the ground came out as soft blotches the size of a footprint —
  // camouflage rather than grass. Grass is small: what should vary at a metre is
  // barely anything, and what varies at a handspan is most of it.
  return encode(
    fieldOf(size, seed, [
      [8, 8, 0.22],
      [16, 16, 0.3],
      [32, 32, 0.28],
      [64, 64, 0.2],
    ]),
    0.16,
  );
}

/** Ridges per tile in the soil map. Three reads as worked ground at a metre or
 *  so per tile without turning into corduroy at a distance. */
export const SOIL_FURROWS = 3;

/**
 * Worked soil: crumb noise under a set of shallow furrows.
 *
 * The furrows band along v and run along u, so a bed laid out with its rows
 * along x gets furrows parallel to its rows — the ground looks like it was
 * worked for the thing planted in it. Their phase wanders with a low-frequency
 * noise, because a ruler-straight ridge reads as machined rather than dug.
 *
 * They are deliberately weak. At full strength the beds came out as high
 * contrast stripes and every bed in the garden read as a sheet of decking — a
 * hard, manufactured object sitting in a field, which is the exact opposite of
 * what soil should look like. The furrow is a hint that the ground was worked,
 * and the crumb underneath it is what makes it soil.
 */
export function soilPixels(seed = 0x501a, size = TEXTURE_SIZE): Uint8Array {
  const crumb = fieldOf(size, seed, [
    [8, 8, 0.5],
    [16, 16, 0.3],
    [32, 32, 0.2],
  ]);
  const wander = latticeOf(4, 4, mulberry32(seed ^ 0x9e37));

  const field = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const offset = (sampleLattice(wander, 4, 4, u, v) - 0.5) * 0.2;
      const furrow =
        Math.cos((v + offset) * Math.PI * 2 * SOIL_FURROWS) * 0.5 + 0.5;
      field[y * size + x] = crumb[y * size + x] * 0.76 + furrow * 0.24;
    }
  }
  return encode(field, 0.15);
}

/**
 * Bark: grain that runs the length of the limb.
 *
 * Cylinder UVs put u around the trunk and v along it, so a lattice that is many
 * cells across and one or two along produces streaks parallel to the limb, which
 * is what bark is. A finer band on top breaks the streaks up so they do not read
 * as stripes painted on a pipe.
 */
export function barkPixels(seed = 0xba12, size = TEXTURE_SIZE): Uint8Array {
  return encode(
    fieldOf(size, seed, [
      [12, 1, 0.5],
      [24, 2, 0.3],
      [48, 4, 0.16],
      [16, 24, 0.08],
    ]),
    0.22,
  );
}

/**
 * Sawn timber: grain running the length of the board.
 *
 * The transpose of bark, and deliberately so. Bark's lattice is many cells
 * around the trunk and one along it, because a cylinder's u goes around and its
 * v goes up. A board is a box, and a box face's u runs along whichever edge is
 * longest, so the grain has to vary across v and hold along u — which is what
 * puts the lines down the plank rather than banded across it like a barcode.
 *
 * Louder than the other maps. A raised bed's timber is a hard, man-made surface
 * a metre from the camera, and it is the one thing in the scene that should look
 * sawn rather than grown: the beds are structure, and the sides saying "somebody
 * built this" is exactly the read that stops them looking like a hole in the
 * floor.
 */
export function plankPixels(seed = 0x91a4, size = TEXTURE_SIZE): Uint8Array {
  return encode(
    fieldOf(size, seed, [
      [1, 10, 0.46],
      [2, 20, 0.28],
      [3, 40, 0.16],
      [12, 12, 0.1],
    ]),
    0.2,
  );
}

/**
 * Grit: the floor of the house, and the stone the glazing stands on.
 *
 * Finer and busier than turf, with no scale that reads as a clump. Gravel is the
 * one surface here made of pieces small enough that the eye gives up and calls
 * it a texture, and the point of it is negative: the path has to be visibly
 * *not* a bed, so that the raised beds are the only ground anything grows out of.
 */
export function gravelPixels(seed = 0x6d21, size = TEXTURE_SIZE): Uint8Array {
  return encode(
    fieldOf(size, seed, [
      [16, 16, 0.16],
      [32, 32, 0.3],
      [64, 64, 0.54],
    ]),
    0.18,
  );
}

/**
 * Pixels to a texture ready to hang on a material.
 *
 * Two DataTexture defaults are wrong for this and both are easy to lose an hour
 * to. It filters nearest and generates no mipmaps, so a repeated map crawls and
 * aliases into noise at any distance; and it carries no colour space, which is
 * what we want here — the bytes are linear multipliers, not sRGB colours — but
 * only because these maps are achromatic grain. A real albedo texture would need
 * `SRGBColorSpace` set explicitly, the same trap the sky shader hit with
 * `colorspace_fragment` (ARCHITECTURE.md, assumption 9).
 */
export function surfaceTexture(
  pixels: Uint8Array,
  repeat: readonly [number, number],
  size = TEXTURE_SIZE,
): THREE.DataTexture {
  // The cast is a TypeScript artefact, not a runtime one: 5.7 made the typed
  // arrays generic over their backing buffer, so a plain `Uint8Array` is now
  // `Uint8Array<ArrayBufferLike>` and no longer assignable to the DOM's
  // `BufferSource`, which excludes `SharedArrayBuffer`. Ours is never shared.
  const texture = new THREE.DataTexture(pixels as BufferSource, size, size);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  // Clamped to the device maximum at upload, so asking for more is harmless.
  // Without it the ground plane, which is seen at a grazing angle all the way to
  // the horizon, blurs to flat colour a few metres out.
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/**
 * The same grain, as relief.
 *
 * An albedo map lightens and darkens a surface; a normal map tilts it, so the
 * sun catches the ridges of the bark and the crumb of the soil instead of
 * washing over a smooth pipe. It is derived from the very same achromatic field
 * the albedo map is — the bright pixels are the high ground — so the two agree by
 * construction: where the map says a ridge, the relief raises one.
 *
 * It is channel-safe for the same reason the maps are, arrived at from the other
 * side. A normal map's r, g, b are not a colour at all — they are a direction —
 * so it cannot tint what it textures and cannot start carrying the health signal
 * that lives in the surface's actual colour. It is geometry, and geometry is
 * decoration here as much as grain is.
 *
 * The slope is a central difference of the luminance, wrapped like the sampler so
 * the relief tiles as seamlessly as the map, and scaled by `strength` — baked in
 * here rather than left to `normalScale`, so a material only has to hang the map.
 */
export function normalPixels(
  source: Uint8Array,
  strength: number,
  size = TEXTURE_SIZE,
): Uint8Array {
  const at = (x: number, y: number): number => {
    const ix = ((x % size) + size) % size;
    const iy = ((y % size) + size) % size;
    return source[(iy * size + ix) * 4] / 255;
  };

  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Central differences: bright is high, so the slope points downhill from a
      // ridge, and the surface normal leans away from it.
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      let nx = -dx;
      let ny = -dy;
      let nz = 1;
      const length = Math.hypot(nx, ny, nz);
      nx /= length;
      ny /= length;
      nz /= length;

      const p = (y * size + x) * 4;
      // Pack a unit vector in [-1,1] into a byte in [0,1]. Green is +Y up, the
      // OpenGL convention three expects.
      out[p] = Math.round((nx * 0.5 + 0.5) * 255);
      out[p + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[p + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      out[p + 3] = 255;
    }
  }
  return out;
}

/**
 * A normal map ready to hang on a material, built from the same pixels as its
 * albedo `map` so the two describe one surface.
 *
 * Kept as raw linear data with no colour space, which is the whole point and the
 * same trap `surfaceTexture` documents from the other direction: an albedo map
 * would want `SRGBColorSpace`, but a normal map is a direction field and running
 * it through the sRGB curve would bend every slope. The `DataTexture` default is
 * exactly right here, so it is left alone deliberately, not by oversight.
 */
export function normalTexture(
  source: Uint8Array,
  repeat: readonly [number, number],
  strength: number,
  size = TEXTURE_SIZE,
): THREE.DataTexture {
  const pixels = normalPixels(source, strength, size);
  const texture = new THREE.DataTexture(pixels as BufferSource, size, size);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Grain between instances.
 *
 * Every leaf on a plant is handed the same colour, and a few hundred instances
 * of one exact value is what makes a canopy read as a solid object rather than
 * as leaves. This returns a small multiplier around 1 keyed on the plant's seed
 * and the instance index, so the canopy breaks up into individual leaves that
 * catch the light differently — and it is stable, so a leaf does not shimmer
 * between frames or re-roll on a telemetry tick.
 *
 * Luminance only, like the textures, and small: this must never grow into
 * something a reader could mistake for a per-leaf signal.
 */
export function grain(seed: string, index: number, amount: number): number {
  return 1 + (hash01(seed, index) * 2 - 1) * amount;
}

/** Stable [0,1) from a seed string and an index. */
function hash01(seed: string, index: number): number {
  let h = Math.imul(hashString(seed) ^ (index + 0x9e3779b9), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
