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
  ecosystem/   Node/edge/state contracts, graph helpers, history, layout,
               staleness, scrub window rules, planting types
  lsystem/     Pure procedural geometry: grammar, turtle, presets, generate
  hooks/       useLSystem — memoized geometry generation
  state/       Zustand store (holds state, nothing derived)
  scene/       R3F components: Garden, Branches, Foliage, Grafts, Beds, Motes,
               Sky, SunScrub, Horizon, plus the pure sway and daylight modules
  mock/        Mock ecosystem + drift tick
```

Rendering aggregates every branch across all plants into one `InstancedMesh`,
and every leaf into one mesh per leaf shape (at most four), for a handful of
draw calls regardless of plant count. Geometry is memoized on quantized vitals,
so a telemetry tick that doesn't move a plant across a bucket is a cache hit,
not a rebuild.

## What's built

- Procedural plants driven by health; garden switching; time scrub (history).
- **Beds are plantings.** Each bed is a *kind* of planting — orchard, grove,
  hedge, conifer stand, or (for suppress gardens) an invasive thicket — laid out
  its own way (roomy rows, a single low line, a jittered clump) and filled with
  the plant forms that belong to it. A bed reads as a composed unit instead of a
  random thicket. It's a container property, never a health signal, so it spends
  no part of the reading budget; health still reads through droop, density, and
  colour within each form. Flower borders, vegetable rows, vineyards, and topiary
  are declared and planned — each lands with its own geometry. See DESIGN.md.
- **Five plant archetypes** — broadleaf, bushy, willow, conifer spire, and the
  weed shrub — each with its own branching grammar and leaf shape (broad, blade,
  needle, round). Within a bed, ordinary plants vary by a hash of the node id, so
  a planting looks grown; a suppress-polarity node is a weed wherever it grows,
  keeping the polarity read intact. Leaves grow in fanned clusters, so a healthy
  plant reads as a full canopy and a sick one sheds to bare twigs.
- **A landscape behind the garden** — layered hills, distant mountains, and a
  conifer tree line receding into fog. Static and signal-free by design; it is
  lit and fogged by the same rig as the garden, so it tracks the day/night scrub
  for free and never competes with the plants for attention.
- Ambient motion: per-plant sway + breathing, drifting motes. Any value that
  updates on a telemetry tick (activity, vitality) is smoothed so it eases in
  rather than snapping — see the comments in `src/scene/sway.ts`.
- Vitality **droop**: sick plants wilt toward the ground (clamped to the soil).
- Staleness desaturation; "what changed since I last looked" summary.
- **Time scrub as the sun crossing the sky.** Drag the sun (or the moon, after
  dark) and history moves with it: the whole look — key light, fill, fog, sky
  gradient, stars — is a function of the hour under the cursor, so scrubbing
  reads as time passing rather than as values changing. A full turn is a day, so
  the mapping is one to one with the sun's real rate.
- Respects `prefers-reduced-motion`. The sky has no motion of its own; it moves
  only when the user scrubs.

### Reaching the sun

Dragging the sun is the gesture the concept is about, and on desktop it is only
half reachable: the camera orbits a target at knee height and is clamped at the
horizon, so sky above roughly 25 degrees cannot be pointed at with a mouse, and
the sun is up there for most of the day. Swing the camera toward a low sun and
you can take hold of the disc directly. Otherwise **shift-drag anywhere** does
the same thing, and the sun still visibly moves under the drag. Arrow keys step
an hour (shift, six), escape returns to live.

In a headset you look up and grab it, which is the interaction the shift-drag is
standing in for.

## What's next

The design docs track the open work. Near-term candidates: longer spans as
seasons (the day is done, the year is not), a signal-gust transient, finishing
the staleness visual state, and real adapters behind the translation layer.
