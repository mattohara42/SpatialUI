import type { Bounds, TurtleParams, Vec3 } from './types';
import type { RawGeometry } from './turtle';
import { signed, type Rng } from './random';

/**
 * Forms that are not trees.
 *
 * A vine is trained along a wire and a topiary is clipped into a solid; neither
 * is self-similar, so neither is an L-system. But both still want branches,
 * leaves, sway, droop, and colour — everything the renderer already does — so
 * rather than invent a second pipeline they emit the very same flat typed arrays
 * the turtle produces (`RawGeometry`), and `generate.ts` scales and renders them
 * exactly like an L-system plant. The only new thing here is the shape.
 *
 * No three.js, same as the rest of `lsystem/`.
 */

const TAU = Math.PI * 2;

/** Accumulates segments and leaves, then hands back the flat arrays. */
class Builder {
  private segS: number[] = [];
  private segE: number[] = [];
  private segR: number[] = [];
  private segD: number[] = [];
  private leafP: number[] = [];
  private leafDir: number[] = [];
  private leafSc: number[] = [];
  private leafD: number[] = [];
  private min: [number, number, number] = [Infinity, Infinity, Infinity];
  private max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  segment(a: Vec3, b: Vec3, r0: number, r1: number, depth: number): void {
    this.segS.push(a[0], a[1], a[2]);
    this.segE.push(b[0], b[1], b[2]);
    this.segR.push(r0, r1);
    this.segD.push(depth);
    this.grow(a);
    this.grow(b);
  }

  leaf(pos: Vec3, dir: Vec3, scale: number, depth: number): void {
    this.leafP.push(pos[0], pos[1], pos[2]);
    this.leafDir.push(dir[0], dir[1], dir[2]);
    this.leafSc.push(scale);
    this.leafD.push(depth);
    this.grow(pos);
  }

  private grow(p: Vec3): void {
    for (let i = 0; i < 3; i++) {
      if (p[i] < this.min[i]) this.min[i] = p[i];
      if (p[i] > this.max[i]) this.max[i] = p[i];
    }
  }

  build(): RawGeometry {
    const segmentCount = this.segD.length;
    const leafCount = this.leafD.length;
    const bounds: Bounds =
      segmentCount === 0 && leafCount === 0
        ? { min: [0, 0, 0], max: [0, 0, 0] }
        : { min: [...this.min] as Vec3, max: [...this.max] as Vec3 };
    return {
      segmentStart: Float32Array.from(this.segS),
      segmentEnd: Float32Array.from(this.segE),
      segmentRadius: Float32Array.from(this.segR),
      segmentDepth: Uint8Array.from(this.segD),
      segmentCount,
      leafPosition: Float32Array.from(this.leafP),
      leafDirection: Float32Array.from(this.leafDir),
      leafScale: Float32Array.from(this.leafSc),
      leafDepth: Uint8Array.from(this.leafD),
      leafCount,
      bounds,
    };
  }
}

function norm(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len < 1e-8) return [0, 1, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function leafSize(params: TurtleParams, rng: Rng): number {
  return params.leafScale * (1 + signed(rng) * 0.25);
}

/**
 * A grapevine: a short gnarled trunk to the wire, a cordon trained left and
 * right along it, and drooping fruiting shoots. The cordon runs along x because
 * a vineyard bed lays its vines in a row along x, so the arms line up with the
 * trellis wire and reach toward their neighbours. Leaves clothe the shoots;
 * grapes are drawn later as produce on a share of those same leaf points, and
 * because the fruiting shoots hang down, the grapes hang with them.
 */
export function generateVine(rng: Rng, params: TurtleParams): RawGeometry {
  const b = new Builder();

  // Built in a tall-ish unit space (comparable to the tree presets) so that when
  // generate.ts normalizes height to growthScale, the leaves and the grapes hung
  // on them come out the same size as everywhere else. A vine is short in the
  // world; that comes from a low height scale on the planting, not from tiny unit
  // coordinates here.
  const trunkH = 3.4;
  const trunkSteps = 4;
  let r = params.baseRadius;
  let pos: Vec3 = [0, 0, 0];
  for (let i = 0; i < trunkSteps; i++) {
    const next: Vec3 = [
      pos[0] + signed(rng) * 0.22,
      pos[1] + trunkH / trunkSteps,
      pos[2] + signed(rng) * 0.14,
    ];
    b.segment(pos, next, r, r * 0.9, 0);
    r *= 0.9;
    pos = next;
  }

  const cordonTop = pos;
  for (const dir of [1, -1]) {
    let c = cordonTop;
    let cr = r * 0.9;
    const arms = 4;
    const armLen = 1.7;
    for (let j = 0; j < arms; j++) {
      const next: Vec3 = [
        c[0] + dir * armLen,
        c[1] + signed(rng) * 0.15,
        c[2] + signed(rng) * 0.1,
      ];
      b.segment(c, next, cr, cr * 0.92, 1);
      cr *= 0.92;
      c = next;
      fruitingShoot(b, c, rng, params);
    }
  }

  return b.build();
}

/** A short shoot that hangs off the cordon, carrying a few leaves. */
function fruitingShoot(b: Builder, from: Vec3, rng: Rng, params: TurtleParams): void {
  let p = from;
  const steps = 2;
  let r = params.baseRadius * 0.3;
  const outward = signed(rng);
  for (let i = 0; i < steps; i++) {
    const next: Vec3 = [
      p[0] + outward * 0.24,
      p[1] - 0.72 - Math.abs(signed(rng)) * 0.2, // droops downward
      p[2] + signed(rng) * 0.36,
    ];
    b.segment(p, next, r, r * 0.8, 2);
    r *= 0.8;
    p = next;
    // Two grape-leaves per node, fanned; these are also where grapes will hang.
    // Thinned by vitality like any foliage, so a sick vine loses its canopy.
    for (let k = 0; k < 2; k++) {
      if (rng() >= params.leafSurvival) continue;
      const dir = norm([signed(rng), -0.3, signed(rng)]);
      const off: Vec3 = [
        p[0] + dir[0] * 0.26,
        p[1] + dir[1] * 0.1,
        p[2] + dir[2] * 0.26,
      ];
      b.leaf(off, dir, leafSize(params, rng), 2);
    }
  }
}

/**
 * A palm: a bare leaning trunk with a crown of arching fronds at the top.
 *
 * Bespoke for the same reason the vine and the topiary are — it is not
 * self-similar. A palm has no branches at all: one unbranched stem and a rosette
 * of fronds, which is the opposite of what a rewriting grammar produces, and any
 * L-system coaxed into the shape would be a grammar with the recursion turned
 * off pretending to be a tree.
 *
 * The wilt read is the interesting part. A tree sheds to bare twigs; a palm
 * loses whole fronds and the survivors droop further, so a sick palm is a short
 * ragged crown rather than a skeleton. That keeps it clear of the grey of
 * staleness in the same way the topiary's shagginess does, which is what a new
 * form has to earn before it is allowed into the vocabulary.
 */
export function generatePalm(rng: Rng, params: TurtleParams): RawGeometry {
  const b = new Builder();

  // Tall unit space, as the vine's comment explains: generate.ts normalizes
  // height to growthScale afterwards, so working small here would shrink the
  // fronds rather than the plant.
  const trunkH = 6.2;
  const steps = 7;
  // A palm leans, and the lean is fixed per plant rather than per segment so the
  // trunk curves smoothly instead of wandering.
  const lean = signed(rng) * 0.16;
  let r = params.baseRadius * 0.85;
  let pos: Vec3 = [0, 0, 0];

  for (let i = 0; i < steps; i++) {
    const t = (i + 1) / steps;
    const next: Vec3 = [
      pos[0] + lean * t * 0.9,
      pos[1] + trunkH / steps,
      pos[2] + lean * t * 0.35,
    ];
    b.segment(pos, next, r, r * 0.93, 0);
    r *= 0.93;
    pos = next;
  }

  const crown = pos;

  // Fronds radiate evenly around the crown by the golden angle, so no amount of
  // thinning leaves a bald side.
  const fronds = 11;
  for (let i = 0; i < fronds; i++) {
    if (rng() >= params.leafSurvival) continue;
    frond(b, crown, i * 2.399963 + signed(rng) * 0.2, rng, params);
  }

  return b.build();
}

/**
 * One frond: a rachis arcing up and out of the crown, then falling away, with
 * leaf instances strung along it.
 *
 * Drawn as several leaves along an arc rather than one stretched instance,
 * because a frond read at four metres is a curve and a single quad is a plank.
 */
function frond(
  b: Builder,
  crown: Vec3,
  azimuth: number,
  rng: Rng,
  params: TurtleParams,
): void {
  const out: Vec3 = [Math.cos(azimuth), 0, Math.sin(azimuth)];
  const length = 2.5 + rng() * 0.7;
  const segments = 4;

  let p = crown;
  let r = params.baseRadius * 0.22;

  for (let i = 0; i < segments; i++) {
    const t = (i + 1) / segments;
    // Up out of the crown, then over and down: the arc every frond makes.
    const rise = Math.sin(t * Math.PI * 0.62) * 1.15 - t * t * 1.5;
    const reach = (length / segments) * (1 + t * 0.25);

    const next: Vec3 = [
      p[0] + out[0] * reach,
      crown[1] + rise,
      p[2] + out[2] * reach,
    ];
    b.segment(p, next, r, r * 0.75, 1);
    r *= 0.75;

    // Leaflets down both sides of the rachis, which is what makes it read as a
    // frond rather than a bare rib.
    for (const side of [1, -1]) {
      const dir = norm([
        out[0] * 0.55 + -out[2] * side * 0.75,
        -0.35,
        out[2] * 0.55 + out[0] * side * 0.75,
      ]);
      b.leaf(
        [next[0] + dir[0] * 0.22, next[1] + dir[1] * 0.12, next[2] + dir[2] * 0.22],
        dir,
        leafSize(params, rng) * (1.25 - t * 0.4),
        1,
      );
    }
    p = next;
  }
}

export type TopiaryShape = 'sphere' | 'cone' | 'cube' | 'spiral';
const SHAPES: TopiaryShape[] = ['sphere', 'cone', 'cube', 'spiral'];

/**
 * A topiary: a short bare trunk under a mass of foliage clipped to a geometric
 * solid. The leaves tile the surface of a sphere, cone, cube, or spiral, chosen
 * per plant, so the shape reads at a distance. Health inverts here — a tended
 * topiary is crisp and full, and neglect (low vitality) is what makes it patchy
 * and sends stray shoots poking through the clipped surface — so the wilt-state
 * is shagginess, nothing like the grey of staleness or the bareness of a tree.
 */
export function generateTopiary(rng: Rng, params: TurtleParams): RawGeometry {
  const b = new Builder();
  const shape = SHAPES[Math.floor(rng() * SHAPES.length)];

  // A short trunk up to the underside of the form.
  const trunkH = 0.7;
  const radius = 1.0;
  const center: Vec3 = [0, trunkH + radius, 0];
  let r = params.baseRadius;
  let pos: Vec3 = [0, 0, 0];
  const steps = 2;
  for (let i = 0; i < steps; i++) {
    const next: Vec3 = [0, pos[1] + trunkH / steps, 0];
    b.segment(pos, next, r, r * 0.9, 0);
    r *= 0.9;
    pos = next;
  }

  // The clipped surface, as a dense shell of leaves facing outward. Vitality
  // thins them, so a neglected topiary goes see-through and patchy.
  const target = 190;
  for (let i = 0; i < target; i++) {
    if (rng() >= params.leafSurvival) continue;
    const local = surfacePoint(shape, i, target, radius, rng);
    const pointPos: Vec3 = [center[0] + local[0], center[1] + local[1], center[2] + local[2]];
    const outward = norm(local);
    b.leaf(pointPos, outward, leafSize(params, rng) * 0.9, 1);
  }

  // Neglect sends stray shoots through the surface: the shaggier the sicker.
  const strays = Math.round((1 - params.leafSurvival) * 10);
  for (let i = 0; i < strays; i++) {
    const dir = norm([signed(rng), signed(rng) * 0.6 + 0.2, signed(rng)]);
    const base: Vec3 = [
      center[0] + dir[0] * radius,
      center[1] + dir[1] * radius,
      center[2] + dir[2] * radius,
    ];
    const tip: Vec3 = [
      base[0] + dir[0] * 0.4,
      base[1] + dir[1] * 0.4,
      base[2] + dir[2] * 0.4,
    ];
    b.segment(base, tip, params.baseRadius * 0.25, params.baseRadius * 0.12, 2);
    b.leaf(tip, dir, leafSize(params, rng), 2);
  }

  return b.build();
}

/** A point on the chosen solid's surface, in local space around its centre. */
function surfacePoint(
  shape: TopiaryShape,
  i: number,
  n: number,
  radius: number,
  rng: Rng,
): Vec3 {
  switch (shape) {
    case 'sphere': {
      // Fibonacci sphere: an even scatter with no clumping at the poles.
      const y = 1 - (i / (n - 1)) * 2;
      const rad = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = i * 2.399963; // golden angle
      return [Math.cos(theta) * rad * radius, y * radius, Math.sin(theta) * rad * radius];
    }
    case 'cone': {
      const t = i / n; // 0 at base, 1 at apex
      const y = (t * 2 - 1) * radius;
      const ring = (1 - t) * radius;
      const a = i * 2.399963;
      return [Math.cos(a) * ring, y, Math.sin(a) * ring];
    }
    case 'cube': {
      // Scatter across the six faces of a cube inscribed to the radius.
      const face = i % 6;
      const u = (rng() * 2 - 1) * radius;
      const v = (rng() * 2 - 1) * radius;
      const s = radius;
      switch (face) {
        case 0: return [s, u, v];
        case 1: return [-s, u, v];
        case 2: return [u, s, v];
        case 3: return [u, -s, v];
        case 4: return [u, v, s];
        default: return [u, v, -s];
      }
    }
    case 'spiral': {
      // A tapering helix: tiers winding up to a point, the classic spiral cut.
      const t = i / n;
      const y = (t * 2 - 1) * radius;
      const turns = 4;
      const a = t * TAU * turns;
      const ring = (1 - t) * radius * 0.95 + 0.05;
      return [Math.cos(a) * ring, y, Math.sin(a) * ring];
    }
  }
}
