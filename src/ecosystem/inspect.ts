/**
 * The domain payload, made readable without being understood.
 *
 * `node.raw` is deliberately `unknown`. The contract in `types.ts` is that
 * domain specifics live there and the renderer never reads them, which is what
 * lets one plant renderer serve a Kubernetes cluster, a notes vault, and a
 * football league without the node type growing a field per source. The cost of
 * that contract is that the one place which *does* show it — the panel you open
 * by walking up to a plant and tapping its tag — cannot know its shape.
 *
 * So it does not try. This flattens any payload into rows, and the only
 * judgements it makes are presentational ones every payload shares: how deep to
 * go before a nested object is more noise than answer, what a millisecond
 * timestamp looks like to a person, and how long a list can get before it
 * should say how many there are instead of showing them all.
 *
 * Two rules are worth stating because they are easy to violate by accident.
 *
 * **Absence is shown, never skipped.** A null is rendered as a dash rather than
 * dropped. In a project where a plant greys and gathers dust precisely because
 * nothing arrived, a panel that quietly omitted the fields it had no value for
 * would be lying in the same way — "no last game" is one of the most
 * informative things this payload can say.
 *
 * **Nothing here is a signal.** The panel is prose about a plant, read at arm's
 * length, after the garden has already told you something. It carries no
 * colour, no ranking, and no opinion about which fields matter, because the
 * moment it did it would be a second, competing reading of the same node.
 */

export interface Field {
  /** The path to this value, already prettied: `roster.available`. */
  key: string;
  /** The value, formatted for a person. */
  value: string;
  /** How deep it sits, for indentation. */
  depth: number;
}

/** How far into a nested payload to go before summarizing. */
export const MAX_DEPTH = 2;

/** How many entries of a list to expand before counting them instead. */
export const MAX_ITEMS = 4;

/** Total rows a panel will show. Past this, the payload is a file, not a card. */
export const MAX_FIELDS = 60;

/**
 * A payload as rows, in the order the source wrote them.
 *
 * Source order rather than alphabetical: an adapter puts the identifying fields
 * first, and re-sorting them would bury what the author thought mattered under
 * whatever happens to start with an 'a'.
 */
export function fieldsOf(raw: unknown, limit = MAX_FIELDS): Field[] {
  const fields: Field[] = [];
  walk(raw, '', 0, fields, limit);
  if (fields.length > limit) {
    return [...fields.slice(0, limit), { key: '…', value: 'more', depth: 0 }];
  }
  return fields;
}

function walk(
  value: unknown,
  path: string,
  depth: number,
  out: Field[],
  limit: number,
): void {
  if (out.length > limit) return;

  if (Array.isArray(value)) {
    walkArray(value, path, depth, out, limit);
    return;
  }

  if (isRecord(value)) {
    if (depth >= MAX_DEPTH) {
      out.push({ key: path, value: summarize(value), depth });
      return;
    }
    // A nested object gets a heading of its own only when it is inside
    // something, so the top-level payload does not open with a blank row.
    if (path) out.push({ key: path, value: '', depth });
    for (const [key, child] of Object.entries(value)) {
      walk(child, path ? `${path}.${key}` : key, path ? depth + 1 : depth, out, limit);
    }
    return;
  }

  out.push({ key: path, value: formatValue(value, path), depth });
}

function walkArray(
  items: unknown[],
  path: string,
  depth: number,
  out: Field[],
  limit: number,
): void {
  if (items.length === 0) {
    out.push({ key: path, value: 'none', depth });
    return;
  }

  // A list of plain values is a sentence, not a table.
  if (items.every((item) => !isRecord(item) && !Array.isArray(item))) {
    out.push({
      key: path,
      value: items.map((item) => formatValue(item, path)).join(', '),
      depth,
    });
    return;
  }

  out.push({ key: path, value: `${items.length}`, depth });
  if (depth >= MAX_DEPTH) return;
  for (const [index, item] of items.slice(0, MAX_ITEMS).entries()) {
    walk(item, `${path}[${index}]`, depth + 1, out, limit);
  }
  if (items.length > MAX_ITEMS) {
    out.push({ key: `${path}[…]`, value: `${items.length - MAX_ITEMS} more`, depth: depth + 1 });
  }
}

/**
 * One value as a person would read it.
 *
 * The only inference made anywhere in here is the temporal one: a key that
 * sounds like a time, holding a number big enough to be an epoch in
 * milliseconds, is shown as a date. It is worth the guess — every adapter in
 * this project stores times as epoch ms, and a raw `1786240000000` in a panel
 * about when something last happened is a field nobody can read.
 */
export function formatValue(value: unknown, key = ''): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return String(value);
    if (looksTemporal(key) && Math.abs(value) > 1e11) {
      return new Date(value).toLocaleString();
    }
    return formatNumber(value);
  }
  if (Array.isArray(value)) return `${value.length}`;
  if (isRecord(value)) return summarize(value);
  return String(value);
}

/** Whole numbers stay whole; fractions round to three places and lose the tail. */
export function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 1000) / 1000);
}

/** A nested object too deep to expand, as its key list. */
function summarize(value: Record<string, unknown>): string {
  const keys = Object.keys(value);
  if (keys.length === 0) return 'empty';
  const shown = keys.slice(0, MAX_ITEMS).join(', ');
  return keys.length > MAX_ITEMS ? `${shown}, …` : shown;
}

/**
 * Whether a key sounds like it holds a moment. Either the whole word, or the
 * camelCase tail an adapter writes — `finalAt`, `fetchedAt`. Deliberately not a
 * loose suffix match, which would read `seat` as a timestamp.
 */
function looksTemporal(key: string): boolean {
  const last = key.split('.').pop() ?? key;
  return /^(at|since|time|date)$/i.test(last) || /[a-z0-9](At|Since|Time|Date)$/.test(last);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
