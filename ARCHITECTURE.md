# Spatial Ecosystem: layout and contracts

## Directory layout

```
src/
  adapters/          Planned, not yet created. Input sources, one folder per
                     source, each returning raw domain records. Nothing here
                     will know what a plant is.
  translation/       Planned, not yet created. Raw records to EcosystemNode and
                     EcosystemEdge. The only place domain knowledge and plant
                     archetypes will meet, and where trend and polarity are
                     decided.
  ecosystem/
    types.ts         Node, edge, and state contracts. Read by every layer.
    graph.ts         Pure helpers: garden filtering, adjacency, reachability,
                     edge validation, topology keys.
    graph.test.ts
  lsystem/           Pure procedural geometry. No React, no three.js.
    types.ts         Vec3, Grammar, TurtleParams, PlantGeometry.
    random.ts        Seeded PRNG so a node id always grows the same plant.
    grammar.ts       String rewriting with a symbol budget guard.
    turtle.ts        Symbols to flat typed arrays, written in one pass.
    presets.ts       Grammar archetypes: broadleaf, shrub, spire.
    generate.ts      Public entry. Maps vitality and growthScale to geometry.
    generate.test.ts
  hooks/
    useLSystem.ts    Memoized React wrapper. The only React import in the
                     generation path.
  state/             Zustand store. Holds EcosystemState, nothing derived.
  scene/             R3F components. Owns InstancedMesh and the merged graft
                     geometry.
  xr/                Planned, not yet created. Session setup, hand rays, and
                     world-anchored HUDs will live here. Named now so nothing
                     gets built in a way that blocks it.
  mock/
    mockEcosystemData.ts  Four gardens, edges, and a drift tick.
docs/
```

Everything listed above without a "planned" note exists and is under test:
49 tests across four files, `tsc --noEmit` clean, `vite build` succeeds.
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

## Time and history

State is a snapshot of now plus a ring buffer of vitals per node, keyed by
absolute hour so gaps stay explicit rather than silently shifting older samples
forward. The scene must read vitals through `vitalsAt(node, history, cursor)`
rather than off the node. That single indirection is why scrubbing, comparison,
and playback are changes to one function instead of changes to every component
that touches a plant.

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
