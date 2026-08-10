import { useCallback, useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Garden, type ViewMode } from './scene/Garden';
import { CAMERA_FOV } from './scene/bonsai';
import { useEcosystem, markVisited, flushObservations } from './state/ecosystemStore';
import { DAY_MS, HOUR_MS } from './ecosystem/history';
import { scrubBy } from './ecosystem/scrub';
import { Timeline } from './Timeline';

/**
 * Deliberately plain chrome. This exists to look at the garden, not to be the
 * interface, and the garden buttons are a placeholder for walking somewhere
 * else.
 *
 * Scrubbing is still dragging the sun across the sky (see scene/SunScrub.tsx).
 * What is here is a readout of where the cursor stands, a keyboard path to the
 * same thing — a gesture that needs a pointing device is not a control everyone
 * has — and the one thing the sun cannot say, which is how much past there is.
 * `Timeline.tsx` is that, and it is a provenance display rather than the scrub
 * bar the sun was chosen over.
 */
export default function App() {
  const nodes = useEcosystem((s) => s.nodes);
  const activeGardenId = useEcosystem((s) => s.activeGardenId);
  const enterGarden = useEcosystem((s) => s.enterGarden);
  const cursor = useEcosystem((s) => s.cursor);
  const setCursor = useEcosystem((s) => s.setCursor);
  const tick = useEcosystem((s) => s.tick);
  const poll = useEcosystem((s) => s.poll);
  const select = useEcosystem((s) => s.select);
  const changesSinceLastVisit = useEcosystem((s) => s.changesSinceLastVisit);

  const [live, setLive] = useState(true);

  // Which grain of space is live: the body on the path, or the whole garden on a
  // table. See scene/bonsai.ts. Held here, next to the other bits of chrome,
  // rather than in the store, because it is how the scene is being looked at and
  // not anything about the ecosystem itself.
  const [viewMode, setViewMode] = useState<ViewMode>('stand');

  const gardens = useMemo(
    () => Object.values(nodes).filter((n) => n.kind === 'garden'),
    [nodes],
  );

  // One beat for both, because they are the same claim: the world is moving.
  // `tick` drifts the mock gardens; `poll` asks the real sources whether they
  // owe a reading, which almost always they do not — the question is a scan and
  // the answer is usually nothing. Turning this off stops both, and the gardens
  // then go grey on their own, correctly, as feeds nobody is reading.
  useEffect(() => {
    if (!live) return;
    const beat = () => {
      tick();
      poll();
    };
    const id = setInterval(beat, 2000);
    return () => clearInterval(id);
  }, [live, tick, poll]);

  // The collector writes on a thirty-second schedule, which covers everything
  // except the moment the page goes away — and that one is not a risk but a
  // certainty. `pagehide` rather than `beforeunload` because the latter does not
  // fire on mobile, where a tab is backgrounded and then reclaimed without ever
  // being closed; `visibilitychange` catches the same thing one step earlier and
  // costs a write nobody notices.
  useEffect(() => {
    const save = () => flushObservations();
    const onHidden = () => {
      if (document.visibilityState === 'hidden') save();
    };
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', onHidden);
      save();
    };
  }, []);

  const nudge = useCallback(
    (deltaMs: number) => {
      const state = useEcosystem.getState();
      setCursor(scrubBy(state.cursor, deltaMs, Date.now(), state.scrubWindowMs));
    },
    [setCursor],
  );

  // The same scrubs the sun gives, by the step: left and right for hours, up and
  // down for days, which is the keyboard's version of dragging across the arc
  // rather than along it. Held in the window rather than on a focused element:
  // there is nothing to focus in a scene made of one canvas, and the alternative
  // is a control the gesture was meant to replace.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const hours = event.shiftKey ? 6 * HOUR_MS : HOUR_MS;
      const days = event.shiftKey ? 7 * DAY_MS : DAY_MS;
      if (event.key === 'ArrowLeft') nudge(-hours);
      else if (event.key === 'ArrowRight') nudge(hours);
      else if (event.key === 'ArrowDown') nudge(-days);
      else if (event.key === 'ArrowUp') nudge(days);
      else if (event.key === 'Escape' || event.key === 'Home') {
        // Escape backs out of one thing at a time, innermost first: an open
        // plant before the time you were looking at it. Collapsing both at once
        // would lose the scrub for anyone who only wanted the panel shut.
        if (useEcosystem.getState().selectedId) select(null);
        else setCursor(null);
      } else if (event.key === 't' || event.key === 'T') {
        // Step back to take the whole garden in at once, or step back down onto
        // the path. The switch is a flight, not a cut (see scene/bonsai.ts).
        setViewMode((mode) => (mode === 'stand' ? 'table' : 'stand'));
      } else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nudge, setCursor, select]);

  const changes = changesSinceLastVisit();

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#14110e' }}>
      {/* A starting position only, and deliberately one already inside the
          house: the garden places the viewer properly once it knows how big a
          house it needs (see scene/Garden.tsx), and a first frame out in the
          field would read as walking in rather than as being there. Drag to
          look round; the scroll stops at the glass. */}
      <Canvas
        shadows
        camera={{ position: [0, 1.2, 4.5], fov: CAMERA_FOV }}
        gl={{ toneMappingExposure: 1.1 }}
      >
        <Garden viewMode={viewMode} />
      </Canvas>

      <div style={panel}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {gardens.map((garden) => (
            <button
              key={garden.id}
              onClick={() => {
                if (activeGardenId) markVisited(activeGardenId);
                enterGarden(garden.id);
              }}
              style={{
                ...button,
                background: garden.id === activeGardenId ? '#3f5a44' : '#242b30',
              }}
            >
              {garden.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <button
            onClick={() => setViewMode((m) => (m === 'stand' ? 'table' : 'stand'))}
            style={{
              ...button,
              background: viewMode === 'table' ? '#3f5a44' : '#242b30',
            }}
          >
            {viewMode === 'table' ? 'walk in' : 'overview'}
          </button>
        </div>

        <label style={row}>
          <input
            type="checkbox"
            checked={live}
            onChange={(e) => setLive(e.target.checked)}
          />
          <span>drift every 2s</span>
        </label>

        <div style={{ opacity: 0.65, marginTop: 8, fontSize: 11 }}>
          {cursor === null
            ? 'live'
            : `${new Date(cursor).toLocaleString()} · ${timeBack(cursor)} back`}
          {changes.length > 0 && ` · ${changes.length} changed since last visit`}
        </div>

        <Timeline />

        <div style={{ opacity: 0.4, marginTop: 8, fontSize: 11 }}>
          {viewMode === 'table'
            ? 'drag to turn the table · scroll to zoom · t to walk in'
            : 'drag to look · scroll to walk · look up for the sun · t for overview'}
        </div>
        <div style={{ opacity: 0.4, marginTop: 2, fontSize: 11 }}>
          drag the sun along its arc for hours, across it for seasons
        </div>
        <div style={{ opacity: 0.4, marginTop: 2, fontSize: 11 }}>
          shift-drag anywhere · ← → hours · ↑ ↓ days · esc for now
        </div>
      </div>
    </div>
  );
}

/**
 * How far back the cursor sits, in whichever unit is legible there. Hours stop
 * being readable at about two days, which is exactly where the season scrub
 * takes over.
 */
function timeBack(cursor: number): string {
  const elapsed = Math.max(0, Date.now() - cursor);
  if (elapsed < 2 * DAY_MS) return `${Math.round(elapsed / HOUR_MS)}h`;
  const days = Math.round(elapsed / DAY_MS);
  return days < 14 ? `${days}d` : `${Math.round(days / 7)} weeks`;
}

const panel: React.CSSProperties = {
  position: 'absolute',
  left: 16,
  bottom: 16,
  padding: '12px 14px',
  background: 'rgba(12,16,18,0.82)',
  border: '1px solid #2a3238',
  borderRadius: 8,
  color: '#d6dbde',
  font: '12px/1.5 ui-monospace, monospace',
  minWidth: 300,
};

const row: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 6,
};

const button: React.CSSProperties = {
  padding: '5px 10px',
  border: '1px solid #38424a',
  borderRadius: 5,
  color: '#d6dbde',
  cursor: 'pointer',
  font: 'inherit',
};
