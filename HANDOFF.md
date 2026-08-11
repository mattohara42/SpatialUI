# Handoff

Where the project stands, what was decided and why, and what is worth doing
next. Written for whoever picks this up cold.

Read `README.md` for what it is, `ARCHITECTURE.md` for the contracts and the
recorded assumptions, `DESIGN.md` for the reading language. This file is the
part those three cannot carry: the state of play, and the judgement calls that
are still open.

---

## State

Green. 772 tests across 44 files (plus one live Prometheus test that skips
unless a server is reachable), `tsc --noEmit` clean, `vite build` clean, and
CI runs all three on every push and every pull request.

Seven gardens. Three are real, in the sense that they come through the
adapter → translation pipeline from feed-shaped records:

| garden | beds | plants | source |
| --- | --- | --- | --- |
| **NFL** | 8 divisions | 32 clubs | `adapters/nfl` — seeded season |
| **Markets** | 8 sectors | 32 holdings | `adapters/market` — seeded tape |
| **World** | 22 UN subregions | 193 states | `adapters/world` + `adapters/news` |
| Infrastructure, Vault, Threats, Portfolio | 4 mock gardens | | `mock/` — drift tick |

All three real sources are generated rather than fetched. This container has no
outbound access to a sports API, a market data vendor, the World Bank, or a news
wire — verified per host (`api.worldbank.org`, `feeds.bbci.co.uk`,
`aljazeera.com` all answer 403 at the proxy CONNECT), and the agent proxy itself
is healthy, so it is policy and not a broken setup. Each implements a
one-method interface (`NflSource`, `MarketSource`, `WorldSource`, `NewsSource`)
that a live feed can be dropped into with nothing downstream changing. That swap
is the single highest-value thing an environment with network access could do.

### What shipped in the most recent session

- **The geometry cache evicts by last use.** It held 600 entries and threw out
  the oldest *inserted*, which is the same thing until something churns: a season
  scrub walks every plant through maturity buckets nobody wants again, and each
  one pushed out whatever went in first — a plant in front of you, which rebuilt
  next frame and was evicted again. Same bound, different 600. The policy is
  `lsystem/lru.ts` and it is tested twice, once in isolation and once against the
  real cache, because the bug was in the wiring rather than in a data structure.
- **The collector survives a second tab.** Found by writing the scenario down:
  one key, two tabs, each with its own copy, and the last to write discarded
  everything the other had seen since it loaded. Silently. Writes now merge what
  is stored before replacing it, with a `savedAt`-and-length check so the
  single-tab case never pays for the decode.
- **What a write costs, measured rather than assumed.** At the budget it is about
  21ms of synchronous main thread. Two changes came out of that: values are
  rounded when observed rather than when encoded, which drops the encode from
  14.8ms to 9.7ms and makes the in-memory record byte-identical to the stored
  one; and the write interval is now the measured cost of the last write times a
  duty cycle, floored at thirty seconds, so the cadence tunes itself to the
  hardware. The first figure taken for all this was 118ms and it was a cold
  sample — worth knowing, because it was nearly the justification for a much
  larger change.

### What shipped in the session before

- **The first graphics fidelity pass.** The plain look was always a choice, not a
  ceiling, and this is the first climb up the ladder in `docs/graphics.md`, all of
  it channel-safe (nothing added competes with the health read). Leaves now
  transmit light, so a backlit canopy glows and fades at dusk
  (`scene/translucency.ts`); the bonsai table wears a tilt-shift depth of field
  that makes the miniature read as a model (`scene/TiltShift.tsx`, three's own
  compositor, no new dependency, table-mode only); and bark, turf, soil and all
  timber carry **normal and roughness maps** derived from the same achromatic
  height field as their albedo (`normalTexture`/`roughnessTexture` in
  `textures.ts`), so the sun catches relief and highlights break up instead of
  sliding over a painted plane. The material pass is complete; leaves and metal
  props were left unmapped on purpose (they spend more than they return). The
  settled decision recorded alongside: **XR stays a target**, so the constrained
  frame budget governs and heavy always-on post stays off the room view.

- **The bonsai table — the second grain of space**, which was the chosen next
  piece of work. History has two grains of time; the garden now has two grains of
  space, the body on the path and the whole garden as a miniature looked down at
  from outside (`t`, or the overview button). It answers traversal: the world
  garden's 35 × 46 metres are takeable at a glance instead of by scrolling a path.

  Three decisions worth knowing before you touch it. **It shrinks, it does not fly
  the camera back** — the scene is lit through exponential fog (`fogExp2`, 0.02),
  so framing a big garden at true scale would put the camera eighty metres out
  where the fog has eaten it; bonsai scale keeps the model near and in clear air.
  The math is `scene/bonsai.ts`, pure and tested, hung on the `size` field
  `layout.ts` reserved for it from the start. **The overview has no text, for
  free** — the near zoom clamp is held just beyond the label fade radius
  (`TABLE_MIN_DISTANCE = LABEL_FAR + 0.6`), so the existing distance rule keeps
  every tag absent with nothing special-cased on; the components are simply not
  rendered on the table. **The switch is a flight, not a cut** (`scene/fly.ts`):
  both controls capture the camera where the other left it and ease to their pose,
  so the room and the table read as the same garden. On the table the camera
  *orbits*, which `look.ts` argued against for the room and which is right here,
  where the whole garden is the object being examined. v1 is one garden on the
  table; several is cross-garden comparison in disguise and stays out.

- **The world as a third source**, which was the item at the top of this list,
  and it was taken deliberately unlike the other two rather than as a third
  instance of them. 193 UN members, twenty-two uneven beds (2 to 18), indicators
  that get revised, and events derived from news rather than generated.

  Four things it settled, all written up in `DESIGN.md` and `ARCHITECTURE.md`:
  **as-of split in two** (what was published versus what it describes, so a
  scrub shows what was *known*); **a layer under translation** (`extract.ts`,
  the first code here that judges rather than calculates, and the first that has
  to keep its evidence); **conflict is a blight, never a vitality term**; and
  **size is maturity**, which is where "a big country should be a big plant"
  belongs without spending a channel.

  Two things to be careful with if you touch it. The provenance rules are
  load-bearing rather than decorative — `UnrestEvent.article` is a required
  field so an event cannot exist without the sentence behind it, and the
  simulated marker on blights derives from `provenance.live` so a live adapter
  drops it by being live. And which countries are shown in conflict is chosen by
  a hash on purpose; hand-picking would mean this repo taking a position on
  which real places are at war, in invented data.

  **The hash is a settled decision, not a placeholder.** It was raised for
  review and kept deliberately: a plausible-looking conflict map reads as
  reporting, and the whole design wants the data obviously synthetic and only
  its *shape* realistic. Do not "improve" it into something that looks real
  without reopening that decision with the owner first.

- **Tag textures build on approach, not on entry.** They were drawn for every
  plant when a garden opened — about 95MB of texture for the world's 193, for
  labels of which a dozen at most are ever inside the 9m fade radius. `Tags.tsx`
  now builds a card when its plant first comes within range, metered to three a
  frame, and the smoothstep fade covers the frame or two before a texture lands.
  Recorded because the prediction behind it was wrong in a useful way: drawing
  the canvases was never the cost (all 193 in 135ms), holding and uploading them
  was — so the fix was to build fewer, not faster.

- **The market's activity axis was dead, and is not mine.** Found by printing
  all four axes for all three gardens rather than only the one under work: the
  market's `activity` sat at exactly 1.00 for 31 of 32 holdings and had since
  that garden existed. The tape emitted a session's hourly bars *and* its daily
  bar at the same `closeAt`, so `volumeRatioAt` measured a day against a window
  of hours (~5.7 where an ordinary day is 1, against a curve that saturates at
  3). Fixed in the generator, since no real feed prints two bars for one symbol
  at one instant. The lesson is in "How to work on this" below: a saturated axis
  is invisible, because it looks exactly like a signal that is always on.

### And the session before that

- **The collector**, which was the item at the top of this list. History was
  backfilled at module load and thrown away on reload, so the archive tier could
  hold twenty weeks and held twenty weeks of fiction regenerated on the spot.
  `state/persist.ts` is the record and the rules, `state/collector.ts` is the
  loop, and the store restores at compose and notes at commit and tick. Verified
  in the browser both ways: a day 85 back that the league cannot reach came from
  the record; a day it does cover was untouched by a record claiming otherwise.
  The limit is stated rather than engineered away — it collects while a tab is
  open and not while one is not — and the format is the one a server-side
  collector would want. See ARCHITECTURE.md, "Collection".
- **A false risk retired.** "The geometry cache still needs an explicit bound"
  had been in the risk list a long time and was not true: it had been capped at
  600 entries since before the scrub shipped. What was left of it — the eviction
  policy — shipped as the geometry cache's LRU eviction, in the most recent
  session above.

### Earlier

- **Session-aware staleness**, which was the item at the top of that list and the
  largest open piece of design. `staleness` now takes a `StaleSchedule` — a
  source-supplied due time plus a grace that only runs once something is owed —
  instead of a flat duration. Measured on the same tape, a vendor dying inside a
  session is flagged in 3.2 hours rather than 95.7. A bare number is still a legal
  policy and is the degenerate schedule, which is what the league stays on, on
  purpose. Details below and in ARCHITECTURE.md.
- **The poll**, which that change made necessary rather than merely nice. Both
  sources snapshotted once and never again; sharpened staleness correctly called
  the market garden dead about three hours in, because it was. `state/sources.ts`
  now re-reads a source when its own `dueAfter` says a reading is owed — the same
  question, used twice. Making the tape safe to ask twice was most of the work,
  and found a latent determinism bug: the price walk's rng was consumed inside the
  bar-emission branch, so what got printed changed the prices.
- **The timeline strip**, which is the one thing the sun cannot say. Dragging the
  sun back, there was no way to know whether the record ran out in an hour or in
  four months, and at the edge the cursor simply stopped with no explanation.
  `ecosystem/timeline.ts` plus `Timeline.tsx` draw the extent, the point where
  hours become days, and where you are standing in it. Deliberately a provenance
  display and not the scrub bar `SunScrub` argues against: the sun keeps the
  gesture.
- **Standing instead of orbiting.** The last open interaction problem: an orbit
  aims at its target, so the upper sky was never in frame and the sun — which is
  the time control — could not be pointed at for most of the day. `StandControl`
  fixes the eye and moves the aim instead. Drag to look, scroll to walk, pitch to
  the zenith. Verified end to end at midsummer noon, sun 78° up: look up, grab it
  through the roof, time scrubs.
- **Two false claims corrected**, both found by checking the code rather than by
  a test. Open work item 2 said the inspection panel did not exist; `Detail.tsx`
  has been doing the whole job — vitals, both sparklines, blights, the flattened
  `raw` payload — for some time. And three sites still justified the panel being
  world-anchored "because `src/xr/` exists", which is the very claim the #9 audit
  found false and removed from one place but not the rest. The reasoning was
  sound and the premise invented; the reasoning now stands on assumption 6.
- **#9** — an audit of the docs against the code. Five claims were false,
  including a `src/xr/` that never existed and a sample count that was out by
  4,000. Then the CI that would have caught them, because the repository had
  none and every "the tests pass" in its history was a person reporting
  honestly.
- **#8** — the greenhouse, and the viewer standing *inside* it rather than
  sixteen metres out in the field looking at a building.
- **#10** — the market as a second real source, chosen because it disagrees
  with the first.

---

## The decisions most likely to be misread

Undoing any of these by accident is easy, so each says what breaks.

**Vitality is unsigned by side, and polarity does the interpreting.**
`translation/market.ts` reports how far an instrument has moved since entry —
*not* whether that is good for you. `signalHealth` inverts it for shorts. Sign
it by side in the translator and polarity inverts it back, so a short reads
healthy exactly while it loses money. The garden looks right and means the
opposite. There is a test named for this.

**The staleness schedule is computed, not chosen, and its two halves are not
interchangeable.** `dueAfter` comes from the exchange calendar (`session.ts`,
`nextBarClose`) and may be days out at no cost; `graceMs` is two bars and is
tight on purpose. Collapse them back into one duration — or point `dueAfter` at
"last update plus a bit" — and you are back to a ratio that cannot tell a shut
exchange from a dead vendor, which is the whole thing this replaced.

**The league is on a flat duration deliberately, not by omission.** A schedule
would clear a bye, and the two clubs a week on byes are the only thing that makes
the staleness state reachable in that garden. Its feed also carries no fixture
list to point `dueAfter` at. Giving it a schedule "for consistency" would silently
delete a documented behaviour and a demonstrable state.

**A generated source that gets polled must extend, never slide.**
`syntheticMarketSource` fixes its origin day and its halt time on the first
`snapshot()` and reuses them. Measure either back from `now` again — which is
what `tradingDaysBack(now, SESSIONS)` did — and asking twice re-prices the whole
record behind you, so the history already recorded disagrees with the source it
came from. Related and just as easy to undo: bar volume is keyed on the bar's
close time rather than drawn from the walk's rng, because drawing it inside the
emission branch made the price path depend on which bars happened to be printed.
There are tests for both.

**The restore fills silence and never overwrites a source.** `recordIfAbsent`
writes only into slots a freshly built buffer left empty. Swap it for `record`
"so the newest reading wins" and the app starts preferring its own old
observation over the source's current account of the same day, which is the one
thing a source is authoritative about. The test is named for it, and it was
checked in a real browser both ways round.

**What counts as having reported is the caller's call, not the collector's.**
`observe` writes everything it is handed, and the store hands it exactly what
`commit` committed and exactly what the mock tick drifted. Move that decision
down into the collector as a freshness heuristic and the silent plant starts
being recorded hourly as reporting the same number — the app inventing a feed
that has died, which is the failure the staleness work exists to prevent. Note
that the market gets this for free from the schedule: `poll` only commits when a
bar is genuinely due, so a weekend leaves no trace rather than a flat line.

**The record stores observations, not the buffers.** Persisting
`state.history` would be storing each source's own account back to itself, at
about a megabyte, and buy nothing — a backfill fills every slot it covers. The
value is only in the slots it does not.

**Shedding spends the hourly tier before the daily one, entirely.** A live feed
can usually still be asked about last week; past its window, the daily tier is
the only place those days exist. Even out the eviction "for fairness" and the
budget starts eating the irreplaceable half first.

**Every write merges before it replaces.** One key, several tabs, each with its
own copy — drop the merge and the last tab to write silently discards what the
others saw. The `savedAt`-and-length check that skips the merge is an
optimisation for the single-tab case and nothing more; if the format ever moves
`savedAt` out of the header, `peekSavedAt` stops finding it and every write
quietly starts paying for a full decode.

**The write interval is derived, not chosen.** It is the measured cost of the
last write times `WRITE_DUTY`. Pin it back to a constant and it is right on the
hardware it was measured on and wrong on everything slower — which was the
original bug, just with a number that happened to be fine here.

**The size estimate is deliberately generous.** `recordBytes` is sized for
values that use all four decimals, so real data — full of values that round
short — comes in under it. Tune the constants to real data and the estimate goes
*under* the truth the moment a garden stops rounding short, which is how a budget
quietly stops being one.

**Beds are raised by lowering the floor.** Plants sit at `y = 0` and grafts,
dust, and sway all measure from there. Raising the soil would force every one of
those to learn a bed height. `FLOOR_Y` is negative for this reason.

**Glass carries no pointer handlers.** R3F only raycasts objects that have them,
which is why the sun and moon are grabbable through the roof. Add a hover
handler to a pane and you break the time scrub.

**The framing effect is keyed on the viewpoint's values, not the object.**
`view` is rebuilt from the node map, so a new object with identical numbers
arrives on every telemetry tick. The orbit tolerated that by accident — its
`update()` recomputed the camera from its own spherical state, so re-setting the
position did nothing — but `StandControl` holds the position *as* its state, and
keying on the object resets your view every two seconds. Looking up becomes
impossible to hold. The old `Framing` comment warned about exactly this and the
old code did it anyway.

**An axis endpoint is the worst case that can really occur, not the arithmetic
floor.** Half a league is below .500 by construction; mapping that straight onto
vitality put half the garden into wilt, and wilt means *in trouble*, not
*mid-table*.

**Unrecorded history is left unwritten.** Both backfills skip slots before their
data starts rather than filling them with a plausible number. A flat line of
plausible numbers is indistinguishable from data.

---

## Open work

The list this file has carried since it was written is now empty, and what
replaces it is one item that code in this repository cannot finish.

### Move the collector somewhere a tab is not required

Everything a page can do about this is done: the record survives a reload,
survives several tabs at once, and costs about 21ms of main thread at its
largest. What no page can do is collect while no page is open, and that is the
half the original architecture note was actually about. A tab that is shut
records nothing, so a client-side record has holes exactly across the nights and
weekends you would most want to inspect.

The next real step is a process — the same loop, the same `ObservedRecord` on
the wire, reading through `LiveSource` and writing somewhere that is not
`localStorage`. That is a deployment question rather than a coding one, and it
is the point at which "the archive holds a season" stops depending on somebody
leaving a tab open. Two things are already shaped for it: `ObservedRecord` is a
wire format and not a browser structure, and `LiveSource` is the read side a
collector would want. The one thing that would change inside this repo is
storage — and note that the `localStorage`-over-IndexedDB decision is only
correct while the write has to survive `pagehide`. In a worker there is no
teardown to race, and the choice reverses.

A smaller intermediate step, if a server is not on the table: a service worker
with periodic background sync. It is Chromium-only, needs an installed PWA, and
is granted at the browser's discretion, so it would be an addition to the
current path rather than a replacement for it — and it would want IndexedDB,
since a service worker cannot reach `localStorage` at all. Worth doing only if
the alternative is nothing.

---

## Enhancements worth considering

Roughly in order of value for effort, with the reason rather than just the idea.

### Built: the bonsai table

This was the chosen next piece of work, and it shipped — see "what shipped in the
most recent session" above for the summary, `scene/bonsai.ts` and `scene/fly.ts`
for the code, and the three constraints below for what any future work on it must
keep. It is left here rather than deleted because the constraints outlive the
building of it.

- **It is a change of *distance*, not of reading.** The tabletop plant is the
  same plant, smaller. Health still reads through droop, colour, and density —
  the tabletop must not earn a second visual language (a pin, a heat tint, a
  badge) that says the same thing the plant already says. That would spend the
  channel budget twice. v1 holds this: nothing is added on the table that the
  plant does not already say.
- **Tags stay gone, and for free.** At tabletop distance you are far from every
  plant, so the fade radius (`labels.ts`) keeps every label absent — which is
  correct: a whole-world overview has no text in it, exactly as the room view
  does not. The near zoom clamp is held just past `LABEL_FAR` so this stays true
  at every distance a zoom can reach, and the label components are not rendered on
  the table at all — the rule is honoured, never special-cased back on.
- **One garden at a time, still.** Showing several gardens on one table is the
  obvious next thought and it is the *cross-garden comparison* constraint below
  in disguise — green means two different things across two gardens, which is the
  one rule the whole environment model exists to hold. v1 is one garden on the
  table. Several is a separate design with a real problem to solve first.

**Where it could go next.** The transition is a flight between two fixed poses;
it is not yet reachable in XR (no controller or gaze gesture bound to it), and
the table does not yet tilt to meet a real surface in passthrough. Both are the
natural continuation once the XR path opens. And the season/time scrub still
lives on the sun, which on the table is often out of frame — the keyboard and the
timeline still scrub, but a sun you cannot see is a gesture you cannot reach, so
a scrub that works from the table view is worth a thought.

### The rest, roughly by value for effort

**A live adapter behind any of the four interfaces.** The highest-value single
change, and the cheapest, because every seam was built for it: implement
`NflSource`, `MarketSource`, `WorldSource`, or `NewsSource` against a real feed
and nothing below changes. It also converts every "seeded fiction" caveat in the
docs into a real claim. Needs network access this environment does not have.

**User-defined data sources** — letting an end user point the garden at their own
feed (FIFA, Prometheus, political fundraising) rather than a developer writing a
translator. Written up in `docs/sources.md`: the seam that already exists
(`LiveSource`, the poll/staleness unification, the server-shaped observation
record), and the two halves the sentence hides — developer extensibility, which
is nearly there, and non-developer runtime configuration, which is the real work.
The crux is turning the translator from *code* into a *declarative mapping*,
because it decides things the raw data does not carry: the four axes as
comparisons in [0, 1], and above all polarity, the one rule the whole
environment model exists to hold. Prometheus is the archetype and the right first
source; `Domain` being a closed enum and the completion-vocabulary gap are the
two things to fix before the general case. Needs the same network — and, for a
real connection past the browser's CORS wall, a backend.

`NewsSource` is the one to do first if you get network, and not because it is
the easiest. It is the only source whose generated half is *text about real
places*, so it carries caveats the other two do not need, and it is the only one
where going live improves the honesty of the app rather than only its accuracy.
Two things to settle before it ships: the outlets' terms on storing their text,
and whether the keyword classifier is good enough on real copy — it was tuned
against generated headlines, which is a much easier problem than a real wire.

**Traversal** was answered by the bonsai table above — the tabletop view is how
you take a whole garden in without walking it, so the two were one piece of work.

Note what is *not* on this list any more: tag textures. They were built for
every plant on entering a garden — about 95MB for 193 — and are now built when a
plant first comes within the fade radius, a few per frame. If you are hunting
for the next cheap win, do not re-find that one; and be careful about assuming
its neighbours are CPU-bound, because that one was not (all 193 canvases draw in
135ms). Measure before believing a stall is where it looks.

**A fourth source, for the shapes still untested.** The three present ones are
all numeric and all publisher-fed. What is still unexercised:

- *Personal knowledge / notes* — a graph with real link topology and where
  "maturity" means something entirely different. Tests whether the model
  survives a domain with no numbers in it. The world garden's land borders are
  the closest thing to real topology so far, but they are static.
- *CI pipelines* — where things genuinely complete, which the vocabulary has no
  word for. Recorded as an open risk: tasks end, plants do not.
- *Prometheus* — the archetype the whole idea was built for. Deliberately not
  chosen three times now, because the mock gardens already cover infrastructure
  and it needs a live server to be interesting. Worth doing the moment there is
  one.

**Completion vocabulary.** Plants do not finish; tasks, goals, builds, and
harvests do. Fruit and deadwood are the obvious candidates and `Produce.tsx`
already draws fruit for other reasons. This is the gap that blocks a whole
class of sources — and it is now **planned in detail in `docs/completion.md`**:
completion modelled as an *event* on the Blight pattern (a discrete terminal
outcome carried as-of a timestamp, not a fifth health level), read as fruit for
success and deadwood for failure, exercised first by a self-contained mock
pipelines garden. The open decisions the owner should settle before code are
listed there.

**Cross-garden comparison.** One garden is live at a time, which is what stops
green meaning two things at once, and that is right. But "how is the AFC West
doing against the NFC North" and "how are my energy holdings against my tech"
are the questions people actually ask, and neither is currently answerable. This
needs design before code — the constraint it bumps into is deliberate.

**A second grain of *space*** was "the bonsai table" above — now built, so it has
left this list.

**A graphics fidelity pass.** The plain look is a choice, not a ceiling: the same
renderer can look far better with no change of engine, and the biggest jump —
leaf translucency, PBR maps, a tilt-shift depth of field on the bonsai table — is
a materials-and-post pass that touches none of the health reads. Written up in
`docs/graphics.md`, including where Blender fits (authoring assets, not a
runtime), why Unreal is a different product rather than a next step, and the one
fork that caps everything: whether XR stays a target. The channel budget is the
constraint it all turns on — decoration is only affordable while it means nothing.

**Sound.** `Blight` and `Vitals` both carry fields whose comments mention
spatial audio, and there is none. Peripheral awareness is exactly the case where
sound earns its place — you notice a change without looking — and it is the one
channel the reading budget has not spent.

**Weather.** The horizon is lit by the same rig as the garden and fogged by the
same fog, so it already tracks the day and season scrub for free. Rain on the
glass is a small amount of work for a large amount of place, and it carries no
signal, which is what makes it affordable. See "what is decoration" in
`DESIGN.md` for the rules it would have to obey.

---

## How to work on this

- `npm install && npm run dev` runs it. Vite HMR on this project often serves
  stale code; hard-reload, and if that fails `rm -rf node_modules/.vite`.
- `npm test`, `npm run typecheck`, `npm run build` — all three run in CI, so
  there is no value in guessing whether they pass.
- **Measure before judging a source.** Every calibration fault found so far was
  invisible in a screenshot and obvious in a distribution — the market's two, the
  world's trend axis, and the one below. Compare a new source's spread against an
  existing garden's before deciding it looks wrong, and print the distribution of
  *every* axis rather than the one you are working on: the market's dead activity
  channel was found by measuring the world's, three columns over.

- **Print all four axes, not the one you changed.** The market's `activity` sat
  at exactly 1.00 for thirty-one of thirty-two holdings for as long as that
  garden has existed, meaning the animation-rate channel carried no information
  at all. Nothing looked wrong: every plant simply moved, and a plant that moves
  looks healthy. The cause was upstream of the axis — the tape emitted a
  session's hourly bars *and* its daily bar at the same `closeAt`, so
  `volumeRatioAt` compared a day against a window of hours and read 5.7 where an
  ordinary day reads 1. A saturated axis is the hardest failure to see, because
  it looks exactly like a signal that is always on.
- **Look at the actual app.** Chromium and Playwright are available
  (`executablePath: '/opt/pw-browsers/chromium'`, do not run `playwright
  install`). A screenshot caught the camera being outside the greenhouse; no
  test would have.
- **Docs drift, and it is not automatically caught.** CI verifies the code, not
  the prose about it. The five false claims in #9 were all of the second kind.
  The counts most likely to go stale are the ones tied to constants —
  `DEFAULT_ARCHIVE_CAPACITY`, `WEEKS_PLAYED`, `SESSIONS`. `src/docs.drift.test.ts`
  now holds a first slice of them to the code's standard: it reads the docs,
  computes each expected number from the code — an exported constant, or a count
  taken by running the real adapter → translation pipeline — and asserts the doc
  quotes it, so a constant that moves fails the doc that still carries the old
  number. It covers the three named constants (via `throughWeek`, and the market's
  session count derived from distinct daily bars), the two history-tier sizes, and
  the three gardens' bed/plant counts. Deliberately *not* asserted: the
  machine-specific numbers in the performance tables (ms, MB, fps), which are
  honest one-machine measurements and are meant to vary. What is left is to widen
  the net as more constant-tied numbers earn a mention — the NFL backfill count
  (85) is derivable but was left out because it needs the backfill run rather than
  a constant read.
