# Completion vocabulary

**Status: built.** This started as a design note written before any code, and
the design below is what shipped. The contract is `Completion` in
`ecosystem/types.ts`, the pure logic is `ecosystem/completion.ts`, the drawing is
`scene/Completions.tsx`, and the Pipelines mock garden exercises it. The
declarative source can also map completions (see `translation/declarative.ts`).
The fruit collision below was settled with option 1, and deadwood is drawn as a
grey-brown spur on the living plant. The remaining open questions are at the end.

`DESIGN.md` covers the reading language and the channel budget this had to fit
into. This file explains what "done" means in a garden of things that grow, and
how to show it without reusing a channel the plant already has.

---

## The gap

Every signal in the model is a *level*. Vitality, activity, maturity and trend
each describe how a thing stands **right now**, and the garden is built for
comparing those levels at a glance. That suits a service, a holding or a
country, which are always somewhere on a scale and never finish.

A whole class of things does **finish**, though. A CI build passes or fails. A
task gets done. A goal is reached, a deploy ships, a harvest comes in. These are
events with an outcome, and the model had no way to say so. A completed task
could only sit at vitality 1 forever, which says "very healthy" when the truth is
"done". A failed build could only show as low vitality, which says "unwell" when
the truth is "this one ended badly". The short version, as recorded in the open
risks: **tasks end, plants don't.** That blocked CI pipelines, task boards, goals
and fundraising targets, or any source whose data is work that completes instead
of state that persists.

---

## The idea: completion is an event, modelled on blight

The model already had one thing that's an event and not a level: the **blight**.
A `Blight` is a discrete, named problem attached to a node. It has a `since`, a
severity, and (in the world garden) the evidence it came from. It drives its own
visible symptom without touching the four axes. Completion is the same shape with
the opposite sign: a discrete, named *outcome* attached to a node, driving its
own symptom.

So `Completion` is a sibling of `Blight`, not a fifth vital:

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

It's carried on the node the same way blights are:

```ts
// on EcosystemNode, beside `blights: Blight[]`
completions: Completion[];
```

This respects the node contract's rule against fields only one domain uses.
Completion isn't a DevOps concept or a task concept. It's the general shape of a
unit of work that ended, just as a blight is the general shape of an affliction.

**Why an event and not a level.** A level would go wrong in three ways. It would
compete with vitality for the same channel. It would have no clean way to
distinguish *failed* from *unwell*. And it couldn't be **counted**. What people
actually want from completion is "how much shipped, and did any of it fail",
which is a tally of events over a window, not a height.

### Completion isn't blight, and it isn't maturity

These are close enough to confuse, so keep them apart:

- **A failed build is a completion, not a blight.** A blight is an *ongoing*
  condition (an injury, an outbreak, a halted symbol) that lasts until it heals.
  A completion is *terminal*: it happened at one instant and is now history. A
  pipeline that is *currently broken* may carry a blight, and each red build it
  produced is a completion with `outcome: 'failed'`. The two can exist together
  and mean different things. One says "it's sick now", the other says "this piece
  of its work ended badly".
- **Throughput isn't age.** `maturity` is how long-established something is. A
  young pipeline can finish a hundred builds while an old one finishes none this
  week. Completion measures yield, and yield has nothing to do with age.

---

## The reading: fruit for success, deadwood for failure

Completion gets a **new channel**, and that's the main reason it was worth doing.
The reading budget had never used "output", and output is exactly what a plant
that bears fruit can show. It uses the one thing a real plant does that none of
the existing signals use: it **fruits**.

- **Success becomes fruit.** A successful completion hangs as fruit on the
  plant. Fruit is the obvious symbol for something good that was produced and
  finished. It reads at a glance and even out of the corner of your eye (a plant
  heavy with fruit looks productive from across the room). `Produce.tsx` already
  drew fruit on a plant's leaf points, following its sway and droop. The number of
  fruit is the number of recent successful completions, capped. Fruit **ripens**
  over its life and then **drops** as it ages out of the window, so the plant shows
  what it finished lately and not its whole history.
- **Failure becomes deadwood.** A failed completion leaves a short length of
  **deadwood**, a bare, grey, brittle twig that stays as a record of the bad ending
  until it weathers away. This is different from the **staleness grey** that
  covers a whole silent plant, which means missing signal, not failure. Deadwood
  is *local*: a dead spot on an otherwise living plant, which is exactly what one
  bad build among green ones looks like.

Both follow the channel rule. Fruit and deadwood are their own channel (output,
discrete and counted) and don't repeat what vitality says. A wilting plant can
still carry fruit from work it finished before it started struggling, and a
thriving one can carry deadwood from a single bad ending. That independence is
the point, and a level could never express it.

---

## The tension that had to be settled first: fruit already meant something

This was the one real design decision, and it had to be made before any code.
**Fruit was decoration.** `Produce.tsx` draws it for vegetable and vineyard
*plantings*, seeded and varietal and explicitly *not* a signal. Its comment says
so, and its colour only greys for staleness. Completion fruit would make fruit a
*signal*. Fruit can't be decoration and signal in the same view, or you get the
"green means two things" problem the environment model exists to prevent.

There were three ways out, in order of preference:

1. **Separate them by garden, and never mix them on one plant.** Decorative
   produce belongs to the vegetable and vineyard plantings. Completion fruit
   belongs to nodes that *have completions*. A source whose plants complete work
   doesn't also plant them as a vegetable patch, so within any one garden fruit
   means exactly one thing. This is the cheapest option and it fits how plantings
   already work (a property chosen per garden). The rule is: **a node never both
   bears decorative produce and receives completions.**
2. **Give completion fruit a look nothing else has**, such as a distinct form or
   a ripen-and-fall motion decorative produce never uses, so the two can't be
   confused even on the same plant. More work, and it spends design effort to
   allow a mix that option 1 simply forbids.
3. **Retire decorative produce**, so fruit *always* means output. The cleanest
   idea, but the vegetable and vineyard gardens lose a feature they were built
   around.

**Option 1 was chosen.** It needs no new visual language and keeps one meaning
per garden by construction. The mock data keeps completions off any bed that
bears produce.

---

## Time: completion scrubs like everything else

Completions ride on the node snapshot the way blights do, and everything in this
app is derived as of a timestamp. A source's reading at time T carries the
completions that had happened by T. Scrubbing the sun back re-derives an earlier
reading, and a build that finished on Tuesday isn't there on Monday, the same
way an injury from the fourth quarter disappears when you scrub back past it.

So completions need **no new history tier**. The four-axis buffers in
`history.ts` are untouched. Completion lives on the node like `blights`, and the
existing scrub machinery rewinds it for free. A fruit's ripening or a deadwood's
weathering is computed from `cursor - completion.at` at the cursor, so both are a
pure function of the displayed time and come out identical under a scrub.

---

## The first source: a mock Pipelines garden

The natural home for this is **CI pipelines**, where things genuinely finish. A
live CI feed needs network access this environment doesn't have, so the test bed
is a **self-contained mock Pipelines garden**, in the same spirit as the other
mock gardens that exist to tune the renderer:

- each **pipeline** is a plant, and the **beds** are teams or repositories;
- **activity** is how often it builds, so a busy pipeline sways;
- each **build** is a `Completion`: green bears fruit, red leaves deadwood,
  generated on the same tick the mock gardens already use;
- a **currently broken** pipeline (several reds in a row) also grows a `Blight`,
  so both channels are exercised together and you can see they read differently.

When network is available, a real source drops in behind the same interface.
Completion is already one of the fields the **declarative mapping** in
`docs/sources.md` can set ("this field is the outcome, this is the timestamp,
this is the evidence"), so the mock and a real feed produce the same node shape.

---

## Phasing

1. **Contract and pure logic.** Add `Completion` and `node.completions` to
   `ecosystem/types.ts`, plus pure helpers for "completions as of the cursor",
   ripeness and weathering from age, and per-plant fruit and deadwood counts. All
   testable without a renderer, like `staleness` and `labels`. *Done.*
2. **Drawing.** Draw completion fruit and deadwood from `node.completions`
   (`scene/Completions.tsx`, a sibling of `Produce.tsx`), following option 1 so it
   never collides with decorative produce. *Done.*
3. **Test bed.** A mock Pipelines garden in `mock/` with a drift tick that
   completes builds, so the whole thing is visible and scrubbable with no backend.
   *Done.*
4. **Live, later.** A real CI or Actions source behind the source interface, with
   completion carried through the declarative mapping. *Not started.*

---

## Constraints it mustn't break

- **The channel budget.** Completion is a *new* channel, output, and has to stay
  separate from the health reading. Fruit doesn't mean "healthier" and deadwood
  doesn't mean "sicker". They mean "finished well" and "finished badly",
  independent of vitality.
- **One meaning per garden.** Fruit must never mean decoration and completion in
  the same garden.
- **Provenance.** `Completion.evidence` is required, for the same reason the world
  garden made blight evidence required. A mark that claims a real outcome has to
  carry what it was, or the inspection panel can't answer "says who?".
- **No node field that only one domain uses.** `completions` is general (work that
  ended), just as `blights` is. Nothing DevOps-specific leaks into the contract.
  The specifics live in `label`, `evidence` and `raw`.
- **Derive as of the cursor, and keep no new history.** Completion rides the node
  snapshot and scrubs through the existing cursor. It mustn't grow a history tier
  of its own.

---

## Still open

1. **Acknowledgement.** Should a completion the viewer hasn't seen yet look
   different (a glow, say) and settle once they've looked, tying into "changes
   since last visit"? Worth a second version, and out of scope for the first.
2. **Suppress polarity.** On a weed (a backlog you want gone), does "a task
   completed" show as fruit, meaning good, even though the node's growth is
   alarming? Probably yes, since completion is literal and doesn't depend on
   polarity. It's an edge case the mock garden should include so the answer comes
   from looking at it, not from arguing about it.
