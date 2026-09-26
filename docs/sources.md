# User-defined data sources

This started as a proposal for **how an end user points the garden at their own
data** (a FIFA league, a Prometheus server, a political fundraising feed) without
writing TypeScript. Much of it is now built. The status of each step is in the
sequence at the end.

`ARCHITECTURE.md` covers the layer contracts and `README.md` the one-way data
flow. This file covers which half of "add a source" existed already, which half
didn't, and the traps the missing half runs into. The World garden hit most of
those traps first and wrote them down.

---

## The short answer

"Let an end user add their own source" sounds like one problem but it's two, and
they're very different in difficulty:

1. **Developer extensibility, which mostly already existed.** Adding a source
   means writing a translator and adding one line to `state/sources.ts`. That seam
   is real and every built-in source uses it. A FIFA source would be close to a
   copy of the NFL one. Prometheus is the case the whole project was built for.
   Fundraising is published and then revised, like the World garden. For someone
   who writes code, each is an afternoon's work.
2. **Configuration at runtime by a non-developer, which is the real work.** For a
   user who doesn't write code, the mapping from raw data to a garden has to become
   configuration instead of code, and it needs a place to enter it and a place for
   it to run. That's a product on top of the pipeline, and all the hard parts are
   there.

Most of this file is about the second problem, because the first is well
understood and the second is where the design decisions are.

---

## What already existed: the seam

The architecture planned for this from the start. Data flows one way: **adapters
emit raw records, translation maps them to normalized nodes, the store holds them,
and the scene subscribes.** Nothing below the scene knows what Prometheus is, and
nothing above `translation/` knows what a plant is. Adding a source means writing
a translator, not widening the node type.

Three pieces were already in place and shouldn't be rebuilt:

- **`LiveSource` (`state/sources.ts`).** A source is four things: a `gardenId`, a
  staleness `policy`, a `read(now)` that returns a `TranslatedGarden` (nodes, edges
  and both history tiers), and a `pollable` flag. `SOURCES` is the full list. The
  composition step in `state/ecosystemStore.ts` walks it, registers each source's
  stale schedule, and fills gaps from the observation record. A live adapter slots
  in behind this interface without anything downstream changing.
- **Polling and staleness are one question.** `StaleSchedule.dueAfter` answers
  both "should I have heard something by now?" (the grey, dusty stale state) and
  "is there anything new to fetch?" (the poll). A source that can say when it'll
  next report has already said when to ask it again. Any new source gets this by
  supplying a policy.
- **The observation record (`state/persist.ts`, `state/collector.ts`).** What the
  app actually saw is written down sparsely, one sample per node per slot, only
  when a node reported. On the next visit it's laid back into the history buffers,
  filling gaps a source left and never overwriting what the source currently says.
  The stored shape is the one a server-side collector would want, so moving the
  loop somewhere it can run unattended **changes the backend, not the format.**
  That matters because a user's live source needs somewhere to run while their tab
  is closed, and the record was designed for that move.

So the developer path is: write a `read(now)` that fetches and translates, give it
a policy, and add it to `SOURCES`. The user path has to turn each of those steps
into data.

**The first part of that now exists.** `translation/declarative.ts` interprets a
mapping over plain JSON (an array of records, plus dotted paths for id, label,
level and bed) into the same flat nodes the hand-written translators produce. It
generalizes what `translation/prometheus.ts` did for one wire shape. The axis
scale, the required polarity, the derived trend and the bed grouping are all
config, so a second garden of that shape is a `DeclarativeMapping` object instead
of a copied translator. It also maps declared **completions**, the fruit and
deadwood for finished work that a CI feed or a to-do list needs. It doesn't cover
edges yet, or the split between when something was published and what date it
describes, which the World garden needs. The file notes both, next to the
translator that defines the expected behaviour.

---

## What the user path needs: configuration, mapping, and a place to run

Three things stand between the seam and an end user.

### 1. A connection, as configuration

The user needs to point at a source without code: a URL or endpoint, auth (a
token or key) and a poll schedule. The schedule is nearly free, since it's just a
`StaleSchedule`. The fetch isn't, for a simple reason: **a browser can't fetch
arbitrary third-party URLs.** CORS blocks it, secrets don't belong in a client,
and letting the browser hit a host the user names opens a request-forgery hole.
A real connection needs a **proxy or backend** to do the fetching. That's the same
backend the "run unattended" problem needs, so it's one piece of work, not two.

### 2. The mapping, as configuration

This is the hard part. It's hard because a translator doesn't just copy values
across. It's **the one place the mapping gets decided**, and it decides things the
raw data doesn't contain at all. Here's what `EcosystemNode` needs that a metric
doesn't carry:

- **The four axes, as comparisons between 0 and 1.** `vitality`, `activity`,
  `maturity` and `trend` are normalized (0 is dying, 1 is thriving), not raw
  numbers. The user has to say what 0 and 1 mean for their metric: a min and max,
  a percentile within the garden, whether higher is better or worse. This is the
  subtlest decision in the whole design, and the World garden already learned it
  the hard way. Vitality is a comparison, so mapping a raw quantity onto it
  naively ranks things against each other, and "a country visibly wilting because
  it's at war" is exactly what that source ruled out. A mapping UI has to make the
  user choose the scale on purpose instead of defaulting it.
- **Polarity, which is required and can't be inferred.** Is growth good news? A
  short position, a weed, a rising count of failed logins, the *opposition's*
  fundraising are all `suppress`, and a suppress node grows as a weed so that
  thriving looks alarming. This is the rule the whole environment model exists to
  protect. Only one garden is shown at a time so green can't mean two opposite
  things at once. The user has to state polarity, because the numbers can't reveal
  it.
- **Trend is derived, not supplied.** It's the signed change, computed in
  translation from history, because "down 6% today" reads differently from
  "sitting low". A declarative source supplies levels and the system derives
  trend. The config says which field is the level, not what the trend is.
- **Beds, emblems and planting are all translator choices.** Grouping plants into
  beds (by division, sector, subregion, a PromQL label), the mark on the tag
  (`emblem`), and the planting kind can't be derived from the four axes. The config
  needs a group-by, an optional emblem source and a default planting.
- **Edges, optionally.** Root grafts are relationships (rivalries, dependencies,
  correlations) and are a separate collection. A first version can skip them, and
  a good one takes an optional edge spec.

This points to a **declarative mapping**: a config object that says *fetch this,
on this schedule; this JSON path is the id, this is the label, this is the level;
scale it like this; polarity is this; group into beds by that; here's the
provenance.* Turn that config into the same nodes and edges the hand-written
translators produce, and those translators become the reference for what the
config can express. Once the mapping is data, **FIFA and fundraising become
configurations, not code**, and a UI is a form over the config.

### 3. Somewhere to run, honestly

The app's honesty rules put two constraints on any user source:

- **Provenance travels with the data.** The World garden made this essential.
  Every derived judgement keeps the evidence it came from, and the "this is
  simulated" marker is derived from `provenance.live`, so a live adapter drops the
  marker just by being live. A user source pointing at real data has to record
  where each value came from so the inspection HUD can always answer "says who?".
  The node's `raw` field exists for exactly this.
- **Third-party text and terms.** As soon as a source ingests someone else's
  content, such as a news wire or a data vendor, their terms on storing and showing
  it apply. The World and news work already flagged this as a blocker for going
  live. A user-source feature inherits the problem in full and should make it
  visible, not bury it.

---

## Two node-contract constraints that had to be fixed first

Both were small and specific, and both blocked the general case.

- **`Domain` is now open.** It used to be a closed enum of seven, and the worry
  was that it drove materials, so a new domain would have no look. Checking the
  code removed most of that worry. Nothing in the renderer picks materials based on
  `domain`. A plant's look comes from `plantingType` and the L-system archetype,
  both chosen in translation, and the only thing that reads `domain` is the
  inspection HUD, which shows it as text. `Domain` is now `KnownDomain | (string &
  {})`. The seven built-in values autocomplete, `'general'` is added as the named
  catch-all, and a user source can name its own (`fundraising`, `fifa`) with
  nothing downstream to update. `isKnownDomain` is for code that wants to branch on
  the built-in set. Don't use it to reject unfamiliar strings, because that would
  just bring the closed enum back.
- **The node type has to stay narrow.** Its own rule is that a field only one
  domain uses belongs in `raw`, not on the node. A declarative source has to follow
  that, and `translation/declarative.ts` does: everything source-specific goes into
  `raw.record`. The flat contract exists to resist the urge to add per-source
  fields to the node.

---

## The three examples

- **FIFA** is feed-shaped and close to the NFL adapter. Vitality comes from table
  position and form, beds from confederations or groups, grafts from group draws or
  rivalries, and emblems from club colours. With the declarative path it's a
  config, not code. It doesn't test anything new, which makes it a good confidence
  check and a poor first thing to build.
- **Prometheus** is the case the whole idea was built for, and the right first
  real source. A PromQL query returns series. Gauges and counters map to vitality
  and activity, `up{}` is the source reporting its own staleness, and labels are
  the natural bed grouping. It's genuinely live and never *finishes*, so it avoided
  the completion gap. Building it forced the real fetch, real poll and backend
  proxy that every user source then reuses.
- **Political fundraising** is published and then revised, which makes it
  structurally like the World garden. Filings get amended, so what you knew on a
  given date differs from what's on record now, and scrubbing back has to show
  what was known at the time. It runs into two traps. First, **polarity depends on
  the viewer**: whether a campaign growing is good news depends on whose side
  you're on, the same problem the World garden handled by refusing to pick a side.
  Second, **a fundraising goal finishes**, which needed the completion vocabulary
  below. Provenance is essential here.

---

## Completion: the gap that blocked a whole class of sources, now closed

Plants grow but don't *finish*. Tasks, builds, goals and harvests do. Prometheus
gauges were fine, but CI pipelines, sprints and fundraising targets all genuinely
complete, and the health vocabulary had no word for that.

That gap is filled. `Completion` sits on the node beside `Blight` with the
opposite sign: a discrete, final event with a timestamp, shown as fruit for `done`
and deadwood for `failed` (`ecosystem/completion.ts`, `scene/Completions.tsx`,
`docs/completion.md`). So a user *can* point the garden at a to-do list, and the
declarative interpreter supports it. A `DeclarativeMapping` takes an optional
`completions` block (an array path, plus `atPath`, `outcomePath`, `labelPath` and
a `doneWhen` set) that maps a record's finished work onto the node's
`completions`.

Completions are safe to leave to config in a way the level isn't. A completion is
an event the source *states* (it happened, at a time, with an outcome), not a
comparison the config has to invent. The only judgement call is which outcome
values count as success.

---

## Sequence

1. ~~**Prometheus as a hand-written `LiveSource`.**~~ **Done, and in `SOURCES`
   behind a mock fetch.** `translation/prometheus.ts` and `adapters/prometheus/`
   translate the wire format. `prometheus.live.test.ts` covers the live pull once
   a server is reachable (here it gets a 403 because of network policy, not a code
   problem). `promSource` is a registered garden pointed at `mockPromFetch`
   (`adapters/prometheus/mock.ts`) instead of a real server. It fetches through the
   same `fetchImpl` a real server would use, is primed synchronously and refreshed
   on the beat (see `docs/prometheus.md`). Going live means swapping that one
   argument and running the unattended refresh loop from step 6.
2. ~~**Open `Domain`.**~~ **Done.** It's now `KnownDomain | (string & {})` with
   `'general'` as the named fallback. No material map was needed, because nothing
   picked materials by `domain` in the first place.
3. **A declarative HTTP/JSON source with a mapping config.** **First version done,
   offline half.** `translation/declarative.ts` interprets a mapping over JSON:
   records path, field paths, the axis scaling rule, required polarity, an
   optional activity field, group-by for beds, provenance, and completions. The
   three hand-written translators define the expected behaviour. What it doesn't
   express yet (edges, and the World garden's published-versus-described dates) is
   noted in the file. The *fetch* half is still missing, because a real HTTP call
   to an arbitrary host needs the backend proxy from step 6.
4. ~~**Settle the completion vocabulary.**~~ **Done, including config.** Fruit and
   deadwood ship (`ecosystem/completion.ts`, `docs/completion.md`), and
   `translation/declarative.ts` maps a record's finished work onto the node's
   `completions` through an optional `completions` block. A config-driven CI feed
   or to-do list gets fruit without a developer writing a translator.
5. **A configuration UI over the mapping.** **First version done, offline half**
   (`docs/garden-builder.md`). A modal (`src/GardenBuilder.tsx`) turns a pasted
   JSON snapshot and a `DeclarativeMapping` into a garden, previewed through the
   real interpreter and saved so it survives a reload. FIFA and fundraising are
   now things a user sets up instead of things a developer writes. It doesn't
   *fetch*: a user brings one snapshot by hand, because pulling live data past the
   browser's CORS limits is step 6. The config UI never needed the network. Only
   the fetch did. The form doesn't offer the completions block yet.
6. **A backend for the fetch proxy and the unattended collector loop.** **Built
   for Prometheus and the NFL, deployable to Netlify, not yet run against a live
   server.** The design and code are described in `docs/backend.md` and the deploy
   steps in `docs/deploy-netlify.md`. The observation record already had the shape
   a server wants, so it was a change of backend, not of format. What's left is
   extending the proxy and collector to arbitrary user-registered sources.

Every source so far has had to pass the same test, and a user-defined one does
too: a stranger glancing at the garden reads health correctly without being told
the domain, and the app never claims something it can't show evidence for. A
mapping tool that lets a user produce a confident but wrong plant has failed that
test, and the World garden's whole design shows how much that matters.
