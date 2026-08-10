import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { orbit, orbitPosition, zoomDistance, type TableView } from './bonsai';
import { FLIGHT_MS, flyPose, progress, type Pose } from './fly';

/**
 * The camera, as a hand turning a model on a table.
 *
 * This is the second grain of space (see `bonsai.ts`): the whole garden shrunk
 * and looked down at, as an alternative to `StandControl`'s body on the path. It
 * is deliberately the gesture `look.ts` argued *against* for the room — an orbit,
 * eye swinging around a fixed point — because the objection there does not apply
 * here. An orbit cannot look up, and in the room the sun overhead is the time
 * control, so a camera that could not raise its aim could not reach it; on the
 * table you are looking *down* at a miniature and the sun is not what you are
 * reaching for, so an orbit is exactly right. `look` even said as much: an orbit
 * is a good way to examine an object, and the whole garden has become one.
 *
 * Like `StandControl` it registers itself as the scene's `controls` so the sun
 * scrub can find it and suspend it (`SunScrub` writes `.enabled` in the capture
 * phase), and it honours the same flags. It has one thing that control does not:
 * it flies in. On mount the camera is wherever the last view left it, and rather
 * than cut to the table it eases there over `FLIGHT_MS`, so you see it is the
 * same garden because you watched the eye travel out to it.
 */
export function TableControl({ view }: { view: TableView }) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const set = useThree((state) => state.set);

  // The live orbit, taken from the view's resting values and then driven by drag
  // and wheel. Held in refs because these are mutated on pointer events, not on
  // render, exactly as `StandControl` holds its stand and look.
  const azimuth = useRef(view.azimuth);
  const pitch = useRef(view.pitch);
  const distance = useRef(view.distance);
  const target = useRef<[number, number, number]>([...view.target]);
  const dragging = useRef<{ x: number; y: number } | null>(null);

  // The flight in. `from` is captured once at mount from wherever the camera
  // stands; `since` is the clock. While `flying` is set, `useFrame` owns the
  // camera and the pointer handlers stand back.
  const flying = useRef(true);
  const since = useRef(0);
  const from = useRef<Pose>({ position: [0, 0, 0], target: [0, 0, 0] });

  const controls = useRef({
    enabled: true,
    target: new THREE.Vector3(...view.target),
    update: () => {},
  });

  // Place the camera from the current orbit and aim it at the table. The mirror
  // of `StandControl.apply`, only here the eye moves and the target is fixed,
  // rather than the other way about.
  const apply = useMemo(
    () => () => {
      const t = target.current;
      const pos = orbitPosition(t, azimuth.current, pitch.current, distance.current);
      camera.position.set(pos[0], pos[1], pos[2]);
      camera.up.set(0, 1, 0);
      camera.lookAt(t[0], t[1], t[2]);
      camera.updateMatrixWorld();
      controls.current.target.set(t[0], t[1], t[2]);
    },
    [camera],
  );

  useEffect(() => {
    controls.current.update = apply;
    set({ controls: controls.current as unknown as never });
    return () => set({ controls: null as unknown as never });
  }, [apply, set]);

  // Start the flight from wherever the previous camera left off. Read straight
  // off the live camera — its position, and a metre along its aim for the target
  // — so the arrival into the table continues the motion the room ended on rather
  // than teleporting to a start pose.
  useEffect(() => {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    from.current = {
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: [
        camera.position.x + dir.x,
        camera.position.y + dir.y,
        camera.position.z + dir.z,
      ],
    };
    since.current = performance.now();
    flying.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A garden switch while on the table changes the miniature's scale, and with
  // it where its middle sits. Follow the target so the frame stays centred;
  // distance and bearing are kept, because the table is meant to feel like the
  // same table with a different garden on it. Signature on the values, not the
  // object, for the reason `StandControl` documents: a telemetry tick hands down
  // an identical view every couple of seconds.
  const signature = view.target.join();
  useEffect(() => {
    target.current = [...view.target];
    if (!flying.current) apply();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, apply]);

  useFrame(() => {
    if (!flying.current) return;
    const t = progress(performance.now() - since.current, FLIGHT_MS);
    const pose = flyPose(from.current, { position: view.position, target: view.target }, t);
    camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
    camera.up.set(0, 1, 0);
    camera.lookAt(pose.target[0], pose.target[1], pose.target[2]);
    camera.updateMatrixWorld();
    controls.current.target.set(pose.target[0], pose.target[1], pose.target[2]);
    if (t >= 1) {
      flying.current = false;
      apply();
    }
  });

  useEffect(() => {
    const canvas = gl.domElement;

    const onDown = (event: PointerEvent) => {
      // Shift and the live sun grab belong to the scrub; `SunScrub` clears
      // `enabled` in the capture phase, ahead of this.
      if (!controls.current.enabled || flying.current || event.button !== 0 || event.shiftKey) {
        return;
      }
      dragging.current = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    };

    const onMove = (event: PointerEvent) => {
      const start = dragging.current;
      if (!start || !controls.current.enabled || flying.current) return;
      const next = orbit(
        { azimuth: azimuth.current, pitch: pitch.current },
        event.clientX - start.x,
        event.clientY - start.y,
      );
      azimuth.current = next.azimuth;
      pitch.current = next.pitch;
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
      if (!controls.current.enabled || flying.current) return;
      event.preventDefault();
      distance.current = zoomDistance(distance.current, event.deltaY);
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
  }, [gl, apply]);

  return null;
}
