import {
  HOUR_MS,
  createHistory,
  record as recordVitals,
  type VitalsHistory,
} from '../ecosystem/history';
import { emblemFrom } from '../ecosystem/labels';
import { rollUpContainers } from '../ecosystem/rollup';
import { clamp, scale, type AxisScale } from '../ecosystem/scale';
import type { PlantingType } from '../ecosystem/planting';
import type {
  Domain,
  EcosystemEdge,
  EcosystemNode,
  Polarity,
  Vitals,
} from '../ecosystem/types';

/**
 * A garden from a config, not from code — the general case of the declarative
 * source `translation/prometheus.ts` proved for one wire shape.
 *
 * The three hand-written translators (league, market, world) each decided their
 * mapping in TypeScript, because each mapping was particular. Prometheus showed a
 * regular-enough source can state its mapping as *data* instead. This file takes
 * the last domain-specific thing out of that — the PromQL wire — and interprets a
 * mapping over plain fetched JSON: an array of records, and dotted paths that say
 * which field is the id, the label, the level, and the bed. It is the interpreter
 * `docs/sources.md` step 3 describes, and the three translators are its spec:
 * anything they express that this cannot is the next increment, listed under
 * "What this does not do yet" below.
 *
 * Everything the numbers cannot say, the config must — the same list every source
 * so far has drawn blood over:
 *
 * - **The scale.** `vitality` is a comparison in [0, 1], never a raw quantity. A
 *   fundraising total of $2M is neither good nor bad until the config says what
 *   the floor and ceiling are (`AxisScale`; `min > max` means "lower is better").
 *   A mapping UI must make the user choose this deliberately, because mapping a
 *   raw quantity on naively ranks things against each other — the reading the
 *   world garden forbade, where "a country visibly wilting because it is at war"
 *   was the bug.
 * - **Polarity — mandatory, never inferable.** Is growth good news? A short
 *   position, a weed, the opposition's fundraising all read as `suppress`, and a
 *   suppress plant grows as a weed so thriving is alarm. This is the one rule the
 *   whole environment model exists to hold, and the numbers cannot tell you which
 *   way it points. It is a required field, with no default.
 * - **Trend is derived, never supplied.** The config names the *level*; the delta
 *   against the previous poll is computed here, so "climbing" reads differently
 *   from "sitting high", exactly as the axis contract asks.
 * - **Beds, planting, domain, emblem are all choices.** Grouping is a field to
 *   group by, not something in the numbers; the planting look, the domain bucket,
 *   and the tag mark are identity, not signal, and the config states them.
 *
 * What this does *not* do yet, on purpose, with the translator that is its spec:
 *
 * - **Edges** (root grafts — rivalries, dependencies, correlations). Their own
 *   collection; a first-cut source skips them. Spec: every hand-written one.
 * - **The published-vs-described split** the world garden needs, where a filing
 *   is revised and a scrub must show what was *known* at a date. This interpreter
 *   translates one snapshot as-of one moment. Spec: `translation/world.ts`.
 * - **Completion** (fruit and deadwood for work that finishes). The node contract
 *   carries it (`completions`), and a config verb for it is future work. Spec:
 *   `ecosystem/completion.ts` and `docs/completion.md`.
 * - **Backfill / archive.** Like Prometheus, a live pull cannot invent months
 *   from one reading, so there is no archive and the fine buffer holds only the
 *   one observed sample. The collector fills the rest over visits.
 */

/** A dotted path into a fetched record, e.g. `"team.abbr"` or `"metrics.cpu"`. */
export type FieldPath = string;

/** A value read from a field, then scaled onto an axis. */
export interface ScaledField {
  path: FieldPath;
  scale: AxisScale;
}

/** The declarative mapping from one fetched JSON payload to one garden. */
export interface DeclarativeMapping {
  gardenId: string;
  gardenLabel: string;
  /**
   * Where the array of records sits in the payload, dotted. Omit when the payload
   * *is* the array — `read` this from `{ data: [...] }` with `recordsPath: 'data'`,
   * or from a bare `[...]` with it absent.
   */
  recordsPath?: FieldPath;
  /** Dotted path to a stable id within each record. Falls back to the label. */
  idPath?: FieldPath;
  /** Dotted path to the human-readable label. */
  labelPath: FieldPath;
  /** Dotted path to the numeric level that drives vitality. */
  levelPath: FieldPath;
  /**
   * How the level maps onto vitality. Mandatory: there is no sane default for
   * "what is healthy". `min > max` expresses "lower is better" with no extra flag.
   */
  vitality: AxisScale;
  /** An optional second numeric field scaled onto activity. Neutral (0.5) when absent. */
  activity?: ScaledField;
  /**
   * How established, in [0, 1]. A constant, because most sources carry no per-node
   * notion of age (a fleet of long-lived hosts vs. ephemeral pods is the operator's
   * knowledge, not the data's). Defaults to mid. Never derived from the level,
   * which would make "busy" read as "old".
   */
  maturity?: number;
  /** Mandatory. The one thing the numbers cannot say. See the module note. */
  polarity: Polarity;
  /** Dotted path to the field that groups plants into beds. Absent value → the `default` bed. */
  bedPath?: FieldPath;
  /** The look of the beds. Signal-free, learnable, constant. Default `orchard`. */
  planting?: PlantingType;
  /**
   * For grouping and the HUD label. Any string is legal (see `Domain`); a
   * user-defined source names its own. Defaults to `general`, the fallback bucket.
   */
  domain?: Domain;
  /**
   * Dotted path to a short string the tag mark is built from. Defaults to
   * initials of the label — `emblemFrom`, the deliberate default for a source with
   * no mark of its own, exactly as Prometheus uses it.
   */
  emblemPath?: FieldPath;
  /**
   * How steeply a change between polls reads as trend. A gain of `1/sensitivity`
   * in scaled vitality saturates the axis. Default 3.
   */
  trendSensitivity?: number;
  /**
   * Where this data came from, copied onto every node's `raw.provenance` so the
   * inspection HUD can always answer "says who". A user source pointing at real
   * data must set it; the world garden made carrying the evidence load-bearing.
   */
  provenance?: unknown;
}

export interface DeclarativeTranslationOptions {
  /** The moment to translate as of. Defaults to `now()` at call time. */
  asOf?: number;
  /**
   * The previous poll's scaled vitality per node id, so trend is a real delta.
   * A live source threads its last reading through here; the first poll has none
   * and every trend is 0, the honest answer for a source with no past.
   */
  previous?: Record<string, number>;
}

/** What a translator hands the store: flat records, no state machinery. */
export interface TranslatedEcosystem {
  nodes: Record<string, EcosystemNode>;
  edges: Record<string, EcosystemEdge>;
  history: Record<string, VitalsHistory>;
  archive: Record<string, VitalsHistory>;
}

const GENERIC_DOMAIN: Domain = 'general';

/** `<garden>/<sanitized-key>`, stable across polls so a record keeps its plant. */
export function declarativeNodeId(gardenId: string, key: string): string {
  return `${gardenId}/${sanitize(key)}`;
}

export function declarativeBedId(gardenId: string, bed: string): string {
  return `${gardenId}/bed/${sanitize(bed)}`;
}

function sanitize(key: string): string {
  return key.replace(/[^A-Za-z0-9_.-]+/g, '_');
}

/**
 * Interpret a mapping over a fetched payload, producing the same flat nodes and
 * edges the hand-written translators produce. `payload` is whatever the fetch
 * returned (already parsed JSON); `recordsPath` locates the array within it.
 */
export function translateDeclarative(
  payload: unknown,
  mapping: DeclarativeMapping,
  options: DeclarativeTranslationOptions = {},
): TranslatedEcosystem {
  const { asOf = Date.now(), previous = {} } = options;
  const domain = mapping.domain ?? GENERIC_DOMAIN;
  const records = recordsOf(payload, mapping.recordsPath);

  const nodes: Record<string, EcosystemNode> = {};
  const history: Record<string, VitalsHistory> = {};

  nodes[mapping.gardenId] = {
    id: mapping.gardenId,
    parentId: null,
    gardenId: mapping.gardenId,
    label: mapping.gardenLabel,
    domain,
    kind: 'garden',
    polarity: mapping.polarity,
    vitality: 1,
    activity: 0.5,
    maturity: 1,
    trend: 0,
    blights: [],
    updatedAt: asOf,
    raw: { source: 'declarative', provenance: mapping.provenance },
  };

  const bedsSeen = new Set<string>();

  for (const record of records) {
    const label = stringAt(record, mapping.labelPath, 'label');
    const key = mapping.idPath ? stringAt(record, mapping.idPath, 'id') : label;
    const bedName = mapping.bedPath
      ? optionalStringAt(record, mapping.bedPath) ?? 'default'
      : 'default';
    const id = declarativeNodeId(mapping.gardenId, key);
    const bedId = declarativeBedId(mapping.gardenId, bedName);

    if (!bedsSeen.has(bedId)) {
      bedsSeen.add(bedId);
      nodes[bedId] = {
        id: bedId,
        parentId: mapping.gardenId,
        gardenId: mapping.gardenId,
        label: bedName,
        domain,
        kind: 'bed',
        polarity: mapping.polarity,
        plantingType: mapping.planting ?? 'orchard',
        vitality: 1,
        activity: 0.5,
        maturity: 1,
        trend: 0,
        blights: [],
        updatedAt: asOf,
        raw: { source: 'declarative', bed: bedName },
      };
    }

    const vitals = readRecord(record, mapping, previous[id]);
    const emblemSource = mapping.emblemPath
      ? optionalStringAt(record, mapping.emblemPath) ?? label
      : label;

    nodes[id] = {
      id,
      parentId: bedId,
      gardenId: mapping.gardenId,
      label,
      emblem: emblemFrom(emblemSource),
      domain,
      kind: 'plant',
      polarity: mapping.polarity,
      ...vitals,
      blights: [],
      updatedAt: asOf,
      raw: {
        source: 'declarative',
        record,
        provenance: mapping.provenance,
      },
    };

    // One observed sample, no invented past — a live fetch cannot backfill from
    // an instant. The collector fills the gaps over visits.
    const buffer = createHistory(HOUR_MS);
    recordVitals(buffer, asOf, vitals);
    history[id] = buffer;
  }

  rollUpContainers(nodes);
  return { nodes, edges: {}, history, archive: {} };
}

/** One record's four axes at a moment. Exported: it is the interesting half. */
export function readRecord(
  record: unknown,
  mapping: DeclarativeMapping,
  previousVitality?: number,
): Vitals {
  const level = numberAt(record, mapping.levelPath, 'level');
  const vitality = scale(level, mapping.vitality);
  const activity = mapping.activity
    ? scale(numberAt(record, mapping.activity.path, 'activity'), mapping.activity.scale)
    : 0.5;
  const maturity = mapping.maturity ?? 0.5;

  // Trend is the move since the last poll, not a derivative of health. No
  // previous reading means no past to have moved from — 0, not a guess.
  const sensitivity = mapping.trendSensitivity ?? 3;
  const trend =
    previousVitality === undefined
      ? 0
      : clamp((vitality - previousVitality) * sensitivity, -1, 1);

  return { vitality, activity, maturity, trend };
}

/** The array of records within a payload, or the payload itself when it is one. */
function recordsOf(payload: unknown, recordsPath?: FieldPath): unknown[] {
  const found = recordsPath ? getPath(payload, recordsPath) : payload;
  if (!Array.isArray(found)) {
    throw new Error(
      recordsPath
        ? `declarative: recordsPath '${recordsPath}' did not resolve to an array`
        : 'declarative: payload is not an array and no recordsPath was given',
    );
  }
  return found;
}

/** Resolve a dotted path over an unknown value, returning `undefined` off any miss. */
export function getPath(value: unknown, path: FieldPath): unknown {
  let current = value;
  for (const key of path.split('.')) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function stringAt(record: unknown, path: FieldPath, what: string): string {
  const value = optionalStringAt(record, path);
  if (value === undefined) {
    throw new Error(`declarative: ${what} path '${path}' is missing on a record`);
  }
  return value;
}

function optionalStringAt(record: unknown, path: FieldPath): string | undefined {
  const value = getPath(record, path);
  if (value === undefined || value === null) return undefined;
  return typeof value === 'string' ? value : String(value);
}

function numberAt(record: unknown, path: FieldPath, what: string): number {
  const value = getPath(record, path);
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new Error(
      `declarative: ${what} path '${path}' is not a finite number (got ${JSON.stringify(value)})`,
    );
  }
  return n;
}
