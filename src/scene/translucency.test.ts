import { describe, expect, it } from 'vitest';
import { LEAF_BACKLIGHT, backlight } from './translucency';

/** A leaf facing the camera: its normal points along +Z toward the eye. */
const facingCamera: [number, number, number] = [0, 0, 1];

describe('backlight', () => {
  it('is strongest looking straight into the sun through the leaf', () => {
    // View toward the camera (+Z) and sun also toward +Z behind the leaf: the
    // eye, the leaf, and the sun are in a line, which is the lantern case.
    const glow = backlight([0, 0, 1], [0, 0, 1], facingCamera);
    // Distortion bends the transmitted direction toward the normal (also +Z
    // here), so the maximum is very close to the full scale.
    expect(glow).toBeGreaterThan(0.85 * LEAF_BACKLIGHT.scale);
    expect(glow).toBeLessThanOrEqual(LEAF_BACKLIGHT.scale + 1e-9);
  });

  it('is nothing when the sun is behind the camera', () => {
    // Front-lit: the sun is on the viewer's side, so no light comes through the
    // leaf toward the eye and the leaf must not glow.
    const glow = backlight([0, 0, 1], [0, 0, -1], facingCamera);
    expect(glow).toBe(0);
  });

  it('rises monotonically as the view swings toward the sun', () => {
    // Sun fixed behind the leaf (+Z); sweep the view from side-on to head-on.
    let previous = -1;
    for (let a = Math.PI / 2; a >= 0; a -= 0.1) {
      const view: [number, number, number] = [Math.sin(a), 0, Math.cos(a)];
      const glow = backlight(view, [0, 0, 1], facingCamera);
      expect(glow).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = glow;
    }
  });

  it('scales with the strength setting and never exceeds it', () => {
    const dim = backlight([0, 0, 1], [0, 0, 1], facingCamera, {
      ...LEAF_BACKLIGHT,
      scale: 0.2,
    });
    const bright = backlight([0, 0, 1], [0, 0, 1], facingCamera, {
      ...LEAF_BACKLIGHT,
      scale: 1.0,
    });
    expect(dim).toBeLessThan(bright);
    expect(dim).toBeLessThanOrEqual(0.2 + 1e-9);
  });

  it('tightens the halo as power rises', () => {
    // Off-axis, a higher power falls off faster, so the same oblique view is
    // dimmer at high power than at low.
    const view: [number, number, number] = [Math.sin(0.6), 0, Math.cos(0.6)];
    const soft = backlight(view, [0, 0, 1], facingCamera, { ...LEAF_BACKLIGHT, power: 1.5 });
    const tight = backlight(view, [0, 0, 1], facingCamera, { ...LEAF_BACKLIGHT, power: 5.0 });
    expect(tight).toBeLessThan(soft);
  });

  it('does not divide by zero on a degenerate vector', () => {
    expect(backlight([0, 0, 0], [0, 0, 1], facingCamera)).toBe(0);
  });
});
