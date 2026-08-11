# The garden builder — an end-user UI

A proposal, not a description of built state. It plans the one piece of the
"user-defined source" sequence that this repository can finish without a
network: **the UI a non-developer uses to point the garden at their own data.**
It is step 5 of the sequence in `docs/sources.md`, and this file argues it is
reachable now — not, as that file assumes, only after the backend of step 6.

Read `docs/sources.md` for the two-problems-in-one-sentence framing and the
declarative interpreter this builds on, `translation/declarative.ts` for the
`DeclarativeMapping` shape a form would produce, and `DESIGN.md` for the reading
language the UI must not let a user break. This file is the part those do not
carry: which half of the UI is buildable offline, what shape it takes, and the
one thing it exists to prevent.

---

## The reframe: the config UI is not blocked on the network

`docs/sources.md` and `HANDOFF.md` both bundle the config UI (step 5) with the
backend fetch (step 6) as two things "waiting on the same network." That is half
right, and the wrong half is the opening this document is about.

Two separable things wear one word, *connection*:

- **The fetch** — pulling a payload from an arbitrary third-party URL — genuinely
  needs a backend. A browser cannot fetch arbitrary hosts (CORS), secrets do not
  belong in a client, and pointing the app at a user-named host from the browser
  is a request-forgery surface. This is real and it stays deferred.

- **The mapping — authoring a `DeclarativeMapping` and seeing the garden it
  makes** — needs no network at all. `translation/declarative.ts` is built,
  runs in the browser, and is covered by 30 tests. Hand it a payload the user
  **pasted or uploaded** instead of one a backend fetched, and the entire "turn
  raw JSON into a garden" loop runs offline, today.

So the end-user UI is one of the few high-value items left that this environment
can actually complete. A live adapter, a real Prometheus socket, and the
unattended collector all need egress this container does not have. The builder
does not, because the interpreter it sits on already exists and the app is
synchronous by contract — a pasted snapshot is exactly the shape a generator
source already hands `read(now)`.

The seam this leans on is the same one Prometheus proved: `promSource` fetches
through a `fetchImpl` argument with a mock in that slot (`adapters/prometheus/
mock.ts`), and going live is swapping the mock for the platform `fetch`. The
builder is the general case of the mock: the user's pasted payload stands in for
the fetch, and the same swap — when a backend exists — turns an authored mapping
into a live one with nothing in the mapping changing.

---

## What it is

A panel in the app, next to the garden buttons in `App.tsx`, that walks a user
from a blob of JSON to a garden they can walk into. Four steps, in order,
because each one needs the last:

1. **Bring data.** Paste a sample payload, or upload a `.json` file. This is the
   thing a backend would eventually fetch on a cadence; here the user supplies
   one snapshot of it by hand. Nothing is fetched.

2. **Map it.** A form over `DeclarativeMapping`: where the array of records
   lives, which field is the label, which is the level, how the level scales
   onto vitality, and — the two the numbers cannot state — the scale's direction
   and the polarity. Optional: an activity field, a bed group-by, an emblem
   field, a completions block.

3. **See it.** A live preview runs `translateDeclarative` on the pasted payload
   as the form changes, and shows either the resulting garden — the same nodes
   the hand-written translators produce, rendered by the same scene — or the
   interpreter's own error, verbatim, with the offending path named.

4. **Keep it.** Add the mapping as a source for this session, so it becomes a
   garden button and behaves like every other garden: it greys on staleness, it
   collects, it scrubs. (Persistence and polling are later rungs — see "Scope".)

---

## The form is opinionated, and that is the whole point

The temptation is a generic JSON-path editor: pick any field, map it to any
axis, done. That would be the feature's failure, not its first cut. `DESIGN.md`
and the World garden are one long argument that the translator is **the only
place the mapping is decided**, and it decides two things the raw data does not
carry. The form's job is to make the user decide them *deliberately*, and to
make the safe path the easy one.

- **The scale is a comparison, not a quantity.** `vitality` is [0, 1], where 0
  is dying and 1 is thriving. A fundraising total of $2M is neither until the
  user says what the floor and ceiling are. The form must ask for a min and a
  max and refuse to guess them from the data's own range — because "scale to the
  spread of what is here" is exactly the naive ranking the World garden forbade,
  the one where a country wilts visibly *because* it is at war. `AxisScale`
  already carries direction in its shape (`min > max` means "lower is better"),
  so the form asks one plain question — "is a higher number healthier?" — and
  writes the scale accordingly. There is no default. A blank scale is an
  incomplete mapping, not a mapping with a sensible fallback.

- **Polarity is mandatory and uninferable.** Is growth good news? A short
  position, a weed, a rising failed-login count, the opposition's fundraising —
  all `suppress`, and a suppress plant grows as a weed so thriving reads as
  alarm. This is the one rule the entire environment model exists to hold, and
  no amount of looking at the numbers reveals it. The form makes it a required
  choice with the consequence spelled out in plain words next to each option, not
  a toggle with a default. `translation/declarative.ts` already types it as
  required with no default; the UI must not paper over that.

Everything else on the form is identity, not signal, and can carry a sensible
default: planting look (`orchard`), domain (`general`, the open fallback bucket —
see `docs/sources.md`, "Domain — opened"), emblem (initials of the label, via
`emblemFrom`). Trend is not on the form at all, because it is derived, never
supplied — the config names the level and the system computes the delta between
polls.

---

## The preview is the honesty check, and it comes for free

`translateDeclarative` already fails loudly: a level path that is not a finite
number throws with the path named, a records path that is not an array throws,
a completions path that is not an array throws. The preview surfaces those
verbatim — the error message *is* the validation. There is no second validation
layer to write and keep in sync with the interpreter, which is the point of
routing the preview through the real translator rather than a UI-side copy of its
rules.

When the mapping is complete and the payload parses, the preview renders a real
garden using the same scene the app already draws — which means the honesty test
the whole feature must pass is visible *before* the user commits: does a stranger
read the health right without being told the domain? A mapping that produces a
confident-looking wrong plant has failed, and the preview is where the user (and
a reviewer) can see it fail. This is why the preview is not optional polish; it
is the feature's safety mechanism.

One care: the preview must run the interpreter, not approximate it. If the
preview and the committed source ever disagree, the preview is worthless as a
check. Route both through `translateDeclarative` with the same mapping and the
same payload, and the thing the user approved is exactly the thing that ships
into `SOURCES`.

---

## How an authored mapping enters the app

A built mapping becomes a generator-style `LiveSource` over the pasted snapshot:

- `read(now)` calls `translateDeclarative(payload, mapping, { asOf: now,
  previous })`, threading the previous poll's scaled vitality so trend is a real
  delta on any later re-read.
- No `refresh`. A pasted snapshot has no next reading to fetch — that is the
  fetch half, deferred. So the source reads the one payload it was given; the
  garden greys into staleness honestly, because for a hand-pasted snapshot that
  *is* the truth: nothing is updating it.
- `pollable: false`, for the same reason. A generated source that is re-asked
  must extend, never slide (see `HANDOFF.md`, the decisions-most-likely-to-be-
  misread); a static snapshot has nothing to extend, so it is not polled.
- A `StaleSchedule` the form supplies as a plain duration — the degenerate
  schedule, exactly what the league uses — since a pasted snapshot carries no
  calendar to point `dueAfter` at.

`SOURCES` is a module constant today. The builder needs it to become a
registry the store can append to at runtime — a small, contained change:
`state/sources.ts` exposes an `addSource` that the store's composition point
already walks. Nothing downstream of the store learns that a source arrived at
runtime rather than at module load; the scene already renders whatever gardens
the node map contains.

---

## What is deferred, and to what

- **The live fetch.** Arbitrary third-party hosts need the backend proxy of
  `docs/sources.md` step 6. Until then the builder is paste/upload-only. This is
  the *only* part of the builder that the network blocks, and naming it precisely
  is half the value of this document.
- **Real polling.** Follows the fetch: a source with a `refresh` that pulls the
  next payload. The seam is Prometheus's `fetchImpl`; the builder's source is the
  generator shape until there is something to fetch.
- **Persistence across reloads.** Storing the *mapping* (not the data) so a
  user's garden survives a refresh is an easy, offline increment — see the scope
  ladder. Left out of the first cut only to keep it small.
- **Edges and the published-vs-described split.** The interpreter does not
  express these yet (named in `translation/declarative.ts`), so the form cannot
  either. A first-cut source skips edges and translates one snapshot as-of one
  moment, exactly as the interpreter does.

---

## Scope, as a ladder

Each rung is a shippable stop, and every rung is fully offline.

1. **Author + preview + session use.** Paste → form → live preview → add as a
   garden for this session. Mappings vanish on reload. This is the whole
   authoring loop and the honesty check; it is the recommended first cut.
2. **Persist the mapping.** Save the `DeclarativeMapping` (and its sample
   payload, or not — a design choice) to `localStorage`, keyed apart from the
   observation record, so an authored garden survives a reload. Store the
   mapping, never fabricated data — the same rule the collector holds.
3. **The mock-fetch poll seam.** Wire a saved mapping through a mock `fetchImpl`
   the way Prometheus does, so it "polls" and advances and greys on a real
   schedule — the closest a source gets to live without a backend, and the last
   rung before the fetch of step 6 simply swaps the mock out.

---

## Decisions to settle before building

- **Where the builder lives in the chrome.** `App.tsx` calls its own panel "a
  placeholder for walking somewhere else." The builder is more than a button; it
  is a form and a preview canvas. Does it open as a modal over the scene, a
  second panel, or a distinct route? The preview wants real estate the corner
  panel does not have.
- **Whether the sample payload is stored with the mapping.** Persisting it makes
  a reloaded garden show something without a re-fetch, but it stores someone
  else's data in the client — the third-party-terms trap `docs/sources.md`
  flags. Storing only the mapping keeps the client clean but leaves a persisted
  garden empty until it can fetch. This is a real fork, and it is the owner's.
- **How hard the form pushes back on a saturated axis.** "How to work on this"
  in `HANDOFF.md` is emphatic that a saturated axis is invisible — it looks
  exactly like a signal that is always on. The preview could print the
  distribution of each axis across the authored garden, so a user (or reviewer)
  can see a channel that is dead-flat before committing. Worth deciding whether
  that lives in the builder or stays a developer's discipline.

The test the whole feature has to pass is the one every source so far has passed,
and the builder must pass it *for a stranger's data the developer never saw*: a
person glancing at the garden reads health correctly without being told the
domain, and the app never asserts something it cannot show the evidence for. A
builder that lets a user produce a confident-looking wrong plant has failed that
test — and the preview is where it is meant to be caught.
