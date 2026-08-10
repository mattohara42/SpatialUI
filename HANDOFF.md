# Handoff

Where the project stands, what was decided and why, and what is worth doing
next. Written for whoever picks this up cold.

Read `README.md` for what it is, `ARCHITECTURE.md` for the contracts and the
recorded assumptions, `DESIGN.md` for the reading language. This file is the
part those three cannot carry: the state of play, and the judgement calls that
are still open.

---

## State

Green. 613 tests across 31 files, `tsc --noEmit` clean, `vite build` clean, and
CI runs all three on every push and every pull request.

Six gardens. Two are real, in the sense that they come through the
adapter → translation pipeline from feed-shaped records:

| garden | beds | plants | source |
| --- | --- | --- | --- |
| **NFL** | 8 divisions | 32 clubs | `adapters/nfl` — seeded season |
| **Markets** | 8 sectors | 32 holdings | `adapters/market` — seeded tape |
| Infrastructure, Vault, Threats, Portfolio | 4 mock gardens | | `mock/` — drift tick |

Both real sources are generated rather than fetched. This container has no
outbound network access to a sports API or a market data vendor — verified, and
the agent proxy itself is healthy, so it is policy and not a broken setup. Each
implements a one-method interface (`NflSource`, `MarketSource`) that a live
feed can be dropped into with nothing downstream changing. That swap is the
single highest-value thing an environment with network access could do.

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

- **The collector**, which was the item at the top of that list. History was
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
  policy — is the first item above.

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

**A live adapter behind either interface.** The highest-value single change, and
the cheapest, because the seam was built for it: implement `NflSource` or
`MarketSource` against a real feed and nothing below changes. It also converts
every "seeded fiction" caveat in the docs into a real claim. Needs network
access this environment does not have.

**A third source, deliberately unlike both.** The two current ones are both
32 things in 8 groups with numeric axes, which is starting to look like a mould
rather than a coincidence. Something with a genuinely different shape would test
the model harder than a third instance of the same one:

- *Personal knowledge / notes* — a graph with real link topology rather than
  synthetic grafts, and where "maturity" means something entirely different.
  Tests whether the model survives a domain with no numbers in it.
- *CI pipelines* — where things genuinely complete, which the vocabulary has no
  word for. Recorded as an open risk: tasks end, plants do not.
- *Prometheus* — the archetype the whole idea was built for. Deliberately not
  chosen twice now, because the mock gardens already cover infrastructure and it
  needs a live server to be interesting. Worth doing the moment there is one.

**Completion vocabulary.** Plants do not finish; tasks, goals, builds, and
harvests do. Fruit and deadwood are the obvious candidates and `Produce.tsx`
already draws fruit for other reasons. This is the gap that blocks a whole
class of sources.

**Cross-garden comparison.** One garden is live at a time, which is what stops
green meaning two things at once, and that is right. But "how is the AFC West
doing against the NFC North" and "how are my energy holdings against my tech"
are the questions people actually ask, and neither is currently answerable. This
needs design before code — the constraint it bumps into is deliberate.

**A second grain of *space*, not just time.** History has hourly and daily. The
garden has one scale: you walk in and see everything. A bonsai or tabletop view
of a whole garden, or of several, is hinted at in `layout.ts` (`size` is
described as being for "Bonsai mode scaling") and does not exist.

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
- **Measure before judging a source.** Both calibration faults in the market
  adapter were invisible in a screenshot and obvious in a distribution. Compare
  a new source's vitality spread against an existing garden's before deciding it
  looks wrong.
- **Look at the actual app.** Chromium and Playwright are available
  (`executablePath: '/opt/pw-browsers/chromium'`, do not run `playwright
  install`). A screenshot caught the camera being outside the greenhouse; no
  test would have.
- **Docs drift, and it is not automatically caught.** CI verifies the code, not
  the prose about it. The five false claims in #9 were all of the second kind.
  The counts most likely to go stale are the ones tied to constants —
  `DEFAULT_ARCHIVE_CAPACITY`, `WEEKS_PLAYED`, `SESSIONS` — and asserting a few
  of them in a test would hold the docs to the same standard as the code. Not
  done.
