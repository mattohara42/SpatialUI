# User-defined data sources

A proposal, not a description of built state. Written to memorialize a design
direction for future sessions: **how an end user points the garden at their own
data** — a FIFA league, a Prometheus server, a political-fundraising feed —
without writing TypeScript.

Read `ARCHITECTURE.md` for the layer contracts and `README.md` for the one-way
data flow. This file is the part those do not carry: which half of "add a source"
already exists, which half does not, and the specific traps the missing half
walks into — most of which the World garden already paid for once and wrote down.

---

## The short answer

"Let an end user add their own source" is **two problems wearing one sentence**,
and they are very different in difficulty:

1. **Developer extensibility — mostly already built.** Adding a source today is
   writing a translator and one line in `state/sources.ts`. The seam is real and
   load-bearing: three sources already come through it. A FIFA source is nearly a
   copy of the NFL one; Prometheus is the archetype the whole project was built
   for; fundraising is a published-then-revised numeric source like the World
   garden. All three are a competent afternoon *for someone who writes code*.

2. **Non-developer configuration at runtime — not built at all, and the real
   work.** For a user who does not write code, the mapping from raw data to a
   garden has to become *configuration* rather than *code*, plus a place to
   enter it and a place for it to run. This is a product on top of the pipeline,
   and everything hard is in here.

The rest of this document is mostly about the second, because the first is a
known quantity and the second is where the design decisions live.

---

## What already exists — the seam

The architecture anticipated this from the start. Data flows one way — **adapters
emit raw records → translation maps them to normalized nodes → the store holds
them → the scene subscribes** — and nothing below the scene knows what Prometheus
is, while nothing above `translation/` knows what a plant is. Adding a source
means writing a translator, not widening the node type.

Concretely, three pieces are already in place and worth not rebuilding:

- **`LiveSource` (`state/sources.ts`).** A source is four things: a `gardenId`, a
  staleness `policy`, `read(now)` that returns a `TranslatedGarden` (nodes,
  edges, and both history tiers), and a `pollable` flag. `SOURCES` is the whole
  list; the composition point in `state/ecosystemStore.ts` walks it, registers
  each source's stale schedule, and lays the observation record back over the
  gaps. A live adapter drops in behind this interface with nothing downstream
  changing — the docs already call that swap the highest-value thing a networked
  environment could do.

- **Poll and staleness are one question.** `StaleSchedule.dueAfter` answers both
  "should I have heard something by now" (the grey, dusty staleness state) and
  "is there anything new to fetch" (the poll). A source that can say when it will
  next speak has already said when to re-ask it. Any new source gets this for
  free by supplying a policy.

- **The observation record (`state/persist.ts`, `state/collector.ts`).** What the
  app actually watched is written down sparsely — one sample per node per slot,
  when a node reported — and laid back into the buffers on the next visit, into
  the gaps a source left and never over what it currently says. Crucially, *the
  stored shape is the one a server-side collector would want*, so moving the
  loop somewhere it can run unattended is **a change of backend, not of format**.
  That matters here: a user's live source needs somewhere to run when their tab
  is shut, and the record was already designed for that move.

So the developer path is: write a `read(now)` that fetches and translates, give
it a policy, add it to `SOURCES`. Done. The user path has to turn each of those
steps into data.

---

## What does not exist — configuration, mapping, and a place to run

Three things stand between the seam and an end user.

### 1. A connection, as configuration

Point at a source without code: a URL or endpoint, auth (token, key), and a poll
cadence. The cadence is nearly free — it is a `StaleSchedule` — but the fetch is
not, for one blunt reason: **a browser cannot fetch arbitrary third-party URLs.**
CORS forbids it, secrets do not belong in a client, and pointing the app at a
user-named host from the browser is a request-forgery surface. So a real
connection needs a **proxy/backend** to do the fetching, which is the same
backend the "run unattended" problem needs. These are one piece of work, not two.

### 2. The mapping, as configuration — the crux

This is the hard part, and it is hard because the translator is not a
transcription. It is **the only place the mappings are decided**, and it decides
things that are not present in the raw data at all. Look at what
`EcosystemNode` demands that a metric does not carry:

- **The four axes, as comparisons in [0, 1].** `vitality`, `activity`,
  `maturity`, `trend` are normalized — 0 is dying, 1 is thriving — not raw
  numbers. The user has to declare *what 0 and 1 mean for their metric*: a
  min/max, a percentile within the garden, "higher is better" or worse. This is
  the subtlest decision in the whole scheme and the one the World garden already
  drew blood on: vitality is a *comparison*, so if you map a raw quantity onto it
  naively you are ranking things against each other, and "a country visibly
  wilting because it is at war" is exactly the reading that source forbade. A
  mapping UI has to make the user choose the scale deliberately, not default it.
- **Polarity — mandatory, never inferable.** Is growth good news? A short
  position, a weed, a rising failed-login count, the *opposition's* fundraising —
  all are `suppress`, and a suppress node grows as a weed so thriving reads as
  alarm. This is the one rule the entire environment model exists to hold: one
  garden at a time so green cannot mean two opposite things at once. The user
  *must* state it; it cannot be guessed from the numbers.
- **Trend is derived, not supplied.** It is the signed delta, computed in
  translation from history, because "down 6% today" reads differently from
  "sitting low". A declarative source supplies levels; the system derives trend —
  the config says which field is the level, not what the trend is.
- **Beds, emblems, planting — all translator choices.** Grouping plants into beds
  (a "group by" field: division, sector, subregion, PromQL label), the mark on
  the tag (`emblem`), and the planting kind are none of them derivable from the
  four axes. The config needs a group-by, an optional emblem source, and a
  default planting.
- **Edges, optionally.** Root grafts are relationships — rivalries, dependencies,
  correlations — and are their own collection. A first-cut declarative source can
  skip them; a good one takes an optional edge spec.

The shape this points to is a **declarative mapping**: a config object saying
*fetch this, on this cadence; this JSON path is the id, this the label, this the
level; scale it this way; polarity is this; group into beds by that; here is the
provenance.* Translate that config into the same nodes and edges the hand-written
translators produce, and the hand-written translators become the reference
implementation of what the config can express. Once mapping is data, **FIFA and
fundraising are configurations, not code**, and a UI is a form over the config.

### 3. Somewhere to run, and to be honest about

Two constraints the honesty of the app imposes on any user source:

- **Provenance travels with the data.** The World garden made this load-bearing:
  every derived judgment keeps the evidence it came from, and the "this is
  simulated" marker derives from `provenance.live` so a live adapter drops it by
  being live. A user source pointing at real data has to carry where each value
  came from, so the inspection HUD can always answer "says who". `raw` already
  exists on the node for exactly this payload.
- **Third-party text and terms.** The moment a source ingests someone else's
  content — a news wire, a data vendor — its terms on storing and showing that
  text apply. The World/news work already flagged this as a ship-blocker for
  going live. A user-source feature inherits it wholesale and should surface it,
  not bury it.

---

## Two constraints in the node contract to fix first

Small, concrete, and they block the general case:

- **`Domain` is a closed enum** (`devops | pkm | markets | sports | …`) used "for
  grouping and materials". An arbitrary user domain — political fundraising —
  does not fit it, and because it feeds *materials*, a new domain has no look.
  Either open it to a string with a generic fallback material, or map every user
  source onto a small set of provided domains. This is a real edit, not a
  formality.
- **The node type must stay narrow.** Its own rule: *never a field only one domain
  uses* — those live in `raw`. A declarative source must respect that. The
  temptation to add per-source fields to the node is the thing the flat contract
  exists to refuse.

---

## The user's three examples, concretely

- **FIFA** — feed-shaped, almost the NFL adapter again. Vitality from table
  position and form, beds from confederations or groups, grafts from group draws
  or rivalries, emblems from club colours. Once the declarative path exists this
  is a config, not code. It also does *not* stress anything new, which is why it
  is a good confidence check but a poor thing to build first.

- **Prometheus** — *the archetype the whole idea was built for*, and the right
  first real source. A PromQL query returns series; gauges and counters map to
  vitality and activity; `up{}` is staleness stated by the source itself; labels
  are the natural bed grouping. It is genuinely live, it never *finishes* (so it
  sidesteps the completion gap below), and building it forces the real-fetch,
  real-poll, backend-proxy plumbing that every user source then reuses. It needs
  network access this environment does not have — which is precisely why it keeps
  being deferred, and why it is the thing to do the moment there is a server.

- **Political fundraising** — a published-then-revised numeric source, structurally
  the World garden: filings get amended, so what you knew at a date differs from
  what is now on record, and the scrub must show what was known. Two sharp traps
  it walks straight into: **polarity is a position** — "is this campaign growing
  good news?" depends on whose side the viewer is on, the same edge the World
  garden handled by refusing to hand-pick — and **a fundraising goal *finishes***,
  which the vocabulary has no word for (see below). Provenance is non-negotiable
  here.

---

## The gap that blocks a whole class of sources: completion

Plants grow; they do not *finish*. Tasks, builds, goals, and harvests do.
Prometheus gauges are safe, but "CI pipelines", "a sprint", "a fundraising
target" all genuinely complete, and the health vocabulary has no term for it —
recorded as an open risk elsewhere: *tasks end, plants do not*. Fruit and
deadwood are the obvious candidates, and `Produce.tsx` already draws fruit for
other reasons. This is worth settling before shipping a user-source feature that
invites completion-shaped data, because a user *will* point it at a to-do list.

---

## Recommended sequence

1. **Prometheus as a hand-written `LiveSource`**, the moment there is network. It
   is the archetype, and it builds the fetch/poll/backend plumbing every later
   step reuses. No new UI, no declarative layer yet — just prove the live pull
   behind the existing interface.
2. **Open `Domain`** and add a generic fallback material, so a source that is not
   one of the seven built-in domains has somewhere to live.
3. **Generalize `read(now)` into a declarative HTTP/JSON source + mapping
   config**: fetch spec, cadence, field paths, the axis-scaling rule, mandatory
   polarity, group-by for beds, provenance. The three hand-written translators
   are the spec for what it must be able to express.
4. **Settle the completion vocabulary** (fruit/deadwood) before inviting
   completion-shaped data.
5. **A configuration UI** over the mapping — at which point FIFA and fundraising
   are things a user sets up, not things a developer writes.
6. **A backend** for the fetch proxy and the unattended collector loop. The
   observation record already stores in the shape this wants, so it is a change
   of backend, not of format.

The test the whole feature has to pass is the one every source so far has passed:
a stranger glancing at the garden reads health correctly without being told the
domain, and the app never asserts something it cannot show the evidence for.
A mapping tool that lets a user produce a confident-looking wrong plant has
failed that test, and the World garden's whole design is the record of how much
that matters.
