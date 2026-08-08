import type { Bounds, PlantGeometry, TurtleParams, Vec3 } from './types';
import { signed, type Rng } from './random';

const DEG = Math.PI / 180;
const MAX_DEPTH = 255;

/**
 * Turtle state. The orientation is an explicit orthonormal frame rather than a
 * quaternion so the module stays free of three.js and stays readable when the
 * gravity bend is applied.
 *
 * Convention: cross(H, L) === U.
 */
interface TurtleState {
  pos: [number, number, number];
  h: [number, number, number];
  l: [number, number, number];
  u: [number, number, number];
  depth: number;
  radius: number;
}

export type RawGeometry = Omit<PlantGeometry, 'symbolCount' | 'truncated'>;

/**
 * Walks the expanded symbol string and writes straight into typed arrays.
 *
 * Capacity is exact rather than guessed: the string contains one segment per F
 * and at most one leaf per J, so both arrays are sized before the walk and
 * nothing reallocates. Only the leaf arrays are trimmed at the end, because
 * vitality kills some leaves as they are placed.
 */
export function interpret(
  symbols: string,
  params: TurtleParams,
  rng: Rng,
): RawGeometry {
  let segmentCapacity = 0;
  let leafCapacity = 0;
  for (const ch of symbols) {
    if (ch === 'F') segmentCapacity++;
    else if (ch === 'J') leafCapacity++;
  }

  const segmentStart = new Float32Array(segmentCapacity * 3);
  const segmentEnd = new Float32Array(segmentCapacity * 3);
  const segmentRadius = new Float32Array(segmentCapacity * 2);
  const segmentDepth = new Uint8Array(segmentCapacity);

  const leafPosition = new Float32Array(leafCapacity * 3);
  const leafDirection = new Float32Array(leafCapacity * 3);
  const leafScale = new Float32Array(leafCapacity);
  const leafDepth = new Uint8Array(leafCapacity);

  let segmentCount = 0;
  let leafCount = 0;

  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  const state: TurtleState = {
    pos: [0, 0, 0],
    h: [0, 1, 0],
    l: [-1, 0, 0],
    u: [0, 0, 1],
    depth: 0,
    radius: params.baseRadius,
  };

  const stack: TurtleState[] = [];
  const angle = params.angleDeg * DEG;
  growBounds(min, max, state.pos);

  for (const ch of symbols) {
    switch (ch) {
      case 'F':
      case 'f': {
        const step =
          params.stepLength * Math.pow(params.lengthFalloff, state.depth);
        const sx = state.pos[0];
        const sy = state.pos[1];
        const sz = state.pos[2];

        state.pos[0] += state.h[0] * step;
        state.pos[1] += state.h[1] * step;
        state.pos[2] += state.h[2] * step;

        if (ch === 'F') {
          const i3 = segmentCount * 3;
          segmentStart[i3] = sx;
          segmentStart[i3 + 1] = sy;
          segmentStart[i3 + 2] = sz;
          segmentEnd[i3] = state.pos[0];
          segmentEnd[i3 + 1] = state.pos[1];
          segmentEnd[i3 + 2] = state.pos[2];

          segmentRadius[segmentCount * 2] = state.radius;
          state.radius *= params.taper;
          segmentRadius[segmentCount * 2 + 1] = state.radius;

          segmentDepth[segmentCount] = Math.min(state.depth, MAX_DEPTH);
          segmentCount++;
        }

        applyGravity(state, params.gravity);
        growBounds(min, max, state.pos);
        break;
      }

      case '+':
        rotate(state, state.u, turn(angle, params.jitter, rng));
        break;
      case '-':
        rotate(state, state.u, -turn(angle, params.jitter, rng));
        break;
      case '&':
        rotate(state, state.l, turn(angle, params.jitter, rng));
        break;
      case '^':
        rotate(state, state.l, -turn(angle, params.jitter, rng));
        break;
      case '\\':
        rotate(state, state.h, turn(angle, params.jitter, rng));
        break;
      case '/':
        rotate(state, state.h, -turn(angle, params.jitter, rng));
        break;
      case '|':
        rotate(state, state.u, Math.PI);
        break;

      case '[':
        stack.push(cloneState(state));
        state.depth += 1;
        break;

      case ']': {
        const restored = stack.pop();
        if (restored) {
          state.pos = restored.pos;
          state.h = restored.h;
          state.l = restored.l;
          state.u = restored.u;
          state.depth = restored.depth;
          state.radius = restored.radius;
        }
        break;
      }

      case 'J': {
        // Foliage thins with vitality. Decided here so a discarded leaf is
        // never written in the first place.
        if (rng() >= params.leafSurvival) break;
        const i3 = leafCount * 3;
        leafPosition[i3] = state.pos[0];
        leafPosition[i3 + 1] = state.pos[1];
        leafPosition[i3 + 2] = state.pos[2];
        leafDirection[i3] = state.h[0];
        leafDirection[i3 + 1] = state.h[1];
        leafDirection[i3 + 2] = state.h[2];
        leafScale[leafCount] = params.leafScale * (1 + signed(rng) * 0.25);
        leafDepth[leafCount] = Math.min(state.depth, MAX_DEPTH);
        leafCount++;
        break;
      }

      default:
        // Production variables (A, B, X and friends) draw nothing.
        break;
    }
  }

  const bounds: Bounds =
    segmentCount === 0
      ? // Degenerate grammar. A well-formed zero box, so callers that divide by
        // height do not produce NaN.
        { min: [0, 0, 0], max: [0, 0, 0] }
      : { min: [...min] as Vec3, max: [...max] as Vec3 };

  return {
    segmentStart,
    segmentEnd,
    segmentRadius,
    segmentDepth,
    segmentCount,
    leafPosition: leafPosition.slice(0, leafCount * 3),
    leafDirection: leafDirection.slice(0, leafCount * 3),
    leafScale: leafScale.slice(0, leafCount),
    leafDepth: leafDepth.slice(0, leafCount),
    leafCount,
    bounds,
  };
}

function turn(angle: number, jitter: number, rng: Rng): number {
  return jitter === 0 ? angle : angle * (1 + signed(rng) * jitter);
}

/** Rodrigues rotation of the whole frame about one of its own axes. */
function rotate(
  state: TurtleState,
  axis: [number, number, number],
  theta: number,
): void {
  const k: [number, number, number] = [axis[0], axis[1], axis[2]];
  state.h = rodrigues(state.h, k, theta);
  state.l = rodrigues(state.l, k, theta);
  state.u = rodrigues(state.u, k, theta);
  orthonormalize(state);
}

function rodrigues(
  v: [number, number, number],
  k: [number, number, number],
  theta: number,
): [number, number, number] {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const kv = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
  const cross: [number, number, number] = [
    k[1] * v[2] - k[2] * v[1],
    k[2] * v[0] - k[0] * v[2],
    k[0] * v[1] - k[1] * v[0],
  ];
  return [
    v[0] * c + cross[0] * s + k[0] * kv * (1 - c),
    v[1] * c + cross[1] * s + k[1] * kv * (1 - c),
    v[2] * c + cross[2] * s + k[2] * kv * (1 - c),
  ];
}

/** Bends the heading toward -Y. A vertical heading is unaffected, which is why
 *  trunks stay upright while side branches droop. */
function applyGravity(state: TurtleState, gravity: number): void {
  if (gravity === 0) return;
  state.h = [state.h[0], state.h[1] - gravity, state.h[2]];
  orthonormalize(state);
}

/** Gram-Schmidt. Kills the floating point drift that accumulates over a few
 *  thousand rotations and would otherwise skew the frame. */
function orthonormalize(state: TurtleState): void {
  state.h = normalize(state.h);
  const hu =
    state.h[0] * state.u[0] + state.h[1] * state.u[1] + state.h[2] * state.u[2];
  state.u = normalize([
    state.u[0] - state.h[0] * hu,
    state.u[1] - state.h[1] * hu,
    state.u[2] - state.h[2] * hu,
  ]);
  state.l = [
    state.u[1] * state.h[2] - state.u[2] * state.h[1],
    state.u[2] * state.h[0] - state.u[0] * state.h[2],
    state.u[0] * state.h[1] - state.u[1] * state.h[0],
  ];
}

function normalize(v: [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len < 1e-8) return [0, 1, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function cloneState(s: TurtleState): TurtleState {
  return {
    pos: [s.pos[0], s.pos[1], s.pos[2]],
    h: [s.h[0], s.h[1], s.h[2]],
    l: [s.l[0], s.l[1], s.l[2]],
    u: [s.u[0], s.u[1], s.u[2]],
    depth: s.depth,
    radius: s.radius,
  };
}

function growBounds(
  min: [number, number, number],
  max: [number, number, number],
  p: readonly [number, number, number],
): void {
  for (let i = 0; i < 3; i++) {
    if (p[i] < min[i]) min[i] = p[i];
    if (p[i] > max[i]) max[i] = p[i];
  }
}
