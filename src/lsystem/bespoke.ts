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
 * Where a vineyard's wires sit, in the vine's own unit space, and the height the
 * vine is measured against.
 *
 * These are the contract between the plant and the structure it is trained on.
 * `Trellis` reads the same fractions, so the wires it draws are the wires the
 * cordon is tied to and the shoots climb — rather than two things that happen to
 * be near each other.
 *
 * `VINE_REFERENCE` is the top wire, and it is what the vine normalizes against
 * (see `RawGeometry.referenceHeight`) rather than its own bounds. That is what
 * lets a struggling vine genuinely fall short of the top instead of being scaled
 * back up until it reaches.
 */
export const VINE_WIRES = { low: 3.0, middle: 5.4, top: 7.8 } as const;
export const VINE_REFERENCE = VINE_WIRES.top;

/** Cordon half-length, in unit space. Set against the row spacing so a trained
 *  row reaches its neighbours without growing through them. */
const CORDON_REACH = 1.9;

/**
 * A grapevine trained on a wire trellis.
 *
 * A vineyard is a structure with a plant tied to it, and the plant only makes
 * sense read against the structure: a post either side, three wires between
 * them, a trunk coming up out of the ground to the lowest wire, a cordon tied
 * along it, and shoots climbing from that cordon toward the top.
 *
 * **Health reads as reach.** A vine in good heart throws many shoots, carries
 * them to the top wire, hangs a full crop, and clothes itself in leaves; one in
 * poor heart stops short of the middle wire with fewer shoots, fewer bunches and
 * thinner foliage. Every one of those follows `leafSurvival`, which is vitality.
 * Reach is the one that needed machinery — see `VINE_REFERENCE` — and it is also
 * the one that reads from furthest away, because the row gives the eye a
 * straight line to measure every vine against.
 *
 * Fruit is not placed here. It hangs on leaf points, and the spurs below mark
 * theirs at a depth of their own so `GRAPE_STYLE.depth` can pick exactly those
 * out; see `Produce`. The spurs are deliberately spread through a band rather
 * than hung in a line, so bunches sit at varying heights the way a real crop
 * does.
 */
export function generateVine(rng: Rng, params: TurtleParams): RawGeometry {
  const b = new Builder();
  const vigour = clamp01(params.leafSurvival);
  const { low } = VINE_WIRES;

  // Trunk: out of the ground to the fruiting wire, wandering as an old stem does.
  let r = params.baseRadius;
  let pos: Vec3 = [0, 0, 0];
  const trunkSteps = 4;
  for (let i = 0; i < trunkSteps; i++) {
    const next: Vec3 = [
      pos[0] + signed(rng) * 0.18,
      pos[1] + low / trunkSteps,
      pos[2] + signed(rng) * 0.12,
    ];
    b.segment(pos, next, r, r * 0.92, 0);
    r *= 0.92;
    pos = next;
  }

  // Cordon: tied along the low wire, one arm each way down the row.
  const head = pos;
  const arms = 3;
  for (const dir of [1, -1]) {
    let c = head;
    let cr = r * 0.9;
    for (let a = 0; a < arms; a++) {
      const next: Vec3 = [
        c[0] + (dir * CORDON_REACH) / arms,
        low + signed(rng) * 0.1,
        c[2] + signed(rng) * 0.08,
      ];
      b.segment(c, next, cr, cr * 0.9, 1);
      cr *= 0.9;
      c = next;

      // Two shoots off each length of cordon, and a struggling vine throws the
      // second one only sometimes.
      climbingShoot(b, midpoint(head, next), rng, params, vigour);
      if (rng() < 0.35 + vigour * 0.65) climbingShoot(b, c, rng, params, vigour);
    }
  }

  // The crop, spread through a band about the fruiting wire rather than hung in
  // a line along it.
  const bunches = Math.round(2 + vigour * 7);
  for (let i = 0; i < bunches; i++) {
    const along = (rng() * 2 - 1) * CORDON_REACH * 0.95;
    const y = low + (rng() * 1.5 - 0.45);
    fruitingSpur(b, [along, y, signed(rng) * 0.12], rng, params);
  }

  const raw = b.build();
  return { ...raw, referenceHeight: VINE_REFERENCE };

  /** Clamp helper, local so the module keeps no state. */
  function clamp01(x: number): number {
    return x < 0 ? 0 : x > 1 ? 1 : x;
  }
}

/** Halfway between two points, for hanging a shoot along an arm. */
function midpoint(a: Vec3, b: Vec3): Vec3 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

/**
 * A fruiting spur: a stub carrying one leaf marked at a depth of its own.
 *
 * That depth is the whole point of it. Fruit is placed on leaf points, and the
 * shoots are trained upward, so anchoring on any leaf would put every bunch in
 * the top of the canopy — the one place a vineyard's fruit never is.
 * `GRAPE_STYLE.depth` picks out exactly these.
 */
function fruitingSpur(b: Builder, at: Vec3, rng: Rng, params: TurtleParams): void {
  const tip: Vec3 = [at[0] + signed(rng) * 0.1, at[1] - 0.3, at[2] + signed(rng) * 0.14];
  b.segment(at, tip, params.baseRadius * 0.16, params.baseRadius * 0.1, 3);
  b.leaf(tip, [signed(rng) * 0.4, -0.8, signed(rng) * 0.4], leafSize(params, rng) * 0.7, 3);
}

/**
 * A shoot climbing from the cordon toward the top wire, clothed in leaves and
 * catching the wires it passes with tendrils.
 *
 * How far it gets is the vine's vitality: a vine in good heart carries its
 * shoots to the top wire, a struggling one stops short of the middle. Because
 * the vine normalizes against the top wire rather than against itself, that
 * shortfall survives into the world instead of being scaled away.
 */
function climbingShoot(
  b: Builder,
  from: Vec3,
  rng: Rng,
  params: TurtleParams,
  vigour: number,
): void {
  const { low, middle, top } = VINE_WIRES;
  const reach = low + (top - low) * (0.32 + 0.68 * vigour);
  const steps = 4;
  let p = from;
  let r = params.baseRadius * 0.26;
  const lean = signed(rng) * 0.14;

  for (let i = 0; i < steps; i++) {
    const t = (i + 1) / steps;
    const next: Vec3 = [
      // Wander as well as lean. Shoots that climb on a fixed lean come out as a
      // picket fence, and a row of pickets is the one thing a vine is not.
      p[0] + lean * 0.5 + signed(rng) * 0.13,
      from[1] + (reach - from[1]) * t,
      p[2] + signed(rng) * 0.19,
    ];
    if (next[1] <= p[1]) break;
    b.segment(p, next, r, r * 0.82, 2);
    r *= 0.82;

    // A tendril where the shoot crosses a wire: this is the vine *grabbing*, and
    // it is what makes the plant read as trained rather than as standing beside
    // the trellis.
    for (const wire of [middle, top]) {
      if (p[1] < wire && next[1] >= wire) {
        const side = signed(rng) >= 0 ? 1 : -1;
        const curl: Vec3 = [next[0] + side * 0.28, wire + 0.06, next[2] + signed(rng) * 0.1];
        b.segment([next[0], wire, next[2]], curl, r * 0.5, r * 0.25, 2);
      }
    }

    p = next;
    // Leaves fan off each node. A thin vine is thin because vitality already
    // culls them in `leafSurvival`; the count here is what a full one carries.
    for (let k = 0; k < 4; k++) {
      if (rng() >= params.leafSurvival) continue;
      const dir = norm([signed(rng), 0.3, signed(rng)]);
      const off: Vec3 = [
        p[0] + dir[0] * 0.3,
        p[1] + dir[1] * 0.1,
        p[2] + dir[2] * 0.3,
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

  // The armature the clipped surface grows on. Without it the form was a single
  // shell of leaves over a two-segment trunk, so every gap in the shell showed
  // through to nothing and the whole read as leaves floating in the shape of a
  // ball rather than as a shrub someone had clipped. These are structural and
  // mostly hidden; what they do is give the gaps something to be in front of.
  const ribs = 7;
  for (let i = 0; i < ribs; i++) {
    const dir = norm([
      Math.cos((i / ribs) * Math.PI * 2),
      (i % 3) * 0.45 - 0.45,
      Math.sin((i / ribs) * Math.PI * 2),
    ]);
    // Out from the centre to just short of the surface, so no rib pokes through
    // a form that is meant to read as clipped.
    const reach = radius * 0.78;
    const tip: Vec3 = [
      center[0] + dir[0] * reach,
      center[1] + dir[1] * reach,
      center[2] + dir[2] * reach,
    ];
    b.segment(center, tip, params.baseRadius * 0.34, params.baseRadius * 0.16, 1);
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

  // A second, inner course of foliage set just under the surface. One layer
  // alone is see-through wherever two leaves fail to meet; a shell with depth
  // behind it reads solid, which is the whole point of a clipped form.
  const inner = 120;
  for (let i = 0; i < inner; i++) {
    if (rng() >= params.leafSurvival) continue;
    const local = surfacePoint(shape, i, inner, radius * 0.82, rng);
    const pointPos: Vec3 = [center[0] + local[0], center[1] + local[1], center[2] + local[2]];
    b.leaf(pointPos, norm(local), leafSize(params, rng) * 0.8, 2);
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
