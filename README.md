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

All three run in CI on every push to `main` and every pull request
(`.github/workflows/ci.yml`), so "the tests pass" is a checked fact rather than
a claim in a commit message.

The scene opens on the **NFL** garden — thirty-two clubs in eight division beds,
built through the real adapter → translation pipeline — alongside **Markets**,
thirty-two holdings in eight sector beds through the same pipeline, and four
mock gardens (Infrastructure, Vault, Threats, Portfolio) with a live drift tick.
It runs with no backend: both real sources are generated (see below), not
fetched.

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
[HANDOFF.md](HANDOFF.md) is the shortest path in if you are picking this up
cold: where it stands, which decisions are easy to undo by accident, what is
unfinished, and what is worth building next.

## Layout

```
src/
  adapters/    Input sources. `nfl/` is feed-shaped records (games with box
               scores, depth charts, injury reports); `market/` is closed bars,
               fills as lots, halts, and a trading calendar. Both come with the
               derivations that answer as of any moment. Neither knows what a
               plant is.
  translation/ Raw records to nodes and edges. `nfl.ts` is where football meets
               the garden and `market.ts` where a portfolio does — the only
               places the mappings are decided.
  ecosystem/   Node/edge/state contracts, graph helpers, history, layout,
               staleness, scrub window rules, planting types, labels and
               emblems, history-as-a-series, and the raw-payload flattener
  lsystem/     Pure procedural geometry: grammar, turtle, presets, generate
  hooks/       useLSystem — memoized geometry generation
  state/       Zustand store (holds state, near enough nothing derived) and the
               composition point where the gardens are assembled
  scene/       R3F components: Garden, Greenhouse, Props, Branches, Foliage,
               Grafts, Beds, Tags, Detail, Motes, Sky, SunScrub, Horizon, plus
               the pure sway, daylight, dust, greenhouse, and label modules
  mock/        Mock ecosystem + drift tick
```

Rendering aggregates every branch across all plants into one `InstancedMesh`,
and every leaf into one mesh per leaf shape (at most four), for a handful of
draw calls regardless of plant count. Geometry is memoized on quantized vitals,
so a telemetry tick that doesn't move a plant across a bucket is a cache hit,
not a rebuild.

## What's built

- **A book of positions, as the second real source — and the one that argues
  back.** Eight sectors are the beds, thirty-two holdings are the plants, and
  the adapter's records are bars and fills rather than a price and a P&L: every
  number is derived from them as of a timestamp, so the whole book scrubs the
  way the league does. It was chosen because it *breaks* things the league had
  satisfied for free.

  **A short position is the first real weed.** `polarity` has existed since the
  beginning and until now only mock threat data used it. Vitality here is how
  far the instrument has moved since you took it on — deliberately not your
  profit, and deliberately unsigned — so a short on a stock that has run away
  from you grows into the biggest, lushest thing in the greenhouse, which is
  exactly what it is.

  **The market is shut most of the time**, which is a problem for a garden whose
  first rule is that silence must never look like health. Staleness therefore
  asks the exchange calendar *when this instrument should next print* rather than
  measuring flat elapsed time: a weekend costs nothing, because nothing was due,
  and a vendor that goes quiet inside a session is flagged in about three hours
  instead of four days. The genuine staleness case is a **trading halt**: one
  symbol stops printing while the rest of the book carries on, and it greys
  itself because `updatedAt` is the last close on the tape and nothing edits it.

  **And it costs more.** The league's history backfill collapses a season to
  about fourteen real computations per club, because a club only moves when a
  game ends. A price moves every bar, so the same memo earns five to ten times
  less here (measured: 70 and 35 against 14 and 3.3). Total time barely changed,
  which is the interesting part — the derivations are logarithmic in the record,
  so losing the cache was survivable. The numbers are in ARCHITECTURE.md.

  Symbols, names, sectors and listing years are real; prices, volumes, fills and
  the halt are seeded fiction standing in for a live feed, and the snapshot says
  so in its provenance. There is no outbound network access to a market data
  vendor from here, which is the same reason the league's season is generated.
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
- **Seasons: the sun's other axis.** Dragging the sun *along* its arc scrubs
  hours at a turn per day. Dragging it *across* the arc scrubs the year — because
  that is what a season physically is, the daily circle riding higher or lower,
  which is why summer days are long. A full sweep of the arc's height is half a
  year, so both gestures move at the sun's own rate and neither is a faster
  version of the other. History is kept at two grains to match (hourly for a
  week, daily for twenty), so the league's whole season is walkable: scrub back
  eleven weeks and the clubs stand at the records they had in May.
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
- **You stand inside it.** The viewer is on the path under the glass at eye
  height, not outside looking in — the beds are either side, the glazing bars
  are overhead, and the hills are seen through the wall. The orbit is clamped by
  the walls, the nearest plant, and the eaves, so you cannot scroll back out
  into the field by accident: being indoors is a constraint rather than a
  starting position. The cost is that a garden's apparent size is no longer
  fixed — a three-bed garden and the league differ by how much house is around
  you, which is the difference a person walking in would get.
- **The garden is under glass.** A greenhouse — dwarf wall, painted frame,
  glazing bars, a pitched roof with a vent propped open, and a door standing
  ajar — sized from whatever is planted, so the league gets a bigger house rather
  than a cramped one. It answers "how much world has to exist" with a wall three
  metres away: the field and the hills are still out there and still lit by the
  same sun, but they are weather now rather than scenery. The sky is the one
  thing it may not take, so the panes cast no shadow and write no depth and the
  sun, moon, and stars read straight through the roof — you can still grab the
  sun to scrub time. **Beds are raised**, held in timber with corner posts and a
  cap rail; they are raised by lowering the floor, so the soil surface never
  moved and nothing that measures from a plant had to change. And the house is
  furnished: a hose on its hook with a length left on the floor, a potting bench
  on castors, a watering can, shears, gloves, twine, and stacks of terracotta
  pots. All of it signal-free, against the walls, and still.
- **Names, at the distance a name belongs.** Every plant carries a nursery tag —
  a stake with a card, the thing's mark on a roundel and its name beside it —
  and the tags **are not there until you walk up to a plant**. They fade in
  inside about nine metres and read fully at four and a half, so the view of a
  whole house has no text in it at all and the beds are named once you are among
  them. Health is what you read across the room; a name is what you read at the
  bed. What goes on the card is chosen by translation, never guessed by the
  renderer: the league uses its own abbreviations and club colours (`DAL` in
  Cowboys navy), and a source with no marks of its own takes the documented
  default — initials on a stable colour — as a deliberate choice. An emblem is
  fixed for the life of a node, which is what keeps a colour on a card clear of
  the health channel: identity never moves, signal does.
- **Tap a tag and the plant explains itself.** A panel opens in the air beside
  it — world-anchored rather than stuck to the screen, because the same object
  has to work in a headset — carrying the four axes as numbers, vitality over
  the last day and over the season as sparklines, the blights, and the source's
  own payload flattened into rows. It is the only place in the app with numbers
  in it, which is what a deliberately lossy summary owes you. It reads through
  the cursor, so scrubbing with a panel open moves the panel; and a stretch
  nobody recorded is drawn as a **gap in the line**, never bridged, because a
  trend line across silence is a picture of something that did not happen.
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
  the mapping is one to one with the sun's real rate. Drag it *across* its arc
  instead and you move the year at the same kind of rate; the season reads in the
  light and never in a plant, because bare branches already mean something else.
- Respects `prefers-reduced-motion`. The sky has no motion of its own; it moves
  only when the user scrubs.

### Reaching the sun

Dragging the sun is the gesture the concept is about, and on desktop it is only
half reachable. The camera stands inside the house and orbits a target at plant
height, so it is always looking somewhat down at the beds: the sky is visible
through the roof and the walls, but the upper sky where the sun spends most of
the day cannot be pointed at with a mouse. Standing inside did not cause this —
the old outdoor camera had the same limit for the same reason — but it does not
fix it either, and it removes the one workaround the field allowed, which was
backing away until the sky came into frame.

The glass itself is not in the way: it carries no pointer handlers, so R3F never
raycasts it and the sun, the moon, and their grab handles stay reachable straight
through the roof. Swing the camera toward a low sun and you can take hold of the
disc directly. Otherwise **shift-drag anywhere** does the same thing, and the sun
still visibly moves under the drag. Left and right arrows step an hour (shift,
six); up and down step a day (shift, a week); escape returns to live. A drag
commits to hours or to seasons on its first movement and holds it, so a diagonal
never means both.

In a headset you look up and grab it, which is the interaction the shift-drag is
standing in for.

## What's next

The design docs track the open work. Near-term candidates: an inspection HUD,
since the league's `raw` payload already carries a full stat sheet nothing yet
renders; a live NFL adapter behind the same `NflSource` interface (this
environment has no outbound network access to a sports API, which is why the
season is generated); and a collector, since the archive tier can now hold months
that nobody is yet recording.
