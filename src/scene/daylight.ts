import type { Vec3 } from '../lsystem/types';

/**
 * Time of day and time of year, as one vector and one palette.
 *
 * Scrubbing is the sun moving across the sky, so the sun's position cannot be a
 * constant that lighting is tuned against: it is a function of the time under
 * the cursor, and everything visible about the hour — key light, fill, fog,
 * sky gradient, stars — falls out of it. That is what makes scrubbing read as
 * time passing rather than as values changing.
 *
 * The path was a great circle and is now a circle with a declination, which is
 * the one change that turns a day into a year. The reasoning that said a real
 * solar position "would buy nothing" was right about latitude and wrong about
 * the date: tilt the daily circle by the sun's declination and the season
 * arrives with no new machinery at all — the arc rides high in summer and low in
 * winter, and because everything already keys off the sun's height above the
 * horizon, **the days get shorter on their own**. Nothing here had to learn what
 * a season is.
 *
 * That also settles the latitude question by accident. A noon altitude of 58° at
 * equinox is latitude 32°, so this is now a real sky over a real parallel rather
 * than a stylized one, and its winter days come out about ten hours long against
 * summer's fourteen. Both the hour and the declination stay invertible from a
 * direction, which is what the two drag gestures need.
 *
 * No three.js import, deliberately. This is the arithmetic behind the look, and
 * keeping it out of the renderer is what lets it be tested at a millisecond.
 */

const TAU = Math.PI * 2;

/**
 * Solar altitude at noon at the equinoxes. Chosen to look right; it also fixes
 * the latitude at 90° − 58° = 32°, which is what the seasonal day length is then
 * computed for.
 */
const PEAK_ALTITUDE = (58 * Math.PI) / 180;

const SIN_PEAK = Math.sin(PEAK_ALTITUDE);
const COS_PEAK = Math.cos(PEAK_ALTITUDE);

export const DAY_MS = 86_400_000;
export const YEAR_MS = 365.25 * DAY_MS;

/** Earth's axial tilt: how far the sun's arc swings either side of the equinox. */
export const SEASON_TILT = (23.44 * Math.PI) / 180;

/**
 * Day of the year the sun stands highest, in the northern hemisphere. The year
 * angle is measured from here, so the solstices are where the arc stops climbing
 * and turns back — which is the one thing about a solstice everybody knows, and
 * it is visible in the gesture.
 */
const SUMMER_SOLSTICE_DAY = 172;

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

/**
 * The axis the daily circle turns about — the celestial pole, perpendicular to
 * both ends of the path.
 *
 * This is the third direction the old two-vector basis never needed, and it is
 * the whole of the seasons: a declination is a tilt of the day's circle toward
 * this axis. Because it is perpendicular to the plane the hour angle is measured
 * in, tilting toward it cannot disturb the hour — which is what lets the two
 * gestures share one object without interfering.
 */
export const POLE: Vec3 = [0, COS_PEAK, SIN_PEAK];

/** Colour of moonlight and of the moon itself. Cool, and never quite white. */
export const MOON_COLOR = '#cfd9f2';

export interface Daylight {
  /** 0 at local noon, ±π at midnight, increasing through the day. */
  hourAngle: number;
  /**
   * The sun's declination, ±`SEASON_TILT`. Positive is summer: the arc rides
   * high and the day is long.
   */
  declination: number;
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

/**
 * How far round the year a timestamp sits, in radians from the summer solstice.
 * The declination is the cosine of it, so this is the angle the season gesture
 * moves and the declination is what you see it do.
 */
export function yearAngleAt(timestamp: number): number {
  const date = new Date(timestamp);
  const start = new Date(date.getFullYear(), 0, 0).getTime();
  const dayOfYear = (date.getTime() - start) / DAY_MS;
  return ((dayOfYear - SUMMER_SOLSTICE_DAY) / 365.25) * TAU;
}

/** The sun's declination at a moment: `+TILT` at midsummer, `−TILT` at midwinter. */
export function declinationAt(timestamp: number): number {
  return SEASON_TILT * Math.cos(yearAngleAt(timestamp));
}

/** The declination a year angle stands at. The inverse is deliberately absent:
 *  a declination maps to two dates a year, which is why the gesture tracks the
 *  angle it has travelled rather than reading a date off the sun's height. */
export function declinationFor(yearAngle: number): number {
  return SEASON_TILT * Math.cos(yearAngle);
}

/**
 * Where the sun sits at a given hour angle and declination. Unit length.
 *
 * The daily circle is spun about the pole: at declination zero this is the old
 * great circle exactly, and a tilt lifts the whole arc toward the pole without
 * touching the axis the hour is measured on.
 */
export function sunDirectionFor(hourAngle: number, declination = 0): Vec3 {
  const s = Math.sin(hourAngle);
  const c = Math.cos(hourAngle);
  const cd = Math.cos(declination);
  const sd = Math.sin(declination);
  return [
    cd * s,
    cd * c * SIN_PEAK + sd * POLE[1],
    -cd * c * COS_PEAK + sd * POLE[2],
  ];
}

export function sunDirectionAt(timestamp: number): Vec3 {
  return sunDirectionFor(hourAngleAt(timestamp), declinationAt(timestamp));
}

/**
 * Hours of daylight at a declination — the part of the circle that clears the
 * horizon. Not read by the renderer, which gets it for free from the sun's
 * height; it exists so the seasons can be asserted in a test as hours rather
 * than as a vector nobody can picture.
 */
export function dayLengthFor(declination: number): number {
  // sunUp > 0 ⟺ cos(h) > −tan(declination) / tan(peak).
  const ratio = -Math.tan(declination) / (SIN_PEAK / COS_PEAK);
  if (ratio <= -1) return 24;
  if (ratio >= 1) return 0;
  return (Math.acos(ratio) / Math.PI) * 24;
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

/**
 * The other inverse: how far out of the day's plane the sky is being pointed.
 *
 * Both components of a tilted direction scale by the same cosine, so `atan2`
 * above is untouched by declination and this reads the part it discards. That
 * orthogonality is the reason one object can carry two gestures: dragging along
 * the arc cannot change the season, and dragging across it cannot change the
 * hour.
 */
export function declinationOf(direction: Vec3): number {
  const [x, y, z] = direction;
  const length = Math.hypot(x, y, z) || 1;
  const alongPole = (y * POLE[1] + z * POLE[2]) / length;
  return Math.asin(clamp(alongPole, -1, 1));
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

export function daylightFor(hourAngle: number, declination = 0): Daylight {
  const sunDirection = sunDirectionFor(hourAngle, declination);
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
    declination,
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
  return daylightFor(hourAngleAt(timestamp), declinationAt(timestamp));
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

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}
