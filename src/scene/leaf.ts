import * as THREE from 'three';

/**
 * A leaf with an outline, a midrib, and a fold.
 *
 * Every leaf in the garden was a solid — an octahedron squashed flat, a cone for
 * a needle, an icosahedron for a petal — picked because a closed solid reads
 * from any angle and costs six vertices. What it cannot do is look like a leaf.
 * A diamond has its widest point exactly halfway along and two straight edges
 * meeting at a blunt corner, so a canopy of them reads as a heap of angular
 * chips: the one thing a real canopy never looks like.
 *
 * This is the blade that replaces it, and it stays inside the instancing budget
 * `docs/graphics.md` sets. Eleven vertices and twelve triangles against the
 * octahedron's six and eight — half again as much geometry for a shape with a
 * shoulder, a point, a channel along its midrib, and a curl at the tip. The
 * detail is in *where* the vertices are, not in how many, which is the only kind
 * of leaf improvement that survives being multiplied by every leaf in a garden.
 *
 * Three properties carry the whole difference:
 *
 * **A shoulder.** The blade swells quickly from the base to its widest point,
 * then tapers to a tip. Where that widest point sits is most of what separates
 * one leaf from another — an ovate broadleaf carries it low, a willow's lance
 * carries it lower still and runs long past it.
 *
 * **A fold.** The edges lift away from the midrib, so the blade is a shallow
 * channel rather than a plane. This is what makes a leaf catch light along one
 * edge and fall into shade along the other instead of flashing as a flat card,
 * and it is why the blade wants smooth shading where the old solid wanted flat.
 *
 * **A curl.** The tip bends out of the plane of the base. Nothing in a plant is
 * flat, and a canopy of perfectly planar leaves reads as printed rather than
 * grown.
 *
 * All three are signal-free in the terms `DESIGN.md` sets, and deliberately so:
 * they are fixed per leaf *kind*, which is a property of the archetype and hence
 * of the bed's planting, never of a vital. Health still reads exactly where it
 * read before — through how many leaves survive and how far the plant droops —
 * and a better-shaped leaf does not make a sick plant look well, because a sick
 * plant's leaves are missing rather than misshapen.
 */

/** The shape of one leaf kind, in the blade's own normalized space. */
export interface LeafProfile {
  /**
   * Where the blade is widest, 0 at the base and 1 at the tip. Below a half is
   * a leaf that swells early and tapers long, which is most leaves.
   */
  shoulder: number;
  /**
   * How far the edges lift off the midrib, as a fraction of the half-width
   * there. Zero is a flat card.
   */
  cup: number;
  /** How far the tip bends out of the plane of the base. */
  curl: number;
  /**
   * How sharply the blade narrows past the shoulder. Below 1 runs out to a long
   * drawn point; above 1 stays broad and ends bluntly.
   */
  taper: number;
}

/**
 * Half the blade's width a fraction `t` along it.
 *
 * A quarter-sine up to the shoulder, so the blade swells off the base smoothly
 * rather than flaring at a corner; a power curve down from it to the tip, so the
 * point is drawn rather than snipped off. One at the shoulder by construction on
 * both sides, which is what keeps the two halves meeting without a kink.
 */
export function bladeHalfWidth(t: number, profile: LeafProfile): number {
  const clamped = Math.min(1, Math.max(0, t));
  if (clamped <= profile.shoulder) {
    if (profile.shoulder <= 0) return 1;
    return Math.sin((Math.PI / 2) * (clamped / profile.shoulder));
  }
  if (profile.shoulder >= 1) return 1;
  const past = (1 - clamped) / (1 - profile.shoulder);
  return Math.pow(past, profile.taper);
}

/**
 * How far the midrib has bent out of the base's plane a fraction `t` along.
 *
 * Quadratic, so the base leaves the twig flat and the bend accumulates toward
 * the tip — a leaf hinges near its end, not at its stalk.
 */
export function midribLift(t: number, profile: LeafProfile): number {
  return profile.curl * t * t;
}

/** How far an edge sits above the midrib beside it. Proportional to the width
 *  there, so the channel closes as the blade narrows to its point. */
export function edgeLift(t: number, profile: LeafProfile): number {
  return profile.cup * bladeHalfWidth(t, profile);
}

/** How many rows of vertices a blade is built from, base and tip included. */
export const BLADE_ROWS = 5;

export interface BladeMesh {
  /** `3 * vertexCount`, laid out x, y, z. */
  positions: Float32Array;
  /** Triangle corners, three indices each. */
  indices: Uint16Array;
  /** `2 * vertexCount`. `u` across the blade, `v` from base to tip. */
  uvs: Float32Array;
  vertexCount: number;
}

/**
 * The blade as plain arrays, with no renderer in sight.
 *
 * The blade runs from `y = -1` at the base, where it meets the twig, to `y = 1`
 * at the tip. That is the span the old solids had, which is the point: every
 * per-kind aspect and every vitality-driven leaf scale downstream was tuned
 * against it, so keeping it means the new shape drops in without any of that
 * tuning moving.
 *
 * Rows run base to tip. The first and last carry a single vertex — a leaf comes
 * to a point at both ends — and every row between carries three: left edge,
 * midrib, right edge. So the strip is stitched as two quads per gap in the
 * middle and one triangle per side at each end.
 */
export function bladeMesh(profile: LeafProfile, rows = BLADE_ROWS): BladeMesh {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Where each row's vertices start, so the stitching below can address them
  // without knowing which rows are points and which are triples.
  const rowStart: number[] = [];
  const rowWidth: number[] = [];

  for (let r = 0; r < rows; r++) {
    const t = r / (rows - 1);
    const y = t * 2 - 1;
    const halfWidth = bladeHalfWidth(t, profile);
    const lift = midribLift(t, profile);
    rowStart.push(positions.length / 3);

    if (halfWidth <= 1e-6) {
      // A point: base or tip.
      positions.push(0, y, lift);
      uvs.push(0.5, t);
      rowWidth.push(1);
      continue;
    }
    const edge = lift + edgeLift(t, profile);
    positions.push(-halfWidth, y, edge, 0, y, lift, halfWidth, y, edge);
    uvs.push(0, t, 0.5, t, 1, t);
    rowWidth.push(3);
  }

  for (let r = 0; r < rows - 1; r++) {
    const a = rowStart[r];
    const b = rowStart[r + 1];
    const wa = rowWidth[r];
    const wb = rowWidth[r + 1];

    if (wa === 1 && wb === 3) {
      // Base point fanning into the first full row.
      indices.push(a, b + 1, b, a, b + 2, b + 1);
    } else if (wa === 3 && wb === 1) {
      // Last full row closing into the tip.
      indices.push(a, a + 1, b, a + 1, a + 2, b);
    } else if (wa === 3 && wb === 3) {
      // Two quads, one either side of the midrib.
      indices.push(a, a + 1, b + 1, a, b + 1, b);
      indices.push(a + 1, a + 2, b + 2, a + 1, b + 2, b + 1);
    } else {
      // Two points in a row: a degenerate blade with nothing between them.
      indices.push(a, b, b);
    }
  }

  return {
    positions: new Float32Array(positions),
    indices: new Uint16Array(indices),
    uvs: new Float32Array(uvs),
    vertexCount: positions.length / 3,
  };
}

/** The blade as geometry ready to instance. Normals are computed from the
 *  stitched surface, so the fold and the curl light as the curves they are. */
export function bladeGeometry(profile: LeafProfile, rows = BLADE_ROWS): THREE.BufferGeometry {
  const mesh = bladeMesh(profile, rows);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(mesh.uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The profiles, one per leaf kind that wears a blade.
 *
 * `needle` is deliberately absent. A conifer needle really is a spike with no
 * blade, no shoulder and no fold, and the cone it is already drawn with is the
 * honest shape for it — giving it a leaf outline would be fidelity spent making
 * something less true.
 */
export const LEAF_PROFILES = {
  /** The default hardwood leaf: ovate, widest low, a clear point. */
  broad: { shoulder: 0.38, cup: 0.3, curl: 0.34, taper: 0.8 },
  /** The willow's lance: narrow, widest very low, running out to a long tip. */
  blade: { shoulder: 0.28, cup: 0.2, curl: 0.5, taper: 0.65 },
  /** A weed's small leaf: nearly round, deeply cupped, barely pointed. */
  round: { shoulder: 0.5, cup: 0.36, curl: 0.16, taper: 1.3 },
  /** A petal: broad, blunt, and strongly cupped, so a head of them reads as a
   *  flower rather than as a rosette of small leaves. */
  bloom: { shoulder: 0.56, cup: 0.46, curl: 0.28, taper: 1.15 },
  /** A palm leaflet: nearly parallel-sided down its length, faintly folded
   *  along the midrib the way a real frond's leaflets are. */
  frond: { shoulder: 0.22, cup: 0.16, curl: 0.22, taper: 0.5 },
} as const satisfies Record<string, LeafProfile>;

export type BladeKind = keyof typeof LEAF_PROFILES;
