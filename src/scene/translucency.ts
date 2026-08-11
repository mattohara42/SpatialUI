import * as THREE from 'three';

/**
 * Leaves let the light through, as arithmetic and a shader patch.
 *
 * A leaf is thin, and the single most convincing thing a garden can do is glow
 * when the sun is behind it — the warm translucence of a canopy shot toward the
 * light. The scene had none: leaves were opaque solids on a plain material, lit
 * only from the front, so a backlit canopy read as a dark silhouette instead of
 * a lantern.
 *
 * This is the cheap approximation of that, the foliage trick from real-time
 * rendering (Barré-Brisebois): not true subsurface scattering, which would price
 * itself out against the hundreds of thousands of instanced leaves, but a single
 * term that adds light when the *view* points back toward the *sun* through the
 * leaf. It costs a few instructions in the fragment shader and nothing on the
 * CPU, and it obeys the channel budget in `DESIGN.md` for free: it is a lighting
 * response tinted by the sun, not a hue the plant carries, so it strengthens the
 * daylight read the scene already has rather than competing with the health read
 * that lives in the plant's colour and shape.
 *
 * The maths is kept pure and separate for the reason `look`, `sway`, and
 * `daylight` are: the shape of the response is the decision, and it should be
 * assertable without a renderer. `backlight` is exactly the scalar the shader
 * computes per fragment; the shader is that one line in GLSL.
 */

export interface BacklightOptions {
  /** How far the transmission bends toward the leaf's own normal, so a leaf that
   *  is not edge-on to the sun still glows a little. */
  distortion: number;
  /** Falloff sharpness. Higher keeps the glow to a tight halo around the sun;
   *  lower spreads it across more of the canopy. */
  power: number;
  /** Overall strength of the effect, before the sun's own colour and intensity. */
  scale: number;
}

/**
 * The resting look: a soft, fairly tight glow. Tuned so a canopy lights up
 * toward the sun without every leaf in the garden turning into a lamp.
 */
export const LEAF_BACKLIGHT: BacklightOptions = {
  distortion: 0.3,
  power: 3.2,
  scale: 0.9,
};

/**
 * How strongly light transmits through a leaf toward the viewer, in [0, scale].
 *
 * `view` is the direction from the leaf to the camera, `sun` the direction from
 * the leaf to the sun, `normal` the leaf's facing — all in the same space. The
 * transmitted direction is the sun's, bent toward the leaf's normal by
 * `distortion`; the response is how well the view aligns with it, raised to
 * `power`. Looking straight into the sun through a leaf is the maximum; with the
 * sun behind the camera it is zero, which is exactly a leaf that is front-lit and
 * should not glow at all.
 *
 * Vectors are normalized defensively so a caller need not pre-normalize.
 */
export function backlight(
  view: readonly [number, number, number],
  sun: readonly [number, number, number],
  normal: readonly [number, number, number],
  options: BacklightOptions = LEAF_BACKLIGHT,
): number {
  const v = normalize(view);
  const s = normalize(sun);
  const n = normalize(normal);
  const lt = normalize([
    s[0] - n[0] * options.distortion,
    s[1] - n[1] * options.distortion,
    s[2] - n[2] * options.distortion,
  ]);
  const aligned = Math.max(0, v[0] * lt[0] + v[1] * lt[1] + v[2] * lt[2]);
  return Math.pow(aligned, options.power) * options.scale;
}

export interface LeafTranslucency {
  material: THREE.MeshStandardMaterial;
  /**
   * Point the effect at the sun for this frame. The sun is given in world space
   * (it is `daylight.sunDirection`) and taken into the camera's space here, so
   * the glow tracks the day and season scrub without the caller doing any linear
   * algebra. Strength is the sun's own intensity, so the effect fades out at
   * dusk with everything else rather than glowing through the night.
   */
  update(
    camera: THREE.Camera,
    sunDirectionWorld: readonly [number, number, number],
    sunColor: string,
    sunStrength: number,
  ): void;
  dispose(): void;
}

/**
 * A leaf material that transmits light, and the handle to aim it each frame.
 *
 * It is an ordinary `MeshStandardMaterial` with one injected term, so it keeps
 * instancing, per-instance colour, shadows, and flat shading exactly as before —
 * nothing about how foliage is batched changes. The uniforms are held on this
 * closure and mutated by `update`; `onBeforeCompile` folds them into the shader
 * and adds the transmission to the outgoing light just before the fragment is
 * resolved.
 */
export function makeLeafMaterial(
  roughness: number,
  flatShading = true,
  options: BacklightOptions = LEAF_BACKLIGHT,
): LeafTranslucency {
  const uniforms = {
    uSunDirView: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color('#ffffff') },
    uSunStrength: { value: 0 },
    uDistort: { value: options.distortion },
    uPower: { value: options.power },
    uScale: { value: options.scale },
  };

  const material = new THREE.MeshStandardMaterial({ roughness, flatShading });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uSunDirView;
        uniform vec3 uSunColor;
        uniform float uSunStrength;
        uniform float uDistort;
        uniform float uPower;
        uniform float uScale;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
          // The transmitted direction: the sun's, bent toward the leaf's normal.
          vec3 lt = normalize( uSunDirView - normal * uDistort );
          float fLT = pow( clamp( dot( normalize( vViewPosition ), lt ), 0.0, 1.0 ), uPower ) * uScale;
          outgoingLight += fLT * uSunColor * diffuseColor.rgb * uSunStrength;
        }
        #include <opaque_fragment>`,
      );
  };

  const scratch = new THREE.Vector3();
  return {
    material,
    update(camera, sunDirectionWorld, sunColor, sunStrength) {
      // World sun direction into view space: rotation only, so a plain direction
      // transform by the view matrix, then normalized.
      scratch
        .set(sunDirectionWorld[0], sunDirectionWorld[1], sunDirectionWorld[2])
        .transformDirection(camera.matrixWorldInverse);
      uniforms.uSunDirView.value.copy(scratch);
      uniforms.uSunColor.value.set(sunColor);
      uniforms.uSunStrength.value = sunStrength;
    },
    dispose() {
      material.dispose();
    },
  };
}

function normalize(
  v: readonly [number, number, number],
): [number, number, number] {
  const length = Math.hypot(v[0], v[1], v[2]);
  if (length < 1e-9) return [0, 0, 0];
  return [v[0] / length, v[1] / length, v[2] / length];
}
