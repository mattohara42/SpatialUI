import { useMemo } from 'react';
import * as THREE from 'three';
import type { Daylight } from './daylight';

/**
 * The sky dome, driven entirely by the time under the cursor.
 *
 * A backside sphere carries a vertical gradient (zenith to horizon) plus a glow
 * that swells toward the sun, so the horizon reads as a real sunset rather than
 * a flat colour, and a star field that fades in once the sun is down. It ignores
 * fog and tone mapping so it stays bright behind the fogged, ACES-graded garden.
 *
 * Colours arrive already interpolated from `daylightFor`. This component decides
 * nothing about what an hour looks like; it only draws it.
 */

const VERT = `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Stars are a hash per cell of direction, not a texture: at this density a
 * cube map would be a megabyte to say something a dozen instructions can say,
 * and the field is stable frame to frame because it is a pure function of the
 * direction rather than of time. Nothing twinkles, which also keeps the night
 * sky honest for reduced-motion users.
 */
const FRAG = `
  varying vec3 vDir;
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uSun;
  uniform vec3 uSunDir;
  uniform float uStars;
  uniform float uGlow;

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(uHorizon, uZenith, smoothstep(0.0, 0.85, h));

    float s = max(dot(d, normalize(uSunDir)), 0.0);
    col += uSun * pow(s, 8.0) * 0.35 * uGlow;   // soft warm glow around the sun
    col += uSun * pow(s, 50.0) * 1.1 * uGlow;   // tight halo at the disc

    if (uStars > 0.001) {
      vec3 g = d * 260.0;
      vec3 cell = floor(g);
      float present = step(0.9965, hash(cell));
      float radius = length(fract(g) - 0.5);
      float magnitude = 0.35 + hash(cell + 7.3) * 0.65;
      // Faded out near the horizon, where haze eats the faint ones.
      col += vec3(0.85, 0.9, 1.0)
           * present
           * smoothstep(0.45, 0.02, radius)
           * magnitude
           * uStars
           * smoothstep(-0.02, 0.3, d.y);
    }

    gl_FragColor = vec4(col, 1.0);

    // Colours arrive in the renderer's working space, which is linear, and the
    // framebuffer wants sRGB. Built-in materials get this include generated for
    // them; a raw shader has to ask, and without it every colour in the table
    // above renders far darker than it reads, which is how a sky that says it
    // is blue comes out navy at seven in the morning.
    #include <colorspace_fragment>
  }
`;

export function Sky({ daylight }: { daylight: Daylight }) {
  // Created once and mutated below. A scrub changes these on every pointer
  // move, and handing the material a fresh uniforms object each time would
  // recompile the shader mid-gesture.
  const uniforms = useMemo(
    () => ({
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uSun: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3() },
      uStars: { value: 0 },
      uGlow: { value: 0 },
    }),
    [],
  );

  uniforms.uZenith.value.set(daylight.zenith);
  uniforms.uHorizon.value.set(daylight.horizon);
  uniforms.uSun.value.set(daylight.sunColor);
  uniforms.uSunDir.value.set(...daylight.sunDirection);
  uniforms.uStars.value = daylight.stars;
  uniforms.uGlow.value = daylight.glow;

  return (
    <mesh renderOrder={-1}>
      <sphereGeometry args={[300, 32, 16]} />
      <shaderMaterial
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={uniforms}
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  );
}
