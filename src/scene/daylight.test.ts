import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  EAST,
  NOON,
  SEASON_TILT,
  angleDelta,
  dayLengthFor,
  daylightAt,
  daylightFor,
  declinationAt,
  declinationOf,
  hourAngleAt,
  hourAngleOf,
  mixHex,
  sunDirectionAt,
  sunDirectionFor,
} from './daylight';
import type { Vec3 } from '../lsystem/types';

/**
 * Times are built with the local Date constructor on purpose. The sun is placed
 * against the user's own clock, so a test that pinned UTC would pass in one
 * timezone and fail in another for reasons that have nothing to do with the
 * arithmetic.
 */
const at = (hour: number, minute = 0) =>
  new Date(2024, 5, 12, hour, minute, 0, 0).getTime();

const length = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe('the sun path', () => {
  it('is noon overhead, midnight underfoot', () => {
    expect(hourAngleAt(at(12))).toBeCloseTo(0, 6);
    expect(Math.abs(hourAngleAt(at(0)))).toBeCloseTo(Math.PI, 6);
  });

  it('rises on the left and sets on the right, so dragging right is later', () => {
    // Six and eighteen are dawn and dusk at an equinox only. In June the sun is
    // well up by six, which is the season doing its job, so the horizon claim is
    // made at declination zero and the direction claim is made all year.
    const dawn = sunDirectionFor(hourAngleAt(at(6)));
    const dusk = sunDirectionFor(hourAngleAt(at(18)));

    expect(dawn[0]).toBeCloseTo(-1, 6);
    expect(dawn[1]).toBeCloseTo(0, 6);
    expect(dusk[0]).toBeCloseTo(1, 6);
    expect(dusk[1]).toBeCloseTo(0, 6);

    // The property the gesture rests on: x rises monotonically through the day,
    // so a rightward drag can never mean going back in time. A declination
    // scales x by a positive cosine and so cannot break it.
    for (let hour = 7; hour <= 17; hour++) {
      expect(sunDirectionAt(at(hour))[0]).toBeGreaterThan(
        sunDirectionAt(at(hour - 1))[0],
      );
    }
  });

  it('stands highest at noon and lowest at midnight', () => {
    // Held as an ordering, which is true in every season. The absolute heights
    // are a fact about the date: at an equinox noon reaches sin(58°) and
    // midnight drops as far the other way, and in June both are lifted.
    expect(sunDirectionAt(at(12))[1]).toBeGreaterThan(0.8);
    expect(sunDirectionAt(at(0))[1]).toBeLessThan(-0.5);
    expect(sunDirectionAt(at(9))[1]).toBeLessThan(sunDirectionAt(at(11))[1]);
    expect(sunDirectionAt(at(15))[1]).toBeLessThan(sunDirectionAt(at(13))[1]);

    expect(sunDirectionFor(0)[1]).toBeCloseTo(Math.sin((58 * Math.PI) / 180), 6);
    expect(sunDirectionFor(Math.PI)[1]).toBeCloseTo(
      -Math.sin((58 * Math.PI) / 180),
      6,
    );
  });

  it('is above the horizon by day and below it by night', () => {
    for (const hour of [7, 9, 12, 15, 17]) {
      expect(sunDirectionAt(at(hour))[1]).toBeGreaterThan(0);
    }
    for (const hour of [0, 2, 4, 20, 22]) {
      expect(sunDirectionAt(at(hour))[1]).toBeLessThan(0);
    }
  });

  it('stays a unit vector all the way round', () => {
    for (let h = -Math.PI; h < Math.PI; h += 0.2) {
      expect(length(sunDirectionFor(h))).toBeCloseTo(1, 6);
    }
  });

  it('travels on the plane its two ends span', () => {
    // EAST and NOON are orthonormal, so every direction on the path has no
    // component outside them. This is the property the drag gesture inverts.
    expect(dot(EAST, NOON)).toBeCloseTo(0, 6);
    for (let h = -Math.PI; h < Math.PI; h += 0.3) {
      const d = sunDirectionFor(h);
      const inPlane = dot(d, EAST) ** 2 + dot(d, NOON) ** 2;
      expect(inPlane).toBeCloseTo(1, 6);
    }
  });

  it('sits over the far side of the garden at noon, so plants are backlit', () => {
    expect(sunDirectionAt(at(12))[2]).toBeLessThan(0);
  });
});

describe('hourAngleOf', () => {
  it('inverts the path exactly', () => {
    for (let h = -Math.PI + 0.01; h < Math.PI; h += 0.17) {
      expect(hourAngleOf(sunDirectionFor(h))).toBeCloseTo(h, 6);
    }
  });

  it('reads the moon as half a turn from the sun', () => {
    const h = 0.7;
    const sun = sunDirectionFor(h);
    const moon: Vec3 = [-sun[0], -sun[1], -sun[2]];
    expect(Math.abs(angleDelta(hourAngleOf(moon), h))).toBeCloseTo(Math.PI, 6);
  });

  it('is unchanged by how far away the pointer ray reaches', () => {
    const d = sunDirectionFor(-0.9);
    const far: Vec3 = [d[0] * 87, d[1] * 87, d[2] * 87];
    expect(hourAngleOf(far)).toBeCloseTo(hourAngleOf(d), 6);
  });

  it('projects a direction off the path onto the nearest hour', () => {
    // A pointer never lands exactly on the path. Nudging a noon direction
    // sideways must still read as around noon rather than as nothing.
    const d = sunDirectionFor(0);
    const off: Vec3 = [d[0] + 0.15, d[1], d[2]];
    expect(Math.abs(hourAngleOf(off))).toBeLessThan(0.25);
  });
});

describe('angleDelta', () => {
  it('takes the short way round', () => {
    expect(angleDelta(0.1, 0.4)).toBeCloseTo(0.3, 6);
    expect(angleDelta(0.4, 0.1)).toBeCloseTo(-0.3, 6);
  });

  it('crosses the seam without a full turn of travel', () => {
    // Dragging the sun through midnight is one continuous motion, and an
    // unwrapped subtraction here would jump the cursor by a whole day.
    const before = Math.PI - 0.05;
    const after = -Math.PI + 0.05;
    expect(angleDelta(before, after)).toBeCloseTo(0.1, 6);
    expect(angleDelta(after, before)).toBeCloseTo(-0.1, 6);
  });

  it('accumulates a full day over a full turn', () => {
    let travelled = 0;
    let last = hourAngleAt(at(0));
    for (let minutes = 30; minutes <= 24 * 60; minutes += 30) {
      const angle = hourAngleAt(at(0) + minutes * 60_000);
      travelled += angleDelta(last, angle);
      last = angle;
    }
    const elapsed = (travelled / (Math.PI * 2)) * DAY_MS;
    expect(elapsed).toBeCloseTo(DAY_MS, -3);
  });
});

describe('daylight palette', () => {
  it('holds the tuned daylight look through the middle of the day', () => {
    const noon = daylightAt(at(12));
    expect(noon.zenith).toBe('#2f74d6');
    expect(noon.sunIntensity).toBeCloseTo(2.6, 6);
    expect(noon.ambientIntensity).toBeCloseTo(1.15, 6);
    expect(noon.stars).toBe(0);
    expect(noon.moonIntensity).toBe(0);
  });

  it('hands the key light to the moon once the sun is down', () => {
    const night = daylightAt(at(1));
    expect(night.sunIntensity).toBe(0);
    expect(night.moonIntensity).toBeGreaterThan(0.3);
    expect(night.stars).toBeGreaterThan(0.8);
    expect(night.glow).toBe(0);
  });

  it('never goes fully dark, because an unreadable garden is unchecked', () => {
    for (const hour of [0, 2, 3, 22]) {
      const dark = daylightAt(at(hour));
      expect(dark.ambientIntensity).toBeGreaterThan(0.4);
      expect(dark.moonIntensity + dark.sunIntensity).toBeGreaterThan(0.3);
    }
  });

  it('warms the sun through the last hour of light', () => {
    // Sunset is 18:00 on this path, so 17:30 is the low sun and 19:00 is night.
    const dusk = daylightAt(at(17, 30)).sunColor;
    expect(channel(dusk, 0) - channel(dusk, 2)).toBeGreaterThan(60);

    const noon = daylightAt(at(12)).sunColor;
    expect(channel(noon, 0) - channel(noon, 2)).toBeLessThan(40);
  });

  it('puts the moon exactly opposite the sun', () => {
    const d = daylightFor(0.4);
    expect(d.moonDirection[0]).toBeCloseTo(-d.sunDirection[0], 6);
    expect(d.moonDirection[1]).toBeCloseTo(-d.sunDirection[1], 6);
    expect(d.moonDirection[2]).toBeCloseTo(-d.sunDirection[2], 6);
  });

  it('moves every channel continuously, so a scrub never flickers', () => {
    // A step in the light while dragging would read as a rendering fault rather
    // than as time passing. The bounds are sized against each channel's full
    // range, not against taste: they are here to catch a discontinuity (a stop
    // out of order, a bracket picked wrong), and the sun genuinely does gain
    // most of its strength in the few degrees above the horizon, so a ramp that
    // steep is the light being right rather than the interpolation breaking.
    let previous = daylightFor(-Math.PI);
    for (let h = -Math.PI + 0.02; h <= Math.PI; h += 0.02) {
      const next = daylightFor(h);
      expect(Math.abs(next.sunIntensity - previous.sunIntensity)).toBeLessThan(2.6 * 0.15);
      expect(Math.abs(next.ambientIntensity - previous.ambientIntensity)).toBeLessThan(1.15 * 0.15);
      expect(Math.abs(next.stars - previous.stars)).toBeLessThan(0.15);
      for (const key of ['zenith', 'horizon', 'fogColor', 'sunColor'] as const) {
        for (const shift of [0, 1, 2]) {
          expect(
            Math.abs(channel(next[key], shift) - channel(previous[key], shift)),
          ).toBeLessThan(40);
        }
      }
      previous = next;
    }
  });

  it('reports every colour as a parseable hex triple', () => {
    const d = daylightFor(1.2);
    for (const value of [d.zenith, d.horizon, d.sunColor, d.fogColor, d.skyColor, d.groundColor]) {
      expect(value).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('the seasons', () => {
  const june = new Date(2024, 5, 21, 12).getTime();
  const december = new Date(2024, 11, 21, 12).getTime();
  const march = new Date(2024, 2, 20, 12).getTime();

  it('tilts the arc to the solstices and flattens it at the equinox', () => {
    expect(declinationAt(june)).toBeCloseTo(SEASON_TILT, 2);
    expect(declinationAt(december)).toBeCloseTo(-SEASON_TILT, 2);
    expect(Math.abs(declinationAt(march))).toBeLessThan(0.06);
  });

  it('makes the summer day long and the winter day short, which is the whole point', () => {
    // At this latitude — 32°, which the peak altitude fixed — a real almanac
    // gives about fourteen hours in June and ten in December.
    expect(dayLengthFor(SEASON_TILT)).toBeGreaterThan(13.5);
    expect(dayLengthFor(SEASON_TILT)).toBeLessThan(14.5);
    expect(dayLengthFor(-SEASON_TILT)).toBeGreaterThan(9.5);
    expect(dayLengthFor(-SEASON_TILT)).toBeLessThan(10.5);
    expect(dayLengthFor(0)).toBeCloseTo(12, 6);
  });

  it('stands the midsummer sun higher at noon than the midwinter one', () => {
    expect(sunDirectionFor(0, SEASON_TILT)[1]).toBeGreaterThan(
      sunDirectionFor(0, -SEASON_TILT)[1],
    );
    // And it is still up at six in the evening in June, and down in December.
    expect(sunDirectionFor(Math.PI / 2, SEASON_TILT)[1]).toBeGreaterThan(0);
    expect(sunDirectionFor(Math.PI / 2, -SEASON_TILT)[1]).toBeLessThan(0);
  });

  it('keeps the sun on the unit sphere at every declination', () => {
    for (let d = -SEASON_TILT; d <= SEASON_TILT; d += 0.05) {
      for (let h = -Math.PI; h < Math.PI; h += 0.3) {
        expect(length(sunDirectionFor(h, d))).toBeCloseTo(1, 6);
      }
    }
  });

  it('leaves the hour untouched by the season, so the two gestures cannot collide', () => {
    // The property the whole two-axis drag rests on: tilting the arc changes
    // where the sun is, never what time the sun says it is.
    for (let h = -3; h < 3; h += 0.25) {
      for (const d of [-SEASON_TILT, -0.1, 0, 0.2, SEASON_TILT]) {
        expect(hourAngleOf(sunDirectionFor(h, d))).toBeCloseTo(h, 6);
      }
    }
  });

  it('reads a declination back off a direction, so the season drag can aim', () => {
    for (const d of [-SEASON_TILT, -0.2, 0, 0.15, SEASON_TILT]) {
      for (const h of [-2, -0.5, 0, 1.4]) {
        expect(declinationOf(sunDirectionFor(h, d))).toBeCloseTo(d, 6);
      }
    }
  });

  it('is unbothered by an unnormalized ray, which is what a pointer gives', () => {
    const d = sunDirectionFor(0.7, 0.3);
    const long: Vec3 = [d[0] * 37, d[1] * 37, d[2] * 37];
    expect(declinationOf(long)).toBeCloseTo(0.3, 6);
  });

  it('carries the declination into the palette, so a winter afternoon is dimmer', () => {
    // Three in the afternoon: high summer still has full sun, midwinter is
    // already sliding toward dusk. Nothing in the palette knows about seasons —
    // it keys off the sun's height, and the season moved the sun.
    const hour = hourAngleAt(new Date(2024, 0, 1, 15).getTime());
    expect(daylightFor(hour, SEASON_TILT).sunIntensity).toBeGreaterThan(
      daylightFor(hour, -SEASON_TILT).sunIntensity,
    );
    expect(daylightFor(hour, -SEASON_TILT).stars).toBeGreaterThanOrEqual(
      daylightFor(hour, SEASON_TILT).stars,
    );
  });

  it('defaults to the equinox, so every existing caller is unchanged', () => {
    expect(sunDirectionFor(1.1)).toEqual(sunDirectionFor(1.1, 0));
    expect(daylightFor(1.1).declination).toBe(0);
  });
});

describe('mixHex', () => {
  it('returns the endpoints unchanged', () => {
    expect(mixHex('#102030', '#405060', 0)).toBe('#102030');
    expect(mixHex('#102030', '#405060', 1)).toBe('#405060');
  });

  it('clamps rather than extrapolating past an endpoint', () => {
    expect(mixHex('#102030', '#405060', -3)).toBe('#102030');
    expect(mixHex('#102030', '#405060', 9)).toBe('#405060');
  });

  it('pads channels that fall below sixteen', () => {
    expect(mixHex('#000000', '#0f0f0f', 1)).toBe('#0f0f0f');
  });
});

function channel(hex: string, index: number): number {
  return parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
}
