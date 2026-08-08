import * as THREE from 'three';

/**
 * Ambient motion, ported from the desk-bonsai look-dev sketch.
 *
 * A plant sways as one rigid body leaning about its base, not as an articulated
 * skeleton. That is deliberate: the scene bakes every branch of every plant into
 * a single InstancedMesh (see Branches.tsx), so there is no per-branch transform
 * to animate. A rigid lean keeps all the joints intact and still reads as life,
 * because geometry grows up from a local origin at y=0, so the tips sit farthest
 * from the pivot and move most. Branches and foliage call this with the same id
 * and time, get the same matrix, and stay glued together.
 *
 * ponytail: recomputes instance matrices on the CPU each frame. Fine for the
 * first scene's ~15 plants; past ~100, push the lean into a vertex shader keyed
 * on instance height, the same ceiling ARCHITECTURE.md names for generation.
 */

const REDUCED =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
/** Global damping so the whole scene calms down for reduced-motion users. */
export const MOTION = REDUCED ? 0.25 : 1;

/** Summed incommensurate sines: cheap organic noise that never quite repeats. */
function osc(t: number, phase: number): number {
  return (
    Math.sin(t * 0.61 + phase) * 0.6 +
    Math.sin(t * 1.03 + phase * 1.7) * 0.28 +
    Math.sin(t * 1.87 + phase * 0.5) * 0.12
  );
}

/** Deterministic phase per node id, so a plant always sways the same way. */
function phaseOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) / 4294967296) * Math.PI * 2;
}

/** Constant so activity can never leak into a sine frequency. See swayMatrix. */
const BREATH_FREQ = 0.8;

/** Slows the whole sway. Lower is calmer; the look-dev sketch ran near 1.0. */
const SWAY_SPEED = 0.45;

/** Seconds for an animated value to catch up to a telemetry step. */
const SMOOTH_TAU = 1.0;

/**
 * Eases a per-plant scalar toward its latest telemetry value instead of letting
 * it step.
 *
 * Telemetry arrives in discrete ticks. Both sway amplitude (activity) and droop
 * (vitality) are driven by those values, so a raw step would jump every plant at
 * once, a synchronized twitch every tick that reads as a jerk even though no
 * frame is dropped. Branches and Foliage call these per frame with the same id,
 * target, and time; the first advances the smoothing, the second reads the same
 * value, so the two meshes never diverge.
 */
function ease(
  store: Map<string, { t: number; value: number }>,
  id: string,
  target: number,
  t: number,
): number {
  let s = store.get(id);
  if (!s) {
    s = { t, value: target };
    store.set(id, s);
  } else if (t > s.t) {
    const dt = Math.min(t - s.t, 0.1);
    s.value += (target - s.value) * (1 - Math.exp(-dt / SMOOTH_TAU));
    s.t = t;
  }
  return s.value;
}

const activityStore = new Map<string, { t: number; value: number }>();
const vitalityStore = new Map<string, { t: number; value: number }>();

export const smoothActivity = (id: string, target: number, t: number): number =>
  ease(activityStore, id, target, t);

export const smoothVitality = (id: string, target: number, t: number): number =>
  ease(vitalityStore, id, target, t);

/**
 * How far a point sags under wilt, from its local position and the plant's
 * vitality. Sag grows with horizontal distance from the trunk, so the trunk
 * stays planted and outer branches droop, the classic wilt read. A pure function
 * of position, so connected endpoints (shared coordinates) sag identically and
 * branches never come apart.
 *
 * Vitality, not signalHealth: a thriving weed should stand tall (upright is the
 * alarm), a dying one should droop, regardless of polarity. Colour carries the
 * polarity inversion; shape carries raw vigour.
 */
const DROOP_STRENGTH = 0.9;

export function droopSag(x: number, z: number, vitality: number): number {
  const v = vitality < 0 ? 0 : vitality > 1 ? 1 : vitality;
  return DROOP_STRENGTH * (1 - v) * Math.hypot(x, z);
}

const euler = new THREE.Euler();
const scale = new THREE.Vector3();

/**
 * Rigid lean + breathing about the plant base. Activity rides on top of a
 * nonzero ambient floor, so a dormant plant still breathes rather than freezing.
 *
 * Pure: the caller passes a pre-smoothed activity (see smoothActivity), so a
 * telemetry step eases in rather than snapping the amplitude.
 */
export function swayMatrix(
  out: THREE.Matrix4,
  id: string,
  activity: number,
  t: number,
): void {
  const phase = phaseOf(id);
  const ts = t * SWAY_SPEED;
  const amp = (0.015 + activity * 0.05) * MOTION; // radians of lean
  const ax = osc(ts, phase) * amp;
  const az = osc(ts * 0.93, phase + 1.3) * amp;
  // Frequencies must never depend on activity either: the argument of a sine is
  // t times the frequency, so a step would jump the phase by t * delta-frequency,
  // a snap that grows with elapsed time. Activity touches amplitude only.
  const breath = Math.sin(ts * BREATH_FREQ + phase) * (0.004 + activity * 0.006) * MOTION;

  euler.set(ax, 0, az, 'ZXY');
  out.makeRotationFromEuler(euler);
  const b = 1 + breath;
  scale.set(b, b, b);
  out.scale(scale);
}
