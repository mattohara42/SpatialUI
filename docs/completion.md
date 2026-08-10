# Completion vocabulary

A plan, not built. Written to settle the design before code, because the hard part
is a decision about the reading language, not the rendering.

Read `DESIGN.md` for the reading language and the channel budget this has to fit
into, and `ecosystem/types.ts` for the node contract it extends. This file is the
part neither carries: what "done" means in a garden of things that grow, and how
to say it without spending a channel the plant already owns.

---

## The gap

Every signal in the model is a *level*: vitality, activity, maturity, trend are
each a reading of how a thing stands **right now**, and the whole garden is built
to compare those levels at a glance. That is the right shape for a service, a
holding, a country — things that are always somewhere on a scale and never
finish.

But a whole class of things **finish**. A CI build passes or fails. A task is
done. A goal is reached. A deploy ships. A harvest comes in. These are not levels
that rose to the top; they are *events with an outcome*, and the vocabulary has
no word for them. Left in the current model a completed task can only sit at
vitality 1 forever, which says "very healthy" and not "done" — and a failed build
can only read as low vitality, which says "unwell" and not "this one finished
badly." Recorded elsewhere as the open risk in one line: **tasks end, plants do
not.** It is the gap that blocks CI pipelines, task boards, goals, and
fundraising targets — a source the moment its data is shaped like *work that
completes* rather than *state that persists*.

---

## The idea: completion is an event, on the Blight pattern

The model already has one thing that is an event rather than a level, and it is
the template for this: the **blight**. A `Blight` is a discrete named problem
attached to a node — it has a `since`, a severity, and (in the world garden) the
evidence it came from — and it drives its own visible symptom without touching
the four axes. Completion is the same shape with the opposite sign: a discrete
named *outcome*, attached to a node, driving its own symptom.

So the proposal is a sibling of `Blight`, not a fifth vital:

```ts
interface Completion {
  id: string;
  /** Epoch ms the thing finished. */
  at: number;
  /** Whether it finished well. Success bears fruit; failure leaves deadwood. */
  outcome: 'done' | 'failed';
  /** Short human line: "build #4821", "Q3 goal", "deploy v2.1". */
  label: string;
  /** Where this came from, so a fruit never asserts a completion it cannot show.
   *  Required, for the reason UnrestEvent.article is required (see the world
   *  garden): a mark that claims something happened must carry what it was. */
  evidence: string;
}
```

carried on the node exactly as blights are:

```ts
// on EcosystemNode, beside `blights: Blight[]`
completions: Completion[];
```

This keeps the node contract's own rule — *never a field only one domain uses* —
because completion is not a DevOps or a task concept, it is the general shape of
*a unit of work that ended*, the same way a blight is the general shape of *an
affliction*.

**Why an event and not a level.** A level would be wrong three ways: it would
compete with vitality for the same channel; it would have no natural way to say
*failed* versus *unwell*; and it could not be **counted** — the reading people
actually want from completion is "how much shipped, and did any of it fail," which
is a tally of events over a window, not a height.

### Completion is not blight, and not maturity

Two lines to keep straight, because they are close:

- **A failed build is a completion, not a blight.** A blight is an *ongoing*
  condition — an injury, an outbreak, a symbol currently halted — that persists
  until it heals. A completion is *terminal* — it happened, at an instant, and is
  now history. A pipeline that is *currently broken* may carry a blight; each red
  build it produced is a completion with `outcome: 'failed'`. They can coexist and
  they mean different things: one is "it is sick now", the other is "this unit of
  its work ended badly."
- **Throughput is not age.** `maturity` is how long-established a thing is. A young
  pipeline can complete a hundred builds and an old one none this week. Completion
  is *yield*, and yield is orthogonal to age.

---

## The reading: fruit for success, deadwood for failure

Completion earns a **new channel**, which is the whole reason it is worth doing:
the reading budget has never spent "output," and output is exactly what a plant
that bears has to say. It reads through the one thing a real plant does that none
of the current signals use — it **fruits**.

- **Success → fruit.** A successful completion hangs as fruit on the plant. Fruit
  is the natural symbol for *a good thing produced and finished*, it is legible at
  a glance and even peripherally (a plant heavy with fruit reads as productive
  from across the room), and `Produce.tsx` already draws fruit on a plant's leaf
  points, riding its sway and droop. The count of fruit is the count of recent
  successful completions, capped; fruit **ripens** over its life and then **drops**
  as it ages out of the window, so the plant shows what it has finished lately and
  not its whole history at once.
- **Failure → deadwood.** A failed completion leaves a short length of **deadwood**
  — a bare, greyed, brittle twig that persists as the record of a bad ending until
  it is pruned or weathers away. Deadwood is distinct from the **staleness grey**
  that covers a *whole* silent plant (that is absence of signal, not a failure);
  deadwood is *local*, a dead spot on an otherwise living plant, which is exactly
  what one bad build among green ones is.

Both obey the channel rule. Fruit and deadwood are a channel of their own —
*output*, discrete and counted — not a second telling of vitality: a wilting
plant can still bear the fruit of the work it finished before it began to
struggle, and a thriving one can carry a length of deadwood from a single bad
ending. That independence is the point, and it is what a level could never
express.

---

## The tension to settle first: fruit already means something

This is the one real design decision, and it must be made before code. **Fruit is
currently decoration.** `Produce.tsx` draws it for vegetable and vineyard
*plantings*, seeded and varietal, explicitly *not* a signal — its comment says as
much, and its colour greys only for staleness. Completion-fruit would make fruit
a *signal*. Fruit cannot be both a decoration and a signal in the same field of
view, or it is the "green means two things" failure the whole environment model
exists to prevent.

Three ways out, in order of preference:

1. **Separate by garden, and never mix on one plant.** Decorative produce belongs
   to the vegetable/vineyard plantings; completion-fruit belongs to nodes that
   *have completions*. A source whose plants complete work does not also plant
   them as a vegetable patch, so within any one garden fruit means exactly one
   thing. This is the cheapest and it fits how plantings already work (a container
   property chosen per garden). The rule to enforce: **a node never both bears
   decorative produce and receives completions.**
2. **Give completion-fruit its own unmistakable treatment** — a distinct form or a
   ripen-and-fall motion decorative produce never has — so the two never read
   alike even if they shared a plant. More work, and it spends design effort to
   permit a mixing that option 1 simply forbids.
3. **Retire decorative produce**, making fruit *always* mean output. Cleanest
   conceptually, but it costs the vegetable and vineyard gardens a bearing they
   were built for.

Recommendation: **option 1.** It needs no new visual language and it keeps the
one-meaning-per-garden rule by construction.

---

## Time, so completion scrubs like everything else

Completions ride on the node snapshot, the way blights do, and the way everything
in this app is *derived as of a timestamp*. A source's reading at time T carries
the completions that had happened by T; scrubbing the sun back re-derives an
earlier reading, and a build that finished on Tuesday is simply absent on Monday —
the same way an injury from the fourth quarter is gone when you scrub past it.

So completions need **no new history tier**. The four-axis buffers
(`history.ts`) are untouched; completion lives on the node like `blights`, and the
scrub machinery already unwinds it for free. What ages a fruit or weathers a
deadwood is `cursor - completion.at`, read at the cursor, so ripening and dropping
are a pure function of the shown time and reproduce exactly under a scrub.

---

## The first source to prove it: a mock pipelines garden

The archetype is **CI pipelines** — "where things genuinely complete" — but a live
CI feed needs network this environment does not have. So the exerciser is a
**self-contained mock pipelines garden**, the same way the mock gardens exist to
tune the renderer against shapes that are not yet live:

- each **pipeline** is a plant; the **beds** are teams or repositories;
- **activity** is how often it builds, so a busy pipeline sways;
- each **build** is a `Completion` — green bears fruit, red leaves deadwood — drifted
  in on the same tick the mock gardens already use;
- a **currently broken** pipeline (several reds in a row) also grows a `Blight`, so
  the two channels are exercised together and shown to read as different things.

When network arrives, the real source drops in behind the same interface, and
completion becomes one of the fields the **declarative mapping** in
`docs/sources.md` sets — "this field is the outcome, this the timestamp, this the
evidence" — so the mock and the real feed produce identical node shapes.

---

## Phasing

1. **Contract + pure logic.** Add `Completion` and `node.completions` to
   `ecosystem/types.ts`; pure helpers for "completions as of the cursor",
   ripeness/weathering from age, and the per-plant fruit/deadwood counts. All
   testable without a renderer, like `staleness` and `labels`.
2. **Reading.** Extend `Produce.tsx` (or a sibling `Fruit`/`Deadwood` layer) to
   draw completion-fruit and deadwood from `node.completions`, honouring option 1
   above so it never collides with decorative produce.
3. **Exerciser.** A mock pipelines garden in `mock/`, with a drift tick that
   completes builds, so the whole thing is visible and scrubbable with no backend.
4. **Live, later.** A real CI/Actions source behind the source interface, with
   completion carried through the declarative mapping.

---

## Constraints it must not break

- **The channel budget.** Completion is a *new* channel — output — and must stay
  clear of the health read. Fruit is not "healthier", deadwood is not "sicker";
  they are "finished well" and "finished badly", independent of vitality.
- **One meaning per garden.** Resolve the fruit-decoration collision (option 1)
  before drawing anything, or fruit says two things at once.
- **Provenance.** `Completion.evidence` is required, for the reason the world
  garden made blight evidence required: a mark that asserts a real outcome must
  carry what it was, or the inspection panel cannot answer "says who."
- **No node field only one domain uses.** `completions` is general — *work that
  ended* — exactly as `blights` is general. Nothing DevOps-shaped leaks into the
  contract; the specifics live in `label`, `evidence`, and `raw`.
- **Derive as-of, keep no new past.** Completion rides the node snapshot and
  scrubs through the existing cursor; it must not grow a history tier of its own.

---

## Open decisions for the owner

1. **The fruit collision** — option 1 (separate by garden), 2 (distinct
   treatment), or 3 (retire decorative produce). Recommended: 1.
2. **Deadwood's look** — a greyed bare twig on the living plant (recommended,
   local and distinct from staleness) versus a fallen dark fruit at the base.
3. **Naming** — `Completion`/`outcome` as above, or a more garden-native
   `Harvest`. The code reads well either way; the docs should match whatever the
   owner prefers to say out loud.
4. **Acknowledgement / harvest** — should a completion the viewer has not seen yet
   read differently (glow, hang) and settle once visited, tying into "changes
   since last visit"? Worth a v2, out of scope for the first cut.
5. **Suppress polarity** — for a weed (a backlog you want gone), does "a task
   completed" read as fruit (good) even though the node's growth is alarming?
   Likely yes — completion is literal and polarity-independent — but it is an edge
   the mock garden should include so the answer is decided by looking, not by
   argument.
