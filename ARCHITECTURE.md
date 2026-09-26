# Spatial Ecosystem: layout and contracts

## Directory layout

```
src/
  adapters/          Input sources, one folder per source, each returning raw
                     domain records. Nothing here knows what a plant is.
    nfl/
      types.ts       The feed contract: franchises, games holding two box
                     scores each, depth-chart slots with age and service,
                     injuries with an onset. Plus `NflSource`, the one method
                     a live feed implements.
      teams.ts       The thirty-two franchises, their alignment, founding
                     years and colours. Real, unlike the seeded season.
      roster.ts      The fifty-three-slot depth chart and what each slot is
                     worth, so an injury report weighs something instead of
                     just counting bodies.
      season.ts      The synthetic source: a seeded season in feed shape.
      espn.ts        The live half: fetches ESPN's public API and parses it
                     into the same records. `espn.fixtures.ts` holds captured
                     responses for the tests.
      live.ts        `liveNflSource`, a synchronous source over the async
                     fetch. Remembers final games so a refresh only fetches
                     what's new.
      derive.ts      Standings, stat sheets and roster availability, all as of
                     any timestamp. Turns raw NFL records into NFL answers.
      index.ts       The barrel, and a note on what a live adapter replaces.
    market/
      types.ts       The feed contract: instruments, closed bars, fills as
                     lots, and halts. Plus `MarketSource`, the one method a
                     live feed implements.
      instruments.ts The thirty-two symbols, their sectors, listing years and
                     colours. Real, unlike the prices.
      session.ts     When the exchange is open, and what staleness asks it:
                     `nextBarClose`, when an instrument should next print. Plus
                     the longest gap it legitimately produces, computed instead
                     of chosen, which bounds that answer.
      tape.ts        The synthetic source: a seeded price walk in feed shape,
                     printing only during sessions, with one instrument halted.
      derive.ts      Price, position, drawdown, volume and momentum, all as of
                     any timestamp. Logarithmic in the size of the record.
      index.ts       The barrel, and what a live adapter wouldn't have to
                     supply.
    world/
      types.ts       The feed contract: dated indicator releases (with both the
                     period described and the release date) and the country
                     table.
      countries.ts   The 193 UN member states, their subregions and flag
                     colours. Real.
      borders.ts     Land borders between countries in the same subregion. The
                     first real link topology in the project.
      world.ts       The synthetic source. Indicator releases are generated
                     here. Unrest and conflict come through the news layer.
      derive.ts      What was *known* at any timestamp, from what had been
                     published by then.
      index.ts       The barrel, and what a live adapter replaces.
    news/
      types.ts       What a news feed hands over: roughly an RSS item.
      feeds.ts       A generated world desk, standing in for real wires.
      extract.ts     Turns a headline into a record, or refuses to. The first
                     code here that makes a judgement instead of a calculation.
      index.ts       The barrel.
    prometheus/
      types.ts       The query API's wire format and the mapping config.
      query.ts       `FetchLike`, and the fetch and parse of an instant query.
      fixtures.ts    Captured `/api/v1/query` responses.
      mock.ts        A stand-in server answering in the real wire format, from
                     a synthetic seven-target fleet.
      index.ts       `promSource`: read, refresh and adopt.
  translation/       Raw records to EcosystemNode and EcosystemEdge. The only
                     place domain knowledge and plant archetypes meet, and
                     where trend and polarity are decided.
    nfl.ts           The league as a garden: the four axes, injuries as
                     blights, division rivalries as grafts, history backfill.
    market.ts        The book as a garden: sectors as beds, shorts as weeds (the
                     first real use of polarity), drawdown as blight, and
                     correlations as grafts.
    world.ts         The world as a garden: subregions as beds, conflict and
                     unrest as blights, land borders as grafts.
    prometheus.ts    A PromQL result as a garden, driven by a mapping config.
    declarative.ts   A config-driven mapping over any JSON, used by the garden
                     builder.
  ecosystem/
    types.ts         Node, edge and state contracts. Read by every layer.
    graph.ts         Pure helpers: garden filtering, adjacency, reachability,
                     edge validation, topology keys.
    history.ts       Vitals over time as fixed-size ring buffers, slotted on
                     absolute time so gaps stay gaps. Four parallel typed
                     arrays, both grains, and `vitalsAt`.
    layout.ts        Where things stand. Pure and deterministic, kept out of
                     the scene. Reads each bed's arrangement from its planting
                     type instead of deciding it.
    staleness.ts     How late a node is against its source's schedule, and the
                     visual state that follows. Silence mustn't look like
                     health, and closed mustn't look like dead.
    scrub.ts         What counts as a legal cursor: the window, the clamp, and
                     when a scrub snaps back to live. Knows nothing about the
                     sky, so the store can use it without importing a renderer.
    timeline.ts      What that legal range looks like: how far the record goes,
                     where hours become days, and where the cursor is. The
                     extent the sun can't show.
    planting.ts      What a bed is planted as: the PlantingType vocabulary and
                     each type's spatial arrangement. Imports nothing, so layout
                     and the renderer can both use it without a cycle.
    labels.ts        What a thing is called and the mark it wears. The Emblem
                     contract translation has to fill, plus the explicit default.
    series.ts        History as a line instead of a point, for the detail
                     panel. Gaps stay gaps all the way to the drawn path.
    inspect.ts       The opaque `raw` payload flattened into rows, without
                     knowing anything about its shape.
    completion.ts    Finished work as of the cursor: which completions count,
                     how ripe a fruit is, how weathered a deadwood.
    scale.ts         The arithmetic every source shares: a raw quantity onto
                     [0, 1], with direction.
    rollup.ts        A bed summarizes its plants and a garden its beds.
    scene-inputs.test.ts  The seam itself: what the scene is handed for a given
                     state, checked end to end instead of per module.
  lsystem/           Pure procedural geometry. No React, no three.js.
    types.ts         Vec3, Grammar, TurtleParams, PlantGeometry.
    random.ts        Seeded PRNG so a node id always grows the same plant.
    grammar.ts       String rewriting with a guard on symbol count.
    turtle.ts        Symbols to flat typed arrays, written in one pass. Emits
                     leaves in fanned clusters per J marker.
    presets.ts       Grammar archetypes (broadleaf, bushy, willow, shrub, spire,
                     and the flower and wildflower blooms) plus the foliage
                     table: leaf kind, cluster, scale.
    bespoke.ts       Forms that aren't self-similar and so aren't grammars: the
                     trained vine and the clipped topiary, built by hand into the
                     same geometry the turtle emits.
    generate.ts      Public entry. Maps vitality and growthScale to geometry,
                     dispatching bespoke presets or running the L-system.
    lru.ts           Least-recently-used map. The geometry cache's eviction
                     policy, generic and free of geometry so it can be tested
                     without generating a plant.
  hooks/
    useLSystem.ts    Memoized React wrapper. The only React import in the
                     generation path.
  state/             Zustand store, and where the gardens are composed. Holds
                     EcosystemState and nothing derived from it, with one
                     deliberate exception: the two window figures
                     (`scrubWindowMs`, `fineWindowMs`). The scrub gesture and
                     the timeline ask for them constantly and they only change
                     when the garden does, so recomputing them on every move
                     would walk every node's buffers at pointer rate.
    ecosystemStore.ts  The store, `composeEcosystem`, and the poll that asks a
                     source for a reading when its own schedule says one is due.
    sources.ts       The real sources: what each garden is read from, when it's
                     next owed a reading, and whether asking again means
                     anything. The one place that knows more than one source
                     exists.
    userSources.ts   Gardens the user built: a saved mapping and pasted
                     snapshot turned into a source, plus saving and loading them.
    persist.ts       The record: what was observed, stored sparsely in a form
                     that survives a reload, and the rule that a restored
                     observation fills silence and never overwrites a source.
                     Pure, and knows nothing about a browser.
    collector.ts     The loop that keeps the record. Schedules the writes, keeps
                     it inside a byte budget, and is the only file that touches
                     `localStorage`.
  backend/           The runtime-agnostic server half: source registry,
                     Prometheus and NFL proxies, the collector loop, a
                     reference store, and the client-side fetch that calls the
                     proxy. See docs/backend.md.
  scene/             R3F components. Owns the InstancedMeshes and the merged
                     graft geometry.
    types.ts         What the scene is handed per plant: geometry, position,
                     tint.
    Garden.tsx       The garden itself: assembles the scene from store state
                     and owns the lighting rig every other component draws in.
    look.ts          Standing and turning, as arithmetic: where a drag leaves
                     the view and where a step lands on the path. You can look
                     straight up on purpose.
    StandControl.tsx The camera as a person in a greenhouse: drag to turn,
                     scroll to walk. Registers as the default controls so the
                     sun drag can still suspend it.
    bonsai.ts        Framing for the table view: how far to shrink the garden
                     and where the camera sits.
    TableControl.tsx The orbit camera for the table view.
    fly.ts           The eased flight between the path and the table.
    Branches.tsx     Every branch in the garden in a single InstancedMesh, so
                     draw calls don't grow with plant count.
    taper.ts         The branch vertex shader: per-instance taper, tilted
                     normals and bark scaled to the branch's real size.
    Foliage.tsx      One InstancedMesh per leaf shape, grouping plants by kind.
    leaf.ts          The leaf blade: shoulder, midrib fold and tip curl.
    translucency.ts  Light through leaves, added to the leaf material.
    Produce.tsx      Fruit on plants that bear it, drawn on some of their leaf
                     points. One instanced mesh, empty when nothing bears.
    Completions.tsx  Fruit for finished work and deadwood for failed work.
    Trellis.tsx      Static posts and wires for vineyard beds. No signal, like
                     the horizon. The vines are trained along it.
    Grafts.tsx       Root grafts as curves dipping under the soil. Merged per
                     garden and rebuilt only when topology changes.
    Beds.tsx         Raised beds: soil in a timber box with a cap rail, and
                     furrows running along the rows.
    Motes.tsx        Drifting motes: activity made visible in the air,
                     additive so they read as light. The opposite of dust.
    dust.ts          The staleness particles: their density ramp and settling
                     step. Pure, no renderer, like sway and daylight.
    Dust.tsx         Draws the dust: one Points object for every stale plant in
                     the garden, and nothing at all when there are none.
    signal.ts        The trend cue: threshold, density ramp and column step.
                     Pure, no renderer. Its test includes the calibration,
                     checked against the real pipelines.
    Signal.tsx       Draws the plume, rising and amber where things are
                     improving and falling and faded where they aren't. One
                     Points object per direction, and none in a garden where
                     nothing is moving.
    sway.ts          Ambient motion: a rigid lean about the base, shared by
                     branches and foliage so they stay attached.
    daylight.ts      Timestamp to sun direction and full palette, and the
                     inverse the drag uses. Pure, no three.js.
    Sky.tsx          The sky dome, a pure function of the hour under the
                     cursor. Decides nothing and draws what `daylight.ts` says.
    SunScrub.tsx     The gesture: grabbing the sun or moon to move time.
    Horizon.tsx      Static hills, mountains and tree line. Depth, no signal.
    greenhouse.ts    The house as arithmetic: floor level, proportions, bay
                     spacing, roof height at a given distance from the wall.
                     Pure, no three.js.
    Greenhouse.tsx   Draws it (dwarf wall, frame, glazing, roof, vent, door)
                     from one unit cube and one unit quad.
    Props.tsx        The hose, the rolling bench, the can, the shears, the
                     gloves, the pots. Decoration, against the walls, still.
    scatter.ts       Where ground cover goes: outside the glass and on the path,
                     never in a bed.
    Scatter.tsx      Draws it.
    labels.ts        When a tag is legible and how big it is. Pure.
    Tags.tsx         The tags themselves: stake, card, fade, and the tap that
                     opens the panel.
    tagTexture.ts    A tag drawn to a 2D canvas. The one place text enters the
                     scene, and the one texture that's a real colour map.
    Detail.tsx       The panel: axes, trend lines, blights, source payload.
                     Anchored in the world beside its plant, never to your head.
    planting.ts      The rendering half of plantings: which L-system forms
                     each PlantingType is drawn with.
    textures.ts      Surface grain at two scales: generated achromatic maps
                     (turf, soil, bark, timber) with normal and roughness maps,
                     and per-instance variation. Pure except for the
                     DataTexture builder, so the pixels can be tested.
    ao.ts            Ambient occlusion read from the existing depth buffer.
    tiltshift.ts     The tilt-shift depth of field for the table view.
    Post.tsx         The one post-processing chain: AO, bloom, tilt-shift,
                     output.
    quality.ts       Which passes the current device can afford. Pure.
    useQuality.ts    Watches the renderer and picks the tier.
  mock/
    mockEcosystemData.ts  Five gardens, edges and a drift tick. One plant per
                     garden has a dead adapter, so the staleness state can be
                     seen without editing data by hand. The tick only moves the
                     gardens this module generated, so it can never drift a
                     translated one.
  App.tsx            Deliberately plain chrome: garden buttons and a readout of
                     where the cursor is. The garden is the interface.
  GardenBuilder.tsx  The modal for building a garden from pasted JSON.
  Timeline.tsx       The recorded past drawn as an extent: how much there is,
                     how finely it was kept, and where you are in it.
  preview.tsx        A scratch page for tuning plant forms one at a time. Not
                     part of the app.
  main.tsx           Vite entry.
netlify/functions/   The Netlify wrappers around `src/backend/`: the two
                     proxies and the scheduled collector.
```

There is no `src/xr/` yet. See assumption 6.

Test files sit next to the modules they test and aren't listed. Everything above
is under test: 988 tests across 62 files, plus two live tests that are skipped
without a server. `tsc --noEmit` is clean and `vite build` succeeds.
`npm install && npm run dev` runs the desktop scene.

## Layer contracts

Data flows one way. Adapters emit raw records, translation turns them into nodes
and edges, the store holds flat records keyed by id, and the scene subscribes.
Nothing below the scene imports three.js, and nothing above `translation/` knows
what Prometheus is.

A garden is an environment the user walks into, and it fixes what vitality means
for everything inside it. Only one garden is live at a time. Beds group plants
inside a garden. This is what stops green meaning "low error rate" and "up 3%
today" in the same view, and it limits scene cost to the largest single garden
instead of everything the user tracks.

A bed also has a **planting type** (orchard, hedge, conifer stand, vineyard),
set by translation on the bed node as `plantingType`. It's a property of the
container, not a health signal. It decides what *form* a plant takes and how the
bed is arranged, the way polarity decides plant versus weed, and it never changes
with a metric. The concept is split across two layers to keep them clean.
`ecosystem/planting.ts` owns the vocabulary and each type's spatial arrangement
(pure, read by `layout.ts`), and `scene/planting.ts` owns which L-system forms
draw it (a rendering decision). `DESIGN.md` has the reasoning.

Health is normalized onto four axes. `vitality` is the level, `activity` is how
busy, `maturity` is how established, and `trend` is the signed change, because a
stock down 6% today reads differently from one that's just sitting low.
`polarity` says whether growth is good news. Suppress-polarity nodes are things
you want gone, so they render as weeds and a thriving one looks alarming. Domain
specifics stay in `raw`, which the HUD shows and the renderer never reads. Adding
a source means writing a translator, not widening the node type.

Edges live in their own collection, never on the node. That way a vitality tick
can't invalidate edge geometry and a topology change can't rebuild plants. Both
ends of an edge must be in the same garden.

The gardens are assembled in one place, `composeEcosystem` in the store, which
is the only code that knows more than one source exists. Adding a source is a
translator plus a line in `state/sources.ts`.

## The first real source: the NFL

The league exercises every layer end to end, and the pattern it settled is worth
writing down because later adapters should copy it.

**The adapter stores events, not summaries.** A game holds both teams' box
scores, and a season stat is a sum over them. An injury holds a start date.
Nothing in `adapters/nfl/` stores a standings table or a yards-per-game figure,
because a feed that hands you totals has already thrown away when each number
changed.

**Every derivation takes an `asOf`.** `recordOf`, `statsOf` and `availabilityAt`
answer for any moment in the season, so the live view and the history are the
same function called at different times and can't disagree. Backfilling history
is that function in a loop. A club's numbers only change when a game goes final
or an injury is reported, so the loop is memoized on the count of each and
collapses to a handful of real computations per club. The whole league
(thirty-two clubs, 48 edges and both grains of history) translates in about 40ms
at module load. The measurements are below.

**A grouping level can be a row instead of a bed.** The model has exactly one
grouping level between garden and plant, and the NFL has two (conference and
division). Divisions are the beds, and conference is shown by ordering: bed ids
start with the conference and `layout.ts` sorts by id, so the AFC fills one row
and the NFC the other. Nested beds would have bought a label and cost the layout
its flat structure.

**Staleness is per source, and it can be real instead of staged.** A club plays
every seven days, so the league's threshold is seven days instead of the
fifteen-minute default, and the clubs that cross it are exactly the ones on a bye.
The garden can't tell a bye from a dead feed and shouldn't try, because both mean
what you're looking at is old. That's still true now that staleness takes a
schedule. The league is registered with a flat duration on purpose, for the
reasons in **Staleness is a schedule** below.

## The second source: a book of positions

The market source exists because it *disagrees* with the league. The NFL fit every
assumption the design had quietly been making, which is pleasant and proves
nothing. A market breaks three of them, and this section is mostly a record of
what broke.

**Polarity finally does something.** A short position is the first thing in any
source that's genuinely `suppress`: you hold it and you want it to go down. So
`vitality` here is *not* the position's profit. It's how far the instrument has
moved since the position was opened, with no sign for long or short, and
`signalHealth` inverts it for shorts. A short on a stock that has run away from
you grows into the biggest, lushest weed in the greenhouse, which is what it is.
The bug to watch for is signing it in advance, and there's a test named for it. If
translation signed the return by side, polarity would invert it *back* and every
short would look healthy while it was winning. Nothing about that failure shows up
in a screenshot.

**The source is closed most of the time.** Staleness exists so silence never
looks like health, and an exchange is silent every night and all weekend with
nothing wrong. The first answer repeated the league's bye argument: size one
threshold to the longest *legitimate* gap (a Friday close followed by a Monday
holiday, computed in `session.ts` instead of picked). It worked, and it cost nearly
four days of detection delay, because one number had to cover both *closed* and
*dead*. That cost is why staleness became session-aware. See **Staleness is a
schedule** below.

The stale state is still reachable naturally, through the market's own mechanism:
a **trading halt** stops the bars on one symbol while the rest of the book keeps
printing. Nothing edits a timestamp. `updatedAt` is the last close on the tape, so
the halted plant greys out on its own.

**Prices move constantly, so memoization stops paying off.** The league's history
backfill collapses a season to about fourteen real computations per club, because
a club's numbers only change when a game goes final. The market uses the same
memo, keyed on how many bars have closed instead of how many games have been
played, and it saves much less:

```
                          per club (NFL)   per instrument (market)
daily grain, a season          14                  70
hourly grain, a week            3.3                35
```

Five to ten times the work, and the shape is exactly what the domain predicts: the
cache absorbs nights and weekends, when no bar closes and the reading really can't
change, and pays full price for every hour of trading.

What *didn't* happen is a blow-up in total cost, and the reason matters because
it's the argument for the whole as-of design. Translation takes about as long as
the league's despite doing five times the computations, because each one is much
cheaper. A club's reading walks its whole season of games, while an instrument's
is a binary search into a sorted list of bars plus a couple of short window scans.
The memo was never the important part. The derivations being O(log n) in the size
of the record is.

## The third source: the world, and a layer under translation

The world source exists because the first two had stopped disagreeing. Both are
thirty-two things in eight even beds, fed by a publisher on a clock, and a
pipeline validated twice by the same shape has really only been validated once.
This one breaks four things, and two of them needed new structure, not just new
numbers.

### A number can be revised, so "as of" splits in two

Every derivation in this project answers *as of a timestamp*. Until the world
source that question had one meaning, because a game result or a closing price is
a fact about a moment that never changes afterwards. An indicator isn't. Growth is
published about seventy-five days after its quarter and revised a month later, so
the record holds two releases with the same `period` and different values.

`IndicatorRelease` therefore carries both dates, and they answer different
questions. `period` is what the figure describes. `releasedAt` is when it became
known. **Every derivation keys on `releasedAt`.** `latestRelease` returns the most
recent figure *published* at or before `asOf`, not the most recent figure
*describing* a period at or before `asOf`, which is a different query and the wrong
one.

So scrubbing shows *what was known*, and that's the only honest option. The other
way round, the garden would rewrite its own past whenever a statistics office
revised something. That's structurally the same mistake as drawing a flat line
through a stretch nobody recorded, which the history buffers already refuse to do.
It also gives the scrub something to do in a garden whose underlying numbers change
quarterly: what moves under the cursor isn't the world, it's what was known about
it.

### Extraction: a layer between adapter and translation

`adapters/news/` is the first source whose records are **text**, and `extract.ts`
is the first code in the project that makes a judgement instead of a
calculation. It sits under translation, not above the gardens. A news overlay
across gardens would break the rule that a garden fixes what vitality means, which
is why `domain` doesn't need a channel.

Two properties are enforced by structure, not convention:

- **It won't guess.** Zero countries named, several countries named, or any sports
  vocabulary present all produce `null`. Recall suffers, and that's the trade-off: a
  miss makes a plant quieter than the world was, but a wrong attribution claims
  something about a real country in a panel that looks like a measurement.
- **Provenance can't be dropped.** `UnrestEvent.article` and
  `ConflictEpisode.articles` are required fields, so an event can't exist without
  the sentence it came from, and no amount of carelessness downstream can strip it.

The classifier is a keyword table because it has to be *inspectable*. A model would
score better, but nobody could read the docs and predict its output, and that's not
acceptable for a layer whose output gets attached to the names of real places.

### What it cost

Measured on this machine, translating one snapshot with history backfilled at both
grains:

```
                     plants   translate   geometry   segments   leaves
NFL                      32        45ms       28ms      2,288    2,377
Markets                  32        69ms         -           -        -
World                   193       485ms       74ms     18,057   15,333
```

Six times the plants for ten times the translation time and under three times the
geometry. The backfill memo (keyed on releases published and events reported)
saves more here than in either other source, for the same reason the release-date
rule exists: the underlying numbers almost never change, so the key stays the same
across long stretches and the walk collapses.

The scaling result worth recording is a **negative** one. The expected bottleneck
was tag textures, one canvas per plant at 1400 px/m. Building all 193 takes 135ms,
so it isn't a bottleneck. Nor is geometry, at 74ms. The total CPU cost we can
attribute to the world garden is about 0.7 seconds. Entering it in this
environment takes much longer than that, but so does entering the NFL garden.
There's no GPU here and the software rasterizer runs the thirty-two-plant garden
at 1.3 fps, so the rest of the cost is fill rate and texture upload, and **it can't
be judged from here**.

The one number that doesn't depend on the GPU and does scale is memory. 193 tag
textures at 588 × 210 is about 95MB before mipmaps, for labels of which at most a
dozen are ever inside the nine-metre fade radius. So `Tags.tsx` builds a card when
its plant first comes into range instead of when the garden opens, a few per frame
so walking into a bed doesn't draw a dozen canvases at once. The fade hides the
delay: `legibility` is a smoothstep that reaches the one-percent cutoff exactly
where a tag becomes visible, so a card still waiting its turn is drawn blank at an
opacity nobody can see.

The distinction matters because the first guess was wrong in a useful way. Drawing
the canvases was never expensive. Holding and uploading them was, so the fix is to
build fewer, not to build faster. The worst case is unchanged: walk up to all 193
and you've paid for all 193, one card at a time instead of all at once.

### The layout had to change

Under the old rule (four or fewer beds in one row, more wrapped into two),
twenty-two beds stand eleven to a row, a sixty-metre wall whose far end you can't
see from the near one. Past twelve beds the default now squares the garden off
(`ceil(sqrt(n))` per row). The threshold is set there on purpose. Every existing
garden is unchanged, because in those the row *is* part of the reading (a
conference, half the sectors), and the new rule only applies where there's no such
grouping to keep. The world garden comes out at roughly 35 × 46 metres, which is
walkable but more greenhouse than anyone wants to cross. The bonsai table view is
the answer to that.

## Standing instead of orbiting

The scene used to have one camera gesture, an orbit. That's a good way to examine
an object and a poor way to be somewhere, and it had one consequence nobody could
work around: **an orbit can't look up.** The aim is pinned to the target, so the
upper sky is never in frame, and the sun is the time control. For most of the day
the thing you scrub time with was out of reach of a desktop pointer. Standing
inside the greenhouse didn't cause that or fix it. It just removed the last
workaround, which had been backing away until the sky came into view.

`StandControl` changes which end is fixed. An orbit fixes the target and moves the
eye. This fixes the eye and moves the aim, which is what a person does. Drag turns,
scroll walks, and you can look straight up on purpose, because anything less would
leave the sun out of reach on exactly the midsummer days it climbs highest. Checked
end to end: from a looking-up position, the sun can be grabbed through the roof and
dragged, and the cursor moves.

Three things it had to keep working, all easy to break:

**The handshake with the sun drag.** `SunScrub` finds the camera controls through
`useThree(state => state.controls)` and clears `.enabled` for the length of a grab,
so dragging the sun doesn't also swing the camera. Any replacement has to register
in the same place and respect the same flag, or the two gestures fight over one
pointer.

**Framing on entry, and only on entry.** The old `Framing` component had a comment
warning against a camera that "snatches itself back every two seconds", and its
effect was keyed on `[view]`, an object rebuilt from the node map, so a new one
arrived on every telemetry tick. The orbit tolerated that by accident, because
`update()` recomputed the camera from its own spherical state and setting the
position again did nothing. Here the position *is* the state, so the same code
reset the view every two seconds and you couldn't keep looking up. It's now keyed
on the viewpoint's values, not the object.

**Staying inside.** The path, between the planting and the glass, is what keeps
you indoors, and `walk` clamps to it. Walking into the beds slides you along them
instead of stopping you dead, and a long enough stride crosses to the far path,
because a person can do both.

## Staleness is a schedule, not a duration

Silence must never look like health. The hard part is that most silence is
innocent (an exchange overnight, a club on its bye), and a garden that greys
through all of it is crying wolf, which ruins the stale state just as thoroughly as
never greying at all.

The original model was a ratio, `(now - updatedAt) / threshold`. With only one
lever, a source with long legitimate silences forces the threshold wide, and a wide
threshold can't see a death. The market's came out at nearly four days.

`StaleSchedule` splits that one lever into two, because two different questions
were hiding in it:

```ts
interface StaleSchedule {
  dueAfter(lastUpdate: number): number;  // when should I next have heard something
  graceMs: number;                       // how late is late, once something is owed
}
```

`dueAfter` is a fact about the source's calendar, and only the adapter knows it.
It can be as far out as it likes at no cost, since silence before the due time
scores exactly zero, not part of the way up the ramp. `graceMs` only starts once
the source has missed something it said it would produce, so it can be tight. The
market's is two bars: one late print is a slow publish and two is a pattern, the
same reasoning as the `for` clause on any sensible alerting rule.

Measured against the flat threshold it replaced, on the same tape:

```
feed dies…              flat threshold   schedule
mid-session                     95.7h       3.2h
at a session's last bar         95.7h      20.7h   (nothing due until tomorrow)
at Friday's close               95.7h      68.7h   (nothing due until Monday)
```

Read the Friday figure carefully, because it looks like the weakest result and is
actually the tightest. No rule can flag a Friday death before the market reopens,
and the reopen is 66.5 hours away. The schedule adds 2.2 hours to that floor, where
the flat threshold added 29.

**A bare number is still a valid policy**: it's the simplest kind of schedule,
where nothing is ever due and the whole duration is tolerance. The league is
registered that way on purpose. Its feed contains games already *played*, so there's
no fixture list to point `dueAfter` at. More importantly, the league *wants* the
flat behaviour. A bye is legitimate silence, so a schedule would clear it, and that
would remove the greying from exactly the two clubs a week that make the state
visible in that garden. A market reader needs to know the vendor is alive. A league
reader needs to know whether what they're looking at is current. Same contract,
opposite answers, which is the argument for making it per source.

**What this exposed, and what fixing it cost.** Both real sources took their
snapshot once at module load and never polled. Under the old four-day threshold
nobody noticed. Under a two-bar grace, the market garden correctly greyed out about
three hours into a trading session, because the feed genuinely was dead and the
slack had only been hiding it. The garden was right and the app was wrong, so the
app now polls (see **Polling** below). The league isn't affected either way, since
its due time is a week out.

## Polling

`state/sources.ts` holds the real sources. It exists because `dueAfter` turned out
to answer two questions. "Should I have heard something by now?" is the staleness
state, and "is there anything new to fetch?" is a poll. They're the same question,
so a source that can say when it will next report has already said when to ask it
again. Nothing here runs its own clock. The poll rides the existing two-second beat,
asks `dueSources` (a scan of the garden's plants against a due time), and only does
the expensive part when something is owed. For the market that's once an hour
during a session and never outside one.

Two things had to be true before a source could be asked twice, and neither was:

**The record has to extend, not slide.** The tape's walk started at the oldest day
of `tradingDaysBack(now, SESSIONS)`, a window measured back from *now*. Asking again
after midnight moved the window, so the walk started a day later and re-priced every
bar behind it, and history the store had already recorded disagreed with the source
it came from. `syntheticMarketSource` now fixes its origin and halt time on the
first call and reuses them, so later calls extend. The one-shot
`generateMarketSnapshot` is unchanged, which is right: a caller that asks once wants
a window ending now.

**The price path can't depend on what gets printed.** Volume noise was drawn from
the walk's own random stream inside the emission branch, so whether a bar was
emitted (which depends on `now`, on the halt, and on whether the day fell inside the
intraday stretch) changed how many draws the walk used and therefore every price
after it. Volume noise is now keyed on the bar's own close time. A bar's volume is a
fact about that bar, and the walk uses the same draws whatever it prints.

The hourly grain is a retention window, so a later snapshot legitimately holds
*fewer* intraday bars at the old end and more at the new end. Only the settled past
is checked for being unchanged. Ageing out isn't the same as re-rolling.

**Not every source can be polled.** The league's season is anchored to when it was
generated (its most recent kickoff is always 26 hours ago, which keeps a game inside
the scrub window), so asking again slides the whole season instead of extending it,
and every recorded result moves with it. `pollable: false` says so, and it costs
nothing, because nothing is due from the league within a week. This is a property of
the synthetic data, not of the design. A live adapter doesn't have it.

## Time and history

State is a snapshot of now plus ring buffers of vitals per node, keyed by absolute
slot so gaps stay explicit instead of silently shifting older samples forward. The
scene has to read vitals through `vitalsAt(node, history, cursor, archive)`, not
straight off the node. That one indirection is why scrubbing, comparison and
playback are changes to one function instead of to every component that touches a
plant.

History is kept at **two grains**, in two collections:

```
history   hourly, 168 slots     a week      3.4KB per node
archive   daily,  140 slots     20 weeks    2.9KB per node
```

This is the downsampling the storage note below always said would be needed, but
the reason to prefer it over one long fine-grained buffer isn't storage. The grains
answer different questions: within a day you want the hour something broke, and
across a season you want the week it started sliding. `vitalsAt` asks the fine grain
first, falls through to the coarse one when the cursor is older than the week kept
in detail, and falls back to live when neither has it. It never interpolates a past
nobody recorded.

A node can be missing from the archive. An adapter that can't backfill months has
nothing to put there, and `windowFor` then keeps that garden's scrub at the two-day
window instead of letting the cursor run past the data.

Two gestures move the cursor, and they're both the sun's arc. Along it is the day, at
one turn per day. Across it (the arc's height, which is physically what a season is)
is the year, at half a year per full sweep. See `scene/daylight.ts` for why the two
can't interfere, and DESIGN.md for what the gesture settled.

Measured on the mock ecosystem:

```
storage, hourly        3.4KB per node per week
                       500 nodes for 90 days   21.6MB
                       2000 nodes for a year    350MB   (downsample past a week)

scrub, 15 plants       naive rebuild every step   5.8ms per step
                       cached by vitality bucket  0.80ms per step, 94% hit rate
cold jump              0.47ms per plant, one hitch, amortizable over frames
compare two timestamps 0.93ms per plant
```

And on the league, the largest of the original gardens and the first with a real
adapter behind it:

```
storage, archive       2.9KB per node per season (daily, 140 slots)
snapshot generation    7ms       210 games (14 weeks played), 32 rosters,
                                 32 injury reports
translation            40ms      32 clubs to nodes, plus both grains of history
                                 backfilled: a week of hours and the season so
                                 far in days, 8,346 samples written
```

The archive has room to spare: 140 slots reach 20 weeks back and the season so far
is 14. Slots before the season opened are deliberately left empty instead of being
filled with an opening-day figure that would look like a flat line of data. That's
the gap between the 4,480 daily slots allocated and the 2,970 written.

Both grains come from the same as-of derivation, so the cost isn't in the sampling
but in how often it has to be recomputed. Memoized on games played and injuries
active, a club's season of daily samples collapses to about fourteen real
computations, and its week of hourly samples to three or four. It runs once at
module load and never again.

And on the market book, the source that stops the memo working:

```
storage                same buffers, same two grains
snapshot generation    25ms      5,920 bars across 32 instruments, 130 daily
                                 sessions plus hourly bars for the last eight
translation            32ms      32 instruments to nodes, 48 correlation edges,
                                 both grains backfilled, 8,531 samples written
memo, daily grain      70 real computations per instrument   (the league: 14)
memo, hourly grain     35                                    (the league: 3.3)
```

Five to ten times the computations for about the same wall-clock time, and that's
the measurement that matters: it shows the memo was never what made this
affordable. The derivations being logarithmic in the record is. A club's reading
walks a whole season of games, while an instrument's is a binary search plus two
short window scans, so it survives losing the cache.

The 48 edges are real Pearson correlations of daily returns over the closes the
instruments share, computed once at module load. Only bars with the same close time
are paired, so the halted instrument contributes nothing after it stops instead of
being lined up against the wrong days, which is the mistake that makes two unrelated
things look perfectly correlated.

Storage was never the expensive part. Rebuilding geometry on every scrub step is,
and quantized vitality is what fixes it: a week of hourly history collapses to
roughly ten distinct shapes per plant, so the geometry cache hits 94% of the time
and scrubbing costs less than a frame.

The cache holds 600 entries and evicts the least recently used. For a long time it
evicted the oldest inserted, which behaves the same while nothing churns and goes
wrong the moment something does. Scrubbing a season walks every plant through
maturity buckets nobody will ask for again, and under first-in-first-out each of
those pushed out whatever went in first. On a garden that had been open a while,
that was often the plant standing in front of you, which then rebuilt on the next
frame and got evicted again. The size never changed, only which 600 it keeps.
`lsystem/lru.ts` holds the policy, kept generic and free of geometry so it can be
tested without generating a plant, and `useLSystem.test.ts` checks it against the
real cache, because the bug was never in a data structure. It was in which one was
wired up.

## Recorded assumptions

1. Plant geometry is deterministic and seeded from the node id, so telemetry
   updates never reshuffle a tree while you're looking at it.
2. Generation runs synchronously on the main thread, memoized per node. Vitality is
   quantized to 20 steps and maturity to 10, so a 1% wobble in a metric doesn't
   rebuild a few hundred segments. It costs roughly 0.8ms per plant, so a full
   rebuild fits in one frame up to about 100 plants. Beyond that, move generation
   into a worker. `src/lsystem/` has no React or three.js imports precisely so that
   move stays a one-file change.
3. Geometry is output as flat typed arrays, sized exactly before the walk and scaled
   in place afterwards. It uploads straight to an `InstancedMesh`, with no per-frame
   tree walking and no intermediate objects. It measured 10.3KB per plant against
   134KB for the object layout it replaced, which takes the projected scrub cache
   for 500 plants from 672MB to 51MB. Generation cost is unchanged at 0.84ms.
4. Plants are generated in unit space and scaled to hit `growthScale` in metres
   exactly. Radii scale separately from positions, so changing a grammar's
   iteration count doesn't make trunks go spindly.
5. Root grafts are curved, so they can't usefully be instanced. They're merged into
   one geometry per garden, rebuilt only when topology changes, and keyed by
   `topologyKey`. Strength and flow direction animate in the shader over a static
   mesh, so a wobble in strength costs nothing.
6. The desktop browser is the first target. XR isn't wired up and `src/xr/` hasn't
   been created, but no HUD or control is locked to the viewer's head, so nothing
   built so far has to be undone to get there.
7. The sun travels a tilted circle with a declination. It used to be a flat great
   circle, on the reasoning that an almanac position "needs a latitude and a date
   and would buy nothing". That was right about the latitude and wrong about the
   date. Tilt the daily circle by the sun's declination and the seasons arrive with
   no new machinery: the arc rides high in summer and low in winter, and since
   every palette and light already depends on the sun's height, the days get
   shorter by themselves. The latitude then falls out instead of being chosen. A
   58° noon sun at the equinox means 32° north, where a winter day is ten hours and
   a summer day fourteen. Both the hour and the declination can still be recovered
   from a direction, which the two drag gestures need, and they're measured on
   perpendicular axes so neither gesture can disturb the other.
8. Time reaches the sky rounded to thirty seconds. The sun goes round a full circle
   in a day, so that's a hundredth of a degree: invisible during a drag, and it stops
   a two-second telemetry tick from rebuilding the lighting for a sun that hasn't
   measurably moved.
9. The sky dome is a raw `ShaderMaterial`, so it gets none of the fragment includes
   the built-in materials generate. It needs `#include <colorspace_fragment>`
   explicitly. Colours arrive in the renderer's linear working space and the
   framebuffer wants sRGB, and without the conversion every colour renders much
   darker than intended. Worth knowing before adding another custom shader.
10. Leaves render as one `InstancedMesh` per leaf shape, not one for the whole
    garden, because an instanced mesh has a single geometry and a conifer can't use
    the same card as a hardwood. There are six kinds (broad, blade, needle, round,
    frond and the flower's bloom), so a garden costs at most six leaf draw calls
    whatever the plant count. Branches stay a single instanced mesh. They all share
    one cylinder, tapered per instance in the vertex shader (`scene/taper.ts`), and
    branch variety between plants comes from the grammar, not from swapping
    geometry. Which leaf shape a plant uses is a rendering decision keyed on its
    preset, kept off `PlantGeometry` so the scrub cache key
    (`seed|maturity|growthScale|preset`) needs nothing new.
11. The horizon (hills, mountains, tree line) is static, deterministic and carries
    no signal on purpose. It has no colour or time logic of its own. The shared
    lights and fog paint it, so it follows the day and night scrub for free, and
    distance plus fog turn far ridges into pale flat silhouettes (aerial
    perspective) with no extra work. Carrying no signal is what lets it be visually
    busy without competing with the plants, which are the only things meant to be
    read.
12. Not every plant is an L-system. Forms that aren't self-similar (a vine trained
    to a wire, a topiary clipped to a solid) are built by hand in `bespoke.ts` and
    output the same `RawGeometry`, so everything downstream (scaling, the vitality
    cache, sway, droop, colour, produce) is unchanged. One trap when writing one:
    leaf size in the world is `leafScale × growthScale / unitHeight`, so a form
    built short in unit space ends up with oversized leaves after height
    normalization. Build a bespoke form at a unit height similar to the tree presets
    and let a low planting height make it short in the world, instead of using tiny
    unit coordinates.
13. Textures are generated, never loaded. A seeded random generator fills a byte
    buffer that goes straight into a `DataTexture`: no image files, no fetch, no
    decode, and the same garden on every machine and in every test. Three
    properties matter and are easy to break. They're **achromatic**, so grain can
    only darken and lighten a tuned colour and never tint it, which keeps it out of
    the channel budget (DESIGN.md). They have a **fixed mean**, because a `map`
    multiplies and a byte tops out at 1.0, so a texture can only darken. Every
    textured material lifts its base colour by the inverse of that mean
    (`liftForTexture`) or the whole scene quietly dims by 24%. And the lift is done
    in **linear space**, since the map's bytes are used as linear multipliers. Two
    `DataTexture` defaults are also wrong here and each cost an hour. It filters
    nearest and generates no mipmaps, so a repeated map crawls at any distance. And
    it has no colour space, which is right for grain and wrong for any real colour
    map (the same trap as assumption 9).
14. Beds wrap into rows once there are more than four. Eight beds in one line is a
    thirty-five-metre strip you can't stand in front of, and wrapping keeps the
    footprint roughly square (the league is 20m by 8m). Gardens with four beds or
    fewer are laid out as before, so this changed nothing for the smaller mock
    gardens. The row a bed lands in depends on its sorted id, which is what lets a
    grouping above the bed be shown without adding a container level. Past twelve
    beds the layout squares off instead (see the world section).
15. The synthetic NFL season is anchored to load time, not to the calendar. Its most
    recent kickoff is always 26 hours ago, which puts it inside the 47-hour scrub
    window with room either side. Otherwise the scrub would run out of window before
    reaching a game, and time travel in that garden would be a flat line. The cost is
    that the season and week numbers don't match the real calendar, which the
    snapshot's provenance says openly. A live adapter has real kickoff times and the
    problem flips: most of the week there's no game inside the window at all, which
    is an argument for seasons as a second, coarser scrub, not for faking the clock.
16. The season scrub's window is limited by what was actually archived, not by the
    archive's capacity. The NFL's daily samples start at week one, so the cursor
    stops at the start of the season instead of running back into a stretch where
    every club looks identical because none had played. A flat line that looks like
    data is exactly what a scrub window is meant to keep off the end.
17. A drag locks its axis on the first movement that clearly means one or the other,
    and keeps it. Deciding per frame would let a diagonal drag switch between hours
    and months partway through, which is impossible to aim. The season drag's
    *direction* is locked at the grab for the same reason: whether pulling the sun up
    means earlier or later depends on which side of a solstice the cursor is, and
    dragging across one mustn't reverse under your hand.
18. The garden is under glass, and the beds are raised by **lowering the world**.
    `layout.ts` places a plant at y = 0. Grafts run between those points, dust
    settles from them, and sway is measured up from them. Raising the soil would have
    made every one of those know about bed height, so instead the floor drops to
    `FLOOR_Y` and the timber sides fall away below a soil surface that never moved.
    Nothing above the ground changed. The thing to keep straight is that the
    building's own heights (knee, eaves, ridge, door) are measured **from the
    floor**, not from the soil, and `Greenhouse` sets that reference point with one
    group offset.
19. Glass casts no shadow and writes no depth. Not casting is a lighting decision.
    The shadow map is 2048 texels over twenty-four metres, so a glazing bar is three
    or four texels wide and would shimmer as the sun moved, and a hard lattice over
    the beds would compete with the plants' own shadows for the glance the product
    is built around. Not writing depth is about correctness. The panes are blended
    over everything opaque, so plants behind glass are never sorted away, and
    neither are the sky, the sun, the moon, or the invisible sixteen-metre grab
    handles the sun and moon carry. Scrubbing time *is* grabbing the sun, so a roof
    that swallowed the pointer would have broken the whole gesture. (R3F only sends
    pointer events to objects with handlers, so the panes aren't in the way either.)
20. The viewer stands inside the house. The camera used to solve for a distance that
    fit the whole width in frame, which can only ever put it outside the building.
    For the league that was sixteen metres past the back wall, looking at a
    greenhouse with a garden shut inside it. The house was never the subject.
    `viewpointFor` places a body on the path instead: eye height above the floor,
    at the near wall, looking at the middle of the planting.

    Being inside isn't just a starting position. It's a constraint, and the clamps
    are what make it one. A walk that carried you out through the glass would undo
    the whole thing in one gesture, so your position is held between the nearer of
    the two walls and the planting, which together make the path. The maths lives
    in `scene/greenhouse.ts` with the rest of the proportions, because the failure
    is a camera inside a wall, and a test can check that. The upward clamp that used
    to be here went away with the orbit. A viewer who stands can't rise into the
    roof, because walking never changes eye height.

    The cost is that a garden's apparent size isn't constant anymore. A three-bed
    garden and the league now differ by how much house is around you instead of how
    far away you stand, which is the real difference and the one a person walking
    in would get.

    `Framing` still only fires on the house's dimensions, never on a telemetry tick,
    or the camera would snap back every two seconds while someone was looking at
    something.
21. Identity is its own channel, and you get it by walking up. Labels don't exist at
    a distance. A plant tag fades in within about nine metres and is fully legible
    at four and a half, so a view of the whole house has no text in it and beds get
    named once you're among them. That's what lets a label be as legible as it
    likes: it avoids competing with the health reading by never being visible at the
    same time. The distance rule lives in `scene/labels.ts`, pure and tested,
    instead of as two numbers inside a `useFrame`.
22. The emblem on a tag is chosen by translation and is never a signal. It's a node
    field (`Emblem`: a mark, a plate colour, an ink) with an explicit default in
    `ecosystem/labels.ts`, because what a thing is called and what it looks like is
    domain knowledge the renderer doesn't have. The league uses its own
    abbreviations and club colours, and deriving `DC` for the Dallas Cowboys from a
    label would throw away something the source already knew. It's fixed for the
    life of the node, which keeps a colour on a card out of the channel budget:
    identity never changes, signal does. The ban on a source's palette reaching bark,
    foliage, produce or bloom still holds absolutely.
23. Text is the one thing this project can't generate. Grain comes from a seeded
    random generator and plants come from a grammar, but letterforms come from a
    font, and both usual routes break rules already committed to. A bitmap font is
    an image asset, and drei's text helpers fetch a typeface on first render. A 2D
    canvas avoids both: a font the machine already has, pixels instead of a file, no
    fetch. The cost is that the tag is the only surface whose exact appearance
    depends on the machine, since available fonts differ, but only people read it.
    It's also the one texture in the app that's a real colour map, so it has to
    declare `SRGBColorSpace` (the same trap as assumptions 9 and 13, from the other
    side).
24. The detail panel is anchored in the world, not to the viewer's head, and it reads
    at the cursor. Anchored, because a headset is a stated target (assumption 6) and
    a card stuck to the corner of the screen is the one interface a headset can't
    have. At the cursor, because a panel showing live numbers while the sky showed
    Tuesday would be two clocks in one view. Selection lives in the store, not in a
    component: the tag that was clicked and the panel that opens are at opposite
    ends of the scene, and a panel that closed itself on every telemetry tick would
    be unusable.

## Collection

History is recorded, not just backfilled. That has a consequence worth stating
plainly: a closed browser tab records nothing, so recording in the browser produces
a history full of holes across exactly the stretches you most want to look at.
Real recording needs a collector that runs continuously and a viewer that reads from
it, not one application doing both.

In the browser, both halves exist, with the limit above stated honestly instead of
engineered away. The poll in `state/sources.ts` keeps the live reading current (a
source is re-read when its own calendar says a reading is due), and it uses the same
`dueAfter` that staleness does, so the collector's schedule comes for free. What the
poll can't do is outlive the tab. The collector does that, but only so far: it
records while a tab is open, and a browser with no server behind it has nowhere to
run a process while one isn't.

The server side now exists too. `src/backend/collectorLoop.ts` runs the same loop and
writes the same `ObservedRecord`, and `netlify/functions/collect-scheduled.ts` runs
it every minute. It covers Prometheus only so far, and it hasn't run against a live
source. See `docs/backend.md`.

The browser collector already buys something. Before it, history was backfilled at
module load and discarded on reload, so scrubbing back four months showed four
months of fiction regenerated on the spot. Now a season is assembled over visits.
Measured on the seeded gardens, the two real sources leave real gaps for it to fill:
of the archive's 140 daily slots, the league backfills 85 and the tape 60, and the
rest are weekends, byes and days before the record starts.

### What's stored, and what wins

`state/persist.ts` is the format and the rules, and `state/collector.ts` is the only
file that knows `localStorage` exists. Two decisions carry the design.

**Observations, not buffers.** What gets written down is one sample per plant per
slot at the moment it reported, not a copy of `state.history`. A backfill fills
every slot it covers, so persisting the buffers would store each source's own
account back to itself, at roughly a megabyte, for nothing. Observations are the
part no source can tell you again. The caller decides which nodes count as having
reported, because the caller is the layer that knows: `commit` receives exactly the
nodes a source reported on, and the mock tick reports exactly the plants it drifted.
The silent plant is in neither. A collector that recorded it every hour as reporting
the same number would be inventing exactly what the rest of the design refuses to
invent.

**On restore, the source wins.** `recordIfAbsent` only writes into slots the freshly
built buffers left empty. A backfill is the source's current account of its own past
and may include corrections, and the record we kept is only valuable where the source
has gone quiet. Checked both ways in the browser: a day 85 back that the league can't
reach comes from the record, and a day it does cover is left alone even when the
record says otherwise.

The two tiers aren't treated the same. When the record goes over budget, the hourly
tier is shed first and completely before a single daily slot goes, because a live
feed can usually still tell you about last week, but past its window those days exist
nowhere else. Two megabytes holds a full season of every plant in every garden,
measured, not guessed. `recordBytes` estimates the encoded size directly, so a budget
check doesn't have to serialize a megabyte to find out how big it is, and a test holds
the estimate within 5% of the real output for values using all four decimal places,
erring high for values that round shorter. Erring high is the only safe direction for
a budget, so it's pinned that way instead of tuned to real data.

### Several tabs at once

One key, several tabs, each with its own copy: a plain write means one tab silently
discarding everything the others saw since they loaded. So every write merges with
what's stored before replacing it, which makes the record belong to the origin
instead of to one tab. Where two tabs hold the same slot, the writer keeps its own
value. The disagreement can only be inside one in-progress slot, and the writer's
value is the one it watched arrive.

The merge costs a decode, and the normal case is a single tab, so a stored value the
collector recognises as its own is skipped based on `savedAt` and length alone.
`peekSavedAt` reads that header with a regex over the first hundred characters
instead of parsing a megabyte to find out nothing changed. A collector running as a
separate process would need none of this. One running in a page does.

### What a write costs

`localStorage` is synchronous and runs on the main thread, so a write is a frame
nobody gets. Measured in Chromium at the budget (124 plants, a season of days and a
week of hours, 1.84MB), encoding takes 9.7ms and the write 11.3ms, about 21ms median
and 28ms at worst. That's one dropped frame every thirty seconds at the very top of
the range, and too small to measure for the first weeks of use.

Both halves were tightened based on what they are, not on a guess. Values are rounded
when observed instead of when encoded, which removes a full rebuild of the record on
every write and cuts encoding from 14.8ms to 9.7ms. `savedAt` being second in the
object is what lets the merge check be a regex. And the interval isn't a constant
anymore. It's the measured cost of the last write times `WRITE_DUTY`, with a floor of
thirty seconds and a cap of ten minutes, so the same code keeps a tight cadence on a
fast machine and backs off on a slow one without anyone choosing a number. Backing
off costs almost nothing, since the finest grain in the record is an hour and the page
closing flushes regardless.

Two megabytes is also a deliberate 40% of the roughly 5MB an origin gets, which was
confirmed the blunt way during benchmarking: three copies of a full record wouldn't
fit. Nothing else lives on this origin, so it's the right trade, but a second consumer
would need the number revisited instead of assuming there's headroom.

`localStorage` and not IndexedDB, on purpose. IndexedDB is asynchronous and would
keep encoding off the critical path, but the flush that matters most is the one on
`pagehide`, and an asynchronous write isn't guaranteed to finish while a page is
being torn down. A synchronous API is the one that can promise the last write lands.
That trade flips as soon as the collector moves into a worker, where there's no
teardown to race and no main thread to block.

`ObservedRecord` is the shape a server-side collector wants, which is the point of
the design: moving the loop somewhere it can run unattended changes the storage
backend, not the format. That's what `src/backend/` did.

Adapters that can backfill should, so a new garden has history on day one instead of
after a week of collecting. Prometheus, market data and sports results all answer
range queries. Notes and task systems mostly can't, and those are the ones that
depend on the collector.

The NFL adapter is the worked example, and it goes further than backfill. Because
every derivation takes an `asOf`, the whole season is addressable, not just the window
someone thought to record. A source built this way only needs the collector for what
it genuinely can't reconstruct. For a league that's the injury report, since a feed
publishes who's hurt now, not who was hurt in week four.

The collector is also the right home for the pruning webhook. The confirmation
belongs in the headset, but the allowlist of what can be pruned, the dry run and the
audit record belong on the server, where a hand-tracking misfire can't reach them.

## Open risks

Pruning shears that fire a webhook mean a hand gesture triggers a destructive
production action, and hand tracking misfires. Before that touches a real backend it
needs a dry-run mode, a confirmation step, and a server-side allowlist of what can be
pruned at all. `Blight.remediable` is where that hooks in.

Edges make pruning riskier, not safer. `reachableFrom` exists so the interaction can
show the blast radius before the cut lands, and it should be wired into the
confirmation from the start instead of added later.

Geospatial domains (disasters, geopolitics) don't fit a bed layout, because a garden
throws away the map. That calls for a terrain environment mode, not a change to the
node type.

**Half of that has now been tested, and it was half right.** The world garden groups
countries into UN subregion beds, and throwing away the map costs less than predicted.
A region is a real grouping people already think in, bed order runs west to east so
the house has a rough geography, and land borders as grafts restore the adjacency that
mattered most. What the prediction got right is more specific than "it won't fit":
borders that *cross* subregions can't be drawn at all, because a graft between two
beds would be the length of the greenhouse. Egypt and Israel share a border and this
garden doesn't know it. A terrain mode is still the answer for a source where
adjacency is the whole point. A bed layout is enough for one where adjacency is
context.

Collecting while no tab is open is built on the server side but hasn't run against a
live source, and it only covers Prometheus. See "Collection" above.

`TRUNK_RATIO` in `generate.ts` is 0.035 of height, which looks stout next to a real
tree. It's a style setting, better tuned in the headset than on paper.
