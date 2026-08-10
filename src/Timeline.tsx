import { useCallback, useMemo, useRef } from 'react';
import { buildTimeline, fractionOf, timeAt } from './ecosystem/timeline';
import { cursorFor } from './ecosystem/scrub';
import { DAY_MS, HOUR_MS } from './ecosystem/history';
import { useEcosystem } from './state/ecosystemStore';

/**
 * The record, drawn.
 *
 * What this is for is in `ecosystem/timeline.ts`; what it must not become is
 * worth repeating here, because the temptation is a rendering one. `SunScrub`
 * argues that a scrub bar is a video player borrowed into a garden, and it is
 * right, so this is drawn as an *extent* rather than as a transport: no play
 * head, no buttons, no track that implies a thing running along it. It is a
 * measure of how much past exists, shaded by how finely it was kept, with a mark
 * where you are standing. The sun still moves under a drag, and it remains the
 * gesture the design is built around.
 *
 * The scale is linear in time, which makes the hourly stretch a small slice of a
 * season-long strip. That is deliberate: a broken or piecewise axis would let
 * the strip claim the two tiers are comparable spans when the whole point of
 * drawing the boundary is that they are not. Hours belong to the sun and the
 * arrow keys, which is where they already were; this is for the reach.
 */

const STRIP_HEIGHT = 18;

export function Timeline() {
  const cursor = useEcosystem((s) => s.cursor);
  const setCursor = useEcosystem((s) => s.setCursor);
  const scrubWindowMs = useEcosystem((s) => s.scrubWindowMs);
  const fineWindowMs = useEcosystem((s) => s.fineWindowMs);
  const revision = useEcosystem((s) => s.revision);

  const ref = useRef<HTMLDivElement>(null);

  // Rebuilt against `revision` rather than a timer of its own: the strip's
  // present is the same present the scene is drawing, so the mark and the light
  // can never disagree about what "now" is.
  const timeline = useMemo(
    () => buildTimeline(Math.max(revision, Date.now()), scrubWindowMs, fineWindowMs, cursor),
    [revision, scrubWindowMs, fineWindowMs, cursor],
  );

  const scrubTo = useCallback(
    (clientX: number) => {
      const box = ref.current?.getBoundingClientRect();
      if (!box || box.width === 0) return;
      const at = timeAt(timeline, (clientX - box.left) / box.width);
      setCursor(cursorFor(at, timeline.to, scrubWindowMs));
    },
    [timeline, setCursor, scrubWindowMs],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      scrubTo(event.clientX);
    },
    [scrubTo],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.buttons === 0) return;
      scrubTo(event.clientX);
    },
    [scrubTo],
  );

  const at = timeline.cursor ?? timeline.to;
  const markLeft = `${fractionOf(timeline, at) * 100}%`;
  const fineLeft =
    timeline.fineFrom === null ? null : `${fractionOf(timeline, timeline.fineFrom) * 100}%`;

  return (
    <div style={{ marginTop: 10 }}>
      <div
        ref={ref}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        style={strip}
        role="slider"
        tabIndex={-1}
        aria-label="recorded history"
        aria-valuemin={timeline.from}
        aria-valuemax={timeline.to}
        aria-valuenow={at}
        aria-valuetext={
          timeline.cursor === null ? 'live' : new Date(timeline.cursor).toLocaleString()
        }
      >
        {/* The coarse tier: the whole extent, held at a low tone so it reads as
            record rather than as fill. */}
        <div style={coarse} />

        {/* The fine tier, brighter, starting where hourly data begins. Drawn as
            its own block rather than as a line, because the difference is a
            span of time and not an instant. */}
        {fineLeft !== null && (
          <>
            <div style={{ ...fine, left: fineLeft, right: 0 }} />
            {/* The change of grain, as its own mark. The block alone was too
                quiet to read at a season's scale — a week of hours is a few
                percent of the strip — and the boundary is the fact, not the
                width of what sits beyond it. */}
            <div style={{ ...grainTick, left: fineLeft }} />
          </>
        )}

        {/* The floor. A hard edge on the old side, because past it is history
            nobody kept, and a strip that faded out there would read as data
            thinning rather than as a record stopping. */}
        <div style={edge} />

        <div style={{ ...mark, left: markLeft }} />
      </div>

      <div style={legend}>
        <span>{spanWords(timeline.to - timeline.from)} kept</span>
        <span style={{ opacity: 0.55 }}>
          {timeline.fineFrom === null
            ? 'daily only'
            : `hourly for ${spanWords(timeline.to - timeline.fineFrom)}`}
        </span>
      </div>
    </div>
  );
}

/** A duration in the largest unit that still reads as a quantity. */
function spanWords(ms: number): string {
  if (ms < 2 * DAY_MS) return `${Math.round(ms / HOUR_MS)}h`;
  const days = Math.round(ms / DAY_MS);
  return days < 14 ? `${days}d` : `${Math.round(days / 7)} weeks`;
}

const strip: React.CSSProperties = {
  position: 'relative',
  height: STRIP_HEIGHT,
  cursor: 'ew-resize',
  touchAction: 'none',
  userSelect: 'none',
};

const coarse: React.CSSProperties = {
  position: 'absolute',
  inset: `${STRIP_HEIGHT / 2 - 3}px 0`,
  background: '#252d32',
  borderRadius: 2,
};

const fine: React.CSSProperties = {
  position: 'absolute',
  top: STRIP_HEIGHT / 2 - 6,
  height: 12,
  background: '#6d9679',
  borderRadius: 2,
};

const grainTick: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: 1,
  background: '#6d9679',
  opacity: 0.75,
  pointerEvents: 'none',
};

const edge: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 1,
  bottom: 1,
  width: 2,
  background: '#7c8a80',
};

const mark: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: 2,
  marginLeft: -1,
  background: '#e8e2d4',
  pointerEvents: 'none',
};

const legend: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  marginTop: 4,
  fontSize: 11,
  opacity: 0.5,
};
