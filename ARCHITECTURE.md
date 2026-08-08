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
  translation/       Raw records to EcosystemNode and EcosystemEdge. The only
                     place domain knowledge and plant archetypes meet, and
                     where trend and polarity are decided.
    nfl.ts           The league as a garden: the four axes, injuries as
                     blights, division rivalries as grafts, history backfill.
    nfl.test.ts
  ecosystem/
    types.ts         Node, edge, and state contracts. Read by every layer.
    graph.ts         Pure helpers: garden filtering, adjacency, reachability,
                     edge validation, topology keys.
    graph.test.ts
    scrub.ts         What counts as a legal cursor: the window, the clamp, and
                     when a scrub lands back on live. Knows nothing about the
                     sky, so the store can use it without importing a renderer.
    scrub.test.ts
    planting.ts      What a bed is planted as: the PlantingType vocabulary and
                     each type's spatial arrangement. Self-contained, imports
                     nothing, so layout and the renderer share it cycle-free.
    planting.test.ts
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
  state/             Zustand store. Holds EcosystemState, nothing derived.
  scene/             R3F components. Owns InstancedMesh and the merged graft
                     geometry.
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
    planting.ts      The render half of the planting concept: which L-system
                     forms each PlantingType is drawn with.
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
docs/
```

Everything listed above without a "planned" note exists and is under test:
307 tests across sixteen files, `tsc --noEmit` clean, `vite build` succeeds.
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
Backfilling a week of hourly vitals is that function in a loop; because a club's
numbers only move when a game goes final or an injury is reported, the loop is
memoized on the count of each and collapses to two or three real computations
per club. The whole league — thirty-two clubs, 48 edges, 168 hourly samples each
— translates in about 25ms at module load.

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
6. Desktop browser is the first target. XR is not wired, but no HUD or control
   is head-locked and `src/xr/` exists to keep that honest.
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
