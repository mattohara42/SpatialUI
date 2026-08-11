# The garden builder — an end-user UI

**Built, the offline half.** This began as a proposal for the one piece of the
"user-defined source" sequence that this repository could finish without a
network — **the UI a non-developer uses to point the garden at their own data** —
and that half now ships. It is step 5 of the sequence in `docs/sources.md`, and
the file's argument held: the config UI was reachable now, not (as that file
assumed) only after the backend of step 6. What remains deferred is only the
*fetch*, which genuinely needs the backend.

Read `docs/sources.md` for the two-problems-in-one-sentence framing and the
declarative interpreter this builds on, `translation/declarative.ts` for the
`DeclarativeMapping` shape the form produces, and `DESIGN.md` for the reading
language the UI must not let a user break. This file is the part those do not
carry: which half of the UI is buildable offline, what shape it takes, and the
one thing it exists to prevent.

---

## What shipped

The builder is a modal, opened from a quiet `+ garden` at the end of the garden
row and — for editing — a `configure` button that appears **only while standing
in a garden the user built**. That placement is the whole posture: a garden is
configured once, occasionally tweaked, and otherwise never seen, because the
mapping persists and the garden is just another button. The config is not daily
chrome.

- **`src/GardenBuilder.tsx`** — the form and the live preview, side by side. The
  form is opinionated on purpose (see below); the preview runs the *real*
  interpreter (`previewMapping`), so what it shows is exactly what will ship, and
  the interpreter's own path-named errors are the validation.
- **`src/state/userSources.ts`** — the pure core: `userSourceFromConfig` builds a
  generated-shaped `LiveSource` over the pasted snapshot (no `refresh`,
  `pollable: false`, a plain-duration stale policy), `previewMapping` translates
  and summarizes, and `loadUserConfigs`/`saveUserConfigs` persist the mapping —
  never fabricated data — under `spatialui.gardens.v1`, apart from the observation
  record. 14 tests.
- **`src/state/ecosystemStore.ts`** — `composeEcosystem` folds persisted user
  gardens in beside the built-in sources, defensively (a stored mapping that no
  longer translates is skipped, not fatal); `addUserGarden`/`removeUserGarden`
  fold and purge at runtime, an edit purging the old garden's nodes before the new
  ones land.

Deferred, and only this: the **live fetch** (arbitrary hosts need the backend
proxy of `docs/sources.md` step 6) and, following it, real polling. A user garden
today is one hand-pasted snapshot that greys into staleness honestly, because
nothing is updating it. The `completions` block the interpreter supports is not
in the form yet — the next increment.

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

A built mapping becomes a generator-style `LiveSource` over the pasted snapshot
(`userSourceFromConfig`):

- `read(now)` calls `translateDeclarative(payload, mapping, { asOf: now })`. No
  `previous` is threaded, so trend is 0 — which is the honest answer for one
  static snapshot: nothing has moved since there is no earlier reading to have
  moved from. Trend becomes real only once a fetch supplies a second one.
- No `refresh`. A pasted snapshot has no next reading to fetch — that is the
  fetch half, deferred. So the source reads the one payload it was given; the
  garden greys into staleness honestly, because for a hand-pasted snapshot that
  *is* the truth: nothing is updating it.
- `pollable: false`, for the same reason. A generated source that is re-asked
  must extend, never slide (see `HANDOFF.md`, the decisions-most-likely-to-be-
  misread); a static snapshot has nothing to extend, so it is not polled.
- A `StaleSchedule` as a plain duration — the degenerate schedule, exactly what
  the league uses — since a pasted snapshot carries no calendar to point
  `dueAfter` at. The form offers a small set (1h / 6h / 1d), defaulting to six.

Rather than mutate the `SOURCES` constant, the store folds user gardens in from
`localStorage`: `composeEcosystem` reads `loadUserConfigs()` and lays each one's
nodes over the built-ins at startup, and `addUserGarden`/`removeUserGarden` do
the same fold (and, for a garden already present, a purge first) at runtime.
Nothing downstream of the store learns a source arrived from a form rather than
at module load; the scene renders whatever gardens the node map contains.

---

## What is deferred, and to what

- **The live fetch.** Arbitrary third-party hosts need the backend proxy of
  `docs/sources.md` step 6. Until then the builder is paste/upload-only. This is
  the *only* part of the builder that the network blocks, and naming it precisely
  is half the value of this document.
- **Real polling.** Follows the fetch: a source with a `refresh` that pulls the
  next payload. The seam is Prometheus's `fetchImpl`; the builder's source is the
  generator shape until there is something to fetch.
- **The completion verb.** The interpreter maps a `completions` block, but the
  form does not offer it yet. A source shaped around finishing (a CI feed, a
  to-do list) can be authored the moment the form grows those fields.
- **Edges and the published-vs-described split.** The interpreter does not
  express these yet (named in `translation/declarative.ts`), so the form cannot
  either. A first-cut source skips edges and translates one snapshot as-of one
  moment, exactly as the interpreter does.

---

## Scope, as a ladder

Each rung is a shippable stop, and every rung is fully offline. The first two
shipped together; the third waits on nothing but its own worth.

1. ~~**Author + preview + session use.**~~ **Done.** Paste → form → live preview →
   add as a garden. The whole authoring loop and the honesty check.
2. ~~**Persist the mapping.**~~ **Done.** The `DeclarativeMapping` and its sample
   payload persist to `localStorage` under `spatialui.gardens.v1`, apart from the
   observation record, so an authored garden survives a reload and the builder
   need not be reopened — configure once. The mapping and the one pasted snapshot
   are stored; no fabricated data, the same rule the collector holds.
3. **The mock-fetch poll seam.** Wire a saved mapping through a mock `fetchImpl`
   the way Prometheus does, so it "polls" and advances and greys on a real
   schedule — the closest a source gets to live without a backend, and the last
   rung before the fetch of step 6 simply swaps the mock out.

---

## Decisions taken

- **The builder is a modal.** Opened from a quiet `+ garden` at the end of the
  garden row, and edited from a `configure` button that shows only while standing
  in a user garden. It is setup, not daily chrome, so it stays out of the way and
  the preview gets the room a corner panel could not give it.
- **The sample payload is stored with the mapping.** A garden has to render on
  reload without a fetch it cannot yet make, so the one pasted snapshot persists
  beside the mapping. This does store the user's own pasted data in their own
  browser — acceptable because it is theirs and local; the third-party-terms trap
  `docs/sources.md` flags is about *ingesting a vendor's* content, which the
  paste path does not do. Revisit if the fetch path ever stores fetched text.
- **The saturated-axis check lives in the preview.** The summary reports each
  axis's spread and names any *data-driven* axis (vitality always, activity when
  mapped) that is flat across the garden — the hardest failure to see, met before
  the user commits rather than months later in a distribution. Maturity, a
  constant by design, is never flagged: warning on it would be noise that hides
  the real one.

The test the whole feature has to pass is the one every source so far has passed,
and the builder must pass it *for a stranger's data the developer never saw*: a
person glancing at the garden reads health correctly without being told the
domain, and the app never asserts something it cannot show the evidence for. A
builder that lets a user produce a confident-looking wrong plant has failed that
test — and the preview is where it is meant to be caught.
