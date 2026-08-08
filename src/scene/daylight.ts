import type { Vec3 } from '../lsystem/types';

/**
 * Time of day, as one vector and one palette.
 *
 * Scrubbing is the sun moving across the sky, so the sun's position cannot be a
 * constant that lighting is tuned against: it is a function of the time under
 * the cursor, and everything visible about the hour — key light, fill, fog,
 * sky gradient, stars — falls out of it. That is what makes scrubbing read as
 * time passing rather than as values changing.
 *
 * The path is a great circle rather than an almanac. A real solar position
 * needs a latitude and a date, and would buy nothing here: what has to be true
 * is that the sun rises on one side, crosses high at noon, sets on the other,
 * and that the shadows agree with the disc you can see. A tilted circle does
 * all of that and stays invertible, which is what the drag gesture needs.
 *
 * No three.js import, deliberately. This is the arithmetic behind the look, and
 * keeping it out of the renderer is what lets it be tested at a millisecond.
 */

const TAU = Math.PI * 2;

/** Solar altitude at noon. Chosen to look right, not to match a latitude. */
const PEAK_ALTITUDE = (58 * Math.PI) / 180;

const SIN_PEAK = Math.sin(PEAK_ALTITUDE);
const COS_PEAK = Math.cos(PEAK_ALTITUDE);

export const DAY_MS = 86_400_000;

/**
 * The two ends of the sun's path, as an orthonormal basis.
 *
 * `EAST` is where it rises, `NOON` is where it stands at midday: high, and over
 * the far side of the garden so plants are backlit from the default camera.
 * Every sun direction is a rotation within the plane these two span, which is
 * why a direction can be turned back into a time (see `hourAngleOf`).
 *
 * Sunrise is at negative x, which is screen left from the default camera, so
 * the sun travels left to right across the day. That is the one arbitrary
 * choice here and it is made for the gesture: dragging rightwards moves the sun
 * toward its own evening, so "drag right" and "later" agree instead of fighting.
 */
export const EAST: Vec3 = [-1, 0, 0];
export const NOON: Vec3 = [0, SIN_PEAK, -COS_PEAK];

/** Colour of moonlight and of the moon itself. Cool, and never quite white. */
export const MOON_COLOR = '#cfd9f2';

export interface Daylight {
  /** 0 at local noon, ±π at midnight, increasing through the day. */
  hourAngle: number;
  sunDirection: Vec3;
  /** Directly opposite the sun, which is where a full moon sits. */
  moonDirection: Vec3;
  /** Height of the sun above the horizon, -1..1. Everything below keys off it. */
  sunUp: number;

  zenith: string;
  horizon: string;
  sunColor: string;
  fogColor: string;
  /** Hemisphere light: sky above, bounce from the ground below. */
  skyColor: string;
  groundColor: string;

  sunIntensity: number;
  /** Takes over from the sun once it is down, so night stays readable. */
  moonIntensity: number;
  ambientIntensity: number;
  fillIntensity: number;
  /** 0..1 star visibility. */
  stars: number;
  /** 0..1 strength of the halo around the sun, gone once it has set. */
  glow: number;
}

/**
 * Local time, so the sun stands overhead when the user's clock says noon. A
 * garden read at a glance is read against the light coming through the window.
 */
export function hourAngleAt(timestamp: number): number {
  const d = new Date(timestamp);
  const seconds =
    d.getHours() * 3600 +
    d.getMinutes() * 60 +
    d.getSeconds() +
    d.getMilliseconds() / 1000;
  return (seconds / 86_400) * TAU - Math.PI;
}

/** Where the sun sits at a given hour angle. Unit length. */
export function sunDirectionFor(hourAngle: number): Vec3 {
  const s = Math.sin(hourAngle);
  const c = Math.cos(hourAngle);
  return [s, c * SIN_PEAK, -c * COS_PEAK];
}

export function sunDirectionAt(timestamp: number): Vec3 {
  return sunDirectionFor(hourAngleAt(timestamp));
}

/**
 * The inverse: which hour angle the sky is being pointed at.
 *
 * The drag gesture is only honest if grabbing the sun and moving it somewhere
 * means the time the sun would be there. Projecting the pointer direction back
 * onto the path's own basis is that inverse, and it is why the path is a plane
 * circle rather than something prettier.
 */
export function hourAngleOf(direction: Vec3): number {
  const [x, y, z] = direction;
  const sin = x; // the component along the path's rise-to-set axis
  const cos = y * NOON[1] + z * NOON[2];
  return Math.atan2(sin, cos);
}

/** Signed shortest way round from one angle to another, in (-π, π]. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

/**
 * Palette keyframes down the sun's height.
 *
 * Stops rather than formulas because the interesting part of a day is not
 * linear: the whole colour story happens in the few degrees either side of the
 * horizon, and the hours around noon barely move. The day stop holds the
 * previous fixed-daylight look exactly, so midday is unchanged by time becoming
 * a variable.
 */
interface Stop {
  up: number;
  zenith: string;
  horizon: string;
  sun: string;
  fog: string;
  sky: string;
  ground: string;
  sunIntensity: number;
  moonIntensity: number;
  ambient: number;
  fill: number;
  stars: number;
}

const STOPS: Stop[] = [
  {
    // Deep night. Dim, blue, and legible: a garden nobody can read is a garden
    // nobody checks, so moonlight keeps shape and droop visible.
    up: -1,
    zenith: '#060a16',
    horizon: '#101a2d',
    sun: '#c2d2f2',
    fog: '#111a2e',
    sky: '#6d86bd',
    ground: '#2f3d35',
    sunIntensity: 0,
    moonIntensity: 1.15,
    ambient: 0.95,
    fill: 0.22,
    stars: 1,
  },
  {
    up: -0.1,
    zenith: '#0d1430',
    horizon: '#2a2740',
    sun: '#8f7fa8',
    fog: '#22243e',
    sky: '#758ab0',
    ground: '#343f39',
    sunIntensity: 0,
    moonIntensity: 1.05,
    ambient: 0.9,
    fill: 0.22,
    stars: 0.85,
  },
  {
    // The sun on the horizon. Red light travelling through the most atmosphere,
    // and the one moment where the sky is warmer than the ground.
    up: 0,
    zenith: '#2b3566',
    horizon: '#e08a55',
    sun: '#ff9d55',
    fog: '#9c7a86',
    sky: '#6f74a0',
    ground: '#3a3a2c',
    sunIntensity: 0.5,
    moonIntensity: 0.18,
    ambient: 0.75,
    fill: 0.18,
    stars: 0.3,
  },
  {
    up: 0.12,
    zenith: '#3f6fae',
    horizon: '#f0c489',
    sun: '#ffd49a',
    fog: '#d3b294',
    sky: '#a9bcd8',
    ground: '#59622f',
    sunIntensity: 2,
    moonIntensity: 0,
    ambient: 1,
    fill: 0.35,
    stars: 0,
  },
  {
    // Full day. These are the values the daylight pass was tuned to.
    up: 0.45,
    zenith: '#2f74d6',
    horizon: '#cfe0f0',
    sun: '#fff3df',
    fog: '#c3d8ec',
    sky: '#cfe0f2',
    ground: '#5f6d3c',
    sunIntensity: 2.6,
    moonIntensity: 0,
    ambient: 1.15,
    fill: 0.5,
    stars: 0,
  },
  {
    up: 1,
    zenith: '#2f74d6',
    horizon: '#cfe0f0',
    sun: '#fff3df',
    fog: '#c3d8ec',
    sky: '#cfe0f2',
    ground: '#5f6d3c',
    sunIntensity: 2.6,
    moonIntensity: 0,
    ambient: 1.15,
    fill: 0.5,
    stars: 0,
  },
];

export function daylightFor(hourAngle: number): Daylight {
  const sunDirection = sunDirectionFor(hourAngle);
  const sunUp = sunDirection[1];

  let a = STOPS[0];
  let b = STOPS[STOPS.length - 1];
  for (let i = 0; i < STOPS.length - 1; i++) {
    if (sunUp >= STOPS[i].up && sunUp <= STOPS[i + 1].up) {
      a = STOPS[i];
      b = STOPS[i + 1];
      break;
    }
  }
  const span = b.up - a.up;
  const t = span === 0 ? 0 : clamp01((sunUp - a.up) / span);

  return {
    hourAngle,
    sunDirection,
    moonDirection: [-sunDirection[0], -sunDirection[1], -sunDirection[2]],
    sunUp,
    zenith: mixHex(a.zenith, b.zenith, t),
    horizon: mixHex(a.horizon, b.horizon, t),
    sunColor: mixHex(a.sun, b.sun, t),
    fogColor: mixHex(a.fog, b.fog, t),
    skyColor: mixHex(a.sky, b.sky, t),
    groundColor: mixHex(a.ground, b.ground, t),
    sunIntensity: lerp(a.sunIntensity, b.sunIntensity, t),
    moonIntensity: lerp(a.moonIntensity, b.moonIntensity, t),
    ambientIntensity: lerp(a.ambient, b.ambient, t),
    fillIntensity: lerp(a.fill, b.fill, t),
    stars: lerp(a.stars, b.stars, t),
    glow: smoothstep(-0.22, 0.0, sunUp),
  };
}

export function daylightAt(timestamp: number): Daylight {
  return daylightFor(hourAngleAt(timestamp));
}

/** Linear interpolate two `#rrggbb` colours. */
export function mixHex(lo: string, hi: string, t: number): string {
  const c = clamp01(t);
  const a = parseInt(lo.slice(1), 16);
  const b = parseInt(hi.slice(1), 16);
  const channel = (shift: number) => {
    const from = (a >> shift) & 255;
    const to = (b >> shift) & 255;
    return Math.round(from + (to - from) * c)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
