import { browserStorage, type CollectorStorage } from './collector';
import {
  translateDeclarative,
  type DeclarativeMapping,
  type TranslatedEcosystem,
} from '../translation/declarative';
import type { LiveSource } from './sources';

/**
 * A garden a user built, not a developer — the offline half of `docs/sources.md`
 * step 5, and the reason the config UI does not wait on the network the way the
 * fetch does.
 *
 * A `DeclarativeMapping` (`translation/declarative.ts`) already turns a fetched
 * JSON payload into a garden. The only thing a live source adds over a hand-built
 * one is the *fetch*, and a browser cannot do that against an arbitrary host. So
 * this stands the fetch down and keeps everything around it: the user pastes one
 * snapshot of the payload by hand, the mapping is authored against it, and the
 * pair is a source the app reads exactly like the generated ones. When a backend
 * exists, the payload is what its `fetchImpl` would return and nothing in the
 * mapping changes — the same swap Prometheus already makes behind its mock.
 *
 * The mapping is persisted; the data is not fabricated and re-invented, it is the
 * one snapshot the user brought. That is the same rule the collector holds — store
 * what was stated, never a plausible fill — and it is why a user garden survives a
 * reload without the builder being reopened, which is the whole point: configure
 * once, then it is just another garden button.
 */

/** Distinct from the observation record's key; the two never share storage. */
export const USER_GARDENS_KEY = 'spatialui.gardens.v1';

/** Six hours: a hand-pasted snapshot ages into staleness politely, not in minutes. */
export const DEFAULT_USER_STALE_MS = 6 * 60 * 60 * 1000;

export interface UserGardenConfig {
  /** The authored mapping. Its `gardenId` is the identity of the garden. */
  mapping: DeclarativeMapping;
  /** The sample payload the mapping was authored against and reads from. */
  payload: unknown;
  /** How long until the single snapshot reads as stale. A plain duration. */
  staleAfterMs?: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * `user/<slug>` from a name, so a user garden can never collide with a built-in
 * id (`nfl`, `market`, …) or a mock one. Stable identity comes from here, which
 * is why an edit keeps the original id rather than recomputing it from a renamed
 * label.
 */
export function userGardenId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `user/${slug || 'garden'}`;
}

/**
 * A generated-shaped `LiveSource` over one pasted snapshot.
 *
 * No `refresh`: a hand-pasted snapshot has no next reading to fetch — that is the
 * fetch half, deferred to a backend. `pollable: false` for the same reason; a
 * generated source that is re-asked must extend rather than slide (see
 * `HANDOFF.md`), and a static snapshot has nothing to extend. So it reads the one
 * payload it holds, and the garden greys into staleness honestly, because for a
 * snapshot nobody is updating, that is the truth.
 */
export function userSourceFromConfig(config: UserGardenConfig): LiveSource {
  return {
    gardenId: config.mapping.gardenId,
    policy: config.staleAfterMs ?? DEFAULT_USER_STALE_MS,
    read: (now) => translateDeclarative(config.payload, config.mapping, { asOf: now }),
    pollable: false,
  };
}

export type PreviewResult =
  | { ok: true; garden: TranslatedEcosystem; summary: GardenSummary }
  | { ok: false; error: string };

/**
 * Run the *real* interpreter over the pasted payload, so the preview and the
 * committed source can never disagree — the preview is the honesty check only
 * because it is the same translation the app will run, not a UI-side copy of its
 * rules. The interpreter already fails loudly with the offending path named, so
 * its error message *is* the validation; there is no second layer to keep in sync.
 */
export function previewMapping(
  payload: unknown,
  mapping: DeclarativeMapping,
  now = Date.now(),
): PreviewResult {
  try {
    const garden = translateDeclarative(payload, mapping, { asOf: now });
    return { ok: true, garden, summary: summarize(garden, mapping) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export interface AxisStat {
  min: number;
  max: number;
  mean: number;
  /** max − min. Near zero across more than one plant means the axis carries nothing. */
  spread: number;
}

export interface GardenSummary {
  beds: number;
  plants: number;
  axes: Record<'vitality' | 'activity' | 'maturity', AxisStat>;
  /**
   * The *data-driven* axes that are nonetheless flat across the garden — a
   * saturated channel, which `HANDOFF.md` calls the hardest failure to see
   * because it looks exactly like a signal that is always on. Only axes the
   * mapping drives from a field are eligible: vitality always, activity when it
   * is mapped. Maturity is a constant by design (it is not per-node data), so a
   * flat maturity is expected, never a warning — flagging it would make the
   * warning noise and hide the real one.
   */
  saturated: Array<'vitality' | 'activity'>;
  /** The first plants, for a glance at what the mapping produced. */
  plantsPreview: Array<{
    label: string;
    bed: string;
    vitality: number;
    activity: number;
    maturity: number;
  }>;
}

const PREVIEW_PLANTS = 24;
const FLAT_EPSILON = 1e-6;

/** The per-axis spread across a garden's plants, and the flat data-driven ones named. */
function summarize(garden: TranslatedEcosystem, mapping: DeclarativeMapping): GardenSummary {
  const plants = Object.values(garden.nodes).filter((n) => n.kind === 'plant');
  const beds = Object.values(garden.nodes).filter((n) => n.kind === 'bed').length;

  const axisNames = ['vitality', 'activity', 'maturity'] as const;
  const axes = {} as Record<'vitality' | 'activity' | 'maturity', AxisStat>;
  const saturated: Array<'vitality' | 'activity'> = [];

  // Only the axes this mapping actually reads from a field can be "saturated" in
  // a way worth warning about: vitality (always) and activity (when mapped).
  const driven = new Set<'vitality' | 'activity'>(['vitality']);
  if (mapping.activity) driven.add('activity');

  for (const axis of axisNames) {
    const values = plants.map((p) => p[axis]);
    const stat = statOf(values);
    axes[axis] = stat;
    if (
      plants.length > 1 &&
      stat.spread < FLAT_EPSILON &&
      (axis === 'vitality' || axis === 'activity') &&
      driven.has(axis)
    ) {
      saturated.push(axis);
    }
  }

  const bedLabel = (parentId: string | null): string =>
    (parentId && garden.nodes[parentId]?.label) || 'default';

  const plantsPreview = plants.slice(0, PREVIEW_PLANTS).map((p) => ({
    label: p.label,
    bed: bedLabel(p.parentId),
    vitality: p.vitality,
    activity: p.activity,
    maturity: p.maturity,
  }));

  return { beds, plants: plants.length, axes, saturated, plantsPreview };
}

function statOf(values: number[]): AxisStat {
  if (values.length === 0) return { min: 0, max: 0, mean: 0, spread: 0 };
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return { min, max, mean: sum / values.length, spread: max - min };
}

export function loadUserConfigs(
  storage: CollectorStorage | null = browserStorage(),
): UserGardenConfig[] {
  if (!storage) return [];
  const text = storage.getItem(USER_GARDENS_KEY);
  if (!text) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.filter(isUserGardenConfig) : [];
  } catch {
    // A corrupt blob is not worth crashing startup over; the user re-adds. The
    // observation record makes the same choice for the same reason.
    return [];
  }
}

export function saveUserConfigs(
  configs: readonly UserGardenConfig[],
  storage: CollectorStorage | null = browserStorage(),
): void {
  if (!storage) return;
  storage.setItem(USER_GARDENS_KEY, JSON.stringify(configs));
}

/** Replace a config with the same garden id, or append it. Identity is the id. */
export function upsertConfig(
  configs: readonly UserGardenConfig[],
  config: UserGardenConfig,
): UserGardenConfig[] {
  const id = config.mapping.gardenId;
  const without = configs.filter((c) => c.mapping.gardenId !== id);
  return [...without, config];
}

/** A light guard: enough to reject a blob that is not our shape, not a schema. */
function isUserGardenConfig(value: unknown): value is UserGardenConfig {
  if (value == null || typeof value !== 'object') return false;
  const mapping = (value as { mapping?: unknown }).mapping;
  if (mapping == null || typeof mapping !== 'object') return false;
  const m = mapping as Record<string, unknown>;
  return (
    typeof m.gardenId === 'string' &&
    typeof m.labelPath === 'string' &&
    typeof m.levelPath === 'string' &&
    (m.polarity === 'nurture' || m.polarity === 'suppress')
  );
}
