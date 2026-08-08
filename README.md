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
plus `polarity` (is growth good news?). Plant shape is mostly procedural L-system
geometry — a couple of forms, the vine and the topiary, are built by hand — all
seeded off the node id so a node always grows the same plant, and all generated
in pure code with no React or three.js so it can move to a worker later.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the layer contracts, the time/history
model, and recorded assumptions; [DESIGN.md](DESIGN.md) for the reading language
(which signal gets which visual channel) and the open design questions.

## Layout

```
src/
  ecosystem/   Node/edge/state contracts, graph helpers, history, layout,
               staleness, scrub window rules, planting types
  lsystem/     Pure procedural geometry: grammar, turtle, presets, bespoke
               (vine + topiary), generate
  hooks/       useLSystem — memoized geometry generation
  state/       Zustand store (holds state, nothing derived)
  scene/       R3F components: Garden, Branches, Foliage, Produce, Grafts, Beds,
               Motes, Sky, SunScrub, Trellis, Horizon, plus the pure sway and
               daylight modules
  mock/        Mock ecosystem + drift tick
```

Rendering aggregates every branch across all plants into one `InstancedMesh`,
and every leaf into one mesh per leaf shape (at most five), for a handful of
draw calls regardless of plant count. Geometry is memoized on quantized vitals,
so a telemetry tick that doesn't move a plant across a bucket is a cache hit,
not a rebuild.

## What's built

- Procedural plants driven by health; garden switching; time scrub (history).
- **Beds are plantings.** Each bed is a *kind* of planting — orchard, grove,
  hedge, conifer stand, flower border, wildflower meadow, vegetable patch,
  vineyard, topiary, or (for suppress gardens) an invasive thicket — laid out its
  own way and filled with the plant forms that belong to it. A bed reads as a
  composed unit instead of a random thicket. It's a container property, never a
  health signal, so it spends no part of the reading budget; health still reads
  through droop, density, and colour within each form.
- **Produce and structure.** Vegetables and vineyards bear **produce** — fruit on
  a subset of the plant's leaf points, so a laden plant is healthy and a bare one
  is not. The **vineyard** trains its vines on a **trellis** (posts and wires)
  with grapes hanging from the shoots; **topiary** clips foliage to a sphere,
  cone, cube, or spiral, where neglect reads as shagginess rather than death.
  Vines and topiary are not L-systems — they're built by hand in
  `lsystem/bespoke.ts` but emit the same geometry, so they render, sway, and
  cache like every other plant. Every declared planting is now live.
- **Plant forms** — broadleaf, bushy, willow, conifer spire, the weed shrub, and
  the flower/wildflower — each with its own branching grammar and leaf shape:
  broad, blade, needle, round, or a **bloom** (a stem topped with a head of
  petals). Within a bed, ordinary plants vary by a hash of the node id, so a
  planting looks grown; a suppress-polarity node is a weed wherever it grows,
  keeping the polarity read intact. Leaves and petals grow in fanned clusters, so
  a healthy plant reads as a full canopy — or a full bloom — and a sick one sheds
  to bare twigs or a bare stem. Petal colour is decorative and varietal, never a
  health signal.
- **A landscape behind the garden** — layered hills, distant mountains, and a
  conifer tree line receding into fog. Static and signal-free by design; it is
  lit and fogged by the same rig as the garden, so it tracks the day/night scrub
  for free and never competes with the plants for attention.
- Ambient motion: per-plant sway + breathing, drifting motes. Any value that
  updates on a telemetry tick (activity, vitality) is smoothed so it eases in
  rather than snapping — see the comments in `src/scene/sway.ts`.
- Vitality **droop**: sick plants wilt toward the ground (clamped to the soil).
- Staleness is grey **and still** — a stale plant stops swaying, so silence
  (a dead adapter) never passes for a thriving plant. Plus "what changed since I
  last looked" summary.
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
seasons (the day is done, the year is not), the **dust** cue that finishes the
staleness state (grey and still are in; the particulate is not), a signal-gust
transient, deadwood for tasks and goals that end, and real adapters behind the
translation layer.
