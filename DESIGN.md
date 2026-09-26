# Reading language and open design concerns

This is the counterpart to ARCHITECTURE.md. That file records how the system is
built. This one records what the garden is supposed to communicate, and what we
know is still unresolved.

## The channel budget

Nine signals compete to be seen: vitality, activity, maturity, trend, polarity,
blight severity, staleness, edge kind and edge strength. A person reads three or
four at a glance. They can't all have a channel, so deciding who gets what is a
design decision, not an implementation detail.

The current allocation, which should be judged against a real scene instead of
defended on paper:

| Signal | Channel | Reads at |
| --- | --- | --- |
| vitality | droop, splay, leaf density, taper | across the room |
| polarity | archetype: plant or weed | across the room |
| staleness | desaturation, dust, no leaf motion | across the room |
| blight severity | pests and discoloration | a few metres |
| trend | a plume: rising and amber, or falling and washed out | across the room |
| activity | animation rate, ambient audio | ambient, not read directly |
| maturity | trunk thickness, structure size | structural, not read directly |
| edge strength | graft thickness and flow brightness | on approach |
| edge kind | graft material | on approach |

Time isn't on this list and must never be. The hour and the season show in the
light (the sun's position, the length of the day, the palette) and never in a
plant. A garden that dropped its leaves in November would be using the wilt
channel, which is the one reading that has to stay unambiguous.

Domain needs no channel at all, because each garden is its own environment. That
came out of the decision to separate gardens instead of being designed, and it's
the reason the budget works.

Colour is deliberately never the main signal. Health already shows through droop,
splay and leaf density, so a red and green palette (the worst possible pairing
for the most common colour blindness) is only a backup. Keep it that way on
purpose.

## The plume: using the trend channel

Trend had a row in the table from the start and nothing drawing it. Every
translator computed the axis, history stored it and the detail panel printed it,
but the scene never showed it (the calibration note further down mentions this in
passing). A plant that was climbing and one that was sliding looked the same until
you walked up and tapped the tag.

It's drawn now, and not as fresh growth. A plant that's moving throws off a
**plume**: specks rising through its canopy in warm amber when things are getting
better, and sinking to the soil in faded slate when they're getting worse.

**Direction carries the meaning and colour repeats it.** Up or down is the whole
message, and it survives being seen in silhouette, from a distance, in the dark,
and by anyone who can't tell the two colours apart. The colours are a bonus for
people who can. Amber against slate blue is the one pairing that survives every
common kind of colour blindness, which is the deliberate opposite of the red and
green this document has warned about from the beginning.

**Growth would have been the wrong channel.** The obvious reading of "fresh growth
or shedding" is to put trend into the plant's geometry, with new shoots on a
climbing plant and bare twigs on a sliding one. That uses the wilt channel twice.
A plant shedding to bare twigs already means *this is in trouble*, and a service
that's struggling but recovering would have to be drawn both ways at once. Keeping
the change in the air around the plant and the level in the plant is what lets a
4-9 club that has won three straight read as exactly that: low, and rising.

**Most of the time it isn't there.** Below a threshold nothing is drawn, so a
garden that's just sitting still has no plumes, and the ones that do appear are
the plants worth walking over to. That's the point of it: something to notice when
you look again, which a cue that's on everywhere can't give you.

**Silence has no direction.** A stale plant never plumes, whatever its last trend
was, because that number is old and things may have changed since. This also
keeps the plume separate from the dust. Both are falling specks, and without the
rule a plant could show both and mean two things. With it, a falling speck on a
coloured, swaying plant means *this is going down*, and on a grey, still one it
means *nobody has heard from this*.

**Polarity is applied before anything is drawn.** A backlog growing fast is bad
news. `signalTrend` inverts trend for suppress-polarity nodes the same way
`signalHealth` inverts the level, so the plume can never say a spreading outbreak
is going well.

### The threshold was measured, and it found a real inconsistency

The threshold was chosen by running the actual pipelines, not by reasoning about
the axis. At a fixed clock, the three real sources disagree sharply about what a
unit of trend is. The league's clubs spread across the whole range with a median
around a third of it. The market book's holdings bunch low and never reach half.
The world's countries saturate, with more than half of them above 0.5. A tenth of
a point is inside the noise for all three, and a quarter silences most of the
market. 0.15 leaves every garden with some plants moving and some not, which is
the only thing the cue actually needs.

The disagreement is the real finding, and it's not a rendering problem. Every
translator calibrates *vitality* against the worst case that can really happen
(that rule is written down twice in this file), but nothing has ever held *trend*
to the same standard. So the same number means "drifting a little" in one garden
and "the fastest thing here" in another. **Trend needs the same calibration pass
vitality got**, source by source. Until then, the plume faithfully shows the data
as it is, not as the axis claims it should be.

## Beds are plantings

A garden fixes what vitality *means*. A bed says what's *planted*. Beds used to be
just spatial buckets, which is why a garden looked like a random thicket of trees
at mixed health. It's also why the infrastructure garden in particular looked
dead: it was mostly deciduous trees running low, and a bare tree is the bleakest
sick state there is and the one closest to the grey of staleness.

The fix was to base the scene on real gardening. Each bed is a *kind* of planting
(an orchard, a hedge, a conifer stand, a flower border, a vineyard, a topiary) and
it's filled with the plant forms that belong to it. This is a real improvement in
meaning, not a new skin. It gives the bed layer a meaning it never had, and it
makes each bed readable as a unit.

Three properties make it safe instead of another way to overload the reading:

**A planting belongs to the container, not to health.** It never changes with a
metric. It sits in the same slot as domain and the choice of tree variety:
learnable, constant, and carrying no signal per node. So it uses none of the
limited health budget. Health still shows through droop, leaf density and colour
*within* whatever form the planting calls for. That boundary is the whole reason
this is affordable.

**Polarity still beats everything.** A suppress-polarity node is a weed wherever
it grows, whatever the bed is planted with, because a thriving weed looking
alarming on sight is the one shape reading that matters most and it has to
survive. Right now every garden is a single polarity, so the suppress gardens are
just planted as thickets. The sharper case of "a weed among the vegetables" waits
on per-node polarity.

**Colour stays decorative.** Flowers and fruit make it tempting to have bloom
colour or ripeness mean something. They mustn't. Health shows through open versus
wilted and full versus bare, which is form, and never through hue, the same rule
colour has always followed here.

The plantings arrived in phases.

First came the plantings that are arrangements of the existing L-system forms:
orchard, grove, hedge, conifer stand and the weed thicket, each laid out in its
own way (rows, a single low line, a jittered clump).

Then flowers, the first form that isn't a tree. A **bloom** is a short green stem
with a head of petals. The head is a leaf cluster with a petal shape, so it costs
the renderer nothing new, and the flower's health reads the way it should: a
thriving flower is full of petals, and a struggling one stops blooming and stands
as a bare stem, which looks nothing like the grey of staleness. Petal colour tests
the colour rule. It's decorative and varies by plant, seeded per node, and it
means nothing, so health never depends on hue. A flower border stands flowers in a
tidy row and a wildflower meadow scatters them.

Then vegetables, which bring **produce**: fruit drawn on some of a plant's leaf
points. It reuses the existing geometry and its amount follows the leaf count, so
a thriving vegetable is laden and a struggling one bears nothing, the same wilt
reading the leaves give. Produce colour is decorative, like petals.

Last came the two forms that aren't trees at all. A vine is trained along a wire
and a topiary is clipped into a solid shape. Neither is self-similar, so neither is
an L-system. They're built by hand in `lsystem/bespoke.ts`, but they output the
same geometry the grammar does, so they sway, droop, colour and cache like
everything else, and only the shape is new. The **vineyard** stands its vines in a
row on a **trellis** (posts and wires, static like the horizon) with the main stem
trained along the wire and grapes hanging from the shoots, reusing the produce
code with a grape palette. **Topiary** clips foliage into a sphere, cone, cube or
spiral chosen per plant. Here health works the other way round: a tended topiary is
crisp and full, and *neglect* makes it patchy, with stray shoots poking through the
clipped surface. So its wilt state is shagginess, which again looks nothing like
staleness or a bare tree.

Every planting type has a wilt state that's different from staleness (a bare stem,
no fruit, shagginess), so a struggling service never looks like a dead adapter.
That guardrail is what the whole idea depends on, and it now holds across every
planting.

Fruit also gave the *completion* vocabulary its home. Fruit and deadwood for
finished work share the drawing approach with produce, and they're kept in
separate gardens so fruit only ever means one thing in a given garden. See
`docs/completion.md`.

## The league: what a real source asks of the mapping

The NFL was the first garden made of things that actually happened, and adding it
settled four things the mock data never could have raised.

**The axes have to split the domain between them, not repeat it.** Vitality is the
record, the point differential and how much of the roster is available. Maturity
is starter experience, roster age and how long the franchise has existed. The rule
that keeps the garden readable is that they never cross: **injuries lower vitality
and never touch maturity, and age and experience raise maturity and never touch
vitality.** An old roster is a big tree, not a healthy one. A hurt roster is a
wilting tree, not a small one. If they crossed, every ageing club would look sick
and every young one would look like a seedling in trouble, and four readings would
blur into one. Trend is the same argument over time. A 4-9 club that has won three
straight is trending up while its vitality is still low. If trend were just the
rate of change of vitality, it would say nothing the level didn't already say.

**Average isn't half dead.** Half of any league is below .500 by definition.
Mapping the composite straight onto vitality put half the garden into wilt every
week, and wilt means *this is in trouble*, not *this is mid-table*. It's the same
problem the infrastructure garden showed, where deciduous trees at middling health
looked like bare twigs, the bleakest state the renderer has. So the composite is
calibrated once, in one line, with a monotonic curve. Zero on the axis is a
winless club with a wrecked roster, which is somewhere nobody actually is, so
average has to sit above the midpoint. The order is unchanged (the table still
reads top to bottom), but the garden stands up.

This applies generally, and it belongs in the adapter contract described below:
**an axis endpoint is the worst case that can really happen, not the arithmetic
minimum.** Every translator will run into it.

**A planting carries no signal per plant, but it does per bed.** Plantings differ
in how harshly they show ill health. A struggling tree sheds to bare twigs, a
struggling topiary goes shaggy, and a struggling vegetable just bears less. The
league has eight beds in two rows, one row per conference, and the first version
gave the AFC all four tree plantings. That made a whole conference look worse than
the other for no reason at all, which is exactly what plantings promised not to do.
Each conference now gets two tree forms and two softer ones. The rule: **a planting
says nothing about the plant, but an uneven spread of plantings says something
about the group**, and beds are grouped now.

**Silence can be real instead of staged.** The mock gardens each keep one plant
with a dead adapter, because a failure state nothing in the demo can reach is one
nobody will ever look at. The league doesn't need that. A club on a bye really has
no new data, so with a seven-day threshold the two clubs off each week stand there
grey, still and dusty on their own. The garden can't tell a bye from a dead feed,
and it shouldn't try, because both mean what you're looking at is old. That's the
strongest form of the staleness argument so far, because the data provided it.
It survived staleness becoming schedule-aware: the league deliberately keeps the
flat seven days, because a schedule would clear the bye and remove the state.

## The market: what a second source asks that the first didn't

The league proved the pipeline worked. It couldn't test it, because one source
can't tell you which of your decisions were principles and which were coincidences
that happened to suit football. The market was chosen because it would disagree,
and it settled four more things.

**Polarity was theory until something was short.** `suppress` has existed since
the first sketch (the idea that some things are alarming when they thrive), but
until the market only mock threat data used it, so it was never really tested. A
short position is the real thing: you hold it and you want it to go *down*.

Getting it right came down to one decision that looks like a detail and isn't.
Vitality is **how far the instrument has moved since you took the position,
without a sign for long or short**, not the position's profit. If you signed it by
side, the number would already say "this is going well for me", polarity would
flip it *back*, and a short would look healthy exactly while it was losing you
money. The garden would look right and mean the opposite. The rule: **a translator
says what the thing is doing, and polarity says whether that's good news. A
translator that answers both has broken the axis.**

**"Silence is never health" has a structural exception.** A market is closed every
night and all weekend and nothing is wrong. The rule can't just be relaxed, since
silence looking like health is exactly what the staleness state exists to prevent.
So it's stated more precisely: **the reader should be warned when a source misses
something it said it would produce, and not warned at all for silence that was
scheduled.** Only the adapter knows which is which.

The first attempt sized one threshold to the longest gap the source *legitimately*
produces, computed from the exchange calendar. It kept the rule but blunted it. A
ratio of elapsed time to a single duration can't tell a closed exchange from a
dead vendor, so a feed that died on Friday wasn't flagged until midweek. Staleness
now takes a **schedule**: a due time from the source's own calendar, plus a grace
period that only starts once something is actually owed. Nothing is owed over a
weekend, so a weekend costs nothing. Two missed prints during a session means a
dead vendor, and it shows as one. The numbers are in ARCHITECTURE.md.

The lesson to carry forward: **duration was the wrong unit.** The question a person
is asking isn't "how long since I heard?" but "is anything missing?", and those
only match for a source that never sleeps.

**Calibration is a measurement, not a matter of taste.** Two faults made it into
the first draft of this source, and neither was visible in the render. The
generated tape had a volatility drag that decayed every instrument, putting the
whole book at a median 6% down. And vitality penalised ordinary drawdown, which at
market volatility is 10 to 20% off the high almost all the time, so the axis was
reporting volatility instead of health and the median plant sat at 0.40. Both were
found by comparing the market's health distribution against the league's, and
neither would have been spotted in a screenshot. **Measure a new source's
distribution against an existing one before judging it.**

**Every source has a shape the model doesn't.** Football has two grouping levels
(conference and division) and the model has one. That was solved by ordering bed
ids so a conference reads as a row. The market has sectors, which fit the one level
exactly, but it also has *lots*, several fills making up one position, and the node
type has nowhere to put them. That worked out cleanly because a position is the sum
of its lots at a given moment, so the derivation handles it and the node never
knows. Both teach the same lesson: **pressure to widen the node type usually means
a derivation that hasn't been written yet.**

## The World: what a third source asks that neither of the others did

The league proved the pipeline and the market tested it. Both are thirty-two
things in eight even beds, taking numbers from a feed that publishes on a clock,
and between them they'd stopped disagreeing. The World was chosen for what it
breaks.

**A number can turn out wrong later.** This is the first source where a figure
about a finished period can *change*. Growth is published about seventy-five days
after its quarter and revised a month after that, so the same quarter has two
values and there's no single "correct" figure for it.

The answer is the most important thing this source contributed: a plant shows what
was **known** at the cursor, never what's now believed to be true. Scrub back past
a release and the country steps back to the previous figure. The alternative,
showing today's view of April when the cursor is on April, would mean the garden
silently rewrote its own past whenever a statistics office changed its mind. That's
the same failure as drawing a flat line through a stretch nobody recorded, just
reached another way. It also gives the scrub something to do in a garden whose
underlying numbers only change once a quarter: what moves isn't the world, it's
what was known about it.

**A headline isn't a record.** The other two adapters get structure from their
feeds: a box score has a home team, a bar has a symbol. This one gets sentences,
and turning one into `{iso3, kind, at, severity}` is the first place in the project
where the app makes a **judgement** about its input instead of a calculation.

Two rules come with that, and they're the price of being allowed to do it at all.
*Extraction won't guess.* A headline naming two countries, or none, or using
sports vocabulary, produces nothing. A miss costs a plant that's quieter than the
world was. A wrong attribution claims something happened in a real country, in a
panel that looks exactly like the ones showing measured numbers. Those costs aren't
comparable. And *every derived event keeps its source sentence*, so a blight can
answer "why?" with the actual dispatch instead of a severity level. A judgement
shown without its evidence is a judgement pretending to be a measurement.

**Conflict is a blight, not a health score.** The obvious design was to fold war
into vitality. A country at war visibly wilting would read powerfully across a
room, which is exactly the kind of reading this project is built on. It's also the
one thing this source mustn't do. Vitality is a comparison (0.6 against 0.55
invites "doing better than"), and a garden that ranked countries by war would be
making a claim a single number can't support. So conflict is named, dated, sourced
and attached to a plant that keeps reporting whatever it reports. The garden says
something is wrong there without claiming to know how wrong.

**Size is maturity, and maturity still isn't health.** A country has a size, and
people expect a big country to be a big plant. That instinct is right and doesn't
need a new channel. Maturity already owns structural size in the budget, so a
country's maturity is its UN age, its population weight and how young its
population is. India is a big old tree and Estonia a small young one.

The important consequence is the same rule the league wrote and the market
repeated, in a third form. An old company is a big tree, not a healthy one. A
position deep underwater is a wilting tree, not a small one. And **a small country
has to be able to be the healthiest plant in its bed.** Nothing in the vitality
function can see population, and nothing in the maturity function can see growth.

**A container property can pick up a meaning nobody intended.** Everywhere else a
planting carries no signal, because a sector or a division has no character for it
to comment on. A world region does. Giving one of them the invasive thicket because
a bed looked bare would read as an opinion about the place, and nobody could point
to where that opinion was formed. Basing the assignment on what actually grows
there (date palms in Northern Africa, vines in the south, conifers in the north,
savanna where there is savanna) removes the judgement instead of hiding it. It
describes the land instead of rating the country. `thicket` appears nowhere in that
table.

**Calibration is measured, not argued, again.** The trend axis was first scaled to
two and a half points of growth, based on how far growth can swing. Against the
actual distribution that put nine tenths of the world within a tenth of zero, so
the channel went unused. Successive figures move by about four tenths of a point,
so the axis has to end at one point. It's the same fault and fix as the market's
drawdown threshold: **a scale reasoned from the domain instead of read off the data
is usually too wide.**

## What counts as decoration, and why it's allowed

Several parts of the scene carry no signal at all, and that's the point of them.

**Leaf shape.** A leaf is a blade with a shoulder, a fold along its midrib and a
curl at its tip, and which profile it uses follows the archetype (and so the bed's
planting), not anything that changes. It's worth being clear about why that's safe,
since leaf shape sounds like it ought to carry health: **a sick plant's leaves are
missing, not misshapen.** Wilt shows through how many leaves are left and how far
the plant droops, and giving a better-shaped leaf to a struggling plant doesn't make
it look well, because it barely has any.

**Variety within a bed.** Whether a plant in an orchard grows as a broadleaf or a
bushy crown is chosen by a hash of the node id, not by any metric. It's there so a
bed looks grown instead of stamped out, and it's free because it means nothing. The
viewer learns to ignore *which* tree it is, the way they ignore which blade of grass.
The important shape reading is still only polarity (weed or plant), and that's held
firmly, so a thriving weed is still alarming and a variety pick never weakens it.

**The horizon.** Hills, mountains and a tree line. It's static and carries no
signal, so it never competes for attention or uses a channel. It earns its place by
giving the scene depth and a sense of place, which makes the garden feel like
somewhere instead of a plot floating in fog. The rule it follows is the same one
colour follows: it can be beautiful, but it can never look like it's telling you
something.

**Texture.** Every surface used to be one flat colour: one green for the ground,
one brown for a bed, one value for every leaf on a plant. That's what made the
scene look like a diagram of a garden instead of a garden. Grain fixes it at two
scales: a generated map *within* a surface (turf, soil, bark) and a small, stable
variation *between* instances, so a canopy breaks up into leaves and a bunch of
grapes into berries.

The rule is that **grain changes brightness and never hue.** The maps are
achromatic by construction and the variation is a single multiplier, so both only
darken or lighten a colour that was already tuned and neither can shift it around
the colour wheel. That keeps texture completely outside the channel budget. Colour
here is deliberately a backup, and a texture that tinted things would start carrying
signal: a mottled leaf would look sick and a lighter berry would look riper. Keeping
it subtle enough to be felt but not seen is the same guardrail from the other side.
At these strengths nobody could mistake one bright leaf for a statement about that
leaf.

**Ground cover**, which turned out to have a harder edge than the rest. Grass tufts
outside the glass and stones and litter on the path make the two biggest surfaces
in the scene look like ground instead of a picture of ground. The obvious next step,
scattering it through the beds too and making it denser under healthy plants, is
the one thing it must never do, and not just because density would start carrying
signal. **A bed is where polarity is read.** A tuft of grass in the soil is a weed,
and a thriving weed looking alarming is the most important shape reading in the
whole language. So scatter is kept out of the beds by construction: the bed
footprint is passed in as an exclusion zone instead of being left to chance, and
density depends on position and a fixed seed so it's the same at every vitality.
Decoration is affordable while it means nothing. This is the case where the same
decoration in a different place would have meant something, and something
alarming.

## Under glass

The garden stands in a greenhouse. That's a decision about how much world has to
exist, not just a change of backdrop.

Outdoors, the answer to "how much?" is *all of it*: grass to the horizon, hills, a
tree line, every one of them a surface that has to hold up from any angle the
camera can reach, and none of which anyone is meant to look at. A wall three
metres away answers the same question and stops it being asked. The field and the
hills are still out there, lit by the same sun, but they've become weather instead
of scenery: seen through glass, softened, and no longer important. That takes the
horizon's approach one step further, and it's the first real saving the scene has
made.

The glass mustn't take the sky. Time is controlled by dragging the sun, so a roof
that hid it, dimmed it or caught the pointer aimed at it would break the whole
gesture. That's why the panes cast no shadow and write no depth, and why the sun,
moon and stars show through the roof exactly as they did outdoors. Everything the
light does, it still does.

Beyond enclosing things, the house follows the horizon's three rules: static, no
signal, and no colour logic of its own. It carries no meaning, so it can be as
detailed as it likes. The one place it touches the reading is a benefit: a
glasshouse **diffuses** light, and diffused light is exactly what a scene read at a
glance from three metres wants.

**Raised beds are the part that matters.** The soil used to be a slab lying on the
ground, which is a patch of different colour, not an object in a room, and that's
most of why the beds looked like regions on a map. Four boards, corner posts and a
cap rail give the soil an edge, a thickness and a shadow, and that's the difference
between ground someone coloured in and ground someone built. The trick is how it
was built: the beds are raised by *lowering the floor*, so the soil surface stays
exactly where the plants already stood and nothing that measures from a plant had
to change.

**The props suggest someone was here.** A hose on its hook, a bench on castors, a
watering can set down next to a pair of gloves, pots waiting to be filled. None of
it means anything and none of it can ever look like it does. What it adds is this:
beds and glass say a garden *exists*, but a can next to a pair of gloves says
someone was here this morning and is coming back. That's the feeling the product is
after, a place you keep an eye on instead of a dashboard you open. It's also the
cheapest thing in the scene, because unlike a plant, none of it has to be true.

Two rules hold it in place, and any future decoration should follow them. It
stays **against the walls**, in the space the shell leaves around the beds, so it
never stands between the camera and a plant. And it's **still**. Motes, dust and
sway are the only things that move here, and all three carry signal, so a rocking
watering can would be motion that meant nothing. That's worse in this scene than it
would be in one where motion never means anything.

## Three questions, three distances

For a long time the garden answered one question very well and only that one:
**something's wrong, and it's over there.** That reading works across a room. It's
what shape, colour and motion are spent on, and it's the whole reason this is a
garden and not a dashboard.

Two other questions are asked from closer up:

| distance | question | what answers it |
| --- | --- | --- |
| across the room | is anything wrong? | the plants themselves |
| at the bed | which one is this? | the tag |
| standing at it | what happened, and which way is it going? | the panel |

Treating them as a sequence is what protects the first one. A name isn't a health
cue and mustn't compete with one, so **labels don't exist at a distance.** A tag
fades in as you approach a plant and disappears when you step back, the way a
nursery label is only readable up close. Thirty-two captions floating over a garden
would be a chart with foliage, every one of them pulling at the glance the plants
are supposed to own.

**An emblem is chosen by translation, never guessed by the renderer.** Every
source has its own idea of what things are called and what they look like. A
league has club colours and three-letter codes, a cluster has service names, and
none of that can be derived from the four health axes. So the emblem is a
translator's decision, like planting type and polarity, with an explicit default
(`emblemFrom`: initials on a stable colour) for sources that don't have marks of
their own. Using the default is still a choice, made where the domain is in scope.

That puts colour on a card, which the channel budget would normally forbid. The
rule that resolves it: **a colour that never changes is identity, and a colour that
changes is signal.** An emblem is fixed for the life of the node and sits on
something that's obviously a label, so nothing about it can be read as vitality.
What stays absolutely banned is a source's palette reaching the *plant itself*
(bark, foliage, produce, bloom), where it would share a channel with health and win.

**The panel is the record, not a verdict.** It's the only place in the app with
numbers, which is what a deliberately lossy summary owes you: you can always get
back to the readings the picture was made from. It has no colour and no ranking,
because a panel that turned red would be a second, competing reading of a node the
garden has already described. It reads everything at the cursor, so scrubbing with
one open updates it: the numbers, the trend and the end of the sparkline all show
the same moment as the sky. And it hangs in the air beside its plant instead of
being stuck to a corner of the screen, because a headset is a stated target and a
card locked to your head is the one interface a headset can't have.

One rule inside it deserves stating by itself: **a gap in the data is drawn as a
gap.** The sparkline breaks where nothing was recorded instead of joining the line
across it. A trend line that bridges silence shows something that didn't happen, in
an app whose central claim is that silence must never pass for health.

## When it's used

Desk Bonsai is the main mode and Greenhouse is the occasional deep dive.

The product's claim is peripheral awareness: the garden sits in passthrough at the
edge of your desk and you notice something wilting while doing something else.
That calls for minimal chrome, no menus, readability at three metres, and detail
only when you get close. If someone puts on a headset specifically to investigate a
problem, a dashboard beats a garden every time and the spatial layer is just
decoration. Everything in this document assumes the first case.

Greenhouse mode also has costs nobody gets around: designing movement, and the fact
that people don't wear headsets for long. That's another argument for the tabletop
being the default.

## Time

Scrubbing is the sun moving across the sky, and longer spans are seasons. No
slider, no scrub bar, nothing borrowed from a video player.

The day is built. `scene/daylight.ts` turns a timestamp into a sun direction and a
full palette, and dragging the sun reverses that: the pointer ray is projected back
onto the sun's path to get an hour, and the angle travelled becomes elapsed time at
one full circle per day.

Three things this settled that weren't obvious on paper:

**The mapping has to be honest, and honest is slow.** A full turn is a day, so
dragging across the screen covers about four hours and reaching the far end of the
window takes ten drags. Rescaling the drag would fix that, and it would also make
the sun move at a rate that isn't the sun's, which is the whole thing the gesture
relies on. Big jumps belong to a different gesture (seasons), not a faster version
of this one.

**Night has to stay readable.** A garden nobody can read is a garden nobody
checks, so when the sun is down the moon takes over the key light instead of the
scene just going dark, and shape and droop survive in silhouette. Colour doesn't,
which is another reason colour is never the main signal.

**The sun used to be out of reach, and the fix was to stop orbiting.** The camera
looked down at the beds and couldn't be raised, so for most of the day the sun was
somewhere a mouse couldn't point. Shift-drag anywhere was the desktop substitute,
and it was always a substitute: the gesture assumes you can look up, which is true
in a headset and wasn't on a desk.

Moving indoors made this worse without causing it (the outdoor camera had the same
limit, since an orbit control always aims at its target), but outdoors you could at
least back away until the sky came into frame, and inside the glass you couldn't.

What changed is which end is fixed. An orbit fixes the target and swings the eye. A
person fixes the eye and turns their head. `StandControl` does the second: drag to
look, scroll to walk, and you can look all the way straight up, because anything
less would leave the sun out of reach on exactly the midsummer days it climbs
highest. The glass was never in the way. Panes have no pointer handlers, so a ray
passes straight through to the sun behind them.

**The sun can't tell you how much past there is.** It's an excellent control and a
poor gauge. It shows the hour, the light and the direction of travel at once, but
when you dragged back there was no way to know whether the record ran out in an
hour or in four months, and at the edge the cursor just stopped without
explanation. The edge of the record is the most important fact about a scrub (past
it is history nobody kept, which is the same failure as a flat line of plausible
numbers) and it was the one thing you couldn't see.

So the strip in the corner (`Timeline.tsx`) isn't the slider coming back. It shows
an **extent**, not a transport control: how far the record goes, where hours become
days, and a mark for where you are. No play head, no buttons, nothing suggesting
something runs along it. You can drag it because it shows a position, but that's a
side effect, and the sun keeps the gesture the design is built around.

Its scale is linear in time, which makes the hourly stretch a thin slice of a
season-long strip. That's the truthful shape and it stays. A broken or piecewise
axis would suggest the two tiers cover comparable spans, when the whole reason for
drawing the boundary is that they don't. Hours belong to the sun and the arrow
keys, where they already were.

Seasons are built too, and the league forced them. A football season is eighteen
weeks and the sun's window was two days, so the gesture could only reach one
weekend out of eighteen.

**The season is the sun's other axis.** Along the arc is the day. Across it is the
year, because that's physically what a season *is*: the daily circle riding higher
or lower, which is why summer days are long. So there's no second control to learn.
You grab the same sun, and which way you pull decides whether you move hours or
months. The two can't interfere, and that's arithmetic, not luck: the hour is
measured in the plane of the arc and the declination perpendicular to it, so each
inverse ignores the other.

**Both rates are the real sun's, and that's why the two gestures feel different.**
A full turn along the arc is a day. A full sweep across it (all the vertical room
the sky has, from midwinter low to midsummer high) is half a year. Neither number
was picked to feel good. Both are how long the real sun takes.

Three more things this settled:

**Which way is "back" depends on the date, so the gesture has to check.** After
midsummer the arc sinks as time moves forward, so pulling the sun *up* moves time
*back*. In spring the same pull means later. A fixed rule would be wrong half the
year. The drag reads the answer from the calendar when you grab the sun and keeps
it, so dragging through a solstice (where the answer flips) doesn't reverse under
your hand. The sun still visibly stops climbing and turns back there, which is
exactly what a solstice is.

**Long history is a second grain, not a longer buffer.** Hourly data for a year is
350MB at two thousand nodes. Daily data for a season is 2.9KB a node. But the real
argument isn't storage. The two grains answer different questions: within a day
you want the hour something broke, and across a season you want the week it started
sliding. The scene reads the coarse tier through one extra argument to `vitalsAt`,
and no component that draws a plant changed at all. That's the second time that one
indirection has paid off.

**Seasons changed the data, not the plants.** It's tempting to make the garden
*look* seasonal, with autumn colour and bare winter branches, and it mustn't. Bare
branches already mean a dying plant and grey already means a dead feed. A garden
that dropped its leaves every November would be saying "everything is broken" in
the one vocabulary that has to stay unambiguous. So the season only shows in the
*light*: how high the arc is, how long the day is, the colour of the hour. It's the
horizon rule applied to time. It can be beautiful, but it can't look like it's
telling you something about a plant.

Two limits. Within the twelve weeks a real season of data covers, the sky's own
seasonal cue is faint (three summer months at this latitude change the day length
by twenty minutes), so over that span it's the garden and the readout that carry
the meaning, with the light as backup. And a cursor that lands at night can only
tell you so by being dark.

## Known problems, and where they stand

**Silence looks like health.** Addressed. An adapter that dies would leave a
green, thriving plant standing there, and a garden is reassuring enough that people
would believe it. That's the classic monitoring failure, and the metaphor makes it
worse. So staleness has its own visual state: grey and **still**. A stale plant
stops swaying, because a plant that has greyed but still moves in the breeze still
looks alive, and stillness is what makes silence readable. `swayMatrix` takes a
motion factor that the scene drops to zero past the staleness threshold, so
branches, leaves and fruit freeze together. `isStale` in `ecosystem/staleness.ts`
works out the state from `updatedAt` against the source's schedule. The schedule is
per garden, because an hourly notes scrape and a fifteen-second Prometheus scrape
mean very different things by "late", and because a source with a calendar can say
when it'll next report, which is a sharper question than how long it's been quiet.

Dust completes the state. Grey and stillness are silhouette cues. They work across
the room, which is the reading the product is built around, but a grey, motionless
plant seen from the bed just looks like a plant you haven't looked at closely
enough. A slow fall of pale specks around its lower half makes neglect visible up
close, and it's deliberately the opposite of the motes that show activity: motes
rise, glow and thicken with busyness, while dust falls, dulls and thickens with
silence.

Thickness is the part that adds something new. Grey is on or off and so is
stillness, so a node ten minutes past its threshold and one three days past look
the same. The density ramp (`scene/dust.ts`) is the only cue that shows *how long*.
It starts at zero exactly at the threshold, so it can never contradict the other
two, and reaches full thickness at three times the threshold. The mock gardens each
run one plant with a dead adapter, because a failure state nothing in the demo data
can reach is one nobody will look at.

**What changed since I last looked.** Addressed. This is a different question from
what things look like now, and it's closer to what the product actually promises. A
service that crashed and recovered overnight is invisible in a live view. The store
records `lastViewedAt` per garden and `changedSince` reports what moved, so
entering a garden can point at what changed instead of whatever happens to be worst
right now.

**Traversal.** Addressed by the bonsai table. Fifteen plants you can walk around.
Five hundred you can't. At thirty-two plants this could wait, but at a hundred and
ninety-three spread across thirty-five by forty-six metres of glasshouse, it was the
first thing anyone noticed. Squaring off the layout past a dozen beds made that
garden walkable but didn't solve the problem. The table view does: press `t` and
the whole garden shrinks to a miniature you look down on. There's still no
aggregation at a distance within the room view, and no way to stand at bed level
even though the rollups exist in the data.

**Normalization creates false comparability.** Still open. Vitality 0.6 in one
garden and 0.6 in another were computed by different translators on different
scales, and keeping gardens separate keeps those apart. But within a single garden
two adapters could still disagree about what 0.6 means, and a bed would look wrong
for reasons nobody can see. This belongs in the adapter contract: what the
endpoints mean, what the midpoint means, and what evidence justifies a mapping.

The adapters so far have written parts of that contract. *What the endpoints
mean:* an endpoint is the worst and best case that can really happen in the domain,
not the arithmetic minimum and maximum of the inputs, which is why the league's
mid-table sits at 0.65 instead of 0.5. *What the axes can't share:* if two axes can
be moved by the same underlying fact, one of them has to give it up, or four
readings collapse into one. Both are written out in the league section above, with
the reasoning behind them. The hardest part is still missing: what evidence
justifies a weighting. The league's (0.45 record, 0.30 differential, 0.25
availability) is argued, not measured, and it'll stay that way until someone
watches a garden and disagrees with it out loud.

The World garden added another part, about the inputs a source should *refuse* to
use. Vitality there is growth and life expectancy and nothing else, even though
conflict, unrest and population were all available and would all have moved it.
Each failed the same test: **would including this turn the number into a claim the
data can't support?** Population would have made big countries healthy. Conflict
would have made the axis a ranking of wars. Birth rate would have called a young
country a sick one. What's left is two quantities that are clearly better when they
go up. That's much less than "how is this country doing", and it's the only thing a
single number can honestly be.

Trend needs the same treatment (see the plume section above).

**Completion had no vocabulary.** Addressed. Tasks and goals end, plants don't.
Fruit for work that finished well and deadwood for work that finished badly are now
built. See `docs/completion.md`.

## Recorded assumption for the first scene

Plants are planted in rows inside their beds, and grafts cross the space between
them. It's the least presumptuous layout and the quickest to judge by eye. If
connected plants sitting far apart turns out to ruin the reading, the first ugly
scene should show it.
