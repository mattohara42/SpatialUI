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

## What is decoration, and why decoration is allowed

Two recent additions carry no signal at all, and that is the point of them.

Individual variety within an archetype — whether a plant grows as a broadleaf, a
bushy crown, or a willow — is chosen by a hash of the node id, not by any metric.
It exists so a bed looks like a planting rather than a stamped row, and it is
free precisely because it means nothing: the reader learns to ignore *which*
tree the way they ignore which blade of grass. The load-bearing shape read is
still only polarity — weed versus plant — and that is held hard, so a thriving
weed is still alarming and a variety pick never dilutes it. The db conifer is the
one shape chosen by meaning, kept as a deliberate exception.

The horizon — hills, mountains, a tree line — is decoration in the same sense.
It is static and signal-free, so it never competes for the reader's attention or
spends a channel. It earns its place by giving the scene depth and a sense of
place, which is what makes the garden feel like somewhere rather than a plot
floating in fog. The rule it must keep is the rule colour keeps: it may be
beautiful, but it may never look like it is telling you something.

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

The day is built. `scene/daylight.ts` turns a timestamp into a sun direction and
a full palette, and dragging the sun inverts that: the pointer ray is projected
back onto the sun's own path to get an hour, and the angle travelled becomes
elapsed time at a circle per day. The slider is gone.

Three things it settled that were not obvious on paper:

**The mapping has to be honest, and honest is slow.** A full turn is a day, so
a screen-width drag is about four hours and reaching the far end of the window
takes ten of them. Rescaling the drag would fix that and would also make the sun
move at a rate that is not the sun's, which is the entire thing the gesture is
trading on. Coarse movement belongs to a different gesture — seasons — not to a
faster version of this one.

**Night has to stay readable.** A garden nobody can read is a garden nobody
checks, so the moon takes the key light when the sun is down rather than the
scene simply going dark, and shape and droop survive in silhouette. Colour does
not, which is another reason colour is not load-bearing.

**The sun is often unreachable.** With the camera clamped at the horizon, most
of the day the sun is somewhere a mouse cannot point. Shift-drag anywhere is the
desktop stand-in, and it is a stand-in: the gesture assumes you can look up,
which is true in a headset and false on a desk. Worth remembering before this is
judged on a monitor.

What remains is seasons, and whether a cursor that lands in the dark should say
so more loudly than by being dark.

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
