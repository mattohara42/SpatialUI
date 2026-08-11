import { describe, expect, it } from 'vitest';
import { blurAmount } from './TiltShift';

const FOCUS = 0.52;
const BAND = 0.07;
const FEATHER = 0.32;
const MAX = 9;

describe('blurAmount', () => {
  it('is perfectly sharp inside the band', () => {
    expect(blurAmount(FOCUS, FOCUS, BAND, FEATHER, MAX)).toBe(0);
    // Halfway into the band is unambiguously sharp; the exact edge sits on a
    // floating-point knife and is only asserted close to zero.
    expect(blurAmount(FOCUS + BAND / 2, FOCUS, BAND, FEATHER, MAX)).toBe(0);
    expect(blurAmount(FOCUS - BAND / 2, FOCUS, BAND, FEATHER, MAX)).toBe(0);
    expect(blurAmount(FOCUS + BAND, FOCUS, BAND, FEATHER, MAX)).toBeCloseTo(0, 9);
    expect(blurAmount(FOCUS - BAND, FOCUS, BAND, FEATHER, MAX)).toBeCloseTo(0, 9);
  });

  it('reaches full blur once past band plus feather, both ways', () => {
    expect(blurAmount(FOCUS + BAND + FEATHER, FOCUS, BAND, FEATHER, MAX)).toBeCloseTo(MAX, 9);
    expect(blurAmount(FOCUS - BAND - FEATHER, FOCUS, BAND, FEATHER, MAX)).toBeCloseTo(MAX, 9);
    // And is clamped there — the top and bottom of the frame do not over-blur.
    expect(blurAmount(1, FOCUS, BAND, FEATHER, MAX)).toBeCloseTo(MAX, 9);
    expect(blurAmount(0, FOCUS, BAND, FEATHER, MAX)).toBeCloseTo(MAX, 9);
  });

  it('rises monotonically away from the band', () => {
    let previous = -1;
    for (let y = FOCUS + BAND; y <= 1.0001; y += 0.02) {
      const value = blurAmount(y, FOCUS, BAND, FEATHER, MAX);
      expect(value).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = value;
    }
  });

  it('is symmetric about the focus line', () => {
    for (const d of [0.1, 0.2, 0.3]) {
      expect(blurAmount(FOCUS + d, FOCUS, BAND, FEATHER, MAX)).toBeCloseTo(
        blurAmount(FOCUS - d, FOCUS, BAND, FEATHER, MAX),
        9,
      );
    }
  });

  it('eases in with no hard edge at the band boundary', () => {
    // Just past the band the ramp starts almost flat (smoothstep), so the first
    // step out of focus is far smaller than a step in the middle of the feather.
    const atEdge = blurAmount(FOCUS + BAND + 0.01, FOCUS, BAND, FEATHER, MAX);
    const midFeather = blurAmount(FOCUS + BAND + FEATHER / 2, FOCUS, BAND, FEATHER, MAX);
    expect(atEdge).toBeLessThan(midFeather / 4);
  });
});
