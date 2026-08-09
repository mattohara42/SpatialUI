import { describe, expect, it } from 'vitest';
import {
  CARD_Y,
  LABEL_CUTOFF,
  LABEL_FAR,
  LABEL_NEAR,
  TAG,
  isVisible,
  legibility,
} from './labels';

describe('legibility', () => {
  it('is nothing at all at a distance', () => {
    // The default view of a whole house must have no text in it.
    expect(legibility(LABEL_FAR)).toBe(0);
    expect(legibility(LABEL_FAR + 20)).toBe(0);
    expect(legibility(200)).toBe(0);
  });

  it('is complete once you are at the plant', () => {
    expect(legibility(LABEL_NEAR)).toBe(1);
    expect(legibility(0.5)).toBe(1);
    expect(legibility(0)).toBe(1);
  });

  it('rises the whole way in between, and never overshoots', () => {
    let previous = 0;
    for (let d = LABEL_FAR; d >= LABEL_NEAR; d -= 0.05) {
      const value = legibility(d);
      expect(value).toBeGreaterThanOrEqual(previous - 1e-9);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      previous = value;
    }
    expect(previous).toBeGreaterThan(0.999);
  });

  it('arrives rather than switching on: the far end starts flat', () => {
    // A linear ramp pops, because the eye catches the first instant of motion.
    // Just inside the threshold a tag must still be essentially absent.
    const justInside = legibility(LABEL_FAR - 0.05);
    expect(justInside).toBeLessThan(0.01);
    // And the fade is fastest in the middle, which is what "smooth" buys.
    const span = LABEL_FAR - LABEL_NEAR;
    const middleSlope =
      legibility(LABEL_NEAR + span * 0.45) - legibility(LABEL_NEAR + span * 0.55);
    const endSlope =
      legibility(LABEL_FAR - span * 0.05) - legibility(LABEL_FAR - span * 0.15);
    expect(middleSlope).toBeGreaterThan(endSlope);
  });

  it('reaches the near threshold smoothly too', () => {
    expect(legibility(LABEL_NEAR + 0.05)).toBeGreaterThan(0.99);
  });
});

describe('isVisible', () => {
  it('drops a tag that would draw nothing anyone could see', () => {
    expect(isVisible(LABEL_FAR)).toBe(false);
    expect(isVisible(LABEL_FAR - 0.01)).toBe(false);
    expect(isVisible(LABEL_NEAR)).toBe(true);
  });

  it('agrees with the ramp it is a threshold on', () => {
    for (const d of [0, 2, 4.5, 6, 7, 8, 8.9, 9, 12]) {
      expect(isVisible(d)).toBe(legibility(d) > LABEL_CUTOFF);
    }
  });
});

describe('the tag', () => {
  it('stands low enough to name a plant without hiding it', () => {
    // Knee height on the smallest thing that can grow in a bed.
    expect(CARD_Y).toBeLessThan(0.6);
    expect(CARD_Y).toBeGreaterThan(TAG.stake);
  });

  it('is pushed in beside the stem, not through it', () => {
    expect(TAG.offset).toBeGreaterThan(TAG.stakeWidth);
  });

  it('is wider than it is tall, like something with a name written on it', () => {
    expect(TAG.width).toBeGreaterThan(TAG.height);
  });
});
