# Spatial Ecosystem

System health as a living garden. Services, notes, tickers, threats — anything
with a pulse — rendered as plants that thrive, wilt, and sway so you can read the
state of a system at a glance instead of scanning a dashboard.

A healthy thing stands tall and leafy; a struggling one wilts toward the ground;
something you want gone grows as a weed, so a thriving one is alarming on sight.
Dependencies run underground as root grafts. The aim is *peripheral awareness*:
the garden sits at the edge of your desk in passthrough AR and you notice
something drooping while doing something else. Desktop browser is the first
target; nothing is head-locked, so XR stays open.

## Quick start

```bash
npm install
npm run dev      # Vite dev server, open the URL it prints
```

```bash
npm run test         # vitest
npm run typecheck    # tsc --noEmit
npm run build        # typecheck + production build
```

The scene boots on mock data (`src/mock/`) — four gardens (Infrastructure,
Vault, Threats, Portfolio), a live drift tick, and backfilled history — so it
runs with no backend.

> **Dev note:** Vite HMR on this project often serves stale code (component
> state, memoized shader uniforms). If an edit doesn't show, hard-reload the
> page; if it still doesn't, restart the dev server (`rm -rf node_modules/.vite`
> and rerun `npm run dev`).

## How it works

Data flows one way: **adapters** emit raw records → **translation** maps them to
normalized `EcosystemNode`s and `EcosystemEdge`s → a flat **store** holds them →
the **scene** subscribes. Nothing below the scene imports three.js; nothing above
`translation/` knows what Prometheus is. Adding a data source means writing a
translator, not widening the node type.

Health normalizes onto four axes — `vitality`, `activity`, `maturity`, `trend` —
plus `polarity` (is growth good news?). Plant shape is procedural L-system
geometry, seeded off the node id so a node always grows the same plant, generated
in pure code with no React or three.js so it can move to a worker later.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the layer contracts, the time/history
model, and recorded assumptions; [DESIGN.md](DESIGN.md) for the reading language
(which signal gets which visual channel) and the open design questions.

## Layout

```
src/
  ecosystem/   Node/edge/state contracts, graph helpers, history, layout, staleness
  lsystem/     Pure procedural geometry: grammar, turtle, presets, generate
  hooks/       useLSystem — memoized geometry generation
  state/       Zustand store (holds state, nothing derived)
  scene/       R3F components: Garden, Branches, Foliage, Grafts, Beds, Motes, Sky, sway
  mock/        Mock ecosystem + drift tick
```

Rendering aggregates every branch and leaf across all plants into one
`InstancedMesh` each, for one draw call regardless of plant count. Geometry is
memoized on quantized vitals, so a telemetry tick that doesn't move a plant
across a bucket is a cache hit, not a rebuild.

## What's built

- Procedural plants driven by health; garden switching; time scrub (history).
- Ambient motion: per-plant sway + breathing, drifting motes. Any value that
  updates on a telemetry tick (activity, vitality) is smoothed so it eases in
  rather than snapping — see the comments in `src/scene/sway.ts`.
- Vitality **droop**: sick plants wilt toward the ground (clamped to the soil).
- Staleness desaturation; "what changed since I last looked" summary.
- Daylight look: blue sky, warm sun, green ground, dusk was an earlier pass.
- Respects `prefers-reduced-motion`.

## What's next

The design docs track the open work. Near-term candidates: the "sun across the
sky" time-scrub gesture (the sun and shadows are already driven by one vector),
a signal-gust transient, finishing the staleness visual state, and real adapters
behind the translation layer.
