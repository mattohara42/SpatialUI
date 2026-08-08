import { useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { DAY_MS, MOON_COLOR, angleDelta, hourAngleOf, type Daylight } from './daylight';
import { cursorFor } from '../ecosystem/scrub';
import { useEcosystem } from '../state/ecosystemStore';

/**
 * Time as a thing you can reach.
 *
 * Dragging the sun across the sky scrubs history. Not a slider under the scene,
 * because a scrub bar is a video player borrowed into a garden and it says
 * nothing about what it is moving; the sun says the hour, the light, and the
 * direction of travel at once, and it is already the object the shadows agree
 * with.
 *
 * The mapping is the inverse of the sun's path: the pointer ray is projected
 * back onto the path's own basis to get an hour angle, and the angle travelled
 * since the drag began converts to elapsed time at a full circle per day. Only
 * deltas are used, never absolute angle, which is what lets the moon be grabbed
 * as well — it sits exactly half a turn from the sun, so the offset cancels and
 * the same arithmetic drives both. Otherwise scrubbing into the night would
 * leave nothing to take hold of.
 *
 * Shift and drag anywhere does the same thing, and it is not a convenience. The
 * camera orbits around a target at knee height and is clamped at the horizon, so
 * the sky above about 25 degrees cannot be pointed at with a mouse at all: for
 * most of the day the sun is a real object in the world that a desktop pointer
 * simply cannot reach. In a headset you look up and take hold of it, which is
 * the interaction this is a stand-in for. The sun still moves under the drag, so
 * what the gesture means stays visible either way.
 */

/** Far enough to read as sky, well inside the dome at 300. */
const DISTANCE = 160;
const SUN_RADIUS = 7;
const MOON_RADIUS = 4.2;
/** Invisible grab volume. Generous, because pointing at the sky is imprecise. */
const HANDLE_RADIUS = 16;

const TAU = Math.PI * 2;

interface Drag {
  /** Time under the cursor when the grab started. */
  anchor: number;
  /** Hour angle of the pointer at the previous sample. */
  last: number;
  /** Signed angle travelled since the grab, unwrapped across ±π. */
  travelled: number;
  /** Whether the camera controls were on before the grab suspended them. */
  restoreControls: boolean;
}

export function SunScrub({ daylight }: { daylight: Daylight }) {
  const { camera, gl } = useThree();
  const controls = useThree((state) => state.controls) as
    | { enabled: boolean }
    | null;

  const setCursor = useEcosystem((state) => state.setCursor);

  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);

  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);

  /** Which way the sky is being pointed, as a direction from the camera. */
  const directionAt = (event: PointerEvent | MouseEvent): THREE.Vector3 => {
    const rect = gl.domElement.getBoundingClientRect();
    ndc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray.direction;
  };

  const start = (event: PointerEvent | MouseEvent) => {
    const d = directionAt(event);
    // Read straight from the store rather than from props: the grab has to
    // start from whatever time is on screen at this instant, and a tick may
    // have landed since this component last rendered.
    const state = useEcosystem.getState();
    drag.current = {
      anchor: state.cursor ?? state.revision,
      last: hourAngleOf([d.x, d.y, d.z]),
      travelled: 0,
      restoreControls: controls?.enabled ?? false,
    };
    // Suspended here rather than in the effect below, which does not run until
    // the next render: OrbitControls listens on the same canvas and may see
    // this very pointerdown first, and a grab that also swung the camera would
    // be a scrub the user cannot aim.
    if (controls) controls.enabled = false;
    setDragging(true);
  };

  const begin = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    start(event.nativeEvent);
  };

  // Capture phase, so `controls.enabled` is already false by the time
  // OrbitControls sees the same pointerdown and decides whether to orbit.
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      if (!event.shiftKey || event.button !== 0) return;
      if (event.target !== gl.domElement) return;
      event.stopPropagation();
      start(event);
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, camera]);

  // Listeners on the window, not on the mesh: the pointer leaves a 16 unit
  // sphere almost immediately, and the drag has to survive that.
  useEffect(() => {
    if (!dragging) return;

    gl.domElement.style.cursor = 'grabbing';

    const move = (event: PointerEvent) => {
      const active = drag.current;
      if (!active) return;
      const d = directionAt(event);
      const angle = hourAngleOf([d.x, d.y, d.z]);
      active.travelled += angleDelta(active.last, angle);
      active.last = angle;
      setCursor(
        cursorFor(active.anchor + (active.travelled / TAU) * DAY_MS, Date.now()),
      );
    };

    const end = () => {
      if (controls && drag.current?.restoreControls) controls.enabled = true;
      drag.current = null;
      setDragging(false);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      // Unmounting mid-drag (switching gardens, say) must not strand the
      // camera controls in the suspended state the grab put them in.
      if (controls && drag.current?.restoreControls) controls.enabled = true;
      gl.domElement.style.cursor = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, controls, gl, camera, setCursor]);

  useEffect(() => {
    if (dragging) return;
    gl.domElement.style.cursor = hovered ? 'grab' : '';
    return () => {
      gl.domElement.style.cursor = '';
    };
  }, [hovered, dragging, gl]);

  const sunPosition = useMemo(
    () =>
      new THREE.Vector3(...daylight.sunDirection)
        .normalize()
        .multiplyScalar(DISTANCE),
    [daylight.sunDirection],
  );
  const moonPosition = useMemo(
    () => sunPosition.clone().negate(),
    [sunPosition],
  );

  // Crossfaded rather than switched, so dusk shows the moon already up while
  // the sun is still going down, and neither body pops in.
  const sunFade = clamp01((daylight.sunUp + 0.05) / 0.07);
  const moonFade = 1 - sunFade;

  const handles = { onPointerDown: begin };
  const hover = {
    onPointerOver: () => setHovered(true),
    onPointerOut: () => setHovered(false),
  };

  return (
    <>
      <group position={sunPosition}>
        <mesh>
          <sphereGeometry args={[SUN_RADIUS, 24, 24]} />
          <meshBasicMaterial
            color={daylight.sunColor}
            transparent
            opacity={sunFade}
            fog={false}
            toneMapped={false}
          />
        </mesh>
        <mesh {...handles} {...hover} visible={sunFade > 0.02}>
          <sphereGeometry args={[HANDLE_RADIUS, 8, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
      </group>

      <group position={moonPosition}>
        <mesh>
          <sphereGeometry args={[MOON_RADIUS, 24, 24]} />
          <meshBasicMaterial
            color={MOON_COLOR}
            transparent
            opacity={moonFade}
            fog={false}
            toneMapped={false}
          />
        </mesh>
        <mesh {...handles} {...hover} visible={moonFade > 0.02}>
          <sphereGeometry args={[HANDLE_RADIUS, 8, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
      </group>
    </>
  );
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
