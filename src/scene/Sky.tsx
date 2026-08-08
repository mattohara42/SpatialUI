import { useMemo } from 'react';
import * as THREE from 'three';
import type { Vec3 } from '../lsystem/types';

/**
 * Dusk sky and sun.
 *
 * A backside dome carries a vertical gradient (deep zenith to warm horizon) plus
 * a glow that swells toward the sun, so the horizon reads as a real sunset rather
 * than a flat colour. A small unlit disc sits at the sun's position for a crisp
 * source. Both ignore fog and tone mapping so they stay bright behind the fogged,
 * ACES-graded garden.
 *
 * The sun sits along the same direction the key light points from, so the visible
 * sun and the shadows agree. When the time-scrub lands, driving this one vector
 * moves the sun across the sky and swings the shadows with it.
 */

const VERT = `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = `
  varying vec3 vDir;
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uSun;
  uniform vec3 uSunDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(uHorizon, uZenith, smoothstep(0.32, 0.88, h));
    float s = max(dot(d, normalize(uSunDir)), 0.0);
    col += uSun * pow(s, 2.5) * 0.7;    // broad warm glow
    col += uSun * pow(s, 40.0) * 1.4;   // tight halo at the disc
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function Sky({ sunDirection }: { sunDirection: Vec3 }) {
  const dir = useMemo(
    () => new THREE.Vector3(...sunDirection).normalize(),
    [sunDirection],
  );

  const uniforms = useMemo(
    () => ({
      uZenith: { value: new THREE.Color('#0b0a12') },
      uHorizon: { value: new THREE.Color('#5a2f16') },
      uSun: { value: new THREE.Color('#ffc078') },
      uSunDir: { value: dir },
    }),
    [dir],
  );

  const sunPosition = useMemo(
    () => dir.clone().multiplyScalar(160),
    [dir],
  );

  return (
    <>
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
      <mesh position={sunPosition}>
        <sphereGeometry args={[7, 24, 24]} />
        <meshBasicMaterial color="#ffe6bf" fog={false} toneMapped={false} />
      </mesh>
    </>
  );
}
