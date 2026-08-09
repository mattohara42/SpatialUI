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
                     years, and colours. Real, unlike the season.
      roster.ts      The fifty-three slot depth chart and what each slot is
                     worth, which is what makes an injury report weigh
                     something instead of counting bodies.
      season.ts      The synthetic source: a seeded season in feed shape.
      season.test.ts
      derive.ts      Standings, stat sheets, and roster availability, all as
                     of an arbitrary timestamp. Converts NFL into NFL.
      derive.test.ts
      index.ts       The barrel, and the note on what a live adapter replaces.
    market/
      types.ts       The feed contract: instruments, closed bars, fills as
                     lots, and halts. Plus `MarketSource`, the one method a
                     live feed implements.
      instruments.ts The thirty-two symbols, their sectors, listing years, and
                     colours. Real, unlike the prices.
      session.ts     When the exchange is open, and the arithmetic behind the
                     staleness threshold: the longest gap it legitimately
                     produces is a holiday weekend, computed not chosen.
      session.test.ts
      tape.ts        The synthetic source: a seeded walk in feed shape, printing
                     only during sessions, with one instrument halted.
      derive.ts      Price, position, drawdown, volume and momentum, all as of
                     an arbitrary timestamp. Logarithmic in the record.
      derive.test.ts
      index.ts       The barrel, and what a live adapter would not have to
                     supply.
  translation/       Raw records to EcosystemNode and EcosystemEdge. The only
                     place domain knowledge and plant archetypes meet, and
                     where trend and polarity are decided.
    nfl.ts           The league as a garden: the four axes, injuries as
                     blights, division rivalries as grafts, history backfill.
    nfl.test.ts
    market.ts        The book as a garden: sectors as beds, shorts as weeds —
                     the first real use of polarity — drawdown as blight, and
                     correlation as grafts.
    market.test.ts
  ecosystem/
    types.ts         Node, edge, and state contracts. Read by every layer.
    graph.ts         Pure helpers: garden filtering, adjacency, reachability,
                     edge validation, topology keys.
    graph.test.ts
    history.ts       Vitals over time as fixed-size ring buffers, slotted on
                     absolute time so gaps stay gaps. Four parallel typed
                     arrays, both grains, and `vitalsAt`.
    history.test.ts
    layout.ts        Where things stand. Pure and deterministic, kept out of
                     the scene; reads each bed's arrangement off its planting
                     type rather than deciding it.
    staleness.ts     How late a node is against its garden's threshold, and the
                     visual state that follows. Silence must not read as health.
    scrub.ts         What counts as a legal cursor: the window, the clamp, and
                     when a scrub lands back on live. Knows nothing about the
                     sky, so the store can use it without importing a renderer.
    scrub.test.ts
    planting.ts      What a bed is planted as: the PlantingType vocabulary and
                     each type's spatial arrangement. Self-contained, imports
                     nothing, so layout and the renderer share it cycle-free.
    planting.test.ts
    labels.ts        What a thing is called and the mark it wears. The Emblem
                     contract translation must choose, plus the explicit default.
    labels.test.ts
    series.ts        History as a line rather than a point, for the detail
                     panel. Gaps stay gaps all the way to the drawn path.
    series.test.ts
    inspect.ts       The opaque `raw` payload flattened into rows, without
                     knowing anything about its shape.
    inspect.test.ts
    scene-inputs.test.ts  The seam itself: what the scene is handed for a given
                     state, asserted end to end rather than per module.
  lsystem/           Pure procedural geometry. No React, no three.js.
    types.ts         Vec3, Grammar, TurtleParams, PlantGeometry.
    random.ts        Seeded PRNG so a node id always grows the same plant.
    grammar.ts       String rewriting with a symbol budget guard.
    turtle.ts        Symbols to flat typed arrays, written in one pass. Emits
                     leaves in fanned clusters per J marker.
    presets.ts       Grammar archetypes (broadleaf, bushy, willow, shrub, spire,
                     and the flower/wildflower blooms) plus the foliage table:
                     leaf kind, cluster, scale.
    bespoke.ts       Forms that are not self-similar and so are not grammars: the
                     trained vine and the clipped topiary, built by hand into the
                     same geometry the turtle emits.
    bespoke.test.ts
    generate.ts      Public entry. Maps vitality and growthScale to geometry;
                     dispatches bespoke presets, else runs the L-system.
    generate.test.ts
    foliage.test.ts  Leaf clusters, the foliage table, and every preset.
  hooks/
    useLSystem.ts    Memoized React wrapper. The only React import in the
                     generation path.
  state/             Zustand store, and where the gardens are composed. Holds
                     EcosystemState and nothing derived from it, with one
                     deliberate exception: `scrubWindowMs`, which the scrub
                     gesture asks for on every pointer move and which only
                     changes when the garden does. Recomputing it per move
                     would walk every node's archive at pointer rate.
    ecosystemStore.ts  The store, and `composeEcosystem` — the one place that
                     knows more than one source exists.
  scene/             R3F components. Owns InstancedMesh and the merged graft
                     geometry.
    types.ts         What the scene is handed per plant: geometry, place, tint.
    Garden.tsx       The garden itself: assembles the scene from store state
                     and owns the rig every other component draws under.
    Branches.tsx     Every branch in the garden in a single InstancedMesh, so
                     draw calls do not scale with plant count.
    Grafts.tsx       Root grafts as curves dipping under the soil. Merged per
                     garden, rebuilt only on topology change.
    Beds.tsx         Soil. Structure rather than signal, with furrows running
                     along the axis layout puts rows on.
    Motes.tsx        Drifting motes: activity made visible in the air,
                     additive so they read as light — the inverse of dust.
    Sky.tsx          The sky dome, a pure function of the hour under the
                     cursor. Decides nothing; draws what `daylight.ts` says.
    sway.ts          Ambient motion: a rigid lean about the base, shared by
                     branches and foliage so they stay glued together.
    sway.test.ts
    daylight.ts      Timestamp to sun direction and full palette, and the
                     inverse used by the drag. Pure, no three.js.
    daylight.test.ts
    SunScrub.tsx     The gesture: grabbing the sun or the moon to move time.
    Foliage.tsx      One InstancedMesh per leaf shape; groups plants by kind.
    Produce.tsx      Fruit on plants that bear it, drawn on a subset of their
                     leaf points. One instanced mesh; empty when no vegetables.
    Trellis.tsx      Static posts and wires for vineyard beds. Signal-free, like
                     the horizon; the vines are trained to it.
    Horizon.tsx      Static hills, mountains, and tree line. Signal-free depth.
    greenhouse.ts    The house as arithmetic: floor level, proportions, bay
                     spacing, roof height at a distance in from the wall. Pure,
                     no three.js, like daylight and dust.
    greenhouse.test.ts
    Greenhouse.tsx   Draws it — dwarf wall, frame, glazing, roof, vent, door —
                     from one unit cube and one unit quad.
    Props.tsx        The hose, the rolling bench, the can, the shears, the
                     gloves, the pots. Decoration, against the walls, still.
    Beds.tsx         Raised beds: soil in a timber box with a cap rail.
    labels.ts        When a tag is legible, and how big it is. Pure.
    labels.test.ts
    Tags.tsx         The tags themselves: stake, card, fade, and the tap that
                     opens the panel.
    tagTexture.ts    A tag drawn to a 2D canvas — the one place text enters the
                     scene, and the one texture that is a real albedo map.
    Detail.tsx       The panel: axes, trend lines, blights, source payload.
                     World-anchored beside its plant, never head-locked.
    planting.ts      The render half of the planting concept: which L-system
                     forms each PlantingType is drawn with.
    planting.test.ts
    textures.ts      Surface grain at two scales: generated achromatic maps
                     (turf, soil, bark) and the per-instance jitter. Pure but
                     for the DataTexture builder, so the pixels are testable.
    textures.test.ts
    dust.ts          The staleness particulate: its density ramp and settle
                     step. Pure, no renderer, like sway and daylight.
    dust.test.ts
    Dust.tsx         Draws the dust, one Points object for every stale plant in
                     the garden and nothing at all when none are.
  xr/                Planned, not yet created. Session setup, hand rays, and
                     world-anchored HUDs will live here. Named now so nothing
                     gets built in a way that blocks it.
  mock/
    mockEcosystemData.ts  Four gardens, edges, and a drift tick. One plant per
                     garden has a dead adapter, so the staleness state is
                     reachable without hand-editing data. The tick moves only
                     the gardens this module generated, so it can never drift
                     a translated one.
  App.tsx            Deliberately plain chrome: garden buttons and a readout of
                     where the cursor is. The garden is the interface.
  main.tsx           Vite entry.
```

Everything listed above without a "planned" note exists and is under test:
476 tests across twenty-four files, `tsc --noEmit` clean, `vite build` succeeds.
`npm install && npm run dev` runs the desktop scene.

## Layer contracts

Data flows one way. Adapters emit raw records, translation converts them into
nodes and edges, the store holds flat records keyed by id, and the scene
subscribes. Nothing below the scene imports three.js and nothing above
`translation/` knows what Prometheus is.

A garden is an environment the user walks into, and it fixes what vitality means
for everything inside it. Only one garden is live at a time. Beds group plants
inside a garden. This is what stops green meaning "low error rate" and "up 3%
today" in the same field of view, and it bounds scene cost by the largest single
garden rather than by everything the user tracks.

A bed also carries a **planting type** — orchard, hedge, conifer stand, vineyard
— set by translation on the bed node (`plantingType`). It is a container
property, not a health signal: it decides the *form* a plant wears and how the
bed is arranged, the way polarity decides plant versus weed, and it never moves
with a metric. The concept splits across two layers to keep them clean:
`ecosystem/planting.ts` owns the semantic vocabulary and each type's spatial
arrangement (pure, read by `layout.ts`), and `scene/planting.ts` owns which
L-system forms draw it (a render decision). `DESIGN.md` carries the reasoning
and the roadmap for the plantings that still need their own geometry.

Health normalizes onto four axes. `vitality` is the level, `activity` is how
busy, `maturity` is how established, and `trend` is the signed delta, because a
stock down 6% today reads differently from one merely sitting low. `polarity`
says whether growth is good news: suppress-polarity nodes are things you want
gone, so they render as weeds and a thriving one is alarming on sight. Domain
specifics stay in `raw`, which the HUD displays and the renderer never reads.
Adding a source means writing a translator, not widening the node type.

Edges live in their own collection, never on the node. A vitality tick then
cannot invalidate edge geometry, and a topology change cannot rebuild plants.
Both endpoints must sit in the same garden.

The gardens are assembled in one place — `composeEcosystem` in the store — which
is the only code that knows more than one source exists. Adding a source is a
translator and a line there.

## The first real source: the NFL

The league exercises the layering end to end, and the shape it settled is worth
stating because the next adapter should copy it.

**The adapter stores events, not summaries.** A game holds both teams' box
scores; a season stat is a sum over them. An injury holds an onset. Nothing in
`adapters/nfl/` stores a standings table or a yards-per-game figure, because a
feed that hands you totals has already thrown away when each number changed.

**Every derivation takes an `asOf`.** `recordOf`, `statsOf`, and
`availabilityAt` answer for any moment in the season, so the live view and the
history are the same function called at different times and cannot disagree.
Backfilling history is that function in a loop; because a club's numbers only
move when a game goes final or an injury is reported, the loop is memoized on
the count of each and collapses to a handful of real computations per club. The
whole league — thirty-two clubs, 48 edges, and both grains of history —
translates in about 40ms at module load. The measurements are below.

**A container level can be a row rather than a bed.** The model has exactly one
grouping level between garden and plant, and the NFL has two (conference,
division). Divisions are the beds; conference is expressed by ordering — bed ids
are conference-prefixed and `layout.ts` sorts by id, so the AFC fills one row and
the NFC the other. Nested beds would have bought a label and cost the layout its
flat structure.

**Staleness is per source, and it can be true rather than staged.** A club plays
every seven days, so the league's threshold is seven days rather than the fifteen
minute fallback, and the clubs that cross it are exactly the ones on a bye. The
garden cannot distinguish a bye from a dead feed, and should not: both mean what
you are looking at is old.

## The second source: a book of positions

The market source exists because it *disagrees* with the league. The NFL
satisfied every assumption the design had quietly been making, which is pleasant
and proves nothing. A market breaks three of them, and this section is mostly
the record of what broke.

**Polarity finally does something.** A short position is the first thing in any
source that is genuinely `suppress`: you hold it and you want it to go down. So
`vitality` here is *not* the position's profit — it is how far the instrument has
moved since it was taken on, unsigned by side, and `signalHealth` inverts it for
the shorts. A short on a stock that has run away grows into the largest, lushest
weed in the greenhouse, which is exactly what it is. The pre-signing bug is the
one to watch for and there is a test named for it: if translation signed the
return by side, polarity would invert it *back* and every short would read as
healthy while winning. Nothing about that failure is visible in a screenshot.

**The source is shut most of the time.** Staleness exists so silence never reads
as health, and an exchange is silent every night and all weekend with nothing
wrong. The threshold is therefore sized to the longest *legitimate* gap — a
Friday close with a Monday holiday, computed in `session.ts` rather than picked —
which is the league's bye argument restated. The cost is real and is not hidden:
a feed that dies on Friday evening is not called stale until midweek. Sharpening
that needs staleness to become session-aware, which is a change to the
`staleness` contract rather than to any adapter, and it is not done.

The state is still reachable honestly, and by the market's own mechanism: a
**trading halt** stops the bars on one symbol while the rest of the book keeps
printing. Nothing edits a timestamp — `updatedAt` is the last close on the tape,
so the halted plant greys itself.

**Prices move constantly, so the memo stops paying.** The league's history
backfill collapses a season to about fourteen real computations per club because
a club's numbers only move when a game goes final. The identical memo is here,
keyed on how many bars have closed instead of how many games have been played,
and it earns far less:

```
                          per club (NFL)   per instrument (market)
daily grain, a season          14                  70
hourly grain, a week            3.3                35
```

Five to ten times the work, and the shape of it is exactly what the domain
predicts: the cache absorbs the nights and weekends, when no bar closes and the
reading genuinely cannot change, and pays full price for every session hour.

What did *not* happen is a blow-up in total cost, and the reason is worth
recording because it is the argument for the whole as-of design. Translation
runs in about the same time as the league's despite doing five times the
computations, because each one is far cheaper: a club's reading walks its whole
season of games, while an instrument's is a binary search into a sorted bar list
plus a couple of short window scans. The lesson is that the memo was never the
load-bearing part — the derivations being O(log n) in the record is.

## Time and history

State is a snapshot of now plus ring buffers of vitals per node, keyed by
absolute slot so gaps stay explicit rather than silently shifting older samples
forward. The scene must read vitals through
`vitalsAt(node, history, cursor, archive)` rather than off the node. That single
indirection is why scrubbing, comparison, and playback are changes to one
function instead of changes to every component that touches a plant.

History is kept at **two grains**, in two collections:

```
history   hourly, 168 slots     a week      3.4KB per node
archive   daily,  140 slots     20 weeks    2.9KB per node
```

The split is the downsampling the storage note below always said this would need,
but the reason to prefer it over one long fine buffer is not storage: the grains
answer different questions. Inside a day you want the hour a thing broke; across
a season you want the week it started sliding. `vitalsAt` asks the fine grain
first, falls through to the coarse one when the cursor is older than the week
kept in detail, and falls back to live when neither holds it — never
interpolating a past nobody recorded.

A node may be absent from the archive. An adapter that cannot backfill months has
nothing to put there, and `windowFor` then keeps that garden's scrub at the two
day window rather than letting the cursor run out past the data.

Two gestures move the cursor and they are the same object: the sun's arc. Along
it is the day at a turn per day; across it — the arc's own height, which is what
a season physically is — is the year at half a year per full sweep. See
`scene/daylight.ts` for why the two cannot interfere, and DESIGN.md for what the
gesture settled.

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

And on the league, which is the largest garden and the one with a real adapter
behind it:

```
storage, archive       2.9KB per node per season (daily, 140 slots)
snapshot generation    7ms       210 games (14 weeks played), 32 rosters,
                                 32 injury reports
translation            40ms      32 clubs to nodes, plus both grains of history
                                 backfilled — a week of hours and the season so
                                 far in days, 8,346 samples written
```

The archive is capacious rather than full: 140 slots reach 20 weeks back, the
season so far is 14, and slots before the season opened are deliberately left
unwritten rather than filled with an opening-day figure that would read as a
flat line of data. That is the gap between the 4,480 daily slots allocated and
the 2,970 written.

Both grains come from the same as-of derivation, so the cost is not in the
sampling but in how often it has to be recomputed: memoized on games played and
injuries active, a club's season of dailies collapses to about fourteen real
computations, and its week of hours to three or four. It runs once at module
load and never again.

And on the book, which is the source that stops the memo working:

```
storage                same buffers, same two grains
snapshot generation    25ms      5,920 bars across 32 instruments — 130 daily
                                 sessions plus hourly bars for the last eight
translation            32ms      32 instruments to nodes, 48 correlation edges,
                                 both grains backfilled, 8,531 samples written
memo, daily grain      70 real computations per instrument   (the league: 14)
memo, hourly grain     35                                    (the league: 3.3)
```

Five to ten times the computations for about the same wall clock, which is the
measurement that matters here: it says the memo was never what made this
affordable. The derivations being logarithmic in the record is. A club's reading
walks a whole season of games; an instrument's is a binary search plus two short
window scans, so it survives losing the cache.

The 48 edges are real Pearson correlations of daily returns over the shared
closes, computed once at module load. Only bars that share a close time are
paired, so the halted instrument contributes nothing after it stops rather than
being lined up against the wrong days — which is the mistake that makes two
unrelated things look perfectly correlated.

Storage was never the expensive part. Rebuilding geometry on every scrub step
is, and quantized vitality is what defuses it: a week of hourly history collapses
to roughly ten distinct shapes per plant, so the geometry cache runs at a 94%
hit rate and scrubbing costs less than a frame.

## Recorded assumptions

1. Plant geometry is deterministic, seeded off node id, so telemetry updates
   never reshuffle a tree under the user's hands.
2. Generation runs synchronously on the main thread, memoized per node.
   Vitality is quantized to 20 steps and maturity to 10, so a 1% metric wobble
   does not rebuild a few hundred segments. Measured cost is roughly 0.8ms per
   plant, so a full rebuild stays inside one frame up to about 100 plants. Past
   that, move generation into a worker. `src/lsystem/` has no React or three.js
   imports specifically so that move stays a one-file change.
3. Geometry is emitted as flat typed arrays, sized exactly before the walk and
   scaled in place afterwards. Direct `InstancedMesh` upload, no per-frame tree
   walking, no intermediate objects. Measured at 10.3KB per plant against 134KB
   for the object layout it replaced, which takes the projected scrub cache for
   500 plants from 672MB to 51MB. Generation cost is unchanged at 0.84ms.
4. Plants are generated in unit space and scaled to hit `growthScale` in metres
   exactly. Radii scale independently of positions, so changing a grammar's
   iteration count does not make trunks go spindly.
5. Root grafts are curved, so they cannot be usefully instanced. They merge into
   one geometry per garden, rebuilt only on topology change and keyed by
   `topologyKey`. Strength and directional flow animate in the shader against a
   static mesh, so a strength wobble costs nothing.
6. Desktop browser is the first target. XR is not wired and `src/xr/` has not
   been created, but no HUD or control is head-locked, so nothing built so far
   has to be undone to get there.
7. The sun travels a tilted circle with a declination. This was a plane great
   circle, on the reasoning that an almanac position "needs a latitude and a date
   and would buy nothing" — right about the latitude, wrong about the date. Tilt
   the daily circle by the sun's declination and the seasons arrive with no new
   machinery: the arc rides high in summer and low in winter, and since every
   palette and light already keys off the sun's height, the days get shorter on
   their own. The latitude then falls out rather than being chosen — a 58° noon
   sun at equinox is 32° north, whose winter day is ten hours against summer's
   fourteen. Both the hour and the declination stay invertible from a direction,
   which is what the two drag gestures need, and they are measured on
   perpendicular axes so neither gesture can disturb the other.
8. Time reaches the sky quantized to thirty seconds. The sun crosses a full
   circle in a day, so that is a hundredth of a degree: invisible mid-drag, and
   it keeps a two second telemetry tick from rebuilding the lighting for a sun
   that has not measurably moved.
9. The sky dome is a raw `ShaderMaterial`, which means it gets none of the
   fragment includes the built-in materials generate. It needs
   `#include <colorspace_fragment>` explicitly: colours arrive in the renderer's
   linear working space and the framebuffer wants sRGB, and without the
   conversion every colour renders far darker than it reads. That is worth
   knowing before adding a second custom shader.
10. Leaves render as one `InstancedMesh` per leaf shape, not one for the whole
    garden, because an instanced mesh has a single geometry and a conifer cannot
    wear the same card as a hardwood. There are five kinds (broad, blade, needle,
    round, and the flower's bloom), so a garden costs at most five leaf draw
    calls regardless of plant count. Branches stay a single
    instanced mesh: they are all cylinders, and per-plant branch variety comes
    from the grammar, not from swapping geometry. Which leaf shape a plant wears
    is a render decision keyed on preset, kept off `PlantGeometry` so the scrub
    cache key (`seed|maturity|growthScale|preset`) needs nothing new.
11. The horizon — hills, mountains, tree line — is static, deterministic, and
    signal-free on purpose. It owns no colour or time logic: the shared lights
    and fog paint it, so it tracks the day/night scrub for free, and distance
    plus fog turn far ridges into pale flat silhouettes (aerial perspective) with
    no extra work. Carrying no signal is what lets it be visually busy without
    competing with the plants, which are the only thing meant to be read.
12. Not every plant is an L-system. Forms that are not self-similar — a vine
    trained to a wire, a topiary clipped to a solid — are built by hand in
    `bespoke.ts` and emit the same `RawGeometry`, so everything downstream
    (scaling, the vitality cache, sway, droop, colour, produce) is unchanged.
    One trap when writing one: leaf world size is `leafScale × growthScale /
    unitHeight`, so a form built short in unit space gets oversized leaves after
    height normalization. Build a bespoke form in a unit height comparable to the
    tree presets and let a low planting height scale make it short in the world,
    rather than authoring tiny unit coordinates.

13. Textures are generated, never loaded. A seeded PRNG fills a byte buffer that
    goes straight into a `DataTexture`: no image files, no fetch, no decode, and
    the same garden on every machine and in every test. Three properties are
    load-bearing and easy to break. They are **achromatic**, so grain can only
    darken and lighten a tuned colour and never tint it, which is what keeps it
    out of the channel budget (DESIGN.md). They have a **fixed mean**, because a
    `map` multiplies and a byte tops out at 1.0 — a texture can only darken, so
    every textured material lifts its base colour by the inverse of that mean
    (`liftForTexture`) or the whole scene quietly dims by 24%. And the lift is
    done in **linear space**, since the map's bytes are consumed as linear
    multipliers. Two `DataTexture` defaults are also wrong here and cost an hour
    each: it filters nearest and generates no mipmaps, so a repeated map crawls
    at any distance, and it carries no colour space — right for grain, wrong for
    any real albedo map, which is the same trap as assumption 9.

14. Beds wrap into rows once there are more than four of them. A garden of eight
    beds in one line is a thirty-five metre strip that cannot be stood in front
    of, and the wrap keeps the footprint near square (the league is 20m by 8m).
    Gardens with four beds or fewer are laid out exactly as before, so this
    changed nothing about the mock gardens. The row a bed lands in is a function
    of its sorted id, which is what lets a grouping above the bed be expressed
    without adding a container level.

15. The synthetic NFL season is anchored to load time, not to the calendar. Its
    most recent kickoff is always 26 hours ago, which puts it inside the 47 hour
    scrub window with room either side — otherwise the scrub would run out of
    window before it reached a game and time travel in that garden would be a
    flat line. The cost is that the season and week numbers will not agree with
    the real calendar, which the snapshot's provenance says out loud. A live
    adapter has real kickoff times and this problem inverts: most of the week
    there is no game inside the window at all, which is an argument for seasons
    as a second, coarser scrub rather than for faking the clock.

16. The season scrub's window is bounded by what was actually archived, not by
    the archive's capacity. The NFL's dailies start at week one, so the cursor
    stops at the season's start rather than running back into a stretch where
    every club is identical because none had played — a flat line that looks like
    data is the one thing a scrub window exists to keep off the end of.

17. A drag latches its axis on the first movement that clearly means one or the
    other, and keeps it. Deciding per frame would let a diagonal drag switch
    between hours and months halfway through, which is unaimable. The season
    drag's *direction* is latched at the grab for the same reason: whether
    pulling the sun up means earlier or later depends on which side of a solstice
    the cursor is on, and dragging across one must not reverse under the hand.

18. The garden is under glass, and the beds are raised by **lowering the
    world**. A plant is placed at y = 0 by `layout.ts`; grafts run between those
    points, dust settles from them, sway is measured up from them. Lifting the
    soil would have made every one of those learn a bed height, so the floor
    drops to `FLOOR_Y` instead and the timber sides fall away beneath a soil
    surface that never moved. Nothing above the ground changed. The consequence
    to keep straight is that the building's own heights — knee, eaves, ridge,
    door — are measured **from the floor**, not from the soil, and `Greenhouse`
    puts that datum in place with one group offset.

19. Glass casts no shadow and writes no depth. Not casting is a light decision:
    the shadow map is 2048 texels over twenty-four metres, so a glazing bar is
    three or four of them and would shimmer as the sun moved, and a hard lattice
    over the beds would compete with the plants' own shadows for the glance the
    product is built around. Not writing depth is a correctness one: the panes
    are blended over everything opaque, so plants behind glass are never sorted
    away — and neither are the sky, the sun, the moon, or the invisible sixteen
    metre grab handles the last two carry. Scrubbing time *is* grabbing the sun,
    so a roof that swallowed the pointer would have cost the whole gesture.
    (R3F only dispatches pointer events to objects that have handlers, so the
    panes are not in the way either.)

20. The viewer stands inside the house. The camera used to solve for a distance
    that fit the whole width in frame, which is arithmetic that can only ever
    put it outside the building — for the league, sixteen metres past the back
    wall, looking at a greenhouse with a garden shut inside it. The house was
    never the subject. `viewpointFor` places a body on the path instead: eye
    height above the floor, at the near wall, looking at the middle of the
    planting.

    Being inside is not a starting position but a constraint, and the clamps are
    the substance of it. A wheel that carried the camera out through the glass
    would undo the whole thing in one gesture, so the orbit is bounded by the
    nearer of the two walls, by the nearest plant coming in, and by the eaves
    going up. The arithmetic lives in `scene/greenhouse.ts` with the rest of the
    proportions, because the failure mode is a camera inside a wall and that is
    a claim a test can settle.

    What it costs: the apparent size of a garden is no longer constant. A three
    bed garden and the league now differ by how much house is around you rather
    than by how far away you stand, which is the honest difference and the one a
    person walking in would get.

    `Framing` still fires on the house's dimensions only, never on a telemetry
    tick, or the camera would snatch itself back every two seconds while
    somebody was looking at something.

21. Identity is a channel of its own, entered by walking. Labels do not exist at
    a distance: a plant tag fades in inside about nine metres and is fully
    legible at four and a half, so the view of a whole house has no text in it
    and the beds are named once you are among them. That is what lets a label be
    as legible as it likes — it competes with the health reading by not being
    present at the same time. The distance rule lives in `scene/labels.ts`, pure
    and asserted, rather than as two numbers inside a `useFrame`.

22. The emblem on a tag is chosen by translation and is never a signal. It is a
    node field (`Emblem`: a mark, a plate colour, an ink) with an explicit
    default in `ecosystem/labels.ts`, because what a thing is called and what it
    looks like is domain knowledge the renderer does not have — the league uses
    its own abbreviations and club colours, and deriving `DC` for the Dallas
    Cowboys off a label throws away something the source already knew. It is
    fixed for the life of the node, which is what keeps a colour on a card clear
    of the channel budget: identity never moves, signal does. The ban on a source
    palette reaching bark, foliage, produce, or bloom still holds absolutely.

23. Text is the one thing this project cannot generate. Grain comes from a
    seeded PRNG and plants come from a grammar, but letterforms come from a
    font, and both usual routes break rules already committed to — a bitmap font
    is an image asset, and drei's text helpers fetch a typeface at first render.
    A 2D canvas is the way out: a face the machine already has, pixels rather
    than a file, no fetch. The cost, stated plainly, is that the tag is the only
    surface whose exact appearance depends on the machine, since font
    availability differs; nothing reads it but a person. It is also the one
    texture in the app that is a real albedo map, so it must declare
    `SRGBColorSpace` — the same trap as assumptions 9 and 13, from the other
    direction.

24. The detail panel is world-anchored, not head-locked, and reads through the
    cursor. Anchored because `src/xr/` exists to keep the project honest and a
    card welded to the corner of the screen is the one interface a headset
    cannot have; through the cursor because a panel that showed live numbers
    while the sky showed Tuesday would be two clocks in one frame. Selection
    lives in the store rather than in a component: the tag that was clicked and
    the panel that opens are at opposite ends of the scene, and a panel that
    closed itself on every telemetry tick would be unusable.

## Collection

History is recorded, not just backfilled. That has a consequence worth stating
plainly: a browser tab that is closed records nothing, so client-side recording
produces a history full of holes exactly across the gaps you most want to
inspect. Recording therefore implies a collector that runs continuously and a
viewer that reads from it, rather than one application that does both.

Adapters that can backfill should, so a new garden has history on day one
instead of after a week of collection. Prometheus, market data, and sports
results all answer range queries. Notes and task systems mostly cannot, and
those are the ones that depend on the collector.

The NFL adapter is the worked example and it goes further than backfill: because
every derivation takes an `asOf`, the whole season is addressable, not just the
window someone thought to record. A source built this way needs the collector
only for the things it genuinely cannot reconstruct — which for a league is the
injury report, since a feed publishes who is hurt now and not who was hurt in
week four.

The collector is also the right home for the pruning webhook. The confirmation
affordance belongs in the headset, but the allowlist of what is prunable, the
dry-run, and the audit record belong server side where a hand-tracking misfire
cannot reach them.

## Open risks

**Staleness cannot tell a shut source from a dead one.** It is a ratio,
`(now - updatedAt) / threshold`, so the only lever is the threshold, and a
source that is legitimately silent for long stretches forces that threshold
wide. The market's is nearly four days, which means a feed dying on a Friday
evening is not flagged until midweek — the exact failure the state exists to
prevent, arrived at by honestly accommodating a source that is shut every night.
The fix is for staleness to consume a source-supplied "when should I next have
heard something" rather than a flat duration; the adapter is the only layer that
knows. It changes the contract for every source, which is why it is here and not
in a translator. This is the largest piece of unfinished design in the project.

**The sun is harder to reach from inside the greenhouse.** An orbit control aims
at its target, so the upper sky was never pointable; standing indoors did not
cause that but did remove the workaround of backing away until the sky came into
frame. Shift-drag is the stand-in and the gesture the whole concept rests on
deserves better: a look control that can pitch up without orbiting. The glass is
already clear of it — panes carry no pointer handlers, so R3F never raycasts
them.

Pruning shears firing a webhook means a hand gesture triggers a destructive
production action, and hand tracking misfires. Before that touches a real
backend it needs a dry-run mode, a confirmation affordance, and a server-side
allowlist of what is prunable at all. `Blight.remediable` is the seam.

Edges make pruning riskier, not safer. `reachableFrom` exists so the interaction
can show blast radius before the cut lands, and it should be wired into the
confirmation rather than added later.

Geospatial domains, meaning disasters and geopolitics, do not fit a bed layout,
because a garden discards the map. That wants a terrain environment mode, not a
change to the node type.

Completion has no vocabulary yet. Tasks and goals end, plants do not. Fruit and
deadwood are the obvious answer, worth deciding once the scene exists.

The geometry cache still needs an explicit bound. 51MB is affordable and
unbounded growth is not, so it wants an LRU keyed by node id and vitality bucket
before the scrub control ships.

Recording history means a collector that runs whether or not anyone is wearing
the headset, which is a layer the original diagram does not have. See below.

`TRUNK_RATIO` in `generate.ts` is 0.035 of height, which reads stout next to a
real tree. It is a stylistic knob, better tuned in the headset than on paper.
