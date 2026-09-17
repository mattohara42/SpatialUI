import { useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { tierFor, type QualityTier } from './quality';

/**
 * The live quality tier: what the renderer is currently able to afford.
 *
 * The decision itself is pure and lives in `quality.ts`. This is only the part
 * that has to watch the renderer, and there are two things worth watching.
 *
 * **A WebXR session starting or ending.** `gl.xr` exists on every three renderer
 * whether or not anything XR is installed, and it fires `sessionstart` and
 * `sessionend` — so the step-down works today, before `@react-three/xr` is a
 * dependency, and will keep working after it becomes one. Entering a headset is
 * not a page load: the same scene keeps running and simply has to get cheaper,
 * which is exactly what a state change here does.
 *
 * **A reduced-motion preference.** Read once and then watched, because a person
 * can change it while the page is open and a preference that only applied to
 * whoever set it before loading would be a preference honoured by accident.
 */
export function useQualityTier(): QualityTier {
  const gl = useThree((s) => s.gl);
  const [presenting, setPresenting] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const xr = gl.xr;
    if (!xr) return;
    const onStart = () => setPresenting(true);
    const onEnd = () => setPresenting(false);
    xr.addEventListener('sessionstart', onStart);
    xr.addEventListener('sessionend', onEnd);
    // In case a session was already live when this mounted.
    setPresenting(xr.isPresenting);
    return () => {
      xr.removeEventListener('sessionstart', onStart);
      xr.removeEventListener('sessionend', onEnd);
    };
  }, [gl]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduced(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  return tierFor(presenting, reduced);
}
