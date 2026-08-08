import type { VitalsHistory } from './history';

/**
 * The normalized vocabulary every adapter must speak.
 *
 * Design rule: this file must never gain a field that only one domain uses.
 * Domain specifics live in `raw`, which the inspection HUD renders and the
 * renderer never reads.
 */

/** Which input source produced this node. Used for grouping and materials. */
export type Domain =
  | 'devops'
  | 'pkm'
  | 'security'
  | 'markets'
  | 'sports'
  | 'learning';

/**
 * Where the node sits in the hierarchy.
 *
 * A garden is a whole environment the user walks into, and it fixes what
 * vitality means for everything inside it. Only one garden is live at a time,
 * which is what stops green from meaning "low error rate" and "up 3% today" in
 * the same field of view.
 */
export type NodeKind =
  /** An environment. Your infrastructure, your portfolio, your studies. */
  | 'garden'
  /** A planting area inside a garden. Service cluster, notebook, sector. */
  | 'bed'
  /** A plant. Service, note, ticker, team, topic. */
  | 'plant'
  /** Part of a plant. Endpoint, section heading, position. */
  | 'organ';

/**
 * Whether growth is good news.
 *
 * Most things are `nurture`: you want them thriving. Some are `suppress`, where
 * the thing itself is the problem and growth is the alarm. Failed login volume,
 * an outbreak, a backlog. Suppress-polarity nodes render as weeds, so a
 * flourishing one is alarming on sight instead of reassuring.
 */
export type Polarity = 'nurture' | 'suppress';

export type BlightSeverity = 'info' | 'warn' | 'error' | 'critical';

/**
 * A named problem attached to a node. Drives visible symptoms (pests,
 * discoloration, spatial audio cues) and is the payload the pruning
 * interaction acts on.
 */
export interface Blight {
  id: string;
  severity: BlightSeverity;
  /** Short human-readable line. Rendered on the spatial HUD. */
  message: string;
  /** Epoch ms the problem was first observed. */
  since: number;
  /** Set by an adapter when this blight is safely actionable. */
  remediable?: boolean;
}

/**
 * The health axes. Every adapter maps its own metrics onto these, and the
 * renderer reads only these. This is what lets one plant renderer serve
 * Prometheus series, Markdown notes, tickers, and league tables.
 */
export interface Vitals {
  /**
   * How healthy the thing is right now. 0 is dying, 1 is thriving.
   * Drives droop, leaf density, and color.
   */
  vitality: number;
  /**
   * How much is happening right now. 0 is dormant, 1 is peak.
   * Drives animation rate and ambient audio intensity.
   */
  activity: number;
  /**
   * How long-established and structurally stable the thing is. 0 is a seedling,
   * 1 is an old tree. Drives trunk thickness and L-System iteration count.
   */
  maturity: number;
  /**
   * Signed rate of change, -1 to 1. Vitality is a level and this is the delta,
   * because a stock down 6% today reads differently from one merely sitting low.
   * Renders as fresh growth or shedding. Computed in translation, not here.
   */
  trend: number;
}

/**
 * One renderable organism in the ecosystem.
 *
 * Flat by design. Hierarchy is expressed with `parentId` so the store can be a
 * plain record and updates never require walking a tree.
 */
export interface EcosystemNode extends Vitals {
  /** Stable across restarts. Used as the deterministic L-System seed. */
  id: string;
  /** Null for gardens. */
  parentId: string | null;
  /**
   * Denormalized so the scene can filter to the live garden in one pass instead
   * of walking parents. For a garden node this equals its own id.
   */
  gardenId: string;
  /** Shown on the HUD and on bed signage. */
  label: string;
  domain: Domain;
  kind: NodeKind;
  polarity: Polarity;
  /** Empty array means healthy. */
  blights: Blight[];
  /** Epoch ms of the last telemetry update. Drives staleness fading. */
  updatedAt: number;
  /**
   * Domain-specific payload, opaque to the renderer. The inspection HUD
   * displays it: a Prometheus series, Markdown source, a price history.
   */
  raw?: unknown;
}

/**
 * How two things affect each other.
 *
 * `depends` and `requires` are directed: the source needs the target.
 * `links` and `correlates` describe association without causation.
 */
export type EdgeKind = 'depends' | 'requires' | 'links' | 'correlates';

/**
 * A visible relationship between two plants, drawn as a root graft below the
 * soil. Held in its own collection rather than on the node, so a vitality tick
 * never invalidates edge geometry and a topology change never rebuilds plants.
 *
 * Both endpoints must sit in the same garden. Correlating a ticker with a
 * Kubernetes pod is meaningless, and the constraint keeps the edge renderer
 * bounded by one garden's worth of relationships.
 */
export interface EcosystemEdge {
  id: string;
  gardenId: string;
  sourceId: string;
  targetId: string;
  kind: EdgeKind;
  /** 0 to 1. Drives graft thickness and the brightness of flow along it. */
  strength: number;
  directed: boolean;
}

/** The shape the store holds and the scene subscribes to. */
export interface EcosystemState {
  nodes: Record<string, EcosystemNode>;
  edges: Record<string, EcosystemEdge>;
  /** Vitals over time, keyed by node id. See `history.ts`. */
  history: Record<string, VitalsHistory>;
  /** Null before the user picks a garden. The scene renders nothing until set. */
  activeGardenId: string | null;
  /**
   * Epoch ms the scene is displaying, or null for live. The scene must read
   * vitals through `vitalsAt` rather than off the node, so this is the only
   * thing that has to change to scrub time.
   */
  cursor: number | null;
  /** Epoch ms of the last state commit, for staleness and debug overlays. */
  revision: number;
}

/** Highest severity present, or null when healthy. Cheap enough to call per frame. */
export function worstBlight(node: EcosystemNode): BlightSeverity | null {
  const order: BlightSeverity[] = ['info', 'warn', 'error', 'critical'];
  let worst = -1;
  for (const b of node.blights) {
    const rank = order.indexOf(b.severity);
    if (rank > worst) worst = rank;
  }
  return worst === -1 ? null : order[worst];
}

/**
 * Vitality as the renderer should read it, with polarity applied. A weed at
 * vitality 0.9 is thriving as a plant and terrible as a signal, and this is the
 * single place that inversion happens.
 */
export function signalHealth(node: EcosystemNode): number {
  return node.polarity === 'suppress' ? 1 - node.vitality : node.vitality;
}
