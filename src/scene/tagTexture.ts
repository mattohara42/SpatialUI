import * as THREE from 'three';
import type { Emblem } from '../ecosystem/labels';
import { TAG, TAG_PIXELS_PER_METRE } from './labels';

/**
 * A plant tag, drawn.
 *
 * Text is the one thing this project cannot generate the way it generates
 * everything else. Grain comes from a seeded PRNG, plants come from a grammar,
 * and the sky comes from an equation — but letterforms come from a font, and the
 * usual ways of getting one into a three.js scene both break rules the project
 * has already committed to: a bitmap font is an image asset, and `drei`'s text
 * helpers fetch a typeface over the network at first render.
 *
 * A 2D canvas is the way out. It uses a face the machine already has, produces
 * pixels rather than a file, needs no fetch, and hands back a texture the same
 * shape as the generated ones. The cost is honest and worth naming: this is the
 * only surface in the app whose exact appearance depends on the machine it runs
 * on, because font availability and hinting differ. Nothing is read from it by
 * anything but a person, so a metric's-worth of difference is a difference of
 * nothing.
 *
 * One trap, and it is the same one `ARCHITECTURE.md` records for the sky shader
 * and the generated maps: **this is a real albedo texture, so it must declare
 * `SRGBColorSpace`.** The grain maps deliberately do not, because their bytes
 * are linear multipliers. Club colours are colours. Without the declaration
 * every plate renders about a gamma too dark, and a navy one goes black.
 */

/** Cream card stock, and the ink the name is written in. */
const CARD = '#f4efe3';
const CARD_EDGE = '#cfc6b2';
const NAME_INK = '#241f18';

/** Corner radius and border, in pixels of the drawn card. */
const RADIUS = 26;
const BORDER = 5;

export function tagTexture(emblem: Emblem, label: string): THREE.CanvasTexture {
  const width = Math.round(TAG.width * TAG_PIXELS_PER_METRE);
  const height = Math.round(TAG.height * TAG_PIXELS_PER_METRE);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx, width, height, emblem, label);

  const texture = new THREE.CanvasTexture(canvas);
  // See the note above: a colour texture, unlike every grain map in this app.
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function draw(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  emblem: Emblem,
  label: string,
): void {
  // The card: rounded, with a drawn edge so it reads as a physical thing rather
  // than as a decal floating in front of the plant.
  roundedRect(ctx, BORDER / 2, BORDER / 2, width - BORDER, height - BORDER, RADIUS);
  ctx.fillStyle = CARD;
  ctx.fill();
  ctx.lineWidth = BORDER;
  ctx.strokeStyle = CARD_EDGE;
  ctx.stroke();

  // The emblem, as a roundel on the left. A disc rather than a square: it reads
  // as a badge at a glance and it survives being seen at an angle, which a
  // rectangle inside a rectangle does not.
  const inset = height * 0.11;
  const radius = (height - inset * 2) / 2;
  const cx = inset + radius;
  const cy = height / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = emblem.color;
  ctx.fill();

  ctx.fillStyle = emblem.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // The mark is set to the roundel rather than to a fixed size, so a two letter
  // club and a three letter one both fill their badge instead of one rattling
  // around inside it.
  setFont(ctx, emblem.mark, radius * 1.5, radius * 1.05, 700);
  ctx.fillText(emblem.mark, cx, cy + radius * 0.04);

  // The name, filling what is left. It wraps onto a second line before it
  // shrinks and shrinks before it truncates, in that order: "Chicago Bears" set
  // over two lines is the name, and "Chic…" is not.
  const left = cx + radius + inset * 0.9;
  const room = width - left - inset;
  ctx.fillStyle = NAME_INK;
  ctx.textAlign = 'left';

  const { lines, size } = layoutName(ctx, label, room, height * 0.3);
  const leading = size * 1.06;
  const top = cy - ((lines.length - 1) * leading) / 2;
  lines.forEach((line, i) => ctx.fillText(line, left, top + i * leading));
}

/** The most lines a name gets before it is cut short. */
const MAX_LINES = 2;

const FACE = `system-ui, "Segoe UI", Helvetica, Arial, sans-serif`;

/** Set the largest font at or below `size` that fits `text` into `maxWidth`. */
function setFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  size: number,
  weight: number,
): void {
  let fontSize = size;
  for (;;) {
    ctx.font = `${weight} ${fontSize}px ${FACE}`;
    if (ctx.measureText(text).width <= maxWidth || fontSize <= size * 0.5) return;
    fontSize -= 1;
  }
}

/**
 * Break a name to fit the space, shrinking the type only as far as it has to.
 *
 * Wrapping first is what keeps the name whole. Shrinking first would set every
 * two-word label in type half the size of the mark beside it, which on a card
 * seen at arm's length reads as a caption on a badge rather than as the plant's
 * name.
 */
function layoutName(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  size: number,
): { lines: string[]; size: number } {
  const floor = size * 0.5;

  let fontSize = size;
  for (;;) {
    ctx.font = `600 ${fontSize}px ${FACE}`;
    const lines = wrap(ctx, text, maxWidth);
    // Both conditions matter. Few enough lines is not enough on its own: a
    // single word wider than the card wraps to one line and would be accepted
    // at full size, then cut to "Chic…" — which is the failure this whole
    // function exists to avoid.
    const fits =
      lines.length <= MAX_LINES &&
      lines.every((line) => ctx.measureText(line).width <= maxWidth);
    if (fits || fontSize <= floor) {
      const kept = lines.slice(0, MAX_LINES);
      const dropped = lines.length > MAX_LINES;
      return {
        lines: kept.map((line, i) =>
          truncate(ctx, line, maxWidth, dropped && i === kept.length - 1),
        ),
        size: fontSize,
      };
    }
    fontSize -= 2;
  }
}

/** Greedy wrap on spaces. A single word too wide for the line stays whole and
 *  is truncated later, because breaking a word mid-syllable reads as a typo. */
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let line = words[0];
  for (const word of words.slice(1)) {
    const candidate = `${line} ${word}`;
    if (ctx.measureText(candidate).width <= maxWidth) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }
  lines.push(line);
  return lines;
}

/** Cut a line to the width, with an ellipsis when anything was dropped. */
function truncate(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  hasMore: boolean,
): string {
  if (!hasMore && ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut.trimEnd()}…`;
}

/** `roundRect` is recent enough that a path by hand is the safer way to draw. */
function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}
