import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ambientOcclusionShader, GARDEN_AO } from './ao';
import { TILT_SHIFT_SHADER } from './tiltshift';
import { needsComposer, settingsFor } from './quality';
import { useQualityTier } from './useQuality';
import type { ViewMode } from './Garden';

/**
 * Every full-screen pass in the scene, in one chain.
 *
 * There can only be one. A pass that composites has to own the render loop —
 * R3F's automatic render has to be handed over, and whatever draws last decides
 * what reaches the screen — so two components each running their own composer
 * would fight, and the loser's work would be thrown away every frame. The
 * tilt-shift used to own a composer of its own, which was fine while it was the
 * only effect; it is not fine now that ambient occlusion and bloom exist, so the
 * chain lives here and the effects are passes in it.
 *
 * The chain, in the order it has to run:
 *
 *   scene        rendered once, into a buffer that keeps its depth
 *   occlusion    darkens where geometry crowds, reading that depth
 *   bloom        spreads only the brightest things
 *   tilt-shift   two separable blurs, table view only
 *   output       tone mapping and the sRGB conversion, to the screen
 *
 * Order is not arbitrary. Occlusion and bloom both want light values as the
 * renderer produced them — linear, unclamped — so they run before the output
 * pass does tone mapping, which is the step that squeezes highlights down into a
 * displayable range. Bloom applied after tone mapping would find nothing bright
 * left to bloom. The tilt-shift runs last of the effects because it is the
 * camera's own defocus: it should blur the finished image, including the glow.
 *
 * **Why the buffers are managed here rather than by `EffectComposer`.** The
 * occlusion pass needs the depth buffer from the scene render, and a composer
 * ping-pongs between two targets that it swaps without telling anyone, so which
 * of them holds the depth that was written this frame is not something a pass
 * can rely on. Driving the passes directly is a dozen lines, makes the ordering
 * above literal, and means the depth the occlusion reads is provably the depth
 * the beauty pass just wrote.
 *
 * What runs is `quality.ts`'s decision, and it is a real fork rather than a
 * setting nobody changes: in a browser window the whole chain runs, and the
 * moment a WebXR session starts everything that costs pixels drops out and the
 * headset gets the direct render its 5.5ms frame was written for.
 */

/**
 * Bloom, as three numbers.
 *
 * The threshold sits above one deliberately, and that is the number that decides
 * whether this effect is restraint or a filter: see where it is used below.
 */
const BLOOM = { strength: 0.5, radius: 0.6, threshold: 1.15 };

/**
 * One pass in the chain. Given the buffer holding the image so far and a spare
 * to draw into, it returns whichever of the two now holds the result.
 *
 * Returning it rather than assuming `write` is not ceremony. three's passes do
 * not agree on where they put their output: a `ShaderPass` writes forward into
 * the write buffer, while `UnrealBloomPass` declares `needsSwap = false` and
 * blends its glow *back into the read buffer* it was handed. A chain that
 * assumed the first convention silently advanced onto an untouched buffer after
 * the bloom and rendered a black screen.
 */
type Stage = (
  read: THREE.WebGLRenderTarget,
  write: THREE.WebGLRenderTarget,
) => THREE.WebGLRenderTarget;

export function Post({ viewMode }: { viewMode: ViewMode }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  const tier = useQualityTier();
  const settings = useMemo(() => settingsFor(tier), [tier]);
  const table = viewMode === 'table';

  const rig = useMemo(() => {
    // The beauty buffer keeps its depth as a texture rather than as a plain
    // renderbuffer, which is the whole reason the occlusion pass can work
    // against the geometry actually on screen — vertex shaders and all — instead
    // of re-rendering the scene through an override material that would undo
    // them (see ao.ts).
    const depthTexture = new THREE.DepthTexture(1, 1);
    const beauty = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthTexture,
      depthBuffer: true,
    });
    const scratch = [
      new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false }),
      new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false }),
    ] as const;

    const ao = ambientOcclusionShader(GARDEN_AO);
    const aoMaterial = new THREE.ShaderMaterial({
      uniforms: ao.uniforms,
      vertexShader: ao.vertexShader,
      fragmentShader: ao.fragmentShader,
      // Every full-screen pass draws over whatever is there, and testing a quad
      // against the depth of the scene it is filtering would reject most of it.
      depthTest: false,
      depthWrite: false,
    });
    const aoQuad = new FullScreenQuad(aoMaterial);

    const makeBlur = () => {
      const material = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.clone(TILT_SHIFT_SHADER.uniforms),
        vertexShader: TILT_SHIFT_SHADER.vertexShader,
        fragmentShader: TILT_SHIFT_SHADER.fragmentShader,
        depthTest: false,
        depthWrite: false,
      });
      return { material, quad: new FullScreenQuad(material) };
    };
    const horizontal = makeBlur();
    const vertical = makeBlur();

    // Restrained on purpose, and the threshold is the part that matters.
    //
    // The beauty buffer is linear and unclamped, so a bright midday sky sits
    // near white and the sun sits well above it. A threshold below one therefore
    // catches the *sky*, and a bloom over the whole sky is a soft filter over
    // the whole garden: it lifts the black point, flattens the contrast between
    // a full canopy and a thin one, and quietly spends the colour channel that
    // `DESIGN.md` keeps deliberately empty. Above one, only things genuinely
    // brighter than white glow — the sun, glass catching it, a white bloom in
    // full light — which is what bloom is for.
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      BLOOM.strength,
      BLOOM.radius,
      BLOOM.threshold,
    );

    const output = new OutputPass();

    return { beauty, scratch, aoMaterial, aoQuad, horizontal, vertical, bloom, output };
  }, []);

  useEffect(
    () => () => {
      rig.beauty.depthTexture?.dispose();
      rig.beauty.dispose();
      for (const target of rig.scratch) target.dispose();
      rig.aoQuad.dispose();
      rig.aoMaterial.dispose();
      rig.horizontal.quad.dispose();
      rig.horizontal.material.dispose();
      rig.vertical.quad.dispose();
      rig.vertical.material.dispose();
      rig.bloom.dispose();
      rig.output.dispose();
    },
    [rig],
  );

  // Buffers follow the drawing buffer, not the CSS size: a pass filters pixels,
  // so on a 2x display it has twice as many of them to filter.
  useEffect(() => {
    const dpr = gl.getPixelRatio();
    const width = Math.max(1, Math.floor(size.width * dpr));
    const height = Math.max(1, Math.floor(size.height * dpr));

    rig.beauty.setSize(width, height);
    for (const target of rig.scratch) target.setSize(width, height);
    rig.bloom.setSize(width, height);

    rig.aoMaterial.uniforms.uResolution.value.set(width, height);
    for (const blur of [rig.horizontal, rig.vertical]) {
      blur.material.uniforms.uFocus.value = 0.52;
      blur.material.uniforms.uBand.value = 0.07;
      blur.material.uniforms.uFeather.value = 0.32;
      blur.material.uniforms.uMax.value = 9;
    }
    rig.horizontal.material.uniforms.uDir.value.set(1 / width, 0);
    rig.vertical.material.uniforms.uDir.value.set(0, 1 / height);
  }, [rig, gl, size]);

  // Priority > 0 hands the render loop over: R3F stops its automatic render, so
  // this is the only thing drawing while it is mounted. Unmounting drops the
  // priority frame and the default render resumes on its own — which is exactly
  // what a step-down to the lean tier in the room view wants to happen.
  useFrame(() => {
    const { beauty, scratch, aoMaterial, aoQuad, horizontal, vertical, bloom, output } = rig;

    // One scene render, into a buffer that keeps its depth.
    gl.setRenderTarget(beauty);
    gl.clear();
    gl.render(scene, camera);

    const stages: Stage[] = [];

    if (settings.ambientOcclusion) {
      stages.push((read, write) => {
        aoMaterial.uniforms.tDiffuse.value = read.texture;
        // Always the beauty pass's own depth, whichever colour buffer we happen
        // to be reading by now.
        aoMaterial.uniforms.tDepth.value = beauty.depthTexture;
        aoMaterial.uniforms.uProjection.value.copy(camera.projectionMatrix);
        aoMaterial.uniforms.uProjectionInverse.value.copy(camera.projectionMatrixInverse);
        gl.setRenderTarget(write);
        aoQuad.render(gl);
        return write;
      });
    }

    if (settings.bloom) {
      stages.push((read, write) => {
        // Blends additively into `read` and leaves `write` untouched; see Stage.
        bloom.renderToScreen = false;
        bloom.render(gl, write, read, 0, false);
        return read;
      });
    }

    if (table && settings.tiltShift) {
      for (const blur of [horizontal, vertical]) {
        stages.push((read, write) => {
          blur.material.uniforms.tDiffuse.value = read.texture;
          gl.setRenderTarget(write);
          blur.quad.render(gl);
          return write;
        });
      }
    }

    // The spare is always whichever scratch buffer is not currently being read,
    // so a stage never reads and writes the same texture. Picking it this way
    // rather than by alternating is what makes it correct for a stage like the
    // bloom, which returns the buffer it was handed rather than the spare.
    let read: THREE.WebGLRenderTarget = beauty;
    for (const stage of stages) {
      const write = read === scratch[0] ? scratch[1] : scratch[0];
      read = stage(read, write);
    }

    // Tone mapping and the sRGB conversion the renderer would otherwise have
    // done itself, straight to the screen.
    output.renderToScreen = true;
    gl.setRenderTarget(null);
    output.render(gl, null as unknown as THREE.WebGLRenderTarget, read, 0, false);
  }, 1);

  return null;
}

/**
 * The chain, or nothing.
 *
 * Mounted rather than switched inside, because a frame loop that decided every
 * frame whether to run would still have claimed the render loop from R3F and
 * would then have to reproduce the plain render itself. Unmounting hands it back
 * instead, which is the same trick the tilt-shift used to play in the room view
 * and the reason a stepped-down headset frame costs exactly nothing.
 */
export function PostChain({ viewMode }: { viewMode: ViewMode }) {
  const tier = useQualityTier();
  const settings = settingsFor(tier);
  if (!needsComposer(settings, viewMode === 'table')) return null;
  return <Post viewMode={viewMode} />;
}
