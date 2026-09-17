import * as THREE from 'three';

/**
 * A limb that narrows along its own length, and wears its bark at life size.
 *
 * `Branches.tsx` drew every segment from one shared cylinder and named the two
 * compromises that cost: a cylinder cannot narrow along its length without a
 * custom shader, so each segment was a barrel at the mean of its two radii and a
 * trunk read as a stack of them; and UVs belong to the shared geometry, so a
 * twig and a trunk got the same number of grain cycles along their length and
 * the twig's bark was compressed to a smear. Both were waiting on the same
 * shader, and the radii were already sitting in `segmentRadius`.
 *
 * This is that shader, as an instanced attribute and three patched chunks.
 * Each instance carries `aLimb` — its two radii and the two UV repeats its
 * physical size asks for — and the vertex stage:
 *
 *   1. scales the unit cylinder's cross-section by the radius interpolated
 *      between the ends, so a segment is a truncated cone rather than a barrel;
 *   2. tilts the side normals onto that cone, so the light agrees with the
 *      silhouette instead of lighting a cylinder that is no longer there;
 *   3. scales the map UVs by the limb's own length and girth, so bark grain is
 *      a fixed number of cycles per metre everywhere in the garden.
 *
 * The instance matrix stops carrying radius as a result — `Branches` now scales
 * it `(1, length, 1)` and the radial scale happens here. That is the one thing a
 * caller has to know, and it is why the depth material below exists: the shadow
 * pass does not run the colour material, so without the same patch every branch
 * would cast the shadow of a one-metre-radius cylinder.
 *
 * Channel-safe by construction, in the terms `DESIGN.md` sets: this changes a
 * silhouette and a UV rate, and touches neither hue nor any vital. A thick limb
 * is still maturity and a thin one still a twig, exactly as the generator
 * already decided — the shape is now drawn as it was always described.
 */

/**
 * Grain cycles per metre of limb. The bark map is one tile of streaks, so this
 * is how many times it repeats along a metre of trunk. Three is tuned by eye at
 * the distance a plant is read from: fewer and the streaks stretch into bands,
 * more and they alias into noise on a twig.
 */
export const GRAIN_PER_METRE = 3;

/**
 * The repeats already baked into the bark texture by `Branches`, which this has
 * to divide out: `surfaceTexture(barkPx, [1, 2])` means the shared geometry's
 * UVs already span one tile around the limb and two along it, so an instance
 * asking for `n` cycles per metre has to scale by `n / these`.
 */
export const BARK_REPEAT: readonly [number, number] = [1, 2];

/** The four floats one limb hands the vertex shader. */
export type LimbAttribute = readonly [
  radiusStart: number,
  radiusEnd: number,
  uvRepeatU: number,
  uvRepeatV: number,
];

/**
 * The attribute for one segment, from the geometry that describes it.
 *
 * Radii pass through untouched — the shader interpolates between them, which is
 * the whole point, and averaging them here is exactly the barrel this replaces.
 * The two repeats are the segment's physical size in grain cycles, divided by
 * what the texture already repeats: `v` runs along the limb, so it follows the
 * length; `u` runs around it, so it follows the circumference at the mean
 * radius. Scaling `u` too is what keeps the grain isotropic — a trunk given the
 * same one tile around as a twig has its streaks stretched four times wider.
 */
export function limbAttribute(
  radiusStart: number,
  radiusEnd: number,
  length: number,
  grainPerMetre = GRAIN_PER_METRE,
  repeat: readonly [number, number] = BARK_REPEAT,
): LimbAttribute {
  const meanRadius = (radiusStart + radiusEnd) / 2;
  const circumference = 2 * Math.PI * meanRadius;
  return [
    radiusStart,
    radiusEnd,
    (circumference * grainPerMetre) / repeat[0],
    (length * grainPerMetre) / repeat[1],
  ];
}

/**
 * The radius a fraction `t` along the limb, `t` running 0 at the start to 1 at
 * the end. The shader's `mix`, in TypeScript, so the shape the silhouette takes
 * is assertable without a renderer — the same split `backlight` and `blurAmount`
 * keep.
 */
export function taperedRadius(radiusStart: number, radiusEnd: number, t: number): number {
  return radiusStart + (radiusEnd - radiusStart) * t;
}

/**
 * The `y` a side normal needs in the unit cylinder's own space for the lighting
 * to land on the cone the taper just carved.
 *
 * A truncated cone of height `h` and radii `r0`, `r1` has surface normals
 * proportional to `(cos, (r0 - r1) / h, sin)`. Here `h` is 1, because the
 * geometry is a unit cylinder and the instance matrix does the lengthening —
 * and three's instanced normal path divides each component by its column's
 * squared scale before applying the matrix, which is the inverse transpose, so
 * the `y` written here arrives in world space already divided by the length.
 * That is why this takes no length: the renderer supplies it.
 */
export function coneNormalY(radiusStart: number, radiusEnd: number): number {
  return radiusStart - radiusEnd;
}

/** Vertex-stage declarations, shared by the colour and depth materials. */
const LIMB_DECLARATIONS = `
attribute vec4 aLimb;   // radiusStart, radiusEnd, uvRepeatU, uvRepeatV
`;

/**
 * Carve the unit cylinder into the cone this limb actually is.
 *
 * `position.y` runs -0.5 at the start to +0.5 at the end, so `t` is the fraction
 * along the limb and the cross-section scales by the radius there. The caps come
 * along for free: their vertices sit at the two ends, where `t` is 0 or 1 and the
 * radius is exactly the end radius they should match.
 */
const LIMB_TAPER = `
#include <begin_vertex>
float limbT = position.y + 0.5;
transformed.xz *= mix( aLimb.x, aLimb.y, limbT );
`;

/**
 * Tilt the side normals onto the cone.
 *
 * Only the sides: a cap's normal is (0, ±1, 0) and is already right, and
 * rewriting it would light the end of every twig as though it faced sideways.
 * The half threshold separates them cleanly, because a side normal on a limb
 * this slender is very nearly horizontal.
 */
const LIMB_NORMAL = `
#include <beginnormal_vertex>
if ( abs( objectNormal.y ) < 0.5 ) {
  objectNormal = normalize( vec3( objectNormal.x, aLimb.x - aLimb.y, objectNormal.z ) );
}
`;

/**
 * Scale the map UVs to the limb's physical size.
 *
 * Patched after `<uv_vertex>`, which is where three assigns each map's varying
 * from the shared attribute and that map's transform. Every map on this material
 * gets the same treatment because they are three views of one grain — the albedo
 * darkens a ridge, the normal raises it, the roughness matts its crevice — and
 * scaling them apart would slide the three out of register. A material without
 * one of these maps simply does not contain the line, and the replace is a
 * no-op.
 */
const LIMB_UV = `
#include <uv_vertex>
#ifdef USE_MAP
vMapUv *= vec2( aLimb.z, aLimb.w );
#endif
#ifdef USE_NORMALMAP
vNormalMapUv *= vec2( aLimb.z, aLimb.w );
#endif
#ifdef USE_ROUGHNESSMAP
vRoughnessMapUv *= vec2( aLimb.z, aLimb.w );
#endif
`;

/** Fold the limb patch into a material's vertex stage. */
function patchVertex(material: THREE.Material, withNormals: boolean): void {
  const existing = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    existing?.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>${LIMB_DECLARATIONS}`)
      .replace('#include <begin_vertex>', LIMB_TAPER)
      .replace('#include <uv_vertex>', LIMB_UV);
    if (withNormals) {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <beginnormal_vertex>',
        LIMB_NORMAL,
      );
    }
  };
  // Two materials compiled from the same source but patched differently would
  // otherwise collide in three's program cache and one would silently get the
  // other's shader.
  material.customProgramCacheKey = () => `limb:${withNormals ? 'lit' : 'depth'}`;
}

export interface TaperedBark {
  material: THREE.MeshStandardMaterial;
  /**
   * The matching depth material. Assigned to the mesh's `customDepthMaterial`,
   * it is what keeps shadows honest: the shadow pass never runs the colour
   * material, and the instance matrix no longer carries radius, so without this
   * every branch would cast a one-metre cylinder across the garden.
   */
  depthMaterial: THREE.MeshDepthMaterial;
  dispose(): void;
}

/**
 * A bark material that tapers, and the depth material that makes its shadow
 * agree. `parameters` are the ordinary `MeshStandardMaterial` ones — the maps
 * and the lifted colour `Branches` already chose — and nothing about instancing,
 * per-instance colour, or batching changes.
 */
export function makeTaperedBark(
  parameters: THREE.MeshStandardMaterialParameters,
): TaperedBark {
  const material = new THREE.MeshStandardMaterial(parameters);
  patchVertex(material, true);

  const depthMaterial = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
  });
  patchVertex(depthMaterial, false);

  return {
    material,
    depthMaterial,
    dispose() {
      material.dispose();
      depthMaterial.dispose();
    },
  };
}
