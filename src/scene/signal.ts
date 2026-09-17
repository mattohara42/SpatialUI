/**
 * The plume: which way a plant is going, said in the air around it.
 *
 * `trend` has had a row in the channel table since the first design pass —
 * "fresh growth or shedding, reads at a few metres" — and until now it was the
 * only row in that table with nothing behind it. The axis was computed by every
 * translator, carried through history, and shown as a number in the detail
 * panel, and the scene never drew it. DESIGN.md says so in as many words while
 * arguing about its calibration: the fresh-growth channel was unspent.
 *
 * This spends it. A plant that is climbing throws a plume of bright specks
 * *upward* through its canopy; a plant that is falling sheds a drift of dull
 * ones *downward* to the soil. Direction is the reading and colour restates it,
 * which is the order those two have always gone in here.
 *
 * Three things make it affordable rather than a tenth signal fighting for the
 * eye:
 *
 * **It is mostly absent.** Below the deadband nothing is drawn at all, so a
 * garden that is merely sitting somewhere has no plumes in it and the ones that
 * appear are the plants worth walking over to. A cue that is on everywhere is
 * wallpaper, and wallpaper is what the channel budget is rationing against.
 *
 * **It never lands on a silent plant.** A stale plant is showing an old number,
 * and an old number has no direction: the trend under it is the last one anyone
 * heard, not the one it is on. So staleness suppresses the plume outright. That
 * is also what keeps this clear of the dust (see dust.ts), the other per-plant
 * particle cue — the two can never appear on the same plant, so a falling speck
 * means *this is going down* on a plant that is still coloured and still
 * swaying, and it means *nobody has heard from this* on a plant that is grey and
 * still.
 *
 * **Polarity is applied first.** A weed growing fast is bad news, and the plume
 * has to say so or it would contradict the shape read, which is the one reading
 * that must never wobble. `signalTrend` in ecosystem/types is the single place
 * that inversion happens, exactly as `signalHealth` is for the level.
 *
 * Pure, and kept out of the component for the reason `dust`, `sway` and
 * `daylight` are: the ramp and the thresholds are the design decision, and they
 * should be arguable in a test without a renderer.
 */

/**
 * Particles reserved per plumed plant. A capacity, not a count — the ramp draws
 * a prefix of it — so the buffer is bounded while the visible amount moves
 * continuously.
 *
 * Deliberately a fraction of what the dust gets (48). Dust has one plant's full
 * attention and has to read as an accumulation; a plume reads as a direction,
 * which a handful of specks carries, and the world garden can put a plume on a
 * hundred and sixty plants at once. Sparse is what keeps that a garden with
 * things happening in it rather than fog.
 */
export const SIGNAL_PER_PLANT = 26;

/**
 * How far a plant has to be moving before it says anything, on the -1..1 trend
 * axis.
 *
 * Measured rather than argued, which is the rule this project keeps arriving at
 * (see the world garden's trend calibration in DESIGN.md). Against the real
 * pipelines at a fixed clock: the league's median club sits near 0.30 and its
 * quieter quarter under 0.15; the book's holdings run narrow, median near 0.13
 * and nothing past 0.42; the world's countries run wide, with more than half
 * past 0.5. A tenth is inside the noise of all three. A quarter silences most of
 * the book. 0.15 is the value that leaves each garden with movers and
 * non-movers, which is the only property the cue actually needs.
 *
 * It also exposes something worth saying out loud: those three distributions
 * disagree badly about what the axis means. The translators calibrate vitality
 * against their own worst case and nothing has ever held trend to the same
 * standard, which is a translation-side question rather than a rendering one.
 * The threshold here is honest about the data as it is.
 */
export const SIGNAL_DEADBAND = 0.15;

/**
 * Where the plume reaches full strength. Past this the specks stop multiplying,
 * so a club on a four-game run and one on a five-game run look the same — the
 * cue says *this is moving, and which way*, and the number is in the panel for
 * anyone who wants the rest.
 */
export const SIGNAL_FULL_AT = 0.6;

/**
 * Metres per second, up and down.
 *
 * They differ on purpose, and the asymmetry is the whole feeling of the thing: a
 * rise is buoyant and a fall is heavy. Both are well clear of the dust's 0.035,
 * which hangs rather than falls, so a drift reads as something coming off a
 * living plant and not as neglect settling on a dead one.
 */
export const SIGNAL_RISE_SPEED = 0.2;
export const SIGNAL_FALL_SPEED = 0.09;

/**
 * How far out from the trunk the plume sits, in metres, and how far above the
 * plant the rising one carries before it recycles.
 *
 * Tighter than the dust's radius, because this belongs to the plant rather than
 * to the air around it: a column that spread as wide as the canopy stopped
 * reading as coming *from* anything. The headroom is proportional rather than
 * capped — unlike the dust, which settles low whatever the plant is — because a
 * plume has to clear the canopy to be seen leaving it, and an orchard tree's
 * canopy is a metre above a flower's.
 */
export const SIGNAL_RADIUS = 0.55;
export const SIGNAL_HEADROOM = 0.45;

/**
 * How strong the plume is, 0 to 1, from the polarity-signed trend.
 *
 * Zero at and below the deadband so the cue is genuinely absent rather than
 * faint, and continuous above it so a plant that is picking up speed thickens
 * instead of popping. A pop would read as an event, and nothing happened.
 */
export function plumeStrength(signal: number): number {
  const size = Math.abs(signal);
  if (size <= SIGNAL_DEADBAND) return 0;
  const t = (size - SIGNAL_DEADBAND) / (SIGNAL_FULL_AT - SIGNAL_DEADBAND);
  return t > 1 ? 1 : t;
}

/** How many of a plant's reserved particles are currently drawn. */
export function plumeCount(signal: number, capacity = SIGNAL_PER_PLANT): number {
  return Math.round(plumeStrength(signal) * capacity);
}

/** Whether a plant shows a plume at all, and which way it goes. Zero is none. */
export function plumeDirection(signal: number): -1 | 0 | 1 {
  if (plumeStrength(signal) === 0) return 0;
  return signal > 0 ? 1 : -1;
}

/**
 * One step of a speck along its column, wrapping at both ends so a fixed set of
 * particles reads as a continuous flow and is never allocated again. A positive
 * delta rises and a negative one falls.
 *
 * The modulo is taken on the span, so a large delta — a backgrounded tab
 * resuming — cannot throw a speck out of its column instead of round it.
 */
export function cycle(y: number, base: number, top: number, delta: number): number {
  const span = top - base;
  if (span <= 0) return base;
  return base + ((((y + delta - base) % span) + span) % span);
}
