import { useCallback, useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Garden } from './scene/Garden';
import { useEcosystem, markVisited } from './state/ecosystemStore';
import { DAY_MS, HOUR_MS } from './ecosystem/history';
import { scrubBy } from './ecosystem/scrub';

/**
 * Deliberately plain chrome. This exists to look at the garden, not to be the
 * interface, and the garden buttons are a placeholder for walking somewhere
 * else.
 *
 * Time is no longer among them. Scrubbing is dragging the sun across the sky
 * (see scene/SunScrub.tsx), so what is left here is a readout of where the
 * cursor stands and a keyboard path to the same thing, because a gesture that
 * needs a pointing device is not a control everyone has.
 */
export default function App() {
  const nodes = useEcosystem((s) => s.nodes);
  const activeGardenId = useEcosystem((s) => s.activeGardenId);
  const enterGarden = useEcosystem((s) => s.enterGarden);
  const cursor = useEcosystem((s) => s.cursor);
  const setCursor = useEcosystem((s) => s.setCursor);
  const tick = useEcosystem((s) => s.tick);
  const select = useEcosystem((s) => s.select);
  const changesSinceLastVisit = useEcosystem((s) => s.changesSinceLastVisit);

  const [live, setLive] = useState(true);

  const gardens = useMemo(
    () => Object.values(nodes).filter((n) => n.kind === 'garden'),
    [nodes],
  );

  useEffect(() => {
    if (!live) return;
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, [live, tick]);

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
      } else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nudge, setCursor, select]);

  const changes = changesSinceLastVisit();

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#14110e' }}>
      {/* A starting position only. The garden frames itself once it knows how
          big a house it needs (see scene/Garden.tsx), because the league's
          twenty metres and a three bed garden want very different distances.
          Scroll to close in; drag to walk round it. */}
      <Canvas
        shadows
        camera={{ position: [0, 4, 22], fov: 50 }}
        gl={{ toneMappingExposure: 1.1 }}
      >
        <Garden />
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

        <div style={{ opacity: 0.4, marginTop: 4, fontSize: 11 }}>
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
