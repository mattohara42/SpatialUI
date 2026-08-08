# Spatial Ecosystem

System health as a living garden. Services, notes, tickers, threats, a football
league — anything with a pulse — rendered as plants that thrive, wilt, and sway
so you can read the state of a system at a glance instead of scanning a
dashboard.

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

The scene opens on the **NFL** garden — thirty-two clubs in eight division beds,
built through the real adapter → translation pipeline — alongside four mock
gardens (Infrastructure, Vault, Threats, Portfolio) with a live drift tick. It
runs with no backend: the league's season is generated (see below), not fetched.

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
  adapters/    Input sources. `nfl/` is the first: feed-shaped records (games
               with box scores, depth charts, injury reports) plus the
               derivations that turn them into standings and stats as of any
               moment. Knows nothing about plants.
  translation/ Raw records to nodes and edges. `nfl.ts` is where football meets
               the garden, and the only place the mapping is decided.
  ecosystem/   Node/edge/state contracts, graph helpers, history, layout,
               staleness, scrub window rules, planting types
  lsystem/     Pure procedural geometry: grammar, turtle, presets, generate
  hooks/       useLSystem — memoized geometry generation
  state/       Zustand store (holds state, nothing derived) and the composition
               point where the gardens are assembled
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

- **The NFL as the first real data source.** The league is the garden, the eight
  divisions are the beds, and the thirty-two clubs are the plants. Vitality is
  the record, the point differential, and how much of the roster is available;
  activity is scoring pace and snaps; maturity is starter experience, roster age,
  and how long the franchise has existed; trend is recent form against season
  form. Injuries are blights, division rivals are root grafts, and a club on a
  bye genuinely stops reporting — so it stands there grey, still, and dusty,
  which is the staleness state reached honestly rather than by hand.

  The adapter's records are feed-shaped — a schedule of games each holding two
  box scores, a fifty-three slot depth chart with ages and years of service, an
  injury report with onsets — and every standing, stat, and availability number
  is *derived from them as of a timestamp*. That is what makes the whole season
  scrubbable: drag the sun back past Sunday and the results unwind, an injury
  from the fourth quarter is gone, and the division reads as the table did on
  Saturday. Alignment, franchises, and founding years are real; results, rosters,
  and injuries are seeded fiction standing in for a live feed, and the snapshot
  says so in its own provenance field. Roster entries are depth-chart slots
  (`QB1`, `LT`), never named players.
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
- **Textures and grain.** Every surface used to be one flat colour. Turf, soil,
  and bark now wear generated maps — no image files, just a seeded PRNG filling a
  byte buffer — and individual leaves, petals, and berries take a small stable
  jitter so a canopy reads as leaves rather than as one solid green object. The
  rule throughout is luminance only, never hue: grain darkens and lightens a
  tuned colour and can never tint it, which is what keeps it clear of the reading
  budget entirely. Soil furrows run along the bed's rows, so the ground looks
  worked for what is planted in it.
- Ambient motion: per-plant sway + breathing, drifting motes. Any value that
  updates on a telemetry tick (activity, vitality) is smoothed so it eases in
  rather than snapping — see the comments in `src/scene/sway.ts`.
- Vitality **droop**: sick plants wilt toward the ground (clamped to the soil).
- Staleness is grey, **still**, and **dusty** — a stale plant stops swaying, so
  silence (a dead adapter) never passes for a thriving plant, and a slow fall of
  pale specks around its base says so up close as well as in silhouette. The
  dust thickens with the length of the silence, which is the only cue that
  carries *how long*; it is the deliberate inverse of the activity motes, which
  rise and glow where dust falls and dulls. The mock runs one silent plant per
  garden so the state is there to look at. Plus "what changed since I last
  looked" summary.
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
seasons — which the league now makes urgent, since a season is eighteen weeks
and the sun's scrub window is two days; a live NFL adapter behind the same
`NflSource` interface (this environment has no outbound network access to a
sports API, which is why the season is generated); and an inspection HUD, since
the league's `raw` payload already carries a full stat sheet nothing yet
renders.
