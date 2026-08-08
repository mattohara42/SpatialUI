# Reading language and open design concerns

This document is the counterpart to ARCHITECTURE.md. That one records how the
system is built. This one records what the garden is supposed to communicate,
and the things we know are unresolved.

## The channel budget

Nine signals compete to be visible: vitality, activity, maturity, trend,
polarity, blight severity, staleness, edge kind, edge strength. A person reads
three or four at a glance. Every one of them cannot have a channel, so the
allocation is a design decision rather than an implementation detail.

Current allocation, to be judged against a real scene rather than defended on
paper:

| Signal | Channel | Reads at |
| --- | --- | --- |
| vitality | droop, splay, leaf density, taper | across the room |
| polarity | archetype: plant or weed | across the room |
| staleness | desaturation, dust, no leaf motion | across the room |
| blight severity | pests and discoloration | a few metres |
| trend | fresh growth or shedding | a few metres |
| activity | animation rate, ambient audio | ambient, not read directly |
| maturity | trunk thickness, structure size | structural, not read directly |
| edge strength | graft thickness and flow brightness | on approach |
| edge kind | graft material | on approach |

Domain needs no channel at all, because gardens are separate environments. That
fell out of the garden decision rather than being designed, and it is the reason
the budget is survivable.

Colour is deliberately not load-bearing. Health already reads through droop,
splay, and leaf density, so a red and green palette, which is the worst possible
pairing for the commonest colour blindness, is a redundant encoding rather than
the encoding. Keep that property on purpose.

## The moment of use

Desk Bonsai is the primary mode and Greenhouse is the occasional deep dive.

The claim the product makes is peripheral awareness: the garden sits in
passthrough at the edge of the desk, and you notice something wilting while
doing something else. That dictates minimal chrome, no menus, legibility at
three metres, and detail only on approach. If instead someone puts on a headset
specifically to investigate a problem, a dashboard beats a garden every time and
the spatial layer is decoration. Everything in this document assumes the first
reading.

Greenhouse also carries a cost nobody escapes: locomotion design, and the fact
that people do not wear headsets for long stretches. That is a second argument
for the tabletop being the default.

## Time

Scrubbing is the sun moving across the sky. Longer spans are seasons. No slider,
no scrub bar, nothing borrowed from a video player.

The mechanism already exists: `state.cursor` and `vitalsAt`. What remains is the
gesture and the lighting model. This is the interaction most likely to make the
concept feel inevitable rather than skinned, and it is worth spending effort on.

## Five things we know are unresolved

**Silence looks like health.** An adapter that dies leaves a green, thriving
plant standing there, and a garden is reassuring enough that people will believe
it. This is the classic monitoring failure and the metaphor makes it worse
rather than better. Staleness therefore gets its own visual state, and it should
be faintly unsettling: grey, dusty, no motion. `isStale` in `ecosystem/staleness.ts`
derives it from `updatedAt`. The threshold is per-garden, because an hourly notes
scrape and a fifteen second Prometheus scrape mean very different things by late.

**What changed since I last looked** is a different question from what things
look like now, and it is closer to what the product actually promises. A service
that crashed and recovered overnight is invisible to a live view. The store
records `lastViewedAt` per garden and `changedSince` reports what moved, so
entering a garden can draw attention to change rather than to whatever happens to
be worst at that instant.

**Traversal is undesigned.** Fifteen plants you walk around. Five hundred you
cannot, and there is currently no aggregation at distance and no way to stand at
bed level even though the rollups already exist in the data. The first scene
dodges this deliberately. Layout decisions made now should leave room for it
rather than quietly foreclose it.

**Normalization creates false comparability.** Vitality 0.6 in one garden and 0.6
in another were computed by different translators against different scales, and
separate environments keep those apart. Inside a single garden, two adapters can
still disagree about what 0.6 means, and a bed will look wrong for reasons nobody
can see. This belongs in the adapter contract, written before the first adapter
exists: what the endpoints mean, what the midpoint means, and what evidence
justifies a given mapping.

**Completion has no vocabulary.** Tasks and goals end, plants do not. Fruit and
deadwood are the obvious answer. Deferred until the scene exists.

## Recorded assumption for the first scene

Plants are planted in rows inside their beds and grafts cross the space between
them. This is the least presumptuous layout and the fastest to judge by eye. If
connected plants sitting far apart is what ruins the reading, that is exactly the
thing the first ugly scene should reveal.
