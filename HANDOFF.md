# Handoff

Where the project stands, what was decided and why, and what's worth doing next.
Written for whoever picks this up cold.

`README.md` says what it is, `ARCHITECTURE.md` has the contracts and the recorded
assumptions, and `DESIGN.md` has the reading language. This file covers what those
can't: the current state, and the judgement calls that are still open.

---

## State

Green. 988 tests across 62 files, plus two live tests (one Prometheus, one NFL)
that are skipped unless a server is reachable. `tsc --noEmit` and `vite build` are
clean, and CI runs all three on every push and pull request.

Nine gardens ship, and users can add their own at runtime with the garden builder
(`docs/garden-builder.md`): paste a JSON snapshot, map it, and it's saved next to
the built-in ones. Four of the built-in gardens are real, in the sense that they
come through the adapter → translation pipeline from feed-shaped records:

| garden | beds | plants | source |
| --- | --- | --- | --- |
| **NFL** | 8 divisions | 32 clubs | `adapters/nfl`: seeded season, **live via ESPN** behind the proxy |
| **Markets** | 8 sectors | 32 holdings | `adapters/market`: seeded tape |
| **World** | 22 UN subregions | 193 states | `adapters/world` + `adapters/news` |
| **Prometheus** | 3 jobs | 7 targets | `adapters/prometheus`: **mock fetch** |
| Infrastructure, Vault, Threats, Pipelines, Portfolio | 5 mock gardens | | `mock/`: drift tick |

All four real sources run with no outbound network. Three are generated. The
fourth, Prometheus, really *fetches*, but through a mock
(`adapters/prometheus/mock.ts`) that answers `/api/v1/query` in the exact wire
format a server uses, because this container has no outbound access. We checked
each host (`api.worldbank.org`, `feeds.bbci.co.uk`, `aljazeera.com` and
Prometheus's own demo all get a 403 at the proxy CONNECT) and the agent proxy
itself is healthy, so it's policy, not a broken setup.

Each source implements either a one-method interface (`NflSource`, `MarketSource`,
`WorldSource`, `NewsSource`) or the `LiveSource.read`/`refresh` fetch seam
(Prometheus), so a live feed drops in without anything downstream changing. Two of
the four have their live path actually *built*: Prometheus (behind a mock fetch)
and the NFL (behind the backend proxy, fetching from ESPN). **Running one of them
against a real server in a networked deploy is the most valuable thing left to
do.** See `docs/running-live.md`.

### Most recent session

- **The trend channel finally gets used: the plume.** `trend` was the one row in
  DESIGN.md's channel table with nothing drawing it. Every translator computed the
  axis, history stored it and the detail panel printed it, but the scene never
  showed it. A club on a three-game winning run and one on a three-game slide
  looked identical until you tapped the tag. Now a plant that's climbing sends warm
  amber specks *up* through its canopy, and one that's sliding sheds faded slate
  specks *down* to the soil (`scene/signal.ts`, `scene/Signal.tsx`).

  Four decisions in it that you shouldn't have to work out again:

  **It isn't fresh growth.** The table originally said "fresh growth or shedding",
  which would put the change into the plant's geometry. That uses the wilt channel
  twice, because shedding to bare twigs already means *this is in trouble*. The
  change lives in the air around the plant and the level lives in the plant, which
  is how a 4-9 club on a three-game run can read as low and rising at the same
  time.

  **A stale plant never plumes.** An old number has no direction. The same rule
  keeps the plume separate from the dust. Both are falling specks, and without the
  rule a plant could show both and mean two things. With it, a falling speck on a
  coloured, swaying plant means *going down*, and on a grey, still one it means
  *nobody has heard from this*.

  **Amber and slate, not green and red.** Direction carries the meaning and colour
  just repeats it. This pairing survives every common kind of colour blindness,
  which is the rule the rest of the palette follows too.

  **The threshold was measured, and measuring it found a problem.** Run against the
  real pipelines at a fixed clock, the three sources disagree badly about what a
  unit of trend means. The league spreads across the whole range, the market book
  never reaches half of it, and more than half the world's countries sit pinned at
  the top. 0.15 is the threshold that leaves every garden with some plants moving
  and some not. The disagreement is a *translation* problem and is now recorded as
  one in DESIGN.md: **trend never got the calibration pass vitality got**, and the
  World garden shows it, because almost everything there plumes.

  One mechanical detail that's easy to get wrong: the plume's specks are rescaled
  by the garden's world scale every frame. A `pointsMaterial` sizes in world units
  and doesn't notice when the garden shrinks onto the table, and without this the
  World garden's miniature vanished behind its own plumes. The same applies to
  `Dust` and `Motes`, which were left alone. They're sparse enough to get away with
  it for now, but it's an inconsistency, not a decision.

### The session before

- **A graphics fidelity pass: rungs 1 to 3 of `docs/graphics.md` are built.** It
  was judged in the league garden in a real browser, which earlier sessions
  couldn't do. Playwright turned out to be installed globally in this container,
  so we took screenshots before and after instead of arguing on paper. Five pieces:
  - **Branch taper** (`scene/taper.ts`): an instanced vertex shader that
    interpolates each branch's cross-section between its two radii, tilts the
    side normals to match, and scales the bark texture to the branch's real size.
    It fixed both compromises `Branches.tsx` had been waiting on.
  - **Leaf blades** (`scene/leaf.ts`): the squashed octahedron is replaced by an
    outline with a shoulder and a point, a fold along the midrib and a curl at the
    tip, in eleven vertices instead of six.
  - **Ground scatter** (`scene/scatter.ts`): grass outside the glass, and stones
    and leaf litter on the path.
  - **Ambient occlusion** (`scene/ao.ts`), written by hand against the depth
    buffer.
  - **A subtle bloom**, and **one post-processing chain** (`scene/Post.tsx`) that
    owns every full-screen pass, with the tilt-shift folded in.

  All of it sits on a **quality tier** (`scene/quality.ts`). It's desktop-first:
  the expensive passes drop out and the chain unmounts as soon as a WebXR session
  starts.

  Three lessons are written up at the end of `docs/graphics.md`. **A custom vertex
  shader breaks anything that re-renders the scene's depth**: any effect that
  re-renders through `scene.overrideMaterial` (including three's `SSAOPass` and
  `GTAOPass`) draws branches as untapered cylinders. That's why the AO is
  hand-written, and it limits what can be dropped in later. **three's passes don't
  agree about where their output goes**: `UnrealBloomPass` sets
  `needsSwap = false` and blends into the *read* buffer, so a hand-built chain has
  to check where each stage put its result. And **bloom with too low a threshold is
  a colour grade**: the main buffer is linear, so a threshold below one catches the
  sky and lifts the black point across the whole frame, taking contrast out of the
  wilting versus thriving reading.

  **Not measured:** frame time on a headset or on any real GPU. This container
  renders through SwiftShader at about 900ms a frame, which measures CPU fill rate
  and doesn't carry over to hardware. The step-down is built and its logic is
  tested, but the budget it protects hasn't been measured. That's the first thing
  to do with a headset.

- **A design problem worth its own look: a bare tree is the bleakest sick state,
  and the league spends a lot of the season in it.** `DESIGN.md` already notes this
  for the infrastructure garden ("a bare tree is the bleakest possible sick-state
  and the one closest to the grey of staleness"), and the fix there was plantings.
  The league has the same problem for a different reason. Early in a season most
  clubs are near .500 and several are below it, so half the beds look like dead
  sticks while the garden is working exactly as designed. Nothing in the graphics
  pass changed that, and nothing should have. It's a question about how vitality
  maps onto the shape of a season, not about rendering, so it's noted here instead
  of being acted on.

### Two sessions back

- **The NFL garden goes live with a real season from ESPN.** The first real source
  is now the first whose live path reaches an actual feed. `liveNflSource`
  (`adapters/nfl/live.ts`) fetches through `adapters/nfl/espn.ts` (ESPN's public,
  keyless API) and fills the same `NflSeasonSnapshot` the seeded generator does:
  scores from the scoreboard, full box scores from each game summary, age and
  experience from the roster, and designations from the injury report. Nothing
  below the adapter changed. `derive.ts` still turns box scores into standings, and
  `translation/nfl.ts` is still the only place football meets a plant. That's what
  the synthetic source was standing in for all along.

  It uses the Prometheus seam: `read` translates the held snapshot synchronously,
  `refresh` is the async fetch, and it **accumulates** (a final box score never
  changes, so a mid-season refresh fetches only the new week's finals). The proxy
  is a sibling of the Prometheus one with a **path allowlist** instead of a query
  allowlist (`backend/nflProxy.ts`, `netlify/functions/nfl-proxy.ts`, routed at
  `/api/proxy/nfl`). The client sends a `sourceId` and one of four allowed ESPN
  paths, never a host. One variable turns it on, `VITE_NFL_PROXY_URL`, just like
  `VITE_PROM_PROXY_URL`. Without it, the garden stays on the seeded season with no
  outbound traffic.

  The one approximation is who counts as a starter. ESPN's roster is a player
  list, not a depth chart, so maturity's per-player age and experience are fully
  real but the eleven "starters" are picked by experience. That shifts the starter
  averages a little and never the league table, and a depth-chart endpoint would
  fix it. Everything is tested offline against captured ESPN responses
  (`espn.fixtures.ts`, `espn.test.ts`, `live.test.ts`, `backend/nflProxy.test.ts`).
  The one step the tests can't run here is the real network call, and
  `nfl.live.test.ts` is waiting for it (skipped unless `NFL_LIVE_URL` is set).
  Written up in `docs/nfl-live.md`. The unattended collector loop doesn't cover it
  yet. The proxy keeps the garden live while a tab is open, and for a weekly feed
  with a seven-day staleness window that's nearly enough.

### Three sessions back

- **Prometheus is in `SOURCES`, behind a mock fetch.** The source the whole idea
  was built for is a working garden in the app, with no network. `promSource`
  goes into `SOURCES` with its `fetchImpl` pointed at `mockPromFetch`
  (`adapters/prometheus/mock.ts`), a `FetchLike` that answers `/api/v1/query` from
  a synthetic seven-target fleet in the exact wire format a real server uses:
  values as strings, timestamps in seconds, labels under `metric`. So
  `fetchPromSnapshot` parses it, `translatePromSnapshot` maps it, and nothing in
  the path can tell it didn't come from a real server. Going live means swapping
  that one `fetchImpl` argument.

  Three changes made it fit the synchronous app. The source is **primed
  synchronously** (`adopt(syntheticPromSnapshot())`), so the garden is populated on
  the first `read` with no empty-then-full flicker. `LiveSource` gained an optional
  **`refresh`** that the beat fires without awaiting. It's the mock standing in for
  the backend collector loop: a fetch that fails just doesn't advance, and the
  garden greys from staleness. And `promStaleSchedule` makes a target **due one
  scrape interval after its last sample** instead of on every beat, which is both
  realistic and what keeps polling cheap.

  The fleet moves (latencies drift, so trend is real) and one replica is held
  **down** (`up{} == 0`, with its last sample frozen in the past). The garden shows
  the thing only Prometheus reports about itself: one target greying out with a
  critical blight while its neighbours stay fresh. It wasn't checked in a real
  browser at the time, because Playwright wasn't a dependency and adding it for one
  screenshot wasn't worth it. The test suite is the proof: compose lands the garden
  with history and a schedule, the fleet translates cleanly, the down replica greys,
  and a refresh changes what `read` returns.

- **The garden builder's offline groundwork.** Two of the three things
  `docs/sources.md` listed as blocking user-defined sources were cleared.

  **`Domain` is open.** It was a closed enum of seven, and the worry was that it
  drove materials, so a new domain would have no look. The code said otherwise.
  Nothing picks materials by `domain` (a plant's look comes from `plantingType`
  and its archetype, chosen in translation), and the only thing that reads it is
  the HUD, which shows it as text. It's now `KnownDomain | (string & {})`, with
  `'general'` as the named fallback, and a user source can name its own with
  nothing downstream to update (`ecosystem/types.ts`, `isKnownDomain`).

  **The declarative interpreter is built.** `translation/declarative.ts` turns a
  mapping over plain JSON (records path, dotted field paths, the axis scale,
  required polarity, an optional activity field, group-by for beds, provenance)
  into the same flat nodes the hand-written translators produce. It generalizes
  what `prometheus.ts` did for one wire format. The three hand-written translators
  define the expected behaviour, and what it can't express yet (edges, and the
  World garden's published-versus-described dates) is noted in the file. It *does*
  support **completion**: an optional `completions` block (an array path plus
  `atPath`, `outcomePath`, `labelPath` and a `doneWhen` set) maps a record's
  finished work onto the node's `completions`. A config-driven CI feed or to-do
  list gets fruit and deadwood without a developer, which is safe as config because
  a completion is an event the source *states*, not a comparison someone has to
  invent. Two shared pieces it needed, `scale`/`AxisScale` and the container
  roll-up, were moved out of `prometheus.ts` into `ecosystem/scale.ts` and
  `ecosystem/rollup.ts`, since they were never Prometheus-specific. Prometheus
  re-exports `scale` and `AxisScale` so nothing downstream moved. 30 tests,
  including league-shaped and market-shaped mappings as reference cases and a
  pipeline-shaped one for completion.

- **The geometry cache evicts the least recently used entry.** It held 600 entries
  and evicted the oldest *inserted*, which is the same thing until something
  churns. A season scrub walks every plant through maturity buckets nobody needs
  again, and each one pushed out whatever went in first, often the plant right in
  front of you, which then rebuilt next frame and got evicted again. Same size
  limit, different 600. The policy is `lsystem/lru.ts`, and it's tested twice, once
  on its own and once against the real cache, because the bug was in the wiring,
  not the data structure.

- **The collector survives a second tab.** Found by writing the scenario down:
  one storage key, two tabs, each with its own copy, and the last to write silently
  discarded everything the other had seen since it loaded. Writes now merge with
  what's stored before replacing it, with a `savedAt` and length check so a single
  tab never pays for the decode.

- **What a write costs, measured.** At the budget it's about 21ms of synchronous
  main-thread time. Two changes came out of that. Values are now rounded when
  they're observed instead of when they're encoded, which drops encoding from
  14.8ms to 9.7ms and makes the in-memory record byte-identical to the stored one.
  And the write interval is now the measured cost of the last write times a duty
  cycle, with a floor of thirty seconds, so the cadence adapts to the hardware. The
  first measurement taken was 118ms, and it was a cold sample. That's worth knowing,
  because it nearly justified a much bigger change.

### Four sessions back

- **The first graphics pass.** The first step up the ladder in `docs/graphics.md`,
  all of it channel-safe (nothing added competes with the health reading). Leaves
  let light through, so a backlit canopy glows and fades at dusk
  (`scene/translucency.ts`). The bonsai table got a tilt-shift depth of field that
  makes the miniature look like a model (now `scene/tiltshift.ts` in the
  `scene/Post.tsx` chain, using three's own compositor with no new dependency,
  table mode only). Bark, turf, soil and all timber got **normal and roughness
  maps** built from the same achromatic height field as their colour
  (`normalTexture` and `roughnessTexture` in `textures.ts`), so the sun catches
  their relief. Leaves and metal props were left unmapped on purpose, because the
  cost outweighs the gain. The decision recorded alongside: **XR stays a target**,
  so the tighter frame budget governs and heavy always-on post-processing stays out
  of the room view.

- **The bonsai table, a second grain of space.** History has two grains of time,
  and now the garden has two grains of space: standing on the path, and the whole
  garden as a miniature seen from above and outside (`t`, or the overview button).
  It solves traversal. The World garden's 35 × 46 metres can be taken in at a
  glance instead of walked.

  Three decisions to know before touching it. **It shrinks the garden instead of
  pulling the camera back.** The scene uses exponential fog (`fogExp2`, 0.02), so
  framing a big garden at full scale would put the camera eighty metres away where
  the fog has swallowed it. Bonsai scale keeps the model close and in clear air.
  The maths is in `scene/bonsai.ts`, pure and tested, built on the `size` field
  `layout.ts` reserved for it from the start. **The overview has no text, and that
  came for free.** The zoom limit is held just past the label fade radius
  (`TABLE_MIN_DISTANCE = LABEL_FAR + 0.6`), so the existing distance rule keeps
  every tag hidden, and the tag components aren't rendered on the table at all.
  **The switch is a flight, not a cut** (`scene/fly.ts`). Each control picks up the
  camera where the other left it and eases to its own pose, so the room and the
  table read as the same garden. On the table the camera *orbits*, which `look.ts`
  argues against in the room but which fits here, where the whole garden is the
  object you're examining. It shows one garden at a time. Several on one table would
  be cross-garden comparison in disguise, so that's left out.

- **The World as a third source.** It was built deliberately unlike the first two,
  not as a third copy of them: 193 UN members, twenty-two uneven beds (2 to 18),
  indicators that get revised, and events derived from news instead of generated.

  Four things it settled, all written up in `DESIGN.md` and `ARCHITECTURE.md`:
  **"as of" is split in two** (what was published versus the period it describes,
  so a scrub shows what was *known*); **a layer under translation** (`extract.ts`,
  the first code here that makes judgements instead of calculations, and the first
  that has to keep its evidence); **conflict is a blight, never a vitality term**;
  and **size is maturity**, which is where "a big country should be a big plant"
  belongs without using up a channel.

  Two things to be careful with. The provenance rules matter.
  `UnrestEvent.article` is a required field so an event can't exist without the
  sentence behind it, and the "simulated" marker on blights is derived from
  `provenance.live`, so a live adapter drops it automatically. And which countries
  are shown in conflict is chosen by a hash on purpose, because hand-picking would
  mean this repo taking a position on which real places are at war, in invented
  data.

  **The hash is a settled decision, not a placeholder.** It was raised for review
  and kept on purpose. A realistic-looking conflict map reads like reporting, and
  the design wants the data obviously synthetic with only its *shape* realistic.
  Don't "improve" it into something that looks real without reopening the decision
  with the owner first.

- **Tag textures are built when you approach, not when you enter.** They used to
  be drawn for every plant when a garden opened: about 95MB of textures for the
  World's 193 plants, when at most a dozen are ever inside the 9m fade radius.
  `Tags.tsx` now builds a card when its plant first comes into range, at most three
  per frame, and the fade covers the frame or two before a texture arrives. It's
  recorded because the original guess was wrong in a useful way. Drawing the
  canvases was never the cost (all 193 took 135ms). Holding and uploading them was.
  So the fix was to build fewer, not to build faster.

- **The market's activity axis was dead.** Found by printing all four axes for
  all three gardens, not just the one being worked on. The market's `activity` sat
  at exactly 1.00 for 31 of 32 holdings, and had since the garden existed. The tape
  emitted a session's hourly bars *and* its daily bar at the same `closeAt`, so
  `volumeRatioAt` compared a day against a window of hours (about 5.7 where a
  normal day is 1, on a curve that saturates at 3). Fixed in the generator, since
  no real feed prints two bars for one symbol at the same instant. The lesson is in
  "How to work on this" below: a saturated axis is invisible, because it looks
  exactly like a signal that's always on.

### Earlier

- **The collector.** History used to be backfilled when the module loaded and
  thrown away on reload, so the archive tier could hold twenty weeks and held
  twenty weeks of fiction regenerated on the spot. `state/persist.ts` holds the
  record and its rules, `state/collector.ts` is the loop, and the store restores
  on compose and records on commit and tick. Checked in the browser both ways: a
  day 85 back that the league can't reach came from the record, and a day it does
  cover was left alone even when the record disagreed. The limit is stated, not
  engineered around: it collects while a tab is open and not otherwise, and the
  format is the one a server-side collector would want. See ARCHITECTURE.md,
  "Collection".
- **A false risk removed.** "The geometry cache still needs an explicit bound" had
  been on the risk list for a long time and wasn't true. It had been capped at 600
  entries since before scrubbing shipped. The remaining piece, the eviction policy,
  became the LRU change above.
- **Schedule-aware staleness**, the biggest open design problem at the time.
  `staleness` now takes a `StaleSchedule` (a due time supplied by the source, plus
  a grace period that only starts once something is owed) instead of a flat
  duration. On the same tape, a vendor dying mid-session is flagged in 3.2 hours
  instead of 95.7. A bare number is still a valid policy, as the simplest kind of
  schedule, and the league deliberately stays on one. Details below and in
  ARCHITECTURE.md.
- **Polling**, which the staleness change made necessary. Both sources used to
  take one snapshot and never another, and sharper staleness correctly declared
  the market garden dead after about three hours, because it was. `state/sources.ts`
  now re-reads a source when its own `dueAfter` says a reading is owed, using the
  same question twice. Most of the work was making the tape safe to ask twice, and
  that turned up a hidden determinism bug: the price walk's random generator was
  consumed inside the bar-emission branch, so which bars got printed changed the
  prices.
- **The timeline strip**, for the one thing the sun can't tell you. When you
  dragged the sun back, there was no way to know whether the record ran out in an
  hour or in four months, and at the edge the cursor just stopped with no
  explanation. `ecosystem/timeline.ts` and `Timeline.tsx` show the extent, the
  point where hours become days, and where you are. It's deliberately a provenance
  display, not the scrub bar `SunScrub` argues against. The sun keeps the gesture.
- **Standing instead of orbiting.** An orbit camera aims at its target, so the
  upper sky was never in frame and the sun (the time control) couldn't be pointed
  at for most of the day. `StandControl` fixes the eye in place and moves the aim.
  Drag to look, scroll to walk, look straight up. Checked end to end at midsummer
  noon with the sun 78° up: look up, grab it through the roof, and time scrubs.
- **Two false claims corrected**, both found by reading the code, not by a test.
  One open-work item said the inspection panel didn't exist, when `Detail.tsx` had
  been doing the whole job (vitals, both sparklines, blights, the flattened `raw`
  payload) for a while. And three places still justified the panel being anchored
  in the world "because `src/xr/` exists", which the #9 audit had found false and
  removed from one place but not the others. The reasoning was sound but the
  premise was made up. It now rests on assumption 6.
- **#9**, an audit of the docs against the code. Five claims were false, including
  a `src/xr/` directory that never existed and a sample count that was off by
  4,000. It also added CI, because the repository had none and every "the tests
  pass" in its history was someone reporting in good faith.
- **#8**, the greenhouse, with the viewer standing *inside* it instead of sixteen
  metres out in the field looking at a building.
- **#10**, the market as a second real source, chosen because it disagrees with
  the first.

---

## The decisions most likely to be misread

Any of these is easy to undo by accident, so each one says what breaks.

**Vitality doesn't carry a sign for long or short, and polarity does the
interpreting.** `translation/market.ts` reports how far an instrument has moved
since entry, *not* whether that's good for you. `signalHealth` inverts it for
shorts. If you sign it by side in the translator, polarity inverts it back, and a
short looks healthy exactly while it's losing money. The garden looks right and
means the opposite. There's a test named for this.

**The staleness schedule is computed, not chosen, and its two halves aren't
interchangeable.** `dueAfter` comes from the exchange calendar (`session.ts`,
`nextBarClose`) and can be days away at no cost. `graceMs` is two bars and is
tight on purpose. Collapse them back into one duration, or point `dueAfter` at
"last update plus a bit", and you're back to a ratio that can't tell a closed
exchange from a dead vendor, which is exactly what this replaced.

**The league uses a flat duration on purpose.** A schedule would clear a bye, and
the two clubs on a bye each week are the only thing that makes the stale state
reachable in that garden. Its feed also has no fixture list to point `dueAfter`
at. Giving it a schedule "for consistency" would silently remove a documented
behaviour and a state you can currently see.

**A generated source that gets polled must extend its data, never slide it.**
`syntheticMarketSource` fixes its origin day and halt time on the first
`snapshot()` and reuses them. If either is measured back from `now` again (which is
what `tradingDaysBack(now, SESSIONS)` used to do), asking twice re-prices the whole
record behind you, and the history already recorded disagrees with the source it
came from. A related one that's just as easy to undo: bar volume is keyed on the
bar's close time instead of drawn from the walk's random generator, because drawing
it inside the emission branch made the price path depend on which bars were
printed. There are tests for both.

**The restore fills silence and never overwrites a source.** `recordIfAbsent` only
writes into slots a freshly built buffer left empty. Swap it for `record` "so the
newest reading wins" and the app starts preferring its own old observation over
the source's current account of the same day, which is the one thing a source is
the authority on. The test is named for it, and it was checked in a real browser
both ways.

**Deciding what counts as having reported is the caller's job, not the
collector's.** `observe` writes everything it's given, and the store gives it
exactly what `commit` committed and what the mock tick drifted. Move that decision
into the collector as a freshness heuristic and the silent plant starts being
recorded every hour as reporting the same number. That's the app inventing a feed
that has died, which is the failure the staleness work exists to prevent. The
market gets this for free from the schedule: `poll` only commits when a bar is
genuinely due, so a weekend leaves no trace instead of a flat line.

**The record stores observations, not the buffers.** Persisting `state.history`
would store each source's own account back to itself, at about a megabyte, and
gain nothing, since a backfill fills every slot it covers. The value is only in the
slots it doesn't.

**Shedding spends the hourly tier entirely before the daily one.** A live feed can
usually still tell you about last week, but past its window the daily tier is the
only place those days exist. Even out the eviction "for fairness" and the budget
starts eating the part you can't replace first.

**Every write merges before it replaces.** One key, several tabs, each with its
own copy. Drop the merge and the last tab to write silently discards what the
others saw. The `savedAt` and length check that skips the merge is only an
optimisation for a single tab. If the format ever moves `savedAt` out of the
header, `peekSavedAt` stops finding it and every write quietly starts paying for a
full decode.

**The write interval is derived, not chosen.** It's the measured cost of the last
write times `WRITE_DUTY`. Pin it back to a constant and it's right on the machine
it was measured on and wrong on anything slower, which was the original bug with a
number that happened to be fine here.

**The size estimate is deliberately generous.** `recordBytes` assumes values use
all four decimal places, so real data, which is full of values that round shorter,
comes in under it. Tune the constants to real data and the estimate goes *under*
the truth as soon as a garden stops rounding short, which is how a budget quietly
stops being one.

**Beds are raised by lowering the floor.** Plants sit at `y = 0`, and grafts, dust
and sway all measure from there. Raising the soil would force every one of those to
know about bed height. That's why `FLOOR_Y` is negative.

**Glass has no pointer handlers.** R3F only raycasts objects that have them,
which is why the sun and moon can be grabbed through the roof. Add a hover handler
to a pane and you break the time scrub.

**The framing effect depends on the viewpoint's values, not the object.** `view`
is rebuilt from the node map, so a new object with identical numbers arrives on
every telemetry tick. The old orbit camera tolerated that by accident, because its
`update()` recomputed the camera from its own spherical state, so setting the
position again did nothing. `StandControl` holds the position *as* its state, so
keying on the object resets your view every two seconds and you can't keep looking
up. The old `Framing` comment warned about exactly this and the old code did it
anyway.

**An axis endpoint is the worst case that can really happen, not the arithmetic
minimum.** Half a league is below .500 by definition. Mapping that straight onto
vitality put half the garden into wilt, and wilt means *in trouble*, not
*mid-table*.

**Unrecorded history stays unwritten.** Both backfills skip the slots before their
data starts instead of filling them with a plausible number. A flat line of
plausible numbers can't be told apart from real data.

---

## Open work

### Run a live path against a real server

Everything for this is built: the Prometheus and NFL proxies, the collector loop,
and the Netlify wrappers (`docs/backend.md`, `docs/deploy-netlify.md`,
`docs/running-live.md`). What's missing is a deploy with network access. Set
`VITE_NFL_PROXY_URL` (or `VITE_PROM_PROXY_URL` plus the `PROM_*` variables) on a
networked deploy, and the skipped live tests will confirm the whole path.

### Keep collecting while no tab is open

Everything a page can do about this is done. The record survives a reload and
several tabs at once, and costs about 21ms of main-thread time at its biggest.
What no page can do is collect while no page is open, and that was the point of
the original architecture note. A closed tab records nothing, so a browser-side
record has holes across exactly the nights and weekends you'd most want to look at.

The server side of this now exists: `backend/collectorLoop.ts` runs the same loop
and writes the same `ObservedRecord`, and `netlify/functions/collect-scheduled.ts`
runs it every minute and stores the record in Netlify Blobs. Two things remain.
It has never run against a live source, and it only covers Prometheus. Extending
it to the NFL (and to user-built gardens once they can fetch) is the next step.

Note that the `localStorage`-over-IndexedDB decision is only right while the write
has to survive `pagehide`. In a worker there's no teardown to race, and the choice
flips.

If a server isn't an option, there's a smaller step: a service worker with
periodic background sync. It's Chromium-only, needs an installed PWA, and is
granted at the browser's discretion, so it would add to the current path, not
replace it. It would also need IndexedDB, since a service worker can't reach
`localStorage` at all. Only worth doing if the alternative is nothing.

---

## Enhancements worth considering

Roughly in order of value for effort, with the reasoning.

**Live adapters behind the remaining interfaces.** Every seam was built for this:
implement `MarketSource`, `WorldSource` or `NewsSource` against a real feed and
nothing below changes. Prometheus and the NFL are already built up to the network
call, so these are the ones still waiting for a live adapter.

`NewsSource` is the one to do first if you get network access, and not because
it's easiest. It's the only source whose generated half is *text about real
places*, so it carries caveats the others don't, and it's the only one where going
live makes the app more honest and not just more accurate. Two things to settle
before it ships: the outlets' terms on storing their text, and whether the keyword
classifier holds up on real copy. It was tuned on generated headlines, which is a
much easier problem than a real wire.

**Calibrate `trend` the way `vitality` is calibrated.** Small, cheap, and now
visible. The plume made the axis matter and immediately showed that the three real
sources don't agree on what a unit of trend means. At a fixed clock, the league
spreads across the whole range, the market book bunches under half of it, and more
than half the world's countries are pinned at the top, so the World garden plumes
almost everywhere while the market barely does. Vitality got this pass twice (the
league's "average isn't half dead" and the World's growth-rate rescale). Trend
never did. The rule to apply is already written down: an axis endpoint is the worst
case that can really happen, not the arithmetic edge. Each translator's `trendOf`
is one line, and `scene/signal.ts` has the numbers to check against.

**Finish the garden builder.** The offline half ships (`docs/garden-builder.md`).
Next is adding the completion fields to the form, then a mock-fetch poll seam, and
finally a real fetch through the backend proxy once arbitrary hosts can be
registered.

**The bonsai table, next steps.** The switch between views is a flight between
two fixed poses. It can't be triggered in XR yet (no controller or gaze gesture is
bound to it), and the table doesn't tilt to meet a real surface in passthrough.
Both follow naturally once the XR path opens. Also, the time scrub still lives on
the sun, which is often out of frame on the table. The keyboard and the timeline
still work, but a sun you can't see is a gesture you can't reach, so a scrub that
works from the table view is worth some thought. Three constraints any work here
has to keep:

- **It changes distance, not the reading.** The plant on the table is the same
  plant, smaller. The table mustn't add a second visual language (a pin, a heat
  tint, a badge) that repeats what the plant already says, because that spends the
  channel budget twice.
- **Tags stay hidden.** At table distance you're far from every plant, so the fade
  radius (`labels.ts`) keeps every label hidden. That's correct: an overview has no
  text, just like the room view. The zoom limit is held just past `LABEL_FAR` so
  this holds at every zoom level, and the tag components aren't rendered on the
  table at all.
- **One garden at a time.** Several gardens on one table is the obvious next idea,
  and it's the cross-garden comparison problem below in disguise.

**A fourth kind of source, for shapes not yet tested.** The current sources are
all numeric and all fed by a publisher. Still untested: *personal knowledge or
notes*, a graph with real link structure where "maturity" means something entirely
different. It would test whether the model survives a domain with no numbers in it.
The World garden's land borders are the closest thing to real topology so far, but
they're static. (CI pipelines, the other gap that used to be listed here, is now
covered by the mock Pipelines garden and the completion vocabulary, see
`docs/completion.md`.)

**Cross-garden comparison.** Only one garden is shown at a time, which stops green
meaning two things at once, and that's right. But "how's the AFC West doing
against the NFC North?" and "how are my energy holdings doing against my tech?" are
the questions people actually ask, and neither can be answered right now. This
needs design before code, because the constraint it runs into is deliberate.

**The rest of the graphics ladder.** Rungs 4 (authored assets) and 5 (the expensive
desktop tier) in `docs/graphics.md`. Rung 4 comes with a deformation cost for
anything whose shape carries meaning, and rung 5 assumes XR is dropped, which it
isn't.

**Sound.** `Blight` and `Vitals` both have fields whose comments mention spatial
audio, and there isn't any. Peripheral awareness is exactly where sound earns its
place, since you notice a change without looking, and it's the one channel the
reading budget hasn't used.

**Weather.** The horizon is lit by the same rig as the garden and fogged by the
same fog, so it already follows the day and season scrub. Rain on the glass is a
small amount of work for a lot of atmosphere, and it carries no signal, which is
what makes it affordable. See "what is decoration" in `DESIGN.md` for the rules it
would have to follow.

**Already done, so don't go looking:** the completion vocabulary
(`docs/completion.md`), traversal (the bonsai table), and building tag textures
lazily. On that last one, be careful assuming its neighbours are CPU-bound, because
it wasn't (all 193 canvases draw in 135ms). Measure before believing a stall is
where it looks.

---

## How to work on this

- `npm install && npm run dev` runs it. Vite's hot reload often serves stale code
  on this project. Hard-reload, and if that doesn't help, `rm -rf node_modules/.vite`.
- `npm test`, `npm run typecheck` and `npm run build` all run in CI.
- **Measure before judging a source.** Every calibration fault found so far was
  invisible in a screenshot and obvious in a distribution: the market's two, the
  world's trend axis, and the one below. Compare a new source's spread against an
  existing garden's before deciding it looks wrong, and print the distribution of
  *every* axis, not just the one you're working on. The market's dead activity
  channel was found by measuring the World's, three columns over.
- **Print all four axes, not only the one you changed.** The market's `activity`
  sat at exactly 1.00 for thirty-one of thirty-two holdings for as long as the
  garden existed, so the animation-rate channel carried no information at all.
  Nothing looked wrong. Every plant just moved, and a plant that moves looks
  healthy. The cause was upstream of the axis (the tape printing hourly and daily
  bars at the same `closeAt`, described above). A saturated axis is the hardest
  failure to see, because it looks exactly like a signal that's always on.
- **Look at the actual app.** Chromium and Playwright are available
  (`executablePath: '/opt/pw-browsers/chromium'`, and don't run `playwright
  install`). A screenshot caught the camera being outside the greenhouse when no
  test would have.
- **Docs drift, and CI only partly catches it.** CI checks the code, not the prose
  about it. The five false claims in #9 were all prose. The numbers most likely to
  go stale are the ones tied to constants: `DEFAULT_ARCHIVE_CAPACITY`,
  `WEEKS_PLAYED` and `SESSIONS`. `src/docs.drift.test.ts` covers a first set of
  them. It reads the docs, computes each expected number from the code (an
  exported constant, or a count from running the real adapter → translation
  pipeline), and asserts the doc quotes it, so a constant that changes fails the
  doc that still has the old number. It covers those three constants (via
  `throughWeek`, and the market's session count taken from distinct daily bars),
  the two history tier sizes, and the three gardens' bed and plant counts. It
  deliberately doesn't check the machine-specific numbers in the performance tables
  (ms, MB, fps), which are honest measurements of one machine and expected to vary.
  The NFL backfill count (85) could be derived too, but it was left out because it
  needs the backfill to run instead of a constant read. Widen the test as more
  constant-tied numbers get mentioned. **If you edit the docs, run it**, because it
  depends on phrasings like "8 divisions" and "140 slots".
