import { useMemo } from 'react';
import { Html } from '@react-three/drei';
import { HOUR_MS, vitalsAt } from '../ecosystem/history';
import { fieldsOf, formatNumber } from '../ecosystem/inspect';
import { emblemOf } from '../ecosystem/labels';
import {
  changeAcross,
  isEmpty,
  seriesOf,
  sparkPath,
  type Series,
} from '../ecosystem/series';
import { signalHealth } from '../ecosystem/types';
import { useEcosystem } from '../state/ecosystemStore';
import { CARD_Y, TAG } from './labels';
import type { PlacedPlant } from './types';

/**
 * The third question.
 *
 * The garden answers the first one across a room — something is wrong, and it is
 * over there. A tag answers the second at arm's length — which one is this. This
 * answers the one nobody has been able to ask yet: *what actually happened, and
 * which way is it going.*
 *
 * It is deliberately the only place in the app with numbers in it. Everything
 * else is a lossy summary by design — four axes, then shape and colour and
 * motion — and a panel is what a lossy summary needs to be honest: you can
 * always get to the readings the picture was made from. Two things follow from
 * that and both are rules rather than preferences.
 *
 * **It is world-anchored, not head-locked.** The panel hangs in the air beside
 * the plant it is about and stays there while you orbit, because a headset is a
 * stated target (assumption 6) and a card welded to your face is the one
 * interface a headset cannot have. On a desktop it looks like a tooltip; in a
 * headset it is a thing floating next to the plant, which is the same object
 * either way.
 *
 * **It carries no colour and no opinion.** Bars are one neutral tone whatever
 * the reading, because colour is the health channel and a panel that turned red
 * would be a second, competing reading of a node the garden has already
 * described. The panel's job is the record, not the verdict.
 *
 * Everything it shows is read through the cursor, so scrubbing with a panel open
 * moves the panel: the numbers, the trend, and the end of the sparkline are all
 * the same moment the light in the sky is showing.
 */

/** Hours in the fine line, and days in the coarse one. */
const DAY_HOURS = 24;
const SEASON_DAYS = 60;

const SPARK = { width: 232, height: 34 };

export function Detail({ plants }: { plants: PlacedPlant[] }) {
  const selectedId = useEcosystem((state) => state.selectedId);
  const select = useEcosystem((state) => state.select);
  const nodes = useEcosystem((state) => state.nodes);
  const history = useEcosystem((state) => state.history);
  const archive = useEcosystem((state) => state.archive);
  const cursor = useEcosystem((state) => state.cursor);
  const revision = useEcosystem((state) => state.revision);

  const plant = plants.find((candidate) => candidate.node.id === selectedId);
  const node = plant?.node;
  const at = cursor ?? revision;

  const day = useMemo(
    () => seriesOf(node && history[node.id], 'vitality', at, DAY_HOURS),
    [node, history, at],
  );
  const season = useMemo(
    () => seriesOf(node && archive[node.id], 'vitality', at, SEASON_DAYS),
    [node, archive, at],
  );

  if (!plant || !node) return null;

  const emblem = emblemOf(node);
  const vitals = vitalsAt(node, history[node.id], cursor, archive[node.id]);
  const bed = node.parentId ? nodes[node.parentId] : undefined;
  const fields = fieldsOf(node.raw);

  return (
    <Html
      position={[
        plant.position[0] + TAG.offset,
        CARD_Y + 0.42,
        plant.position[2] + 0.12,
      ]}
      center
      // Above the tag it belongs to, and above the canvas. `pointerEvents` is
      // set on the card rather than the wrapper so the empty space around it
      // still belongs to the camera.
      style={{ pointerEvents: 'none' }}
      zIndexRange={[20, 10]}
    >
      <div style={panel}>
        <div style={header}>
          <div
            style={{
              ...chip,
              background: emblem.color,
              color: emblem.ink,
            }}
          >
            {emblem.mark}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={title}>{node.label}</div>
            <div style={subtitle}>
              {bed ? `${bed.label} · ` : ''}
              {node.domain}
              {node.polarity === 'suppress' ? ' · suppress' : ''}
            </div>
          </div>
          <button
            style={close}
            onClick={() => select(null)}
            aria-label="close"
          >
            ×
          </button>
        </div>

        {plant.stale > 1 && (
          <div style={note}>
            no readings for {sinceWords(node.updatedAt, at)} — everything below is
            the last thing it said
          </div>
        )}

        <div style={{ marginTop: 10 }}>
          <Axis label="vitality" value={vitals.vitality} />
          <Axis label="activity" value={vitals.activity} />
          <Axis label="maturity" value={vitals.maturity} />
          <Axis label="trend" value={vitals.trend} signed />
        </div>

        <Spark
          caption="last day"
          series={day}
          stepWords="hourly"
          empty="nothing recorded in the last day"
        />
        <Spark
          caption="season"
          series={season}
          stepWords="daily"
          empty="no season archived for this source"
        />

        {node.blights.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={caption}>blights</div>
            {node.blights.map((blight) => (
              <div key={blight.id} style={blightRow}>
                <span style={{ opacity: 0.55 }}>{blight.severity}</span>{' '}
                {blight.message}
              </div>
            ))}
          </div>
        )}

        {fields.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={caption}>source</div>
            <div style={rawBox}>
              {fields.map((field, i) => (
                <div key={`${field.key}-${i}`} style={rawRow}>
                  <span
                    style={{
                      ...rawKey,
                      paddingLeft: field.depth * 10,
                      opacity: field.value === '' ? 0.85 : 0.55,
                    }}
                  >
                    {leafOf(field.key)}
                  </span>
                  <span style={rawValue}>{field.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ ...subtitle, marginTop: 10 }}>
          reading {cursor === null ? 'live' : new Date(at).toLocaleString()}
          {' · '}
          health {formatNumber(Math.round(signalHealth({ ...node, ...vitals }) * 100) / 100)}
        </div>
      </div>
    </Html>
  );
}

/** One axis: a number and a neutral bar. Signed axes read from the middle. */
function Axis({
  label,
  value,
  signed = false,
}: {
  label: string;
  value: number;
  signed?: boolean;
}) {
  const magnitude = Math.min(1, Math.abs(value));
  return (
    <div style={axisRow}>
      <span style={axisLabel}>{label}</span>
      <span style={track}>
        <span
          style={{
            ...fill,
            left: signed ? (value < 0 ? `${50 - magnitude * 50}%` : '50%') : 0,
            width: signed ? `${magnitude * 50}%` : `${magnitude * 100}%`,
          }}
        />
        {signed && <span style={middle} />}
      </span>
      <span style={axisValue}>
        {signed && value > 0 ? '+' : ''}
        {formatNumber(Math.round(value * 100) / 100)}
      </span>
    </div>
  );
}

/** A line of vitality over a window, with what it did across it. */
function Spark({
  caption: text,
  series,
  stepWords,
  empty,
}: {
  caption: string;
  series: Series;
  stepWords: string;
  empty: string;
}) {
  if (isEmpty(series)) {
    return (
      <div style={{ marginTop: 12 }}>
        <div style={caption}>{text}</div>
        <div style={{ ...subtitle, marginTop: 2 }}>{empty}</div>
      </div>
    );
  }

  const change = changeAcross(series);
  const path = sparkPath(series, SPARK.width, SPARK.height);
  const span = spanWords(series);

  return (
    <div style={{ marginTop: 12 }}>
      <div style={captionRow}>
        <span style={caption}>{text}</span>
        <span style={{ opacity: 0.55 }}>
          {change === null
            ? `one reading, ${stepWords}`
            : `${change >= 0 ? '↑' : '↓'} ${formatNumber(
                Math.round(Math.abs(change) * 100) / 100,
              )} over ${span}`}
        </span>
      </div>
      <svg
        width={SPARK.width}
        height={SPARK.height}
        style={{ display: 'block', marginTop: 4 }}
      >
        <line
          x1={0}
          y1={SPARK.height / 2}
          x2={SPARK.width}
          y2={SPARK.height / 2}
          stroke="#3a4750"
          strokeDasharray="2 4"
        />
        <path
          d={path}
          fill="none"
          stroke="#cfe0d4"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/** `roster.available` shows as `available`; the path is the indentation. */
function leafOf(key: string): string {
  const leaf = key.split('.').pop() ?? key;
  return leaf || '·';
}

function spanWords(series: Series): string {
  const hours = (series.to - series.from) / HOUR_MS;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

function sinceWords(from: number, to: number): string {
  const hours = Math.max(0, to - from) / HOUR_MS;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)} days`;
}

const panel: React.CSSProperties = {
  pointerEvents: 'auto',
  width: 300,
  maxHeight: '62vh',
  overflowY: 'auto',
  padding: '12px 14px',
  background: 'rgba(12,16,18,0.93)',
  border: '1px solid #2a3238',
  borderRadius: 10,
  color: '#d6dbde',
  font: '11px/1.5 ui-monospace, monospace',
  boxShadow: '0 18px 40px rgba(0,0,0,0.45)',
  userSelect: 'text',
};

const header: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 9,
};

const chip: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  font: '600 12px/1 ui-monospace, monospace',
  letterSpacing: 0.2,
  flexShrink: 0,
};

const title: React.CSSProperties = {
  fontSize: 13,
  color: '#eef2f4',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const subtitle: React.CSSProperties = { opacity: 0.5 };

const close: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#d6dbde',
  opacity: 0.5,
  cursor: 'pointer',
  font: '15px/1 ui-monospace, monospace',
  padding: '0 2px',
};

const note: React.CSSProperties = {
  marginTop: 8,
  padding: '5px 7px',
  border: '1px solid #3a3f34',
  borderRadius: 5,
  opacity: 0.75,
};

const axisRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 3,
};

const axisLabel: React.CSSProperties = { width: 54, opacity: 0.6 };

const track: React.CSSProperties = {
  position: 'relative',
  flex: 1,
  height: 5,
  background: '#232b30',
  borderRadius: 3,
  overflow: 'hidden',
};

/** One tone for every axis. The panel does not have a view. */
const fill: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  background: '#8fa896',
};

const middle: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: 0,
  bottom: 0,
  width: 1,
  background: '#3a4750',
};

const axisValue: React.CSSProperties = { width: 34, textAlign: 'right' };

const caption: React.CSSProperties = {
  opacity: 0.5,
  textTransform: 'uppercase',
  letterSpacing: 0.6,
  fontSize: 10,
};

const captionRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: 8,
};

const blightRow: React.CSSProperties = { marginTop: 2 };

const rawBox: React.CSSProperties = {
  marginTop: 3,
  maxHeight: 168,
  overflowY: 'auto',
  paddingRight: 4,
};

const rawRow: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'baseline',
};

const rawKey: React.CSSProperties = {
  flex: '0 0 42%',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const rawValue: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflowWrap: 'anywhere',
};
