import { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Garden } from './scene/Garden';
import { useEcosystem, markVisited } from './state/ecosystemStore';
import { HOUR_MS } from './ecosystem/history';

/**
 * Deliberately plain chrome. This exists to look at the garden, not to be the
 * interface. Every control here is a placeholder for a spatial one: the time
 * slider becomes the sun crossing the sky, and the garden buttons become
 * walking somewhere else.
 */
export default function App() {
  const nodes = useEcosystem((s) => s.nodes);
  const activeGardenId = useEcosystem((s) => s.activeGardenId);
  const enterGarden = useEcosystem((s) => s.enterGarden);
  const cursor = useEcosystem((s) => s.cursor);
  const setCursor = useEcosystem((s) => s.setCursor);
  const revision = useEcosystem((s) => s.revision);
  const tick = useEcosystem((s) => s.tick);
  const changesSinceLastVisit = useEcosystem((s) => s.changesSinceLastVisit);

  const [hoursBack, setHoursBack] = useState(0);
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

  useEffect(() => {
    setCursor(hoursBack === 0 ? null : revision - hoursBack * HOUR_MS);
    // revision deliberately excluded: re-anchoring the cursor on every tick
    // would drag the view forward while the user is holding it still.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoursBack, setCursor]);

  const changes = changesSinceLastVisit();

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#14110e' }}>
      <Canvas
        shadows
        camera={{ position: [0, 3.2, 9], fov: 50 }}
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
                setHoursBack(0);
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
          <span style={{ width: 70 }}>
            {hoursBack === 0 ? 'now' : `-${hoursBack}h`}
          </span>
          <input
            type="range"
            min={0}
            max={47}
            value={hoursBack}
            onChange={(e) => setHoursBack(Number(e.target.value))}
            style={{ flex: 1 }}
          />
        </label>

        <label style={row}>
          <input
            type="checkbox"
            checked={live}
            onChange={(e) => setLive(e.target.checked)}
          />
          <span>drift every 2s</span>
        </label>

        <div style={{ opacity: 0.65, marginTop: 8, fontSize: 11 }}>
          {cursor === null ? 'live' : new Date(cursor).toLocaleString()}
          {changes.length > 0 && ` · ${changes.length} changed since last visit`}
        </div>
      </div>
    </div>
  );
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
