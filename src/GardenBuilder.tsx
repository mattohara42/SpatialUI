import { useMemo, useState } from 'react';
import { useEcosystem } from './state/ecosystemStore';
import {
  previewMapping,
  userGardenId,
  type UserGardenConfig,
} from './state/userSources';
import type { DeclarativeMapping } from './translation/declarative';
import type { Polarity } from './ecosystem/types';
import { KNOWN_DOMAINS } from './ecosystem/types';
import type { PlantingType } from './ecosystem/planting';

/**
 * The garden builder — the setup tool, not daily chrome.
 *
 * A user configures a garden here once, occasionally reopens it to tweak, and
 * otherwise never sees it: the mapping persists and the garden is just another
 * button. So this is a modal that stays out of the way, opened from a small
 * affordance, and its whole job is to make the two decisions the numbers cannot
 * carry — the scale and the polarity — deliberate rather than defaulted, and to
 * show, before anything is saved, the garden the mapping actually produces.
 *
 * The preview runs the real interpreter (`previewMapping`), so what is shown is
 * exactly what will ship into the scene; the interpreter's own errors are the
 * validation, and a flat axis is called out where the user can see it.
 */

/** The live plantings — the ones with geometry today (see `ecosystem/planting.ts`). */
const LIVE_PLANTINGS: PlantingType[] = ['orchard', 'grove', 'hedge', 'conifer-stand', 'thicket'];

const STALE_CHOICES: Array<{ label: string; hours: number }> = [
  { label: 'stale after 1 hour', hours: 1 },
  { label: 'stale after 6 hours', hours: 6 },
  { label: 'stale after 1 day', hours: 24 },
];

const EXAMPLE = {
  payload: JSON.stringify(
    {
      teams: [
        { name: 'North Rovers', group: 'A', points: 21, form: 0.8 },
        { name: 'East United', group: 'A', points: 12, form: 0.4 },
        { name: 'South City', group: 'B', points: 27, form: 0.9 },
        { name: 'West Albion', group: 'B', points: 6, form: 0.2 },
      ],
    },
    null,
    2,
  ),
  recordsPath: 'teams',
  labelPath: 'name',
  levelPath: 'points',
  dying: '0',
  thriving: '30',
  bedPath: 'group',
  activityPath: 'form',
};

export function GardenBuilder({
  editing,
  onClose,
}: {
  editing: UserGardenConfig | null;
  onClose: () => void;
}) {
  const addUserGarden = useEcosystem((s) => s.addUserGarden);
  const removeUserGarden = useEcosystem((s) => s.removeUserGarden);

  const m = editing?.mapping;
  const [name, setName] = useState(m?.gardenLabel ?? '');
  const [payloadText, setPayloadText] = useState(
    editing ? JSON.stringify(editing.payload, null, 2) : '',
  );
  const [recordsPath, setRecordsPath] = useState(m?.recordsPath ?? '');
  const [labelPath, setLabelPath] = useState(m?.labelPath ?? '');
  const [levelPath, setLevelPath] = useState(m?.levelPath ?? '');
  const [dying, setDying] = useState(m ? String(m.vitality.min) : '');
  const [thriving, setThriving] = useState(m ? String(m.vitality.max) : '');
  const [polarity, setPolarity] = useState<Polarity>(m?.polarity ?? 'nurture');
  const [bedPath, setBedPath] = useState(m?.bedPath ?? '');
  const [domain, setDomain] = useState(String(m?.domain ?? ''));
  const [planting, setPlanting] = useState<string>(m?.planting ?? '');
  const [provenance, setProvenance] = useState(
    typeof m?.provenance === 'string' ? m.provenance : '',
  );
  const [activityEnabled, setActivityEnabled] = useState(Boolean(m?.activity));
  const [activityPath, setActivityPath] = useState(m?.activity?.path ?? '');
  const [activityDying, setActivityDying] = useState(
    m?.activity ? String(m.activity.scale.min) : '',
  );
  const [activityThriving, setActivityThriving] = useState(
    m?.activity ? String(m.activity.scale.max) : '',
  );
  const [staleHours, setStaleHours] = useState(
    editing?.staleAfterMs ? editing.staleAfterMs / 3_600_000 : 6,
  );

  // Parse the pasted payload once per keystroke. A parse error is its own kind of
  // problem — before the mapping can be wrong, the JSON has to be JSON.
  const parsed = useMemo<{ ok: true; value: unknown } | { ok: false; error: string }>(() => {
    const text = payloadText.trim();
    if (!text) return { ok: false, error: 'Paste a JSON payload to map.' };
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch (e) {
      return { ok: false, error: `Not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
    }
  }, [payloadText]);

  const mapping = useMemo<DeclarativeMapping | null>(() => {
    if (!name.trim() || !labelPath.trim() || !levelPath.trim()) return null;
    const min = Number(dying);
    const max = Number(thriving);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    const gardenId = editing?.mapping.gardenId ?? userGardenId(name);
    return {
      gardenId,
      gardenLabel: name.trim(),
      ...(recordsPath.trim() ? { recordsPath: recordsPath.trim() } : {}),
      labelPath: labelPath.trim(),
      levelPath: levelPath.trim(),
      vitality: { min, max },
      polarity,
      ...(bedPath.trim() ? { bedPath: bedPath.trim() } : {}),
      ...(domain.trim() ? { domain: domain.trim() } : {}),
      ...(planting ? { planting: planting as PlantingType } : {}),
      ...(activityEnabled && activityPath.trim()
        ? {
            activity: {
              path: activityPath.trim(),
              scale: { min: Number(activityDying), max: Number(activityThriving) },
            },
          }
        : {}),
      ...(provenance.trim() ? { provenance: provenance.trim() } : {}),
    };
  }, [
    name, labelPath, levelPath, dying, thriving, polarity, recordsPath, bedPath,
    domain, planting, activityEnabled, activityPath, activityDying, activityThriving,
    provenance, editing,
  ]);

  const preview = useMemo(() => {
    if (!parsed.ok || !mapping) return null;
    return previewMapping(parsed.value, mapping);
  }, [parsed, mapping]);

  const canSave = Boolean(mapping) && parsed.ok && preview?.ok === true;

  const save = () => {
    if (!mapping || !parsed.ok) return;
    const config: UserGardenConfig = {
      mapping,
      payload: parsed.value,
      staleAfterMs: staleHours * 3_600_000,
      createdAt: editing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    addUserGarden(config);
    onClose();
  };

  const loadExample = () => {
    setName((n) => n || 'Example League');
    setPayloadText(EXAMPLE.payload);
    setRecordsPath(EXAMPLE.recordsPath);
    setLabelPath(EXAMPLE.labelPath);
    setLevelPath(EXAMPLE.levelPath);
    setDying(EXAMPLE.dying);
    setThriving(EXAMPLE.thriving);
    setBedPath(EXAMPLE.bedPath);
    setActivityEnabled(true);
    setActivityPath(EXAMPLE.activityPath);
    setActivityDying('0');
    setActivityThriving('1');
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={sheet} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <strong style={{ fontSize: 14 }}>{editing ? 'Configure garden' : 'Build a garden'}</strong>
          <button style={ghost} onClick={onClose}>close</button>
        </div>
        <p style={hint}>
          Point the garden at your own data. Paste one snapshot of a JSON feed, say
          which fields mean what, and the two things numbers can’t: what counts as
          thriving, and whether growth is good news.
        </p>

        <div style={grid}>
          {/* ---- The form ---- */}
          <div style={col}>
            <Field label="Garden name">
              <input style={input} value={name} onChange={(e) => setName(e.target.value)}
                placeholder="My league" />
            </Field>

            <Field label="Sample payload (JSON)"
              note="What a backend would fetch. Here you bring one snapshot by hand.">
              <textarea
                style={{ ...input, height: 150, resize: 'vertical', fontFamily: 'ui-monospace, monospace' }}
                value={payloadText}
                onChange={(e) => setPayloadText(e.target.value)}
                placeholder='{ "teams": [ … ] }'
              />
              <button style={ghost} onClick={loadExample}>load an example</button>
            </Field>

            <Field label="Records path"
              note="Where the array of records sits, dotted. Leave blank if the payload is the array.">
              <input style={input} value={recordsPath} onChange={(e) => setRecordsPath(e.target.value)}
                placeholder="teams" />
            </Field>

            <div style={{ display: 'flex', gap: 8 }}>
              <Field label="Label field">
                <input style={input} value={labelPath} onChange={(e) => setLabelPath(e.target.value)}
                  placeholder="name" />
              </Field>
              <Field label="Level field" note="The number that drives health.">
                <input style={input} value={levelPath} onChange={(e) => setLevelPath(e.target.value)}
                  placeholder="points" />
              </Field>
            </div>

            <Field label="What the level means"
              note="Deliberate, never guessed: state the value that reads as dying and the one that reads as thriving. Put dying above thriving when lower is better (a latency, an error rate).">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input style={{ ...input, width: 90 }} value={dying} onChange={(e) => setDying(e.target.value)}
                  placeholder="dying (0)" />
                <span style={{ opacity: 0.5 }}>→</span>
                <input style={{ ...input, width: 90 }} value={thriving} onChange={(e) => setThriving(e.target.value)}
                  placeholder="thriving (1)" />
              </div>
            </Field>

            <Field label="Polarity"
              note="The one rule the whole model holds. It cannot be read from the numbers.">
              <label style={radio}>
                <input type="radio" checked={polarity === 'nurture'} onChange={() => setPolarity('nurture')} />
                <span><b>Nurture</b> — more is good. A healthy plant is thriving.</span>
              </label>
              <label style={radio}>
                <input type="radio" checked={polarity === 'suppress'} onChange={() => setPolarity('suppress')} />
                <span><b>Suppress</b> — more is alarm (a weed, a short, failed logins). Growth reads as trouble.</span>
              </label>
            </Field>

            <Field label="Group into beds by" note="A field to group plants by. Optional.">
              <input style={input} value={bedPath} onChange={(e) => setBedPath(e.target.value)}
                placeholder="group" />
            </Field>

            <label style={radio}>
              <input type="checkbox" checked={activityEnabled} onChange={(e) => setActivityEnabled(e.target.checked)} />
              <span>Map a second field to <b>activity</b> (animation liveliness)</span>
            </label>
            {activityEnabled && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <input style={{ ...input, flex: 1 }} value={activityPath} onChange={(e) => setActivityPath(e.target.value)}
                  placeholder="field" />
                <input style={{ ...input, width: 64 }} value={activityDying} onChange={(e) => setActivityDying(e.target.value)}
                  placeholder="low" />
                <span style={{ opacity: 0.5 }}>→</span>
                <input style={{ ...input, width: 64 }} value={activityThriving} onChange={(e) => setActivityThriving(e.target.value)}
                  placeholder="high" />
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <Field label="Domain" note="A label for the HUD.">
                <input style={input} value={domain} onChange={(e) => setDomain(e.target.value)}
                  placeholder="general" list="known-domains" />
                <datalist id="known-domains">
                  {KNOWN_DOMAINS.map((d) => <option key={d} value={d} />)}
                </datalist>
              </Field>
              <Field label="Planting">
                <select style={input} value={planting} onChange={(e) => setPlanting(e.target.value)}>
                  <option value="">orchard (default)</option>
                  {LIVE_PLANTINGS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
            </div>

            <Field label="Where the data came from"
              note="Provenance, shown in the inspection panel. A source on real data should say.">
              <input style={input} value={provenance} onChange={(e) => setProvenance(e.target.value)}
                placeholder="e.g. exported from my spreadsheet, 2026-08-11" />
            </Field>

            <Field label="Freshness">
              <select style={input} value={staleHours} onChange={(e) => setStaleHours(Number(e.target.value))}>
                {STALE_CHOICES.map((c) => <option key={c.hours} value={c.hours}>{c.label}</option>)}
              </select>
            </Field>
          </div>

          {/* ---- The live preview ---- */}
          <div style={col}>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>Preview</div>
            {!parsed.ok && <div style={errorBox}>{parsed.error}</div>}
            {parsed.ok && !mapping && (
              <div style={muted}>Fill in a name, the label field, the level field, and the scale.</div>
            )}
            {preview && !preview.ok && <div style={errorBox}>{preview.error}</div>}
            {preview && preview.ok && <PreviewBody summary={preview.summary} />}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'space-between' }}>
          <div>
            {editing && (
              <button
                style={{ ...ghost, color: '#c98a8a' }}
                onClick={() => {
                  removeUserGarden(editing.mapping.gardenId);
                  onClose();
                }}
              >
                remove this garden
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={ghost} onClick={onClose}>cancel</button>
            <button
              style={{ ...primary, opacity: canSave ? 1 : 0.4, cursor: canSave ? 'pointer' : 'default' }}
              disabled={!canSave}
              onClick={save}
            >
              {editing ? 'save changes' : 'add garden'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewBody({ summary }: { summary: import('./state/userSources').GardenSummary }) {
  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <b>{summary.plants}</b> plants in <b>{summary.beds || 1}</b> bed{summary.beds === 1 ? '' : 's'}.
      </div>
      {summary.saturated.length > 0 && (
        <div style={warnBox}>
          Flat axis: <b>{summary.saturated.join(', ')}</b> is the same for every plant, so it
          carries no signal. A saturated axis looks exactly like one that is always on —
          widen its scale, or map a field that actually varies.
        </div>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ opacity: 0.6, textAlign: 'left' }}>
            <th style={th}>plant</th><th style={th}>bed</th>
            <th style={thNum}>vit</th><th style={thNum}>act</th><th style={thNum}>mat</th>
          </tr>
        </thead>
        <tbody>
          {summary.plantsPreview.map((p, i) => (
            <tr key={i}>
              <td style={td}>{p.label}</td>
              <td style={{ ...td, opacity: 0.6 }}>{p.bed}</td>
              <td style={tdNum}>{p.vitality.toFixed(2)}</td>
              <td style={tdNum}>{p.activity.toFixed(2)}</td>
              <td style={tdNum}>{p.maturity.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {summary.plants > summary.plantsPreview.length && (
        <div style={{ ...muted, marginTop: 6 }}>
          …and {summary.plants - summary.plantsPreview.length} more.
        </div>
      )}
    </div>
  );
}

function Field({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10, flex: 1 }}>
      <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 3 }}>{label}</div>
      {children}
      {note && <div style={{ fontSize: 10, opacity: 0.45, marginTop: 3, lineHeight: 1.4 }}>{note}</div>}
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(6,8,10,0.72)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16,
};
const sheet: React.CSSProperties = {
  width: 'min(880px, 96vw)', maxHeight: '92vh', overflow: 'auto',
  background: 'rgba(16,20,22,0.98)', border: '1px solid #2a3238', borderRadius: 10,
  color: '#d6dbde', font: '12px/1.5 ui-monospace, monospace', padding: 18,
};
const hint: React.CSSProperties = { fontSize: 11, opacity: 0.6, margin: '6px 0 14px', lineHeight: 1.5 };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 };
const col: React.CSSProperties = { minWidth: 0 };
const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '5px 7px', background: '#0d1113',
  border: '1px solid #2f3a41', borderRadius: 4, color: '#d6dbde', font: 'inherit',
};
const radio: React.CSSProperties = { display: 'flex', gap: 7, alignItems: 'flex-start', marginBottom: 6, fontSize: 11 };
const ghost: React.CSSProperties = {
  padding: '4px 9px', background: 'transparent', border: '1px solid #38424a',
  borderRadius: 4, color: '#9fb0b8', cursor: 'pointer', font: 'inherit', marginTop: 4,
};
const primary: React.CSSProperties = {
  padding: '6px 14px', background: '#3f5a44', border: '1px solid #4c6b52',
  borderRadius: 5, color: '#eaf1ec', font: 'inherit',
};
const muted: React.CSSProperties = { fontSize: 11, opacity: 0.5, lineHeight: 1.5 };
const errorBox: React.CSSProperties = {
  fontSize: 11, color: '#e0a0a0', background: 'rgba(90,30,30,0.3)',
  border: '1px solid #5a3030', borderRadius: 4, padding: '8px 10px', lineHeight: 1.5, whiteSpace: 'pre-wrap',
};
const warnBox: React.CSSProperties = {
  fontSize: 10.5, color: '#d8c68a', background: 'rgba(80,66,20,0.25)',
  border: '1px solid #5a4c20', borderRadius: 4, padding: '7px 9px', marginBottom: 8, lineHeight: 1.5,
};
const th: React.CSSProperties = { padding: '2px 4px', fontWeight: 400, borderBottom: '1px solid #2a3238' };
const thNum: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '2px 4px', borderBottom: '1px solid #1c2226' };
const tdNum: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
