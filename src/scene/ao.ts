import * as THREE from 'three';

/**
 * Ambient occlusion from the depth the scene already drew.
 *
 * The garden's shadows come from one directional sun, and a hemisphere light
 * fills everything the sun misses so nothing goes black. That fill is what keeps
 * a shadowed plant readable, and it is also what makes the scene look flat: a
 * hemisphere light reaches into every crevice equally, so the underside of a
 * canopy, the inside corner of a raised bed, and the gap where a trunk meets the
 * soil are all lit as though nothing were near them. Ambient occlusion is the
 * correction — darken a fragment in proportion to how much geometry is crowding
 * it — and it is what seats a plant *in* its bed rather than on top of it.
 *
 * **Why this is written rather than imported.** three ships `SSAOPass` and
 * `GTAOPass`, and both re-render the scene through `scene.overrideMaterial` to
 * collect depth and normals. That is exactly incompatible with this scene:
 * branches get their shape from a vertex shader (`taper.ts`), and an override
 * material replaces that shader, so every limb would enter the AO buffers as the
 * one-metre cylinder it is before the taper runs. The AO would then be computed
 * against geometry that is not on screen.
 *
 * Reading the depth buffer the beauty pass already wrote avoids the whole
 * problem: whatever the vertex stage did, it is in that depth, so the occlusion
 * is computed against exactly the garden the viewer is looking at. It is also
 * one scene render instead of three, which is most of why this is affordable at
 * all.
 *
 * Normals are reconstructed from depth derivatives rather than rendered, for the
 * same reason and at the same saving. That is the approximation this makes: a
 * derivative normal is wrong along a silhouette, where the depth buffer steps
 * between two surfaces, so a thin dark seam can appear at an edge. The radius is
 * kept small and the strength moderate, which is what holds that inside "felt
 * rather than seen".
 *
 * **Against the channel budget** (`DESIGN.md`), this is a lighting response and
 * not a hue: it scales luminance toward black in crevices and leaves colour
 * where it was, exactly as the generated textures do. It is also geometric — it
 * depends on how close surfaces are, and nothing in the garden moves a surface
 * because of a metric. A wilting plant occludes differently than an upright one
 * only in the sense that it is a different shape, which is the read the wilt
 * already carries.
 */

/**
 * How much a single neighbouring sample occludes, in [0, 1].
 *
 * `difference` is how far in front of the sample point the scene actually is, in
 * view-space metres: positive means something is standing between this fragment
 * and where we sampled, so it occludes. Two guards shape the response, and both
 * are what separate usable AO from a screen covered in dark halos:
 *
 * **A bias**, below which nothing counts. Without it a flat surface occludes
 * itself, because its own depth wanders by a fraction of a millimetre across
 * neighbouring pixels and every one of those reads as a tiny occluder.
 *
 * **A range falloff**, above which occlusion fades back out. An occluder a long
 * way in front is not shading this fragment, it is a different object entirely,
 * and counting it is what produces a dark outline round everything in the
 * foreground.
 *
 * This is exactly the scalar the shader computes per sample; the shader is this
 * arithmetic in GLSL, and keeping it here is the split `backlight` and
 * `blurAmount` already keep.
 */
export function sampleOcclusion(
  difference: number,
  radius: number,
  bias = 0.02,
): number {
  if (difference <= bias) return 0;
  // Beyond the radius the occluder is a separate object, not a crevice wall.
  const range = radius <= 0 ? 0 : Math.min(1, Math.max(0, radius / difference));
  return range;
}

/**
 * The occlusion of a whole kernel, in [0, 1], given how many of its samples were
 * blocked and how strongly.
 *
 * Averaged rather than summed, so the kernel size is a quality knob and not a
 * strength knob: dropping from sixteen samples to eight in a lean frame has to
 * make the AO noisier, never darker.
 */
export function kernelOcclusion(occlusions: readonly number[], strength: number): number {
  if (occlusions.length === 0) return 0;
  let total = 0;
  for (const occlusion of occlusions) total += occlusion;
  return Math.min(1, (total / occlusions.length) * strength);
}

export interface AmbientOcclusionOptions {
  /** How far, in view-space metres, a fragment looks for occluders. Roughly the
   *  size of the crevices it will find: a bed corner, a trunk in soil. */
  radius: number;
  /** Overall darkening. Above about one it stops reading as contact shading and
   *  starts reading as dirt. */
  strength: number;
  /** Depth difference below which nothing counts, in view-space metres. */
  bias: number;
  /** Samples per fragment. The whole cost, essentially. */
  samples: number;
}

/**
 * Tuned to be felt rather than seen, which is the rule every piece of decoration
 * in this scene keeps. The radius is a hand's breadth because that is the scale
 * of the gaps that actually exist here — soil against timber, a trunk against
 * the ground, one branch crossing another.
 */
export const GARDEN_AO: AmbientOcclusionOptions = {
  radius: 0.22,
  strength: 0.85,
  bias: 0.02,
  samples: 12,
};

/**
 * The pass.
 *
 * Takes the beauty buffer and the depth texture written alongside it, and
 * multiplies the colour down where geometry crowds. The kernel is a spiral of
 * `samples` points rotated per-fragment by a hash of its screen position, which
 * is the standard trade: a rotated low sample count reads as fine noise, while
 * an unrotated one reads as banding, and noise at this amplitude disappears into
 * the grain the scene already has.
 */
export function ambientOcclusionShader(
  options: AmbientOcclusionOptions = GARDEN_AO,
): THREE.ShaderMaterial['userData'] & {
  uniforms: Record<string, THREE.IUniform>;
  vertexShader: string;
  fragmentShader: string;
} {
  return {
    uniforms: {
      tDiffuse: { value: null },
      tDepth: { value: null },
      uProjectionInverse: { value: new THREE.Matrix4() },
      uProjection: { value: new THREE.Matrix4() },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uRadius: { value: options.radius },
      uStrength: { value: options.strength },
      uBias: { value: options.bias },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }`,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform sampler2D tDepth;
      uniform mat4 uProjectionInverse;
      uniform mat4 uProjection;
      uniform vec2 uResolution;
      uniform float uRadius;
      uniform float uStrength;
      uniform float uBias;
      varying vec2 vUv;

      const int SAMPLES = ${options.samples};

      /* Screen uv plus a depth-buffer reading, back into view space. */
      vec3 viewPositionAt( vec2 uv ) {
        float depth = texture2D( tDepth, uv ).x;
        vec4 clip = vec4( uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0 );
        vec4 view = uProjectionInverse * clip;
        return view.xyz / view.w;
      }

      float hash( vec2 p ) {
        return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
      }

      void main() {
        vec4 colour = texture2D( tDiffuse, vUv );
        float depth = texture2D( tDepth, vUv ).x;

        /* The far plane: sky, and nothing to occlude. Leaving it alone is also
           what keeps a dark rim off every silhouette against the sky. */
        if ( depth >= 1.0 ) {
          gl_FragColor = colour;
          return;
        }

        vec3 origin = viewPositionAt( vUv );

        /* Normal from the depth gradient. Cheap, and correct everywhere except
           across a silhouette, where the two derivatives straddle a step. */
        vec3 normal = normalize( cross( dFdx( origin ), dFdy( origin ) ) );

        /* Radius in screen space shrinks with distance, so a crevice occludes
           over the same number of metres whether it is near or far. */
        float scale = uRadius / max( 0.0001, -origin.z );
        float turn = hash( gl_FragCoord.xy ) * 6.2831853;

        float total = 0.0;
        for ( int i = 0; i < SAMPLES; i++ ) {
          /* A spiral: the angle winds round while the radius grows as a square
             root, which distributes points evenly over the disc instead of
             crowding them at the centre. */
          float t = ( float( i ) + 0.5 ) / float( SAMPLES );
          float angle = turn + t * 6.2831853 * 3.0;
          vec2 offset = vec2( cos( angle ), sin( angle ) ) * sqrt( t ) * scale;
          offset.y *= uResolution.x / uResolution.y;

          vec2 uv = vUv + offset;
          if ( uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 ) continue;

          vec3 sampled = viewPositionAt( uv );
          vec3 toSample = sampled - origin;
          float distance = length( toSample );
          if ( distance < 0.0001 ) continue;

          /* Only geometry standing in front of this fragment's own plane
             occludes it; the cosine weights an occluder overhead more than one
             off to the side. */
          float facing = max( 0.0, dot( normal, toSample / distance ) );
          float falloff = uRadius / max( uRadius, distance );
          total += step( uBias, facing * distance ) * facing * falloff;
        }

        float occlusion = clamp( ( total / float( SAMPLES ) ) * uStrength, 0.0, 1.0 );
        gl_FragColor = vec4( colour.rgb * ( 1.0 - occlusion ), colour.a );
      }`,
  };
}
