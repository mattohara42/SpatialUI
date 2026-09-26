# The garden builder

**Status: the offline half is built.** This started as a proposal for the one
part of the "user-defined source" plan this repository could finish without a
network: **a UI that lets a non-developer point the garden at their own data.**
That part now ships. It's step 5 of the sequence in `docs/sources.md`. The
proposal's main claim held up: the config UI could be built right away, and
didn't have to wait for the backend in step 6 as `docs/sources.md` had assumed.
The only thing still deferred is the *fetch*, which really does need a backend.

For background, `docs/sources.md` describes the declarative interpreter this
builds on, `translation/declarative.ts` defines the `DeclarativeMapping` shape
the form produces, and `DESIGN.md` describes the reading language the UI mustn't
let a user break. This file covers which half of the UI works offline, what it
looks like, and the one mistake it exists to prevent.

---

## What shipped

The builder is a modal. You open it from a small `+ garden` button at the end of
the garden row. To edit, there's a `configure` button that **only appears while
you're in a garden you built**. That placement reflects how it gets used: you
set a garden up once, tweak it now and then, and otherwise never see the config
again, because the mapping persists and the garden becomes just another button.

- **`src/GardenBuilder.tsx`** holds the form and the live preview, side by side.
  The form is deliberately opinionated (see below). The preview runs the *real*
  interpreter through `previewMapping`, so what it shows is exactly what you'll
  get, and the interpreter's own errors, which name the offending path, act as
  the validation.
- **`src/state/userSources.ts`** is the pure core. `userSourceFromConfig` builds
  a generator-style `LiveSource` over the pasted snapshot (no `refresh`,
  `pollable: false`, and a plain-duration stale policy). `previewMapping`
  translates and summarizes. `loadUserConfigs` and `saveUserConfigs` persist the
  mapping under `spatialui.gardens.v1`, separate from the observation record, and
  never store made-up data. 14 tests.
- **`src/state/ecosystemStore.ts`** adds persisted user gardens next to the
  built-in sources in `composeEcosystem`. It does this defensively: a stored
  mapping that no longer translates is skipped instead of crashing the app.
  `addUserGarden` and `removeUserGarden` do the same at runtime. An edit clears
  the old garden's nodes before the new ones go in.

What's deferred is the **live fetch** (arbitrary hosts need the backend proxy
from step 6 of `docs/sources.md`) and the real polling that follows from it.
Today a user garden is one pasted snapshot, and it greys into staleness because
nothing is updating it, which is accurate. The interpreter supports a
`completions` block, but the form doesn't offer it yet. That's the next piece.

---

## Why the config UI didn't have to wait for the network

`docs/sources.md` and `HANDOFF.md` both grouped the config UI (step 5) with the
backend fetch (step 6) as two things waiting on network access. That was only
half right.

The word *connection* covers two separate things:

- **The fetch**, pulling a payload from an arbitrary third-party URL, does need a
  backend. A browser can't fetch arbitrary hosts because of CORS, secrets don't
  belong in a client, and letting the browser hit a host the user names opens a
  request-forgery hole. This stays deferred.
- **The mapping**, writing a `DeclarativeMapping` and seeing the garden it makes,
  needs no network at all. `translation/declarative.ts` already exists, runs in
  the browser, and has 30 tests. Give it a payload the user **pasted or
  uploaded** instead of one a backend fetched, and the whole "raw JSON to garden"
  loop runs offline.

That made the builder one of the few valuable pieces this environment could
actually finish. A live adapter, a real Prometheus connection and the unattended
collector all need outbound network access this container doesn't have. The
builder doesn't, because the interpreter already existed and the app is
synchronous by contract. A pasted snapshot is exactly what a generator source
already hands to `read(now)`.

This relies on the same seam Prometheus uses. `promSource` fetches through a
`fetchImpl` argument that currently holds a mock (`adapters/prometheus/mock.ts`),
and going live means swapping in the platform `fetch`. The builder is the general
version of that mock: the user's pasted payload stands in for the fetch. Once a
backend exists, the same swap turns a saved mapping into a live one without
changing the mapping.

---

## How it works

The builder walks a user from a blob of JSON to a garden they can walk into, in
four steps. Each depends on the one before.

1. **Bring data.** Paste a sample payload or upload a `.json` file. Eventually a
   backend would fetch this on a schedule. For now the user supplies one snapshot
   by hand and nothing is fetched.
2. **Map it.** Fill in a form over `DeclarativeMapping`: where the array of
   records lives, which field is the label, which is the level, and how the level
   scales onto vitality. It also asks the two things the numbers can't tell you,
   the scale's direction and the polarity. Optional fields cover activity, a bed
   group-by and an emblem.
3. **See it.** A live preview runs `translateDeclarative` on the payload as you
   edit. It shows either the resulting garden (the same nodes the hand-written
   translators produce, drawn by the same scene) or the interpreter's error
   exactly as written, with the bad path named.
4. **Keep it.** Add it as a garden. It becomes a garden button and behaves like
   every other garden: it greys when stale, it collects, it scrubs.

---

## The form is opinionated on purpose

The obvious design is a generic JSON-path editor: pick any field, map it to any
axis, done. That would defeat the point. `DESIGN.md` and the World garden both
argue at length that the translator is **the one place the mapping gets decided**,
and it has to decide two things the raw data doesn't carry. The form makes the
user decide them on purpose and makes the safe choice the easy one.

- **The scale is a comparison, not a quantity.** `vitality` runs from 0 (dying)
  to 1 (thriving). A fundraising total of $2M is neither until the user says what
  the floor and ceiling are. So the form asks for a min and a max and won't guess
  them from the data's own range. Scaling to the spread of whatever's there is the
  naive ranking the World garden ruled out, the one that makes a country wilt
  visibly just because it's at war. `AxisScale` already encodes direction (`min >
  max` means lower is better), so the form asks one plain question, "is a higher
  number healthier?", and writes the scale to match. There's no default. A blank
  scale is an incomplete mapping, not a mapping with a fallback.
- **Polarity is required and can't be inferred.** Is growth good news? A short
  position, a weed, a rising count of failed logins, the opposition's fundraising
  are all `suppress`, and a suppress plant grows as a weed so that thriving looks
  alarming. This is the rule the whole environment model exists to protect, and
  no amount of staring at the numbers reveals it. The form makes it a required
  choice, with the consequence of each option written out in plain words, instead
  of a toggle with a default. `translation/declarative.ts` already types it as
  required, and the UI mustn't hide that.

Everything else on the form is identity, not signal, and gets a sensible default:
planting look (`orchard`), domain (`general`, the open catch-all described in
`docs/sources.md` under "Domain: opened"), and emblem (the label's initials, via
`emblemFrom`). Trend isn't on the form at all. It's always derived: the config
names the level and the system computes the change between polls.

---

## The preview is the honesty check

`translateDeclarative` already fails loudly. A level path that isn't a finite
number throws with the path named, and so does a records path or completions path
that isn't an array. The preview shows those errors as they are, so the error
message is the validation. There's no second validation layer to write and keep
in sync, which is why the preview goes through the real translator instead of a
UI-side copy of its rules.

When the mapping is complete and the payload parses, the preview draws a real
garden with the same scene the app uses. That puts the feature's key test in
front of the user before they commit: can a stranger read the health correctly
without being told the domain? A mapping that produces a confident but wrong
plant has failed, and the preview is where the user (or a reviewer) sees it fail.
So the preview isn't polish. It's the feature's safety mechanism.

That only works if the preview runs the interpreter and doesn't approximate it.
If the preview and the saved source ever disagreed, the preview would be useless
as a check. Both go through `translateDeclarative` with the same mapping and the
same payload, so what the user approved is exactly what gets added.

---

## How a saved mapping enters the app

`userSourceFromConfig` turns a saved mapping into a generator-style `LiveSource`
over the pasted snapshot:

- `read(now)` calls `translateDeclarative(payload, mapping, { asOf: now })`. No
  `previous` reading is passed in, so trend is 0. That's correct for one static
  snapshot, since there's no earlier reading to have moved from. Trend becomes
  meaningful once a fetch supplies a second one.
- There's no `refresh`, because a pasted snapshot has no next reading to fetch.
  The source reads the one payload it has and the garden greys into staleness.
  For a pasted snapshot that's simply true: nothing is updating it.
- It's marked `pollable: false` for the same reason. A generated source that gets
  asked again has to extend its data and never slide it (see the decisions most
  likely to be misread in `HANDOFF.md`). A static snapshot has nothing to extend,
  so it isn't polled.
- Its `StaleSchedule` is a plain duration, the simplest kind and the same one the
  league uses, because a pasted snapshot has no calendar to point `dueAfter` at.
  The form offers 1h, 6h or 1d, defaulting to 6h.

The store doesn't modify the `SOURCES` constant. `composeEcosystem` reads
`loadUserConfigs()` from `localStorage` at startup and lays each user garden's
nodes over the built-in ones. `addUserGarden` and `removeUserGarden` do the same
at runtime, clearing an existing garden's nodes first when it's being replaced.
Nothing downstream of the store knows a source came from a form instead of being
defined in code. The scene draws whatever gardens the node map contains.

---

## Decisions taken

- **The builder is a modal.** It's opened from a small `+ garden` at the end of
  the garden row and edited from a `configure` button that only shows while
  you're in a user garden. It's setup, not something you look at every day, so it
  stays out of the way, and the preview gets more room than a corner panel could
  give it.
- **The sample payload is stored with the mapping.** A garden has to render after
  a reload without a fetch it can't make yet, so the pasted snapshot is saved next
  to the mapping. That means the user's own data is stored in their own browser,
  which is fine because it's theirs and it's local. The third-party terms problem
  flagged in `docs/sources.md` is about ingesting a vendor's content, and pasting
  doesn't do that. Revisit this if the fetch path ever stores fetched text.
- **The saturated-axis check lives in the preview.** The summary reports each
  axis's spread and names any data-driven axis (vitality always, activity when
  mapped) that's flat across the whole garden. That failure is the hardest to
  spot, and this catches it before the user commits instead of months later.
  Maturity is constant by design, so it's never flagged. Warning on it would just
  be noise that hides the real warnings.

---

## What's next

The first two steps shipped together, and everything on this list stays
offline except the fetch.

1. ~~**Author, preview, and add to the session.**~~ **Done.** Paste, fill the
   form, check the live preview, add it as a garden.
2. ~~**Persist the mapping.**~~ **Done.** The `DeclarativeMapping` and its sample
   payload are saved to `localStorage` under `spatialui.gardens.v1`, separate from
   the observation record, so a garden survives a reload without reopening the
   builder. Only the mapping and the one pasted snapshot are stored, never made-up
   data, which is the same rule the collector follows.
3. **Add the completion fields to the form.** The interpreter already maps a
   `completions` block. Once the form offers it, someone can build a garden around
   finished work (a CI feed, a to-do list) without a developer.
4. **A mock-fetch poll seam.** Run a saved mapping through a mock `fetchImpl` the
   way Prometheus does, so it "polls", advances and greys on a real schedule. This
   is as close to live as a source gets without a backend, and after it the step 6
   fetch just swaps the mock out.
5. **The live fetch and real polling**, once the backend proxy for arbitrary
   hosts exists. This is the only part of the builder the network blocks.

Edges, and the split between when something was published and when it describes,
aren't supported by the interpreter yet (see `translation/declarative.ts`), so the
form can't offer them either. For now a user source skips edges and translates
one snapshot as of one moment.

The builder has to pass the same test every source so far has passed, except this
time with a stranger's data that no developer has seen. Someone glancing at the
garden should read health correctly without being told the domain, and the app
should never claim something it can't show evidence for. If the builder lets a
user produce a confident but wrong plant, it has failed, and the preview is where
that's supposed to get caught.
