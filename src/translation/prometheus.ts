import {
  HOUR_MS,
  createHistory,
  record as recordVitals,
  type VitalsHistory,
} from '../ecosystem/history';
import { emblemFrom, type Emblem } from '../ecosystem/labels';
import { afterQuietFor, type StaleSchedule } from '../ecosystem/staleness';
import type { PlantingType } from '../ecosystem/planting';
import type {
  Blight,
  Domain,
  EcosystemEdge,
  EcosystemNode,
  Polarity,
  Vitals,
} from '../ecosystem/types';
import type { PromSample, PromSnapshot } from '../adapters/prometheus/types';

/**
 * Prometheus series as a garden — and the first source that is *declarative*.
 *
 * The three hand-written translators (league, market, world) each decided their
 * mapping in code, because each mapping was particular. Prometheus is the source
 * `docs/sources.md` names as the archetype, and the reason is that its mapping
 * is regular enough to be *data*: a query, a label to name plants by, a label to
 * group them into beds, and — the part that is never optional and never
 * inferable — a scale that says what 0 and 1 mean and a polarity that says
 * whether growth is good news. `PromMapping` is that config, and this file is
 * the interpreter for it. Get it right and a second Prometheus garden is a
 * config object, not a copy of this file.
 *
 * What the config must state, and why each one cannot be guessed from the
 * numbers (the same list `docs/sources.md` draws blood over):
 *
 * - **The scale.** `vitality` is a comparison in [0, 1], not a raw gauge. A
 *   request rate of 4000/s is neither good nor bad until someone says what the
 *   floor and ceiling are. `min`/`max` say it; putting `min` above `max`
 *   expresses "lower is better" (a latency, an error rate) without a second flag,
 *   because the scale simply runs backwards and the arithmetic already handles it.
 * - **Polarity — mandatory.** A rising error rate is a thriving weed, not a
 *   healthy tree. The numbers cannot tell you which; the operator can, and must.
 * - **Trend is derived, never supplied.** The config names the level (the metric);
 *   the delta against the previous poll is computed here, so "climbing" reads
 *   differently from "sitting high" exactly as the axis contract asks.
 * - **`up{}` is staleness the source states itself.** A target reporting `up 0`
 *   is not a plant at its last value — it is silent, and silence must not read as
 *   health. It becomes a down blight and the plant stops advancing its clock.
 */

/** How a sample's value lands on an axis in [0, 1]. `min > max` inverts. */
export interface AxisScale {
  /** The value that reads as 0. */
  min: number;
  /** The value that reads as 1. Put it below `min` when lower is better. */
  max: number;
}

/** The declarative mapping from one PromQL result to one garden. */
export interface PromMapping {
  gardenId: string;
  gardenLabel: string;
  /** Which label names a plant, e.g. `instance` or `job`. Falls back to a joined label set. */
  idLabel: string;
  /** Which label groups plants into beds, e.g. `job`. */
  bedLabel: string;
  /** How the metric maps onto vitality. Mandatory: there is no sane default for "what is healthy". */
  vitality: AxisScale;
  /** How busy, optionally on the same value or left neutral. */
  activity?: AxisScale;
  /**
   * How established — Prometheus carries no such notion per series, so it is a
   * constant the operator sets (a fleet of long-lived nodes vs. ephemeral pods),
   * defaulting to mid. Never derived from the metric, which would make "busy"
   * read as "old".
   */
  maturity?: number;
  /** Mandatory. See the module note: this is the one thing the numbers cannot say. */
  polarity: Polarity;
  /** The look of the beds. Signal-free, learnable, constant. */
  planting?: PlantingType;
  /** For grouping and materials. Defaults to devops, which is where scrapes live. */
  domain?: Domain;
  /**
   * How steeply a change between polls reads as trend. A gain of `1/sensitivity`
   * in scaled vitality saturates the axis. Default 3, so a third of the scale in
   * one poll is a full green flush.
   */
  trendSensitivity?: number;
}

export interface PromTranslationOptions {
  /** The moment to translate as of. Defaults to the snapshot's fetch time. */
  asOf?: number;
  /**
   * The previous poll's scaled vitality per plant id, so trend is a real delta.
   * `promSource` threads its last reading through here; the first poll has none
   * and every trend is 0, which is the honest answer for a source with no past.
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

/**
 * A staleness schedule for a scrape interval.
 *
 * Prometheus is the source whose calendar is tightest and simplest: it scrapes
 * on a fixed interval, so "should I have heard by now" is just "one interval
 * plus a scrape or two of slack". Exported so the composition point can register
 * it, the way it registers the market's exchange calendar.
 */
export function promStaleSchedule(scrapeIntervalMs: number): StaleSchedule {
  // Two intervals of grace: one missed scrape is noise, two is a pattern — the
  // same reasoning as the market's two-bar grace and any sane alert's `for`.
  return afterQuietFor(2 * scrapeIntervalMs);
}

/** `<garden>/<sanitized-id>`, stable across polls so a target keeps its plant. */
export function promNodeId(gardenId: string, plantKey: string): string {
  return `${gardenId}/${plantKey.replace(/[^A-Za-z0-9_.-]+/g, '_')}`;
}

export function promBedId(gardenId: string, bed: string): string {
  return `${gardenId}/bed/${bed.replace(/[^A-Za-z0-9_.-]+/g, '_')}`;
}

/**
 * Clamp a value onto [0, 1] under a scale. Runs backwards when `min > max`, so
 * an error rate and a request rate use the same function and only differ in
 * which end the operator called good.
 */
export function scale(value: number, { min, max }: AxisScale): number {
  if (max === min) return 0.5; // a degenerate scale has no gradient to read
  return clamp01((value - min) / (max - min));
}

export function translatePromSnapshot(
  snapshot: PromSnapshot,
  mapping: PromMapping,
  options: PromTranslationOptions = {},
): TranslatedEcosystem {
  const { asOf = snapshot.fetchedAt, previous = {} } = options;
  const domain = mapping.domain ?? 'devops';

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
    raw: { source: 'prometheus', provenance: snapshot.provenance },
  };

  // `up{}` keyed by the same id the plants use, so a plant can ask "is my target
  // reporting" without re-deriving anything. A target absent from `up` is
  // treated as up: the source did not say otherwise.
  const liveness = new Map<string, boolean>();
  for (const sample of snapshot.up ?? []) {
    liveness.set(keyOf(sample, mapping.idLabel), sample.value !== 0);
  }

  const bedsSeen = new Set<string>();

  for (const sample of snapshot.series) {
    const plantKey = keyOf(sample, mapping.idLabel);
    const bedName = sample.labels[mapping.bedLabel] ?? 'default';
    const id = promNodeId(mapping.gardenId, plantKey);
    const bedId = promBedId(mapping.gardenId, bedName);

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
        raw: { source: 'prometheus', [mapping.bedLabel]: bedName },
      };
    }

    const up = liveness.get(plantKey) ?? true;
    const vitals = readSeries(sample, mapping, previous[id]);

    nodes[id] = {
      id,
      parentId: bedId,
      gardenId: mapping.gardenId,
      label: plantKey,
      emblem: emblemForSeries(plantKey),
      domain,
      kind: 'plant',
      polarity: mapping.polarity,
      ...vitals,
      blights: up ? [] : [downBlight(sample, snapshot.fetchedAt)],
      // A down target's clock stops at the sample's own time, not the poll's, so
      // it greys as the silence the `up 0` declares rather than staying fresh
      // because we happened to ask. A live target is as current as its sample.
      updatedAt: sample.at,
      raw: {
        source: 'prometheus',
        query: snapshot.provenance.query,
        labels: sample.labels,
        value: sample.value,
        up,
        provenance: snapshot.provenance,
      },
    };

    // One live sample recorded, and no invented past. Prometheus is genuinely
    // live and cannot backfill months from an instant query, so — exactly as
    // `docs/sources.md` allows — there is no archive, and the fine buffer holds
    // only what was actually observed. The collector fills the rest over visits.
    const buffer = createHistory(HOUR_MS);
    recordVitals(buffer, sample.at, vitals);
    history[id] = buffer;
  }

  rollUpContainers(nodes);
  return { nodes, edges: {}, history, archive: {} };
}

/** One series' four axes at a moment. Exported: it is the interesting half. */
export function readSeries(
  sample: PromSample,
  mapping: PromMapping,
  previousVitality?: number,
): Vitals {
  const vitality = scale(sample.value, mapping.vitality);
  const activity = mapping.activity ? scale(sample.value, mapping.activity) : 0.5;
  const maturity = mapping.maturity ?? 0.5;

  // Trend is the move since the last poll, not the derivative of health: the
  // config names the level and the delta is derived here. No previous reading
  // means no past to have moved from, which is 0, not a guess.
  const sensitivity = mapping.trendSensitivity ?? 3;
  const trend =
    previousVitality === undefined
      ? 0
      : clamp((vitality - previousVitality) * sensitivity, -1, 1);

  return { vitality, activity, maturity, trend };
}

/**
 * The mark a target's tag wears: initials on a muted, stable plate.
 *
 * Prometheus is exactly the source `emblemFrom` was written for — it has no
 * colours or abbreviation of its own, only a label — so calling the default is
 * the decision, made here where the domain is still in scope, not a guess left
 * to the renderer. A saturated plate would be inventing a signal; a target's
 * plate must stay identity.
 */
export function emblemForSeries(plantKey: string): Emblem {
  return emblemFrom(plantKey);
}

function downBlight(sample: PromSample, at: number): Blight {
  return {
    id: `${keyOf(sample, '__name__')}/down`,
    severity: 'critical',
    message: 'target down — up{} reports 0',
    since: sample.at || at,
  };
}

/** The value of the naming label, or a joined label set when it is absent. */
function keyOf(sample: PromSample, idLabel: string): string {
  const named = sample.labels[idLabel];
  if (named) return named;
  const parts = Object.entries(sample.labels)
    .filter(([k]) => k !== '__name__')
    .map(([k, v]) => `${k}=${v}`);
  return parts.length > 0 ? parts.join(',') : sample.labels.__name__ ?? 'series';
}

/**
 * A bed summarizes its plants and the garden its beds, so a job reads at a
 * glance and the whole scrape does too. `updatedAt` takes the newest child: a
 * bed is as current as its freshest target, and one down node must not drag the
 * whole bed's clock back and make live targets look stale by association.
 */
function rollUpContainers(nodes: Record<string, EcosystemNode>): void {
  const childIds: Record<string, string[]> = {};
  for (const node of Object.values(nodes)) {
    if (node.parentId) (childIds[node.parentId] ??= []).push(node.id);
  }

  const beds = Object.values(nodes).filter((n) => n.kind === 'bed');
  for (const bed of beds) rollUp(nodes, bed.id, childIds[bed.id] ?? []);
  const garden = Object.values(nodes).find((n) => n.kind === 'garden');
  if (garden) rollUp(nodes, garden.id, childIds[garden.id] ?? []);
}

function rollUp(
  nodes: Record<string, EcosystemNode>,
  id: string,
  childIds: string[],
): void {
  const children = childIds.map((childId) => nodes[childId]);
  if (children.length === 0) return;
  nodes[id] = {
    ...nodes[id],
    vitality: mean(children.map((c) => c.vitality)),
    activity: mean(children.map((c) => c.activity)),
    maturity: mean(children.map((c) => c.maturity)),
    trend: mean(children.map((c) => c.trend)),
    updatedAt: Math.max(...children.map((c) => c.updatedAt)),
  };
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / (values.length || 1);
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

function clamp01(n: number): number {
  return clamp(n, 0, 1);
}
