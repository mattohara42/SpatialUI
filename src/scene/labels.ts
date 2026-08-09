/**
 * When a label is there, and how big it is.
 *
 * A name is not part of the reading (see `ecosystem/labels.ts`), and a garden
 * with thirty-two floating captions in it would be a chart with foliage — every
 * one of them competing for the glance that shape and colour are supposed to
 * own. So labels are not drawn at a distance at all. They resolve as you come
 * close, the way a nursery tag does: from across the greenhouse you see plants,
 * and when you walk up to one you find out which it is.
 *
 * That is a real interaction rather than a fade. The distance thresholds are the
 * whole design decision, so they live here where they can be argued with and
 * asserted, rather than as two numbers inside a `useFrame`.
 *
 * Pure, no three.js: the component measures a distance and asks this what to do
 * with it.
 */

/**
 * Metres from the camera at which a tag is completely absent, and at which it is
 * fully legible.
 *
 * `NEAR` is set from readability rather than taste: the card is 42cm of a scene
 * about 6m wide at that distance, so the mark is around a tenth of the frame's
 * width and reads without leaning in. `FAR` is roughly a bed and a path away —
 * near enough that walking to a plant brings its neighbours in with it, which is
 * what makes the beds legible as a group once you are among them, and far enough
 * that the default view of a whole house has no text in it whatsoever.
 */
export const LABEL_FAR = 9;
export const LABEL_NEAR = 4.5;

/**
 * How present a tag is at a given distance: 0 beyond `LABEL_FAR`, 1 within
 * `LABEL_NEAR`, and smooth between.
 *
 * Smoothstep rather than linear, because the ends are where a fade is noticed. A
 * linear ramp pops on at the far end — the eye catches the first instant of
 * motion far more readily than the middle of it — and the whole intent is that
 * labels *arrive* rather than switch on.
 */
export function legibility(distance: number): number {
  if (distance >= LABEL_FAR) return 0;
  if (distance <= LABEL_NEAR) return 1;
  const t = (LABEL_FAR - distance) / (LABEL_FAR - LABEL_NEAR);
  return t * t * (3 - 2 * t);
}

/** Below this, a tag is not worth drawing at all. */
export const LABEL_CUTOFF = 0.01;

/** Whether a tag at this distance should be in the scene this frame. */
export function isVisible(distance: number): boolean {
  return legibility(distance) > LABEL_CUTOFF;
}

/**
 * The tag itself, in metres. A garden centre plant label, near enough: a stake
 * pushed into the soil with a card on top of it, standing about knee height on
 * the plant so it never hides the thing it names.
 */
export const TAG = {
  /** The printed card. Wide, because what goes on it is a name: a roundel and
   *  three or four syllables need the room, and a squarer card spends most of
   *  its face on the badge and then abbreviates the thing it is naming. */
  width: 0.58,
  height: 0.26,
  /** Top of the stake, measured up from the soil. */
  stake: 0.34,
  stakeWidth: 0.028,
  stakeThickness: 0.012,
  /** How far to one side of the stem it is pushed in. */
  offset: 0.26,
} as const;

/** Height of the card's centre above the soil. */
export const CARD_Y = TAG.stake + TAG.height / 2 - 0.02;

/** Pixels per metre when the card is drawn. 42cm at this density is a 600px
 *  wide texture, which is a plate that survives being walked up to. */
export const TAG_PIXELS_PER_METRE = 1400;
