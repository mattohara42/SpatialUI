import * as THREE from 'three';

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
 * It is deliberately only used in table mode. Post-processing is a full-screen
 * pass and the first real bite out of the headset frame budget
 * (`docs/graphics.md`), and the room view neither needs it nor can spare it; so
 * `Post` adds these two passes only on the table.
 *
 * Built by hand rather than pulled in as a dependency, in keeping with the
 * self-contained rule the rest of the scene follows — the blur is one separable
 * Gaussian run twice, horizontal then vertical, its radius driven by how far a
 * fragment sits from the sharp band. That band function is pure and tested
 * (`blurAmount`); the shader is the same arithmetic in GLSL.
 *
 * This is the shader and the arithmetic only. The passes that run it, and the
 * chain they sit in, are `Post.tsx`: one composer has to own every full-screen
 * pass in the scene, because two of them would each claim the render loop and
 * fight over it.
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

export const TILT_SHIFT_SHADER = {
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
