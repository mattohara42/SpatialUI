/**
 * What a plant is called, and the mark it wears.
 *
 * The garden deliberately says almost nothing in words. Shape, colour, motion,
 * and dust carry the reading, and they carry it across a room — a scene that
 * needed captions to be understood would have failed at the thing it exists to
 * do. So a name here is not part of the reading. It answers the *second*
 * question, the one you ask after the garden has already told you something is
 * wrong: **which one is this?**
 *
 * That is why identity is a separate channel rather than another visual one, and
 * why it only appears when you walk up to a plant (see `scene/labels.ts`). At a
 * glance you are reading health. At arm's length you are reading a name.
 *
 * ## An emblem is chosen, never guessed
 *
 * Every source has its own idea of what a thing is called and what it looks
 * like: a league has club colours and a three letter abbreviation, a cluster has
 * service names, a portfolio has tickers. None of that is derivable from the
 * four health axes, so **translation must choose it**, the same way translation
 * chooses a planting type and a polarity. `emblemFrom` is the deliberate default
 * for a source that has no mark of its own — initials on a stable colour — and
 * calling it is itself a choice, made in the translator where the domain is
 * still in scope, rather than a guess made by the renderer where it is not.
 *
 * ## Why the colour is not a signal
 *
 * An emblem carries a hue, and colour in this project is spoken for: it is the
 * live health channel (DESIGN.md's channel budget). The rule that keeps this
 * clear of it is the same one bloom colour lives by — **an emblem never
 * moves**. It is a fact about identity, fixed for the life of the node, so
 * nothing about it can be mistaken for a reading of state. A plate that
 * brightened when a service recovered would be a budget violation; one that is
 * Cardinal red because the club is, forever, is not.
 */

/** A mark a plant wears: a few characters on a plate, in an ink that reads. */
export interface Emblem {
  /** One to three characters. Longer marks stop being legible on a tag. */
  mark: string;
  /** The plate colour. Identity, never state. */
  color: string;
  /** What the mark is printed in. Chosen to survive on that plate. */
  ink: string;
}

/** The longest mark a tag can carry and still be read at arm's length. */
export const MARK_LIMIT = 3;

/**
 * Words that are never the identity of the thing. Dropped when there is
 * something else to use, kept when they are all there is — "The Ashes" should
 * not initial to nothing.
 */
const NOISE = new Set(['the', 'a', 'an', 'of', 'and', 'for', 'in', 'on', 'at', 'to']);

/** Ink colours, dark and light. Never pure black or white, which read as holes. */
const DARK_INK = '#14120e';
const LIGHT_INK = '#f7f3ea';

/**
 * Initials for a label, when the source has no abbreviation of its own.
 *
 * Multi-word labels initial, which is what a person does: "Payments Gateway"
 * becomes PG. A single word takes its first letters instead, because the
 * initial of one word is one character and one character is not a mark, it is a
 * typo.
 */
export function initialsOf(label: string): string {
  const words = label
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word.length > 0);
  if (words.length === 0) return '?';

  const meaningful = words.filter((word) => !NOISE.has(word.toLowerCase()));
  const chosen = meaningful.length > 0 ? meaningful : words;

  if (chosen.length === 1) {
    return chosen[0].slice(0, MARK_LIMIT).toUpperCase();
  }
  return chosen
    .slice(0, MARK_LIMIT)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

/**
 * The default emblem: initials on a colour keyed to the label.
 *
 * Muted on purpose. A source that has real colours (a league, a brand) passes
 * them in and they can be as loud as they are; a derived one has no business
 * inventing a saturated plate, because the only thing loud colour means in this
 * scene is health.
 */
export function emblemFrom(label: string, seed = label): Emblem {
  const hue = (hash(seed) % 360) / 360;
  const color = hslToHex(hue, 0.32, 0.46);
  return { mark: initialsOf(label), color, ink: inkFor(color) };
}

/**
 * Dark ink or light, whichever survives on the given plate.
 *
 * Relative luminance rather than lightness, because the eye is not equally
 * sensitive to the three channels: a saturated blue at the same HSL lightness as
 * a yellow is far darker to look at, and picking ink by lightness puts black
 * text on navy about a third of the time.
 */
export function inkFor(plate: string): string {
  return luminanceOf(plate) > 0.42 ? DARK_INK : LIGHT_INK;
}

/** Relative luminance of an `#rrggbb` colour, 0 to 1. */
export function luminanceOf(hex: string): number {
  const value = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const srgb = ((value >> shift) & 255) / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

/**
 * The emblem to draw for a node, given whatever translation chose.
 *
 * The fallback exists so a half-written adapter renders something rather than
 * nothing, not so an adapter can skip the decision: a plant with no emblem is a
 * plant nobody named, and `scene-inputs.test.ts` says so out loud.
 */
export function emblemOf(node: { label: string; id: string; emblem?: Emblem }): Emblem {
  return node.emblem ?? emblemFrom(node.label, node.id);
}

/** Stable non-negative hash, so a label lands on the same plate every run. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** HSL in 0..1 to `#rrggbb`. Kept local: this file may not import three. */
function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
