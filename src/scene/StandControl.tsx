import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { LOOK_LIMITS, lookAt, turn, walk, type Look, type Path } from './look';
import type { Viewpoint } from './greenhouse';

/**
 * The camera, as a person standing in a greenhouse.
 *
 * Replaces `OrbitControls`. Why is in `look.ts`: an orbit aims at its target and
 * so cannot look up, and the sun is the time control. This drags to turn, wheels
 * to walk, and can point at the sky.
 *
 * The component is deliberately thin — every decision it makes is a call into
 * `look.ts` — but it has one job of its own that is easy to get wrong, and that
 * is **being the default controls**. `SunScrub` finds the camera controls with
 * `useThree(state => state.controls)` and sets `.enabled = false` for the length
 * of a sun grab, so that dragging the sun does not also swing the camera. Any
 * replacement has to register in the same place and honour the same flag, or the
 * two gestures fight for the same pointer. `Garden`'s framing effect also
 * reaches for `.target` and `.update()`, so both are kept: the target is where
 * this stands looking, and updating writes the camera.
 */
export function StandControl({ view }: { view: Viewpoint }) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const set = useThree((state) => state.set);

  const look = useRef<Look>({ yaw: 0, pitch: 0 });
  const stand = useRef<[number, number, number]>([...view.position]);
  const dragging = useRef<{ x: number; y: number } | null>(null);

  const path = useMemo<Path>(
    () => ({ minRadius: view.minRadius, maxRadius: view.maxRadius }),
    [view.minRadius, view.maxRadius],
  );

  // The object the rest of the scene knows as `controls`. Held in a ref and
  // mutated rather than rebuilt, because `SunScrub` writes `.enabled` on it
  // directly and a fresh object each render would drop that write.
  const controls = useRef({
    enabled: true,
    target: new THREE.Vector3(...view.target),
    update: () => {},
  });

  const apply = useMemo(
    () => () => {
      const [x, y, z] = stand.current;
      camera.position.set(x, y, z);
      // YXZ so yaw is applied about the world's vertical and pitch about the
      // camera's own right. Any other order rolls the horizon as you turn.
      camera.rotation.order = 'YXZ';
      camera.rotation.set(look.current.pitch, look.current.yaw, 0);
      camera.updateMatrixWorld();

      // Kept meaningful rather than vestigial: a metre along the view is what
      // this is looking at, which is what a target has always meant here.
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      controls.current.target.copy(camera.position).add(forward);
    },
    [camera],
  );

  useEffect(() => {
    controls.current.update = apply;
    set({ controls: controls.current as unknown as never });
    return () => set({ controls: null as unknown as never });
  }, [apply, set]);

  // Where you stand when you walk into a garden.
  //
  // You stand *in* it. The camera used to solve for a distance that fit the
  // whole width in frame, which necessarily put it outside the house — for the
  // league, some sixteen metres past the back wall, looking at a building with
  // a garden inside it. The house is not the subject and never was; being under
  // the glass with the plants is the entire reason for having built it.
  //
  // The position and the target both come from `viewpointFor`, so the
  // arithmetic that decides where a body can stand stays with the rest of the
  // proportions and is tested there. This only applies it, turning the target
  // into a heading so the two descriptions cannot drift apart.
  //
  // It fires on the house's dimensions and on nothing else. Those change when
  // you enter a garden and never on a telemetry tick, which is the difference
  // between a camera that frames what you walked into and one that snatches
  // itself back every two seconds while you are trying to look at something.
  //
  // Keyed on the viewpoint's *values* rather than on the object, and that is the
  // whole of the sentence above working. `view` is rebuilt from the node map, so
  // a telemetry tick hands down a new object holding identical numbers every two
  // seconds. An orbit tolerated that by accident — `update()` recomputed the
  // camera from its own spherical state, so re-setting the position was a no-op
  // — and this does not, because here the position is the state. Dragging to
  // look up and being snapped back a second later is precisely the bug the
  // comment above was written against.
  const signature = `${view.position.join()}|${view.target.join()}|${view.minRadius}|${view.maxRadius}`;
  useEffect(() => {
    stand.current = [...view.position];
    look.current = lookAt(view.position, view.target, LOOK_LIMITS);
    apply();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, apply]);

  useEffect(() => {
    const canvas = gl.domElement;

    const onDown = (event: PointerEvent) => {
      // Shift belongs to the sun scrub, and the left button to it as well while
      // a grab is live — `SunScrub` clears `enabled` in the capture phase, which
      // runs before this.
      if (!controls.current.enabled || event.button !== 0 || event.shiftKey) return;
      dragging.current = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    };

    const onMove = (event: PointerEvent) => {
      const from = dragging.current;
      if (!from || !controls.current.enabled) return;
      look.current = turn(
        look.current,
        event.clientX - from.x,
        event.clientY - from.y,
        LOOK_LIMITS,
      );
      dragging.current = { x: event.clientX, y: event.clientY };
      apply();
    };

    const onUp = (event: PointerEvent) => {
      dragging.current = null;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    const onWheel = (event: WheelEvent) => {
      if (!controls.current.enabled) return;
      event.preventDefault();
      // A step per notch, and forward is where you are looking rather than
      // where you are pointing: a scroll while looking at the roof should not
      // drive you into the floor, so only the ground component of the heading
      // is used. That falls out of `walk` taking a yaw and not a direction.
      stand.current = walk(stand.current, look.current.yaw, -event.deltaY * 0.004, path);
      apply();
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [gl, apply, path]);

  return null;
}
