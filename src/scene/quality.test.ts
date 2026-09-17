import { describe, expect, it } from 'vitest';
import { needsComposer, settingsFor, tierFor } from './quality';

describe('tierFor', () => {
  it('gives a browser window the rich tier', () => {
    expect(tierFor(false)).toBe('rich');
  });

  // The hard one. A headset is 90Hz across two eyes and an effect that overruns
  // that does not degrade gracefully, it drops frames in something strapped to
  // a face.
  it('steps down absolutely when presenting to a headset', () => {
    expect(tierFor(true)).toBe('lean');
    expect(tierFor(true, false)).toBe('lean');
    expect(tierFor(true, true)).toBe('lean');
  });

  it('honours a reduced-motion preference on a desktop too', () => {
    expect(tierFor(false, true)).toBe('lean');
  });
});

describe('settingsFor', () => {
  it('runs the full chain on the rich tier', () => {
    const rich = settingsFor('rich');
    expect(rich.ambientOcclusion).toBe(true);
    expect(rich.bloom).toBe(true);
  });

  it('drops the passes that cost pixels on the lean tier', () => {
    const lean = settingsFor('lean');
    expect(lean.ambientOcclusion).toBe(false);
    expect(lean.bloom).toBe(false);
  });

  // The table is a whole garden at arm's length, where the frame has the least
  // real work in it, and the tilt-shift is the effect that mode exists for.
  it('keeps the tilt-shift in both tiers', () => {
    expect(settingsFor('rich').tiltShift).toBe(true);
    expect(settingsFor('lean').tiltShift).toBe(true);
  });

  it('shrinks the shadow map when stepping down', () => {
    expect(settingsFor('lean').shadowMapSize).toBeLessThan(
      settingsFor('rich').shadowMapSize,
    );
  });

  // The property that makes it safe to switch tiers mid-session: the tiers
  // differ in what the frame costs, never in what the garden is saying.
  it('carries nothing that could change a reading', () => {
    const keys = Object.keys(settingsFor('rich')).sort();
    expect(keys).toEqual(
      ['ambientOcclusion', 'bloom', 'shadowMapSize', 'tiltShift'].sort(),
    );
  });
});

describe('needsComposer', () => {
  it('composites in the room when there are effects to run', () => {
    expect(needsComposer(settingsFor('rich'), false)).toBe(true);
  });

  // A composer running only an output pass is a full-screen blit for nothing,
  // and unmounting it is what hands the render loop back to the default path.
  it('does not composite in a stepped-down room view', () => {
    expect(needsComposer(settingsFor('lean'), false)).toBe(false);
  });

  it('always composites on the table, which wants the tilt-shift', () => {
    expect(needsComposer(settingsFor('rich'), true)).toBe(true);
    expect(needsComposer(settingsFor('lean'), true)).toBe(true);
  });

  it('does not composite for a tilt-shift that is switched off', () => {
    const settings = { ...settingsFor('lean'), tiltShift: false };
    expect(needsComposer(settings, true)).toBe(false);
  });
});
