/**
 * Where the small things on the ground go.
 *
 * The garden had two flat surfaces doing nothing: the field outside, a single
 * textured plane running to the horizon, and the path inside, a grey sheet of
 * gravel between the beds and the glass. Both are read constantly — the field
 * through every pane, the path underfoot — and a texture alone cannot make
 * either look like ground rather than like a picture of ground. What does is
 * *things on it*: tufts, litter, a scatter of stones, each one catching its own
 * light and casting its own small shadow.
 *
 * This is the placement half, kept pure for the reason `greenhouse`, `daylight`
 * and `dust` are: where a thing stands is the decision, and it should be
 * arguable in a test without a renderer.
 *
 * Three rules hold it inside the design, and they are the ones `DESIGN.md` set
 * for the props and the horizon:
 *
 * **It is never in a bed.** Ground cover among the planting would be the one
 * decoration that cannot stay decoration: a bed is where polarity reads, a weed
 * among the plants is the load-bearing alarm the whole language turns on, and a
 * tuft of grass in the soil is exactly a weed. So the scatter lives on the path
 * and on the field, and the beds it carefully steps around are named here as an
 * exclusion rather than left to chance.
 *
 * **Its density says nothing.** Placement is a jittered grid keyed on a fixed
 * seed and the position itself, so it is identical on every frame, in every
 * garden, and at every vitality. Nothing thins because a plant is sick and
 * nothing thickens because one is thriving — which is the trap `docs/graphics.md`
 * names for exactly this rung, since ground cover that followed health would be
 * a second, quieter vitality channel nobody asked for.
 *
 * **It is still.** Motes, dust and sway are the only things that move in this
 * scene and all three carry signal, so grass that waved would be motion that
 * meant nothing. Out of doors that costs a little realism and buys the rule
 * staying simple, which is the same bargain the watering can makes.
 */

/** One placed thing: where it stands, how it is turned, and how big it is. */
export interface ScatterPoint {
  x: number;
  z: number;
  /** Rotation about the vertical, in radians. */
  rotation: number;
  /** Multiplier on the instance's base size. */
  scale: number;
}

/** A rectangle centred on the origin, which is how every extent in the scene is
 *  given (see `layout.size` and `Shell`). */
export interface Extent {
  width: number;
  depth: number;
}

/**
 * Stable [0,1) from a cell and a channel.
 *
 * The same integer hash `textures.ts` uses, keyed on the grid cell rather than
 * on an instance index, so a point's jitter, turn and size are properties of
 * *where it is* rather than of when it happened to be generated. Two runs, two
 * gardens and two frames all produce the same field.
 */
function hash01(seed: number, ix: number, iz: number, channel: number): number {
  let h = seed ^ 0x9e3779b9;
  h = Math.imul(h ^ ix, 0x85ebca6b);
  h = Math.imul(h ^ iz, 0xc2b2ae35);
  h = Math.imul(h ^ channel, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545f491);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** True when a point falls inside a centred rectangle, with a margin pushed out
 *  around it. Negative margins shrink the rectangle. */
export function insideExtent(
  x: number,
  z: number,
  extent: Extent,
  margin = 0,
): boolean {
  return (
    Math.abs(x) <= extent.width / 2 + margin && Math.abs(z) <= extent.depth / 2 + margin
  );
}

/**
 * How likely a tuft is to survive at a given distance beyond the wall, in [0,1].
 *
 * One at the glass, nothing at `reach`, falling off as the square so the thinning
 * happens late rather than immediately. That shape is the point: the first few
 * metres outside the pane are what the eye actually rests on when it looks out,
 * and they want to be full, while the distance wants to hand over to the turf
 * texture without a visible edge where the scatter stops.
 */
export function meadowDensity(distance: number, reach: number): number {
  if (reach <= 0) return 0;
  const t = Math.min(1, Math.max(0, distance / reach));
  return 1 - t * t;
}

/**
 * How far a point lies outside a centred rectangle. Zero inside it.
 *
 * The Chebyshev-style distance to the rectangle's edge rather than to its
 * centre, because the house is a box and what matters is how far past its wall
 * you are, not how far from its middle.
 */
export function distanceOutside(x: number, z: number, extent: Extent): number {
  const dx = Math.abs(x) - extent.width / 2;
  const dz = Math.abs(z) - extent.depth / 2;
  if (dx <= 0 && dz <= 0) return 0;
  return Math.hypot(Math.max(0, dx), Math.max(0, dz));
}

export interface ScatterOptions {
  /** Metres between grid cells before jitter. Smaller is denser. */
  spacing: number;
  /** How far a point may wander inside its cell, as a fraction of `spacing`.
   *  One is a full cell, which is as random as a grid can look without clumping. */
  jitter?: number;
  /** Size multipliers, picked uniformly between them. */
  scale?: readonly [number, number];
  seed?: number;
}

const DEFAULTS = { jitter: 0.85, scale: [0.7, 1.35] as const, seed: 0x5ca7 };

/**
 * Points on a jittered grid over a rectangle, minus whatever `reject` refuses.
 *
 * A grid rather than uniform random sampling, because uniform random over an
 * area clumps: it leaves bald patches beside knots of three, and on ground cover
 * that reads as a mistake rather than as nature. Jittering each point inside its
 * own cell keeps the evenness and loses the lattice.
 */
function griddedScatter(
  bounds: Extent,
  options: ScatterOptions,
  reject: (x: number, z: number) => boolean,
  keep: (x: number, z: number, roll: number) => boolean,
): ScatterPoint[] {
  const { spacing } = options;
  const jitter = options.jitter ?? DEFAULTS.jitter;
  const [minScale, maxScale] = options.scale ?? DEFAULTS.scale;
  const seed = options.seed ?? DEFAULTS.seed;
  if (spacing <= 0) return [];

  const points: ScatterPoint[] = [];
  // Cells tile the bounds exactly rather than being `spacing` wide and running
  // over the far edge, and a point is jittered within its own cell rather than
  // by a fixed distance. Together those are what guarantee every point lands
  // inside the bounds it was asked for — which is not cosmetic: the path ring is
  // bounded by the dwarf wall, and a pebble that escaped it would be embedded in
  // the masonry. `spacing` is therefore a target rather than an exact pitch, and
  // the cell it produces is within half a cell of it.
  const nx = Math.max(1, Math.round(bounds.width / spacing));
  const nz = Math.max(1, Math.round(bounds.depth / spacing));
  const cellWidth = bounds.width / nx;
  const cellDepth = bounds.depth / nz;

  for (let ix = 0; ix < nx; ix++) {
    for (let iz = 0; iz < nz; iz++) {
      const cellX = -bounds.width / 2 + (ix + 0.5) * cellWidth;
      const cellZ = -bounds.depth / 2 + (iz + 0.5) * cellDepth;
      const x = cellX + (hash01(seed, ix, iz, 0) - 0.5) * cellWidth * jitter;
      const z = cellZ + (hash01(seed, ix, iz, 1) - 0.5) * cellDepth * jitter;
      if (reject(x, z)) continue;
      if (!keep(x, z, hash01(seed, ix, iz, 2))) continue;
      points.push({
        x,
        z,
        rotation: hash01(seed, ix, iz, 3) * Math.PI * 2,
        scale: minScale + hash01(seed, ix, iz, 4) * (maxScale - minScale),
      });
    }
  }
  return points;
}

/**
 * Grass outside the glass: an apron of tufts around the house, thinning with
 * distance until the turf texture takes over.
 *
 * Excluded from the building's own footprint, with a margin, because a tuft
 * growing up through the floor would be the one thing in the scene that broke
 * the enclosure the greenhouse exists to provide.
 */
export function meadowScatter(
  shell: Extent,
  reach: number,
  options: ScatterOptions,
): ScatterPoint[] {
  const bounds = {
    width: shell.width + reach * 2,
    depth: shell.depth + reach * 2,
  };
  return griddedScatter(
    bounds,
    options,
    (x, z) => insideExtent(x, z, shell, 0.35),
    (x, z, roll) => roll < meadowDensity(distanceOutside(x, z, shell), reach),
  );
}

/**
 * Litter on the path inside: the ring of floor between the planting and the
 * glass, which is where the props already live.
 *
 * Two exclusions, and both are load-bearing. The beds, so nothing lands in the
 * soil where it would read as a weed; and a margin outside them, so a pebble
 * does not appear to be tucked under a bed's timber. A margin at the wall keeps
 * the scatter off the skirting, where it would look swept into a corner.
 */
export function pathScatter(
  shell: Extent,
  plot: Extent,
  options: ScatterOptions,
): ScatterPoint[] {
  return griddedScatter(
    { width: shell.width - 0.3, depth: shell.depth - 0.3 },
    options,
    (x, z) => insideExtent(x, z, plot, 0.25),
    () => true,
  );
}
