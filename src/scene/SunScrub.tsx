import { useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import {
  DAY_MS,
  MOON_COLOR,
  SEASON_TILT,
  YEAR_MS,
  angleDelta,
  declinationOf,
  hourAngleOf,
  yearAngleAt,
  type Daylight,
} from './daylight';
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
 * camera stands inside the greenhouse and orbits a target at plant height, so it
 * looks somewhat down at the beds and the upper sky cannot be pointed at with a
 * mouse at all: for most of the day the sun is a real object in the world that a
 * desktop pointer simply cannot reach. Moving indoors neither caused that nor
 * cured it — the outdoor camera had the same limit — but it did take away the
 * one escape, which was backing off until the sky came into frame.
 *
 * The roof is not the obstacle. Glass carries no pointer handlers, and R3F only
 * raycasts objects that have them, so the panes are not in the way: both bodies
 * and their handles out at 160 metres are grabbable straight through it. In a
 * headset you look up and take hold of it, which is the interaction this is a
 * stand-in for. The sun still moves under the drag, so what the gesture means
 * stays visible either way.
 *
 * ## Seasons: the same object's other axis
 *
 * Along the arc is the day. *Across* it is the year, because that is what a
 * season physically is — the whole daily circle riding higher or lower, which is
 * why summer days are long. So one object carries both scrubs and they cannot
 * interfere: the hour is measured in the plane of the arc and the declination
 * perpendicular to it, and `daylight.ts` holds the proof that each inverse
 * ignores the other.
 *
 * The rate is the honest one again, and it is what makes the two gestures feel
 * different rather than merely be different. A full turn along the arc is a day.
 * A full sweep across it — the sun's arc climbing from its midwinter low to its
 * midsummer high, every bit of vertical room the sky has — is half a year. That
 * is not a scaling factor chosen to feel good; it is how long the real sun takes
 * to do it.
 *
 * Two consequences worth knowing before touching this. The season drag *eases*
 * near a solstice and then reverses the sun's direction while time keeps going
 * the same way: the sun stops climbing and turns back, which is what a solstice
 * is, and the drag tracks the angle it has travelled rather than the sun's
 * height precisely so that crossing one is continuous. And the axis is latched
 * on the first real movement of a drag, not decided per frame, because a gesture
 * that switched between hours and months halfway through a diagonal would be
 * unaimable.
 */

/** Far enough to read as sky, well inside the dome at 300. */
const DISTANCE = 160;
const SUN_RADIUS = 7;
const MOON_RADIUS = 4.2;
/** Invisible grab volume. Generous, because pointing at the sky is imprecise. */
const HANDLE_RADIUS = 16;

const TAU = Math.PI * 2;

/**
 * Radians of pointer travel across the arc before the drag commits to being a
 * season scrub rather than an hour one. About two degrees: past a hand tremor,
 * inside the first few pixels of a deliberate pull.
 */
const LATCH_ANGLE = 0.035;

/**
 * Half a year per full sweep of the arc's height. The sweep is `2 × SEASON_TILT`
 * of sky, so this is the conversion from pointer travel across the path into
 * travel around the year.
 */
const YEAR_ANGLE_PER_TILT = Math.PI / (2 * SEASON_TILT);

type Axis = 'hour' | 'season' | null;

interface Drag {
  /** Time under the cursor when the grab started. */
  anchor: number;
  /** Hour angle of the pointer at the previous sample. */
  last: number;
  /** Declination of the pointer at the previous sample. */
  lastDeclination: number;
  /** Signed angle travelled since the grab, unwrapped across ±π. */
  travelled: number;
  /** Signed declination travelled since the grab. */
  travelledAcross: number;
  /** Which scrub this drag turned out to be, once it moved enough to tell. */
  axis: Axis;
  /**
   * Which way in time raises the sun's arc, at the moment of the grab.
   *
   * Not a convention, a fact about the date: after midsummer the arc sinks as
   * time runs forward, so pulling the sun up is pulling time back — and in
   * spring the same pull means later. Latched at the grab so that dragging
   * through a solstice, where the answer flips, does not reverse under the hand.
   */
  seasonSign: number;
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
    const anchor = state.cursor ?? state.revision;
    drag.current = {
      anchor,
      seasonSign: Math.sin(yearAngleAt(anchor)) > 0 ? -1 : 1,
      last: hourAngleOf([d.x, d.y, d.z]),
      lastDeclination: declinationOf([d.x, d.y, d.z]),
      travelled: 0,
      travelledAcross: 0,
      axis: null,
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
      const ray: [number, number, number] = [d.x, d.y, d.z];

      const angle = hourAngleOf(ray);
      const declination = declinationOf(ray);
      active.travelled += angleDelta(active.last, angle);
      active.travelledAcross += declination - active.lastDeclination;
      active.last = angle;
      active.lastDeclination = declination;

      // Latched on the first movement that clearly means one or the other, and
      // held for the rest of the drag.
      if (active.axis === null) {
        if (Math.abs(active.travelledAcross) > LATCH_ANGLE) active.axis = 'season';
        else if (Math.abs(active.travelled) > LATCH_ANGLE) active.axis = 'hour';
        else return;
      }

      const elapsed =
        active.axis === 'season'
          ? (active.seasonSign *
              active.travelledAcross *
              YEAR_ANGLE_PER_TILT *
              YEAR_MS) /
            TAU
          : (active.travelled / TAU) * DAY_MS;

      // The window is the garden's own: two days where nothing was archived, a
      // season where the whole of one was.
      setCursor(
        cursorFor(
          active.anchor + elapsed,
          Date.now(),
          useEcosystem.getState().scrubWindowMs,
        ),
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
