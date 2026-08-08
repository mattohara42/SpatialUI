/**
 * Dust: what neglect looks like up close.
 *
 * Staleness — a node whose adapter has stopped reporting — already has two
 * cues, and both of them are silhouette cues. A stale plant greys, and a stale
 * plant stops moving. Those work across the room, which is the reading the
 * product is built around, and they are the reason silence cannot pass for
 * health. What they do not do is survive a close approach: standing at the bed,
 * a grey motionless plant is just a plant you have not looked at hard enough,
 * and DESIGN.md has carried "what is still owed is the dust" as an open debt
 * since the staleness state was built. This is that cue.
 *
 * It reads as neglect for three reasons, all of them inversions of the mote
 * field that carries activity (see Motes.tsx):
 *
 *   motes rise, dust falls          one is life, the other is settling
 *   motes glow (additive), dust dulls (normal-blended, grey)
 *   motes thicken with activity, dust thickens with silence
 *
 * The last one is the useful part: how thick the dust is says *how long* the
 * silence has been, which none of the other staleness cues carry. Grey is
 * binary and stillness is binary; a node ten minutes past its threshold and one
 * three days past look identical. Density is the only place that duration
 * shows, so it earns its keep rather than merely restating the silhouette.
 *
 * Pure, and kept out of the component for the same reason `sway` and `daylight`
 * are: the ramp is the design decision and it should be testable without a
 * renderer.
 */

/**
 * Particles reserved per stale plant. This is a capacity, not a count — the
 * density ramp draws a prefix of it — so it bounds the buffer while letting the
 * visible amount move continuously.
 */
export const DUST_PER_PLANT = 48;

/**
 * Staleness at which the dust reaches full thickness, in multiples of the
 * garden's own threshold. Staleness starts at 1 (exactly at the threshold), so
 * the ramp spans two further multiples: a node that has just tipped over is
 * barely dusty, and one that is three times late is unmistakable. Set against
 * the threshold rather than a wall-clock duration because the threshold is
 * already the per-garden judgement about what counts as late — a fifteen second
 * scrape and an hourly one disagree about that by orders of magnitude.
 */
export const DUST_FULL_AT = 3;

/** Metres per second a speck settles. Slow enough to read as hanging in the air
 *  rather than falling, which is the difference between dust and rain. */
export const DUST_FALL_SPEED = 0.035;

/**
 * How far up the plant the dust reaches, and how far out from its trunk, in
 * metres.
 *
 * Both are caps rather than proportions. Filling a whole tree's bounding volume
 * spread the same specks over cubic metres of air and they read as the ambient
 * mote field rather than as dust — the first version of this was invisible for
 * exactly that reason. Dust settles: keeping it low and close to the trunk
 * concentrates it where someone standing at the bed is looking, and is also what
 * real neglect looks like.
 */
export const DUST_CEILING = 1.4;
export const DUST_RADIUS = 0.8;

/**
 * How thick the dust is on a plant, 0 to 1, from its staleness.
 *
 * Zero at and below the threshold, so this never contradicts the other cues: a
 * plant that is still moving and still coloured is never dusty. The ramp then
 * runs continuously, so dust accumulates as the silence lengthens instead of
 * appearing all at once — a pop would read as an event, and nothing happened.
 */
export function dustDensity(stale: number): number {
  if (stale <= 1) return 0;
  const span = DUST_FULL_AT - 1;
  const t = (stale - 1) / span;
  return t > 1 ? 1 : t;
}

/** How many of a plant's reserved particles are currently drawn. */
export function dustCount(stale: number, capacity = DUST_PER_PLANT): number {
  return Math.round(dustDensity(stale) * capacity);
}

/**
 * One settling step. Returns the new height, wrapping back to the top of the
 * column once a speck reaches the ground, so a fixed set of particles reads as
 * a continuous fall without ever being allocated again.
 *
 * Wrapping rather than clamping is what keeps it looping; the modulo is taken on
 * the span so a large delta (a backgrounded tab resuming) cannot drop a speck
 * below the ground.
 */
export function settle(y: number, base: number, top: number, distance: number): number {
  const span = top - base;
  if (span <= 0) return base;
  const fallen = y - distance - base;
  return base + ((fallen % span) + span) % span;
}
