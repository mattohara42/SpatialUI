import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * Tilt-shift on the bonsai table, so the miniature reads as a model.
 *
 * A tilt-shift photograph makes a city look like a train set: a thin band across
 * the middle is sharp and everything above and below it falls out of focus, and
 * the eye reads that shallow depth as *closeness*, so a real place looks tiny.
 * The bonsai table (see `bonsai.ts`) is the same trick in reverse — a whole
 * garden shrunk and set on a table — and this is what tells the eye it is a
 * model rather than a garden seen from a strange height.
 *
 * It is deliberately only mounted in table mode. Post-processing is a full-screen
 * pass and the first real bite out of the headset frame budget (`docs/graphics.md`),
 * and the room view neither needs it nor can spare it; so `Garden` renders this
 * only on the table, and when it unmounts the default render resumes untouched.
 *
 * Built on three's own `EffectComposer` rather than a new dependency, in keeping
 * with the self-contained rule the rest of the scene follows — the blur is one
 * separable Gaussian run twice, horizontal then vertical, its radius driven by
 * how far a fragment sits from the sharp band. That band function is pure and
 * tested (`blurAmount`); the shader is the same arithmetic in GLSL.
 */

/**
 * How much blur a fragment gets, in [0, max], from its vertical screen position.
 *
 * Zero inside a band of half-width `band` about `focus`, then ramping smoothly to
 * `max` over the next `feather` of screen. Smoothstep rather than linear so the
 * transition out of focus has no hard edge — a visible line where blur switched
 * on would give the trick away.
 */
export function blurAmount(
  uvY: number,
  focus: number,
  band: number,
  feather: number,
  max: number,
): number {
  const distance = Math.abs(uvY - focus) - band;
  if (distance <= 0) return 0;
  const t = Math.min(1, distance / feather);
  const smooth = t * t * (3 - 2 * t);
  return smooth * max;
}

const TiltShiftShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uDir: { value: new THREE.Vector2(0, 0) },
    uFocus: { value: 0.5 },
    uBand: { value: 0.08 },
    uFeather: { value: 0.34 },
    uMax: { value: 9 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 uDir;      // one texel along the blur axis
    uniform float uFocus;
    uniform float uBand;
    uniform float uFeather;
    uniform float uMax;
    varying vec2 vUv;

    void main() {
      float d = abs( vUv.y - uFocus ) - uBand;
      float t = clamp( d / uFeather, 0.0, 1.0 );
      float amt = t * t * ( 3.0 - 2.0 * t );
      float r = amt * uMax;
      vec2 s = uDir * r;

      // Nine-tap Gaussian along the axis in uDir.
      vec4 sum = texture2D( tDiffuse, vUv ) * 0.227027;
      sum += texture2D( tDiffuse, vUv + s * 1.0 ) * 0.1945946;
      sum += texture2D( tDiffuse, vUv - s * 1.0 ) * 0.1945946;
      sum += texture2D( tDiffuse, vUv + s * 2.0 ) * 0.1216216;
      sum += texture2D( tDiffuse, vUv - s * 2.0 ) * 0.1216216;
      sum += texture2D( tDiffuse, vUv + s * 3.0 ) * 0.0540540;
      sum += texture2D( tDiffuse, vUv - s * 3.0 ) * 0.0540540;
      sum += texture2D( tDiffuse, vUv + s * 4.0 ) * 0.0162162;
      sum += texture2D( tDiffuse, vUv - s * 4.0 ) * 0.0162162;
      gl_FragColor = sum;
    }`,
};

export interface TiltShiftProps {
  /** Centre of the sharp band, in screen uv (0 bottom, 1 top). */
  focus?: number;
  /** Half-width of the fully-sharp band. */
  band?: number;
  /** How far past the band the blur reaches its maximum. */
  feather?: number;
  /** Maximum blur radius, in texels. */
  max?: number;
}

export function TiltShift({
  focus = 0.52,
  band = 0.07,
  feather = 0.32,
  max = 9,
}: TiltShiftProps) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  const { composer, horizontal, vertical } = useMemo(() => {
    const composer = new EffectComposer(gl);
    composer.addPass(new RenderPass(scene, camera));
    const horizontal = new ShaderPass(TiltShiftShader);
    const vertical = new ShaderPass(TiltShiftShader);
    composer.addPass(horizontal);
    composer.addPass(vertical);
    // OutputPass applies tone mapping and the sRGB conversion the renderer would
    // otherwise do itself, so the composited image matches the direct render
    // rather than coming out flat and linear.
    composer.addPass(new OutputPass());
    return { composer, horizontal, vertical };
  }, [gl, scene, camera]);

  // Band settings are the same on both passes; only the blur axis differs, and
  // the axis is one texel, so it depends on the render size.
  useEffect(() => {
    const dpr = gl.getPixelRatio();
    composer.setPixelRatio(dpr);
    composer.setSize(size.width, size.height);
    for (const pass of [horizontal, vertical]) {
      pass.uniforms.uFocus.value = focus;
      pass.uniforms.uBand.value = band;
      pass.uniforms.uFeather.value = feather;
      pass.uniforms.uMax.value = max;
    }
    horizontal.uniforms.uDir.value.set(1 / (size.width * dpr), 0);
    vertical.uniforms.uDir.value.set(0, 1 / (size.height * dpr));
  }, [composer, horizontal, vertical, size, gl, focus, band, feather, max]);

  useEffect(() => () => composer.dispose(), [composer]);

  // Priority > 0 hands the render loop to us: R3F stops its automatic render, so
  // the composer is the only thing drawing while this is mounted. Unmounting
  // drops the priority frame and the default render resumes on its own.
  useFrame(() => {
    composer.render();
  }, 1);

  return null;
}
