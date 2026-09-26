# Spatial Ecosystem

![The World garden from the path: countries planted in subregion beds under
the glass, a vineyard bearing in the centre bed.](docs/images/social-preview.jpg)

System health shown as a living garden. Services, notes, stock tickers, security
threats, a football league, anything with a pulse, drawn as plants that thrive,
wilt and sway. You read the state of a system at a glance instead of scanning a
dashboard.

A healthy thing stands tall and leafy. A struggling one wilts toward the ground.
Something you want gone grows as a weed, so when it thrives you notice straight
away. Dependencies run underground as root grafts. The goal is *peripheral
awareness*: the garden sits at the edge of your desk in passthrough AR and you
notice something drooping while you're doing something else. The desktop browser
is the first target, and nothing is locked to your head, so XR stays possible.

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

CI runs all three on every push to `main` and every pull request
(`.github/workflows/ci.yml`).

The app opens on the **NFL** garden and has nine gardens in all:

- **NFL**: thirty-two clubs in eight division beds.
- **Markets**: thirty-two holdings in eight sector beds.
- **World**: 193 UN member states in twenty-two subregion beds.
- **Prometheus**: seven targets in three job beds, fetched from a mock server.
- **Infrastructure, Vault, Threats, Pipelines and Portfolio**: hand-written mock
  gardens that drift over time.

The first four run through the real adapter → translation pipeline. Nothing needs
a backend: the generated sources are seeded and Prometheus fetches from a mock, so
nothing leaves the page. To run against real data, see
[docs/running-live.md](docs/running-live.md).

> **Dev note:** Vite's hot reload often serves stale code on this project
> (component state, memoized shader uniforms). If an edit doesn't show up,
> hard-reload the page. If it still doesn't, restart the dev server
> (`rm -rf node_modules/.vite` and run `npm run dev` again).

## How it works

Data flows one way. **Adapters** emit raw records, **translation** maps them to
normalized `EcosystemNode`s and `EcosystemEdge`s, a flat **store** holds them, and
the **scene** subscribes to the store. Nothing below the scene imports three.js,
and nothing above `translation/` knows what Prometheus is. Adding a data source
means writing a translator, not changing the node type.

Health is normalized onto four axes (`vitality`, `activity`, `maturity`, `trend`)
plus `polarity`, which says whether growth is good news. Plant shapes are
procedural L-system geometry, seeded from the node id so a node always grows the
same plant. The generator is pure code with no React or three.js, so it can move
to a worker later.

[ARCHITECTURE.md](ARCHITECTURE.md) covers the layer contracts, the time and
history model, and the assumptions we've recorded. [DESIGN.md](DESIGN.md) covers
the reading language (which signal gets which visual channel) and the open design
questions. If you're picking this up cold, start with [HANDOFF.md](HANDOFF.md): it
says where things stand, which decisions are easy to undo by accident, what's
unfinished and what's worth building next.

## Layout

```
src/
  adapters/    Input sources. `nfl/` is feed-shaped records (games with box
               scores, depth charts, injury reports) plus the live ESPN client;
               `market/` is closed bars, fills as lots, halts, and a trading
               calendar; `world/` is dated indicator releases, the country
               table, and land borders; `news/` is articles, plus the extractor
               that turns a headline into a record; `prometheus/` is the
               query-API wire format and a `fetch` seam, with `mock.ts` as a
               stand-in server so it runs offline. Each includes the
               derivations that answer "as of any moment". None of them knows
               what a plant is.
  translation/ Raw records to nodes and edges. `nfl.ts` is where football meets
               the garden, `market.ts` where a portfolio does, `world.ts` where
               countries do, and `prometheus.ts` / `declarative.ts` where a
               metric feed and a config-driven JSON source do. These are the
               only places mappings are decided.
  ecosystem/   Node/edge/state contracts, graph helpers, history, layout,
               staleness, scrub window rules, planting types, labels and
               emblems, completions, history as a series, and the raw-payload
               flattener
  lsystem/     Pure procedural geometry: grammar, turtle, presets, generate,
               and the hand-built vine and topiary forms
  hooks/       useLSystem, memoized geometry generation
  state/       Zustand store (holds state, derives almost nothing), the
               composition step where the gardens are assembled, user-built
               gardens, and the collector that records what was observed so a
               reload doesn't throw the past away
  scene/       R3F components (Garden, Greenhouse, Props, Branches, Foliage,
               Produce, Completions, Grafts, Beds, Tags, Detail, Motes, Dust,
               Signal, Sky, SunScrub, Horizon, Scatter, Post) and the two
               cameras (StandControl on the path, TableControl above the bonsai
               table), plus pure modules for sway, daylight, dust, signal,
               greenhouse, labels, bonsai table framing, camera flights,
               textures, leaf and branch shapes, and post-processing
  backend/     Runtime-agnostic proxy, registry and collector loop for live
               sources (see docs/backend.md)
  mock/        Mock ecosystem and drift tick
netlify/functions/  Netlify wrappers for the proxies and the scheduled collector
```

Rendering batches every branch across all plants into one `InstancedMesh`, and
every leaf into one mesh per leaf shape (six at most), so the draw call count
stays small no matter how many plants there are. Geometry is memoized on quantized
vitals, so a telemetry tick that doesn't push a plant into a new bucket is a cache
hit, not a rebuild. The cache holds 600 shapes and evicts the least recently used.
That keeps the plant you're looking at from being evicted when a season scrub
walks every other plant through buckets nobody will ask for again.

## What's in it

### The sources

- **The NFL**, the first real data source. The league is the garden, the eight
  divisions are the beds and the thirty-two clubs are the plants. Vitality comes
  from the record, the point differential and how much of the roster is
  available. Activity is scoring pace and snaps. Maturity is starter experience,
  roster age and how long the franchise has existed. Trend is recent form against
  season form. Injuries are blights, and division rivals are connected by root
  grafts. A club on a bye really does stop reporting, so it stands there grey,
  still and dusty, which is the stale state reached naturally.

  The adapter's records are shaped like a real feed: a schedule of games each
  holding two box scores, a fifty-three-slot depth chart with ages and years of
  service, and an injury report with start dates. Every standing, stat and
  availability number is *derived from them as of a timestamp*. That's what makes
  the season scrubbable. Drag the sun back past Sunday and the results unwind, a
  fourth-quarter injury disappears, and the division looks the way the table did
  on Saturday. Team alignment, franchises and founding years are real. By default
  the results, rosters and injuries are seeded fiction, and the snapshot says so
  in its provenance field. Roster entries are depth-chart slots (`QB1`, `LT`),
  never named players. With `VITE_NFL_PROXY_URL` set it pulls a real season from
  ESPN instead (see [docs/nfl-live.md](docs/nfl-live.md)).

- **Markets**, a book of positions and the second real source. Eight sectors are
  the beds and thirty-two holdings are the plants. The adapter's records are bars
  and fills, not a price and a P&L, and every number is derived from them as of a
  timestamp, so the whole book scrubs the way the league does. It was picked
  because it breaks things the league got for free.

  **A short position is the first real weed.** `polarity` existed from the
  beginning, but until this only mock threat data used it. Vitality here is how
  far the instrument has moved since you opened the position. It's deliberately
  not your profit and deliberately unsigned, so a short on a stock that has run
  away from you grows into the biggest, lushest thing in the greenhouse, which is
  exactly what it is.

  **The market is closed most of the time**, and the garden's first rule is that
  silence must never look like health. So staleness asks the exchange calendar
  when an instrument *should* next print, instead of measuring elapsed time. A
  weekend costs nothing because nothing was due, and a vendor that goes quiet
  during a session is flagged in about three hours instead of four days. The real
  staleness case is a **trading halt**: one symbol stops printing while the rest
  of the book carries on, and it greys out on its own because `updatedAt` is the
  last close on the tape. The same calendar drives polling, so the source is
  re-read exactly when it says a bar should have printed.

  **It's also more expensive.** The league's history backfill collapses a season
  to about fourteen real computations per club, because a club only changes when
  a game ends. A price changes every bar, so the same memoization does five to ten
  times less work here (measured: 70 and 35 against 14 and 3.3). Total time barely
  changed, because the derivations are logarithmic in the size of the record. The
  numbers are in ARCHITECTURE.md.

  Symbols, names, sectors and listing years are real. Prices, volumes, fills and
  the halt are seeded fiction standing in for a live feed, and the snapshot's
  provenance says so.

- **The World**, the third source and the first where a number can be revised.
  193 UN member states, with the twenty-two UN subregions as beds. It's the first
  garden built on figures that are *published* instead of measured, and it broke
  three things the first two sources had quietly agreed on.

  **Beds aren't all the same size.** The other gardens have eight even beds of
  four, but subregions hold anywhere from two countries to eighteen. The two-row
  wrap that works for eight beds turns twenty-two into a sixty-metre strip whose
  far end you can't see, so past a dozen beds the layout squares the garden off
  instead. Existing gardens keep their layout, because in those the row is part of
  the reading.

  **Scrubbing shows what was known, not what was true.** Growth figures are
  published about seventy-five days after the quarter they describe and revised a
  month later, so the same quarter has two values and which one you see depends on
  where the cursor is. A plant shows the figure that had been published at the
  cursor, and steps on release dates instead of drifting. The alternative would
  have the garden rewriting its own past every time a statistics office changed
  its mind.

  **A headline isn't a record.** Unrest and conflict don't come from the generator.
  They come from a news feed through an extraction layer (`adapters/news/`), which
  is the first place the app forms a *judgement* about its input instead of a
  calculation. It won't guess. A headline naming two countries, or none, or that
  reads like sport, produces nothing. Precision beats recall here: a miss costs a
  quiet plant, but a wrong attribution states something about a real country in a
  panel that looks just like the ones showing measured numbers.

  Conflict is a **blight**, never a vitality term. A country at war visibly wilting
  would be powerful and is the one thing this source mustn't do, because vitality
  is a comparison and the app would be ranking countries by war. Every derived
  blight carries the dispatch it came from (headline, outlet, date) and says
  plainly that it's simulated.

  Countries, ISO codes, subregions, UN accession years, land borders and rough
  populations are real. Every indicator value and every event is generated. The
  outlets are called "Simulated Wire" instead of borrowing a real masthead, the
  links use `.invalid`, and **which countries are shown in conflict is decided by a
  hash**, because hand-picking would mean taking a position on which real places
  are at war, in invented data, in a public repository.

- **Prometheus**, the kind of source the whole idea was built for. It runs through
  the real adapter and translator against a mock server that answers in the exact
  wire format. See [docs/prometheus.md](docs/prometheus.md).

- **Your own data.** The **+ garden** button opens a builder where you paste JSON,
  map its fields, preview the result through the real interpreter, and keep it as
  a garden. See [docs/garden-builder.md](docs/garden-builder.md).

### Reading the garden

- **Plant forms.** Broadleaf, bushy, willow, conifer spire, the weed shrub, and
  flowers and wildflowers, each with its own branching grammar and leaf shape:
  broad, blade, needle, round, frond, or a **bloom** (a stem topped with a head of
  petals). Within a bed, plants vary by a hash of the node id so the planting
  looks grown. A suppress-polarity node is a weed wherever it grows, so polarity
  always reads correctly. Leaves and petals grow in fanned clusters, so a healthy
  plant has a full canopy or a full bloom and a sick one sheds down to bare twigs
  or a bare stem. Petal colour is decorative and never a health signal.
- **Beds are plantings.** Each bed is a *kind* of planting (orchard, grove, hedge,
  conifer stand, flower border, wildflower meadow, vegetable patch, vineyard,
  topiary, or for suppress gardens an invasive thicket), laid out its own way and
  filled with the plant forms that belong in it. A bed reads as one composed unit.
  Planting kind is a container property and never a health signal, so health
  still reads through droop, density and colour within each form.
- **Produce and structure.** Vegetables and vineyards bear **produce**, fruit on
  some of the plant's leaf points, so a laden plant is healthy and a bare one
  isn't. The **vineyard** trains its vines on a **trellis** of posts and wires with
  grapes hanging from the shoots. **Topiary** clips foliage into a sphere, cone,
  cube or spiral, and neglect shows as shagginess instead of death. Vines and
  topiary are built by hand in `lsystem/bespoke.ts` instead of by L-system, but
  they output the same geometry, so they render, sway and cache like every other
  plant.
- **Fruit and deadwood for finished work.** Things that finish (builds, tasks)
  hang fruit when they succeed and leave a grey spur of deadwood when they fail.
  The Pipelines garden shows it. See [docs/completion.md](docs/completion.md).
- **Droop.** Sick plants wilt toward the ground, stopping at the soil.
- **Staleness is grey, still and dusty.** A stale plant stops swaying, so silence
  (a dead adapter) never passes for a thriving plant. A slow fall of pale specks
  around its base says so up close as well as in silhouette. The dust thickens the
  longer the silence lasts, and that's the only cue for *how long*. It's the
  opposite of the activity motes, which rise and glow where dust falls and dulls.
  The mock gardens each have one silent plant so you can see it.
- **A plume where something is moving.** The `trend` axis had a row in the
  channel table from the start but nothing drawing it. A club on a three-game
  winning run and one on a three-game slide looked identical, and the difference
  only showed as a number in the panel. Now a plant that's climbing sends warm
  amber specks *up* through its canopy, and one that's sliding sheds faded slate
  specks *down* to the soil.

  Direction carries the meaning and colour only repeats it, which is why it's
  amber against slate and not green against red. That pairing survives every
  common form of colour blindness, and in silhouette or in the dark the up and
  down still read. Below a threshold nothing is drawn, so most of a quiet garden
  has no plume. A **stale plant never plumes**, since an old number has no
  direction, and that also keeps the plume distinct from the falling dust.
  Polarity is applied first, so a backlog growing fast sheds instead of rising.
  The threshold is tuned against the real pipelines. `src/scene/signal.ts` has the
  numbers and notes on how differently the sources calibrate trend.
- **Ambient motion.** Each plant sways and breathes, and motes drift. Any value
  that updates on a telemetry tick (activity, vitality) is smoothed so it eases in
  instead of snapping. See the comments in `src/scene/sway.ts`.
- **What changed since you last looked**, as a summary.
- **Respects `prefers-reduced-motion`.** The sky has no motion of its own and only
  moves when you scrub.

### The place

- **You stand inside it.** You're on the path under the glass at eye height, not
  outside looking in. The beds are on either side, the glazing bars are overhead,
  and you see the hills through the wall. Drag to look around (including straight
  up through the roof) and scroll to walk. You're kept on the path between the
  planting and the glass so you can't wander out into the field by accident. One
  consequence is that a garden's apparent size isn't fixed: a three-bed garden
  and the league differ in how much greenhouse is around you, just as they would if
  you walked in.
- **The garden is under glass.** A greenhouse with a dwarf wall, painted frame,
  glazing bars, a pitched roof with a vent propped open and a door left ajar,
  sized to whatever is planted, so the league gets a bigger house instead of a
  cramped one. The field and hills are still out there and lit by the same sun, but
  now they're weather, not scenery. The glass mustn't block the sky, so the panes
  cast no shadow and write no depth, and the sun, moon and stars show straight
  through the roof. You can still grab the sun through it. **Beds are raised** in
  timber with corner posts and a cap rail. They were raised by lowering the floor,
  so the soil surface didn't move and nothing that measures from a plant had to
  change. The house is furnished too: a hose on its hook with some left on the
  floor, a potting bench on castors, a watering can, shears, gloves, twine and
  stacks of terracotta pots. None of it carries signal. It's all against the walls
  and none of it moves.
- **A landscape behind the garden.** Layered hills, distant mountains and a line
  of conifers fading into fog. It's static and carries no signal. It's lit and
  fogged by the same rig as the garden, so it follows the day and night scrub
  automatically and never competes with the plants for attention.
- **Textures and grain.** Turf, soil and bark have generated maps (no image files,
  just a seeded random generator filling a byte buffer), and individual leaves,
  petals and berries get a small, stable variation so a canopy looks like leaves
  and not one solid green lump. Grain only ever changes brightness, never hue, so
  it can't interfere with the health reading. Soil furrows run along the rows so
  the ground looks worked for what's planted in it.
- **Light through leaves, a model on the table, relief underfoot.** Leaves let
  light through, so a backlit canopy glows toward the sun and fades at dusk
  (`scene/translucency.ts`). It's a lighting effect tinted by the sun, not a colour
  the plant carries, so it stays out of the health reading. The bonsai table gets
  a **tilt-shift depth of field** (`scene/tiltshift.ts`, in the `scene/Post.tsx`
  chain), the shallow focus that makes a shrunk garden look like a physical model.
  Bark, turf, soil and timber have **normal and roughness maps** built from the
  same achromatic height field as their colour, so the sun catches their relief.
  Ambient occlusion, subtle bloom, tapered branches, shaped leaf blades and ground
  scatter came in the same pass. [docs/graphics.md](docs/graphics.md) has the full
  ladder and records the decision that XR stays a target.

### Names and details

- **Names appear when you get close.** Every plant has a nursery tag: a stake with
  a card showing its mark on a roundel and its name beside it. Tags **only appear
  when you walk up to a plant.** They fade in within about nine metres and are
  fully visible at four and a half, so a view of the whole house has no text in it
  and beds get named once you're among them. You read health from across the room
  and names at the bed. What goes on the card is chosen by translation, never
  guessed by the renderer. The league uses its own abbreviations and club colours
  (`DAL` in Cowboys navy), and a source without marks of its own gets the
  documented default of initials on a stable colour. An emblem never changes for
  the life of a node, which keeps card colours separate from the health signal:
  identity stays put and signal moves.
- **Tap a tag and the plant explains itself.** A panel opens in the air beside it.
  It's anchored in the world instead of stuck to the screen, because the same
  object has to work in a headset. It shows the four axes as numbers, vitality
  over the last day and over the season as sparklines, any blights, and the
  source's own payload flattened into rows. It's the only place in the app with
  numbers, which is what a deliberately lossy summary owes you. It follows the
  cursor, so scrubbing with a panel open updates the panel. A stretch nobody
  recorded is drawn as a **gap in the line** and never bridged, because a trend
  line across a silence shows something that didn't happen.

### Time

- **Scrubbing is the sun crossing the sky.** Drag the sun (or the moon, after
  dark) and history moves with it. The whole look (key light, fill, fog, sky
  gradient, stars) is a function of the hour under the cursor, so scrubbing feels
  like time passing instead of values changing. A full turn is a day, matching the
  sun's real rate.
- **Seasons are the sun's other axis.** Dragging the sun *along* its arc scrubs
  hours, one turn per day. Dragging it *across* the arc scrubs the year, because
  that's physically what a season is: the daily circle riding higher or lower,
  which is why summer days are long. A full sweep of the arc's height is half a
  year, so both gestures move at the sun's own rate. The season shows in the light
  and never in a plant, because bare branches already mean something else. History
  is kept at two grains to match (hourly for a week, daily for twenty weeks), so
  you can walk the league's whole season. Scrub back eleven weeks and the clubs
  stand at the records they had then.
- **The garden on a table.** History has two grains of time, and this adds a
  second grain of *space*. Press `t` (or the **overview** button) and the whole
  garden shrinks to a miniature on the grass, seen from above and outside, instead
  of walking the length of the aisle. It was built for the World garden, which is
  193 plants over roughly 35 × 46 metres, too long to see the far end from the
  near one. The table makes it take-in-at-a-glance.

  It changes your *distance*, not the reading. A plant on the table is the same
  plant, smaller, and health still reads through droop, colour and density.
  **It shrinks the garden instead of pulling the camera back** because the scene
  uses exponential fog: framing a thirty-metre garden would mean standing eighty
  metres away, where the fog has swallowed it. At bonsai scale the model stays an
  arm's length away in clear air. The pieces were already there, since `layout.ts`
  had always returned a `size` "for Bonsai mode scaling" that nothing used, so this
  is a new camera and frame, not a new layout (`scene/bonsai.ts`).

  The overview has **no text in it**, and that happened on its own: at table
  distance every plant is past the label fade radius, so the existing rule draws
  no tags. The switch is a **flight, not a cut** (`scene/fly.ts`). The camera
  eases out to the table and back down to the path, so the second view reads as
  the same garden because you watched the eye move there. On the table the camera
  *orbits*. `look.ts` argues against orbiting in the room, but here the whole
  garden has become the one object you're examining, so it fits. It's still one
  garden at a time. Several gardens on a table would be cross-garden comparison in
  disguise, with green meaning two things at once, and that needs its own design.
- **The past isn't thrown away.** History used to be backfilled when the page
  loaded and discarded when it closed, so scrubbing back four months showed four
  months of fiction regenerated on the spot. A collector now records what was
  actually observed and puts it back into the buffers on the next visit. Of the
  archive's 140 daily slots, the league can backfill 85 and the market tape 60.
  Weekends, byes and the days before each record starts are gaps, and those gaps
  are what the collector fills in, one visit at a time.

  The key rule is which account wins. A restored observation only goes into a slot
  the source left empty. A backfill is the source's *current* story about its own
  past and may include corrections, while our own record is valuable exactly where
  the source has gone quiet. Only what actually reported gets recorded. The mock
  garden's dead plant is never written down as saying the same number every hour,
  which would be the app inventing the one thing the design is built to avoid.

  It survives a reload and several tabs at once. Every page shares one storage
  key, so a write has to merge before it replaces, or the last tab to close would
  silently discard what the others saw. It can't collect while no tab is open,
  which is as far as a browser with no server behind it can go. The stored format
  is the one a server-side collector would want, so moving the loop to a server
  changes the backend, not the format. That server side is now built (see
  [docs/backend.md](docs/backend.md)).

### Reaching the sun

Dragging the sun is the gesture the whole concept is about, and for a long time
you could only half reach it on desktop. The camera used to orbit a point at
plant height, so it always looked somewhat down at the beds, and you couldn't
point a mouse at the upper sky where the sun spends most of the day.

The camera doesn't orbit anymore. **Drag to look** around from where you stand,
including straight up, and **scroll to walk** along the path. Look up and the sun
is there to grab, at midsummer noon as easily as at dusk.

The glass has never been in the way. It has no pointer handlers, so R3F never
raycasts it, and the sun, the moon and their grab handles are reachable straight
through the roof. **Shift-drag anywhere** does the same scrub without aiming at
anything, and the sun visibly moves with it. Left and right arrows step an hour
(with shift, six hours). Up and down step a day (with shift, a week). Escape
returns to live. A drag locks to hours or seasons on its first movement, so a
diagonal never does both.

In a headset you look up and grab the sun directly, which is the interaction
shift-drag was standing in for.

## What's next

[HANDOFF.md](HANDOFF.md) tracks the open work. The most valuable next step is
running one of the two built live paths against a real server in a networked
deploy: Prometheus through its proxy, or the NFL through the proxy to ESPN. This
environment's network policy blocks `api.worldbank.org`, `feeds.bbci.co.uk`,
`aljazeera.com` and Prometheus's demo server alike, which is why everything here
runs on generated or mocked data. After that, the `MarketSource`, `WorldSource`
and `NewsSource` interfaces were all built to take a live adapter.
