import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { smoothActivity, swayMatrix } from './sway';

const read = (id: string, activity: number, t: number) => {
  const m = new THREE.Matrix4();
  swayMatrix(m, id, activity, t);
  return m.elements.slice();
};

describe('swayMatrix', () => {
  it('is deterministic for the same node, activity, and time', () => {
    expect(read('svc-a', 0.5, 3.2)).toEqual(read('svc-a', 0.5, 3.2));
  });

  it('animates: the same plant differs across time', () => {
    expect(read('svc-a', 0.5, 3.2)).not.toEqual(read('svc-a', 0.5, 3.3));
  });

  it('still moves at zero activity: dormant plants breathe, not freeze', () => {
    // A dormant plant must not sit perfectly still, so two different times must
    // produce different matrices even with activity 0.
    expect(read('svc-a', 0, 1.0)).not.toEqual(read('svc-a', 0, 5.0));
  });

  it('different plants sway out of phase', () => {
    expect(read('svc-a', 0.5, 3.2)).not.toEqual(read('svc-b', 0.5, 3.2));
  });

  it('eases activity toward a telemetry step instead of jumping', () => {
    // Establish a plant sitting at low activity, then a tick jumps it high. One
    // frame (~16ms) later the smoothed value must still be near the old value,
    // not the new target: that gradual catch-up is what kills the per-tick jerk.
    smoothActivity('eases', 0.1, 10.0);
    const afterOneFrame = smoothActivity('eases', 0.9, 10.016);
    expect(afterOneFrame).toBeLessThan(0.12);
    // ...and after a second of frames (the loop calls this ~60x/sec), it arrives.
    let t = 10.016;
    let v = afterOneFrame;
    for (let f = 0; f < 60; f++) {
      t += 0.016;
      v = smoothActivity('eases', 0.9, t);
    }
    // Well past the midpoint of the 0.1 -> 0.9 step after a second of easing.
    expect(v).toBeGreaterThan(0.5);
  });

  it('does not snap when activity steps at large elapsed time', () => {
    // Activity changes discretely every telemetry tick. If it leaked into a sine
    // frequency, the matrix would jump by an amount that grows with t (the 2s
    // jerk). At a large t a small activity step must stay a small matrix step.
    const t = 100;
    const a = read('svc-a', 0.4, t);
    const b = read('svc-a', 0.55, t);
    const maxDelta = Math.max(...a.map((v, i) => Math.abs(v - b[i])));
    expect(maxDelta).toBeLessThan(0.05);
  });
});
