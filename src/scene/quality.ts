/**
 * How much rendering this frame can afford.
 *
 * `docs/graphics.md` named a fork and then settled it: XR stays a target, and a
 * headset is 90Hz across two eyes, which is a ~5.5ms frame. Post-processing is
 * the first real bite out of that, because every effect is a full-screen pass
 * whose cost scales with pixels rather than with how much garden is in them.
 *
 * The decision taken here is **desktop-first with an automatic step-down**. In a
 * browser window the full stack runs and the scene looks as good as it can; the
 * moment a WebXR session starts, the passes that cost pixels drop out and what
 * is left is the direct render the headset budget was written for. That is worth
 * stating plainly because the alternative — holding every effect back to what a
 * headset can afford — makes the desktop view, which is where the scene is
 * mostly looked at today, worse for the benefit of a device that is a target
 * rather than a shipped path.
 *
 * Nothing in the step-down touches the reading. The tiers differ in post and in
 * shadow resolution; they do not differ in what a plant looks like, what colour
 * it takes, or what it is doing. A wilting plant wilts identically in both, which
 * is the property that makes it safe to switch tiers mid-session without the
 * garden appearing to say something new.
 *
 * Pure, and kept out of the component for the reason `daylight` and `greenhouse`
 * are: what an effect costs against a budget is a decision, and it should be
 * arguable in a test.
 */

export type QualityTier = 'rich' | 'lean';

export interface QualitySettings {
  /**
   * Ambient occlusion: the contact darkening that seats a plant in its soil and
   * gives the greenhouse frame weight. One full-screen pass over the depth the
   * scene already rendered.
   */
  ambientOcclusion: boolean;
  /**
   * Bloom on the brightest things only — the sun, and a white bloom in full
   * light. Two passes plus the blur chain, and the first thing to go.
   */
  bloom: boolean;
  /**
   * Tilt-shift on the bonsai table. Cheaper than it looks, and it is the effect
   * that most rewards the mode it runs in, so it survives a step-down: the table
   * is a whole garden at arm's length, where the frame has the least real work
   * in it anyway.
   */
  tiltShift: boolean;
  /** Edge of the sun's shadow map. Halving it in a headset is four times less
   *  shadow to render for a resolution nobody resolves at speed. */
  shadowMapSize: number;
}

const RICH: QualitySettings = {
  ambientOcclusion: true,
  bloom: true,
  tiltShift: true,
  shadowMapSize: 2048,
};

const LEAN: QualitySettings = {
  ambientOcclusion: false,
  bloom: false,
  tiltShift: true,
  shadowMapSize: 1024,
};

/**
 * Which tier a frame gets.
 *
 * Presenting to a headset is the one condition that forces the lean tier, and it
 * forces it absolutely: the budget there is a hard 5.5ms across two eyes, and an
 * effect that overruns it does not degrade gracefully, it drops frames in
 * something strapped to a face.
 *
 * A reduced-motion preference steps down too. That is not a performance
 * judgement — it is that bloom and a shallow focus band are exactly the sort of
 * full-screen visual effect the preference is asking to be spared, and honouring
 * it costs nothing the reading depends on.
 */
export function tierFor(presenting: boolean, prefersReducedEffects = false): QualityTier {
  if (presenting) return 'lean';
  if (prefersReducedEffects) return 'lean';
  return 'rich';
}

/** What a tier turns on. */
export function settingsFor(tier: QualityTier): QualitySettings {
  return tier === 'rich' ? RICH : LEAN;
}

/**
 * Whether any pass at all is wanted, which is what decides between running the
 * composer and letting the renderer draw straight to the screen.
 *
 * Worth its own function because the answer is mode-dependent: the table always
 * wants the tilt-shift, so it always composites, while the room in the lean tier
 * wants nothing and should pay nothing — a composer that runs only an output
 * pass is a full-screen blit for no reason.
 */
export function needsComposer(settings: QualitySettings, table: boolean): boolean {
  if (table && settings.tiltShift) return true;
  return settings.ambientOcclusion || settings.bloom;
}
