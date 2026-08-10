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

Time is not on this list and must never join it. The hour and the season read in
the light — the sun's position, the length of the day, the palette — and never in
a plant. A garden that shed its leaves in November would be spending the wilt
channel, which is the one reading that has to stay unambiguous.

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

## Beds are plantings

A garden fixes what vitality *means*; a bed says what is *planted*. Until now
beds were only spatial buckets, which is why a garden read as a random thicket
of trees at mixed health — and why the infrastructure garden in particular
looked dead, since it was deciduous trees mostly running low, and a bare tree is
the bleakest possible sick-state and the one closest to the grey of staleness.

The fix is to ground the scene in real gardening: an individual bed is a *kind*
of planting — an orchard, a hedge, a conifer stand, a flower border, a vineyard,
a topiary — and it is filled with the plant forms that belong to it. This is a
genuine conceptual upgrade, not a skin: it gives the bed-grouping layer a
meaning it never had, and it makes each bed legible as a unit.

Three properties make it safe rather than a new way to overload the reading:

**A planting is a property of the container, not of health.** It never moves
with a metric. It sits in the same contextual slot as domain and archetype
variety — learnable, constant, signal-free per node — so it spends none of the
scarce health budget. Health still reads through droop, leaf density, and colour
*within* whichever form the planting dictates. That boundary is the whole reason
this is affordable.

**Polarity still overrides everything.** A suppress-polarity node is a weed
wherever it grows, whatever the bed is planted with, because a thriving weed
being alarming on sight is the one load-bearing shape read and it must survive.
Today whole gardens are single-polarity, so the suppress gardens are simply
planted as thickets; the sharper "a weed among the vegetables" case waits on
per-node polarity.

**Colour stays decorative.** Flowers and fruit will tempt us to make bloom or
ripeness colour mean something. It must not. Health reads through open versus
wilted, full versus shed — through form — never through hue, the same rule
colour has always kept here.

This also finally gives the deferred *completion* vocabulary a home: vegetables
and vineyards harvest, and fruit and deadwood are exactly the vocabulary that
was waiting for the scene to exist.

The work lands in phases. Live now: the plantings that are arrangements of the
existing L-system forms — orchard, grove, hedge, conifer stand, and the weed
thicket — each laid out in its own way (rows, a single low line, a jittered
clump).

Then the flowers, the first form that is not a tree: a **bloom** primitive, a
short green stem topped with a head of petals. The head is a leaf cluster of a
petal shape, so it costs the renderer nothing new, and it makes the flower's
health read the way it should — a thriving flower is full of petals, a
struggling one stops blooming and stands as a bare stem, which is a wilt-state
nothing like the grey of staleness. Petal colour is the test case for the colour
rule: it is decorative and varietal, seeded per plant, and it means nothing, so
health never rides on hue. A flower border stands them in a tidy row; a
wildflower meadow scatters them.

Then vegetables, which bring **produce**: fruit drawn on a subset of a plant's
leaf points, so it reuses the geometry with nothing new and its amount follows
the leaf count — a thriving vegetable is laden, a struggling one bears nothing,
the same wilt read the leaves give. Produce colour is varietal and decorative
like petals. This is the first piece of the *completion* vocabulary the design
deferred until the scene existed; the vineyard's grapes and a fruiting orchard
will reuse the same seam.

Last, the two forms that are not trees at all. A vine is trained along a wire and
a topiary is clipped into a solid; neither is self-similar, so neither is an
L-system. They are built by hand instead (`lsystem/bespoke.ts`) — but they emit
the very same geometry the grammar does, so they sway, droop, colour, and cache
exactly like everything else, and the only new thing is the shape. The
**vineyard** stands its vines in a row on a **trellis** (posts and catch-wires,
static structure like the horizon) with the cordon trained along the wire and
grapes — produce, reusing the vegetables' seam with a grape palette — hanging
from the fruiting shoots. **Topiary** clips foliage to a sphere, cone, cube, or
spiral chosen per plant; here health inverts, because a tended topiary is crisp
and full and *neglect* is what makes it patchy and sends stray shoots poking
through the clipped surface. So its wilt-state is shagginess — again nothing like
the grey of staleness or the bareness of a tree.

Every planted type earns a wilt-state distinct from staleness — bare stem, no
fruit, shagginess — so a struggling service never looks like a dead adapter. That
guardrail, the one the whole idea rests on, now holds across the full vocabulary:
every declared planting is live.

## The league: what a real source actually asks of the mapping

The NFL is the first garden made of something that happened, and putting it in
settled four things the mock data could never have raised.

**The axes have to divide the domain, not restate it.** Vitality is the record,
the point differential, and how much of the roster is available. Maturity is
starter experience, roster age, and how long the franchise has existed. The rule
that makes the garden readable is that these never cross: **injuries lower
vitality and never touch maturity; age and experience raise maturity and never
touch vitality.** An old roster is a big tree, not a healthy one. A hurt roster
is a wilting tree, not a small one. Cross them and every ageing club looks sick
and every young one looks like a seedling in trouble — the axes stop being four
readings and become one blurred one. Trend is the same argument in time: a 4-9
club that has won three straight is trending up while its vitality is still low,
and if trend were just the derivative of vitality it would carry nothing the
level did not already say.

**Average is not half dead.** Half of any league is below .500 by construction.
Mapping the composite straight onto vitality put half the garden into wilt every
week — and wilt means *this is in trouble*, not *this is mid-table*. It is the
same failure the infrastructure garden taught us, where deciduous trees at
middling health read as bare twigs, which is the bleakest state the renderer
owns. So the composite is calibrated once, in one line, with a monotonic curve:
0 on the axis is a winless club with a wrecked roster, a place nobody actually
stands, so average has to sit above the midpoint. The ordering is untouched —
the table still reads top to bottom — but the garden stands up.

This generalizes, and it belongs in the adapter contract the normalization
section below asks for: **an axis endpoint is defined by the worst case that can
really occur, not by the arithmetic floor.** Every translator will meet it.

**A planting is signal-free per node but not per bed.** Plantings differ in how
harshly they show ill health: a struggling tree sheds to bare twigs, a struggling
topiary goes shaggy, a struggling vegetable simply bears less. The league has
eight beds in two rows, one row per conference, and the first assignment gave the
AFC all four tree plantings — which made a whole conference look worse than the
other for no reason whatsoever. That is precisely the thing plantings promise not
to be. Each conference now gets two of the tree forms and two of the soft ones.
The rule the vocabulary needs: **a planting carries no signal about the plant, but
an uneven distribution of plantings carries a signal about the group**, and beds
are grouped now.

**Silence can be a fact instead of a fixture.** The mock gardens each keep one
plant with a dead adapter, because a failure state nothing in the demo can reach
is one nobody will look at. The league does not need the fixture: a club on a bye
genuinely has no new data, so with a seven day threshold the two clubs idle each
week stand there grey, still, and dusty on their own. The garden cannot tell a
bye from a dead feed, and should not — both mean what you are looking at is old.
That is the strongest form the staleness argument has taken so far, because the
data volunteered it. It survived staleness becoming schedule-aware: the league
keeps the flat seven days on purpose, because a schedule would clear the bye and
take the state with it.

## The book: what a *second* source asks, that the first one never did

The league proved the pipeline. It could not test it, because a single source
cannot tell you which of your decisions were principles and which were
coincidences that happened to fit football. The market was chosen for
disagreement, and it settled four more things.

**Polarity was theory until something was short.** `suppress` has existed since
the first sketch — the idea that some things are alarming when they thrive —
and until now only mock threat data used it, which means it was never really
tested. A short position is the genuine article: you hold it, and you want it to
go *down*.

Getting it right turned on one decision that looks like a detail and is not.
Vitality is **the instrument's move since you took it on, unsigned by side** —
not the position's profit. Sign it by side and the number already says "this is
going well for me", polarity then inverts it *back*, and a short reads healthy
exactly while it is losing you money. The garden would look right and mean the
opposite. So the rule the vocabulary needs: **a translator states what the thing
is doing; polarity states whether that is good news. A translator that answers
both has broken the axis.**

**"Silence is never health" has an exception, and it is structural.** A market
is shut every night and all weekend and nothing is wrong. The rule cannot simply
be relaxed — silence looking like health is the failure the whole staleness state
exists to prevent — so it is stated more precisely instead: **the reader is owed
a warning when the source misses something it said it would produce, and owed
nothing at all for silence that was scheduled.** The adapter is the only layer
that knows which is which.

The first attempt sized one threshold to the longest gap the source
*legitimately* produces, computed from the exchange calendar rather than chosen.
It held the rule but blunted it: a ratio of elapsed time to a single duration
cannot tell a shut exchange from a dead vendor, so a feed dying on Friday was not
called stale until midweek. Staleness now takes a **schedule** — a due time from
the source's own calendar, plus a grace that only starts running once something
is actually owed. Nothing is owed over a weekend, so a weekend is free; two
missed prints inside a session is a dead vendor, and reads as one. The numbers
are in ARCHITECTURE.md.

The design consequence worth carrying forward: **duration was the wrong unit.**
The reading a person makes is not "how long since I heard" but "is anything
missing", and those only coincide for a source that never sleeps.

**Calibration is a measurement, not a taste.** Two faults shipped into the first
draft of this source and neither was visible in the render. The generated tape
had a volatility drag that decayed every instrument, putting the whole book at a
median 6% down; and vitality charged for ordinary drawdown, which at market
volatilities is 10–20% off the high almost all the time, so the axis was
reporting volatility rather than health and the median plant sat at 0.40. Both
were found by comparing the book's health distribution against the league's, and
neither would have been found by looking at a screenshot. **A new source's
distribution should be measured against an existing one before it is judged.**

**Every source has a shape the model does not have.** Football had two grouping
levels (conference, division) against the model's one, solved by ordering bed ids
so a conference reads as a row. The market has sectors, which fit the one level
exactly — but it also has *lots*, several fills making up one position, which the
node type has nowhere to put. That resolved cleanly because a position is the sum
of its lots as of a moment, so the derivation absorbs it and the node never
learns. Both are the same lesson: **the pressure to widen the node type is
usually a derivation that has not been written yet.**

## The world: what a *third* source asks, that neither of the others did

The league proved the pipeline and the book tested it. Both are thirty-two
things in eight even beds taking numbers off a feed that publishes on a clock,
and between them they had stopped disagreeing. The world was chosen for the
things it breaks.

**A number can be wrong later.** This is the first source where a figure about a
period that has already ended can *change*. Growth is published about
seventy-five days after its quarter and revised a month after that, so the same
quarter carries two values and there is no such thing as "the" figure for it.

The resolution is the sharpest thing this source contributed: a plant reads what
was **known** at the cursor, never what is now thought to be true. Scrub back
past a release and the country steps to its previous vintage. The alternative —
showing today's opinion of April when the cursor is on April — would mean the
garden silently rewrote its own past whenever a statistical office changed its
mind, which is the same failure as drawing a flat line through a stretch nobody
recorded, reached by a different route. It also gives the scrub something to do
in a garden whose underlying quantities move once a quarter: what moves is not
the world, it is what was known about it.

**A headline is not a record.** Both other adapters are handed structure by
their feeds — a box score has a home team, a bar has a symbol. This one is
handed sentences, and turning one into `{iso3, kind, at, severity}` is the first
place in the project where the app forms a **judgment** about its input rather
than a calculation.

Two rules follow, and they are the price of being allowed to do it at all.
*Extraction refuses to guess*: a headline naming two countries, or none, or
carrying sporting vocabulary, yields nothing. A miss costs a plant that is
quieter than the world was; a wrong attribution asserts that something happened
in a real country, in a panel that looks exactly like the ones showing measured
numbers. Those are not comparable. And *every derived event keeps its source
sentence*, so a blight can answer "why?" with the dispatch rather than with a
severity level. A judgment presented without its evidence is a judgment wearing
the costume of a reading.

**Conflict is a blight, not a health score.** The obvious design was to fold war
into vitality: a country at war visibly wilting reads powerfully across a room,
which is exactly the reading this project is built around. It is the one thing
this source must not do. Vitality is a comparison — 0.6 against 0.55 invites
"doing better than" — and a garden that ranked countries by war would be making
a claim it cannot support with a scalar. So conflict is named, dated, sourced,
and attached to a plant that goes on reporting whatever it reports. The garden
says something is wrong there without claiming to know how wrong.

**Size is maturity, and maturity is still not health.** A country is a thing
with a size, and the eye expects a big country to be a big plant. That instinct
is right and it does not need a new channel: maturity already owns structural
size in the budget above, so a country's maturity is its UN age, its population
weight, and how young its population is. India is a big old tree and Estonia a
small young one.

The load-bearing consequence is the same clause the league wrote and the book
restated, in its third costume. An old company is a big tree, not a healthy one;
a position deep underwater is a wilting tree, not a small one; **a small country
must be able to be the healthiest plant in its bed.** Nothing in the vitality
function can see a population, and nothing in the maturity function can see a
growth rate.

**A container property can acquire a meaning nobody intended.** A planting is
signal-free everywhere else because a sector or a division has no character for
it to comment on. A world region does. Handing one of them the invasive thicket
because a bed looked bare would read as an opinion about the place, and nobody
could point at the line where the opinion was formed. Grounding the assignment
in what actually grows there — date palms in Northern Africa, vines in the
south, conifers in the north, savanna where there is savanna — removes the
judgment rather than hiding it: it describes the ground instead of evaluating
the country. `thicket` appears nowhere in that table.

**Calibration is measured, not argued — again.** The trend axis was first scaled
to two and a half points of growth, reasoned from how far growth can swing.
Against the actual distribution that put nine tenths of the world within a tenth
of zero and left the fresh-growth channel unspent. Successive figures move by
about four tenths of a point, so a point is where the axis has to end. Same
fault and same fix as the market's drawdown deadband: **a scale argued from the
domain rather than read off the data is usually too wide.**

## What is decoration, and why decoration is allowed

Three recent additions carry no signal at all, and that is the point of them.

Individual variety within a bed — whether a plant grows as a broadleaf or a
bushy crown in an orchard — is chosen by a hash of the node id, not by any
metric. It exists so a bed looks grown rather than stamped, and it is free
precisely because it means nothing: the reader learns to ignore *which* tree the
way they ignore which blade of grass. The load-bearing shape read is still only
polarity — weed versus plant — and that is held hard, so a thriving weed is
still alarming and a variety pick never dilutes it.

The horizon — hills, mountains, a tree line — is decoration in the same sense.
It is static and signal-free, so it never competes for the reader's attention or
spends a channel. It earns its place by giving the scene depth and a sense of
place, which is what makes the garden feel like somewhere rather than a plot
floating in fog. The rule it must keep is the rule colour keeps: it may be
beautiful, but it may never look like it is telling you something.

Texture is the third, and it is decoration with a rule attached. Every surface
was one flat colour — one green for the ground, one brown for a bed, one value
across every leaf on a plant — which is what made the scene read as a diagram of
a garden rather than a garden. Grain fixes that at two scales: a generated map
*within* a surface (turf, soil, bark) and a small stable jitter *between*
instances, so a canopy breaks into leaves and a bunch of grapes into berries.

The rule is that **grain modulates luminance and never hue**. The maps are
achromatic by construction and the jitter is a scalar multiply, so both darken
and lighten a colour that was already tuned and neither can move it around the
wheel. That is what keeps this outside the channel budget entirely: colour here
is a redundant encoding on purpose, and a texture that tinted as well as
textured would quietly start carrying signal — a mottled leaf would look like a
sick one, a lighter berry like a riper one. Small enough to be felt rather than
seen is the same guardrail from the other direction: at the amplitudes used, no
reader could mistake one bright leaf for a statement about that leaf.

## Under glass

The garden now stands in a greenhouse, and that is a decision about how much
world has to exist rather than a change of backdrop.

Outdoors, the answer to "how much" is *all of it*. Grass to the horizon, hills,
a tree line, and every one of them a surface that has to hold up from any angle
the camera can reach — none of which anybody is meant to look at. A wall three
metres away answers the same question and stops asking it. The field and the
ridges are still out there and still lit by the same sun, but they have become
weather rather than scenery: seen through a pane, softened, no longer
load-bearing. That is the horizon's own bargain taken one step further, and the
first real cost saving the scene has made.

The sky is the one thing the glass may not take. Time is dragged on the sun, so
a roof that hid it, dimmed it, or swallowed the pointer aimed at it would have
cost the whole gesture — which is why the panes cast no shadow and write no
depth, and why the sun, the moon, and the stars read through the roof exactly as
they did in the open. Everything the light does, it still does.

What the house adds beyond enclosure is the same three rules the horizon keeps:
static, signal-free, no colour logic of its own. It carries no reading, so it
can be as detailed as it likes. The one place it touches the reading at all is a
gain — a glasshouse **diffuses**, and diffused light is exactly what a scene
read at a glance from three metres wants.

**Raised beds are the part that reads.** The soil was a slab lying on the
ground, which is a patch of a different colour rather than an object in a room:
that is most of why the beds looked like regions on a map. Four boards, corner
posts, and a cap rail give the soil an edge, a thickness, and a shadow, and that
is the whole difference between ground somebody coloured in and ground somebody
built. The trick is which way it was built: the beds are raised by *lowering the
floor*, so the soil surface stays exactly where the plants already stood and
nothing that measures from a plant had to learn about it.

**The props are for tense.** A hose on its hook, a bench on castors, a watering
can set down beside a pair of gloves, pots waiting to be filled. None of it
means anything and none of it may ever appear to. What it buys is that beds and
glass say a garden *exists*, while a can next to a pair of gloves says somebody
was here this morning and is coming back — which is the reading the whole
product wants, a place you keep an eye on rather than a dashboard you open. It
is also the cheapest thing in the scene, because unlike a plant, none of it has
to be true.

Two rules hold it in place, and they are the ones any future decoration should
inherit. It lives **against the walls**, in the path the shell leaves around the
beds, so it never stands between the camera and a plant. And it is **still**:
motes, dust, and sway are the only things that move here and all three carry
signal, so a rocking watering can would be motion that meant nothing — which is
worse in this scene than it would be in one where motion means nothing anyway.

## Three questions, three distances

The garden answers one question extremely well and, until now, only that one:
**something is wrong, and it is over there.** That reading works across a room,
it is what shape and colour and motion are spent on, and it is the whole reason
this is a garden rather than a dashboard.

It leaves two questions unanswered, and both of them are asked from closer up.

| distance | question | what answers it |
| --- | --- | --- |
| across the room | is anything wrong? | the plants themselves |
| at the bed | which one is this? | the tag |
| standing at it | what happened, and which way is it going? | the panel |

Reading them as a sequence is what keeps the first one intact. A name is not a
health cue and must never compete with one, so **labels do not exist at a
distance**: a tag fades in as you approach a plant and is gone again when you
step back, the way a nursery label is only readable when you are next to it.
Thirty-two captions floating over a garden would be a chart with foliage — every
one of them pulling at the glance the plants are supposed to own.

**An emblem is chosen by translation, never guessed by the renderer.** Every
source has its own idea of what a thing is called and what it looks like — a
league has club colours and a three letter code, a cluster has service names —
and none of that is derivable from the four health axes. So the emblem is a
translator's decision, like planting type and polarity, with an explicit default
(`emblemFrom`: initials on a stable colour) for sources that have no mark of
their own. Calling the default is itself a choice, made where the domain is
still in scope.

That puts colour on a card, which the channel budget above would normally
forbid. The line that resolves it: **a colour that never moves is identity, and
a colour that moves is signal.** An emblem is fixed for the life of the node and
sits on an object that is obviously a label, so nothing about it can be read as
vitality. The ban that still holds absolutely is on a source palette reaching
the *organism* — bark, foliage, produce, bloom — where it would sit in the same
channel as health and win.

**The panel is the record, not a verdict.** It is the only place in the app with
numbers in it, which is what a deliberately lossy summary owes you: you can
always get back to the readings the picture was made from. It carries no colour
and no ranking, because a panel that turned red would be a second, competing
reading of a node the garden has already described. It reads everything through
the cursor, so scrubbing with one open moves it — the numbers, the trend, and
the end of the sparkline are the same moment the sky is showing. And it hangs in
the air beside its plant rather than being welded to the corner of the screen,
because a headset is a stated target and a head-locked card is the one interface
a headset cannot have.

One rule inside it is worth stating on its own: **a gap in the data is drawn as
a gap.** The sparkline breaks where nothing was recorded rather than joining the
line across it. A trend line that bridges silence is a picture of something that
did not happen, in an app whose central claim is that silence must never be able
to pass for health.

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

**One thing was missing from that, and it took a while to name.** A sun is a
superb control and a hopeless *measure*: it says the hour, the light and the
direction of travel at once, and it cannot say how much past there is. Dragging
back, there was no way to know whether the record ran out in an hour or in four
months, and when it did run out the cursor simply stopped with no account of
itself. The edge of the record is the most consequential fact about a scrub —
past it is history nobody kept, which is the same failure as a flat line of
plausible numbers — and it was the one thing invisible.

So the strip in the corner (`Timeline.tsx`) is not the slider coming back. It
draws an **extent**, not a transport: how far the record goes, the point where
hours become days, and a mark for where you are standing. No play head, no
buttons, nothing that implies a thing running along it. That it can be dragged
is a consequence of showing a position, not the reason for it, and the sun keeps
the gesture the design is built around.

Its scale is linear in time, which leaves the hourly stretch a thin slice of a
season-long strip. That is the honest shape and it is kept: a broken or
piecewise axis would let the strip imply the two tiers are comparable spans, when
the entire reason for drawing the boundary is that they are not. Hours belong to
the sun and the arrow keys, where they already were.

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

**The sun used to be unreachable, and the fix was to stop orbiting.** The camera
looked down at the beds and could not be raised, so for most of the day the sun
was somewhere a mouse could not point. Shift-drag anywhere was the desktop
stand-in and it was always a stand-in: the gesture assumes you can look up, which
is true in a headset and was false on a desk.

Moving indoors sharpened this rather than causing it — the outdoor camera had the
same limit for the same reason, since an orbit control aims at its target — but
in the field you could at least back away until the sky came into frame, and
inside the glass you could not.

What changed is which end is pinned. An orbit fixes the target and swings the
eye; a person fixes the eye and turns the head. `StandControl` does the latter:
drag to look, scroll to walk, and the pitch limit goes all the way to the zenith
because anything less would leave the sun unreachable on exactly the midsummer
days it climbs highest. The glass was never in the way — panes carry no pointer
handlers, so a ray passes straight through to the sun behind them.

Seasons are now built too, and the league is what forced them: a football season
is eighteen weeks and the sun's window was two days, so the whole gesture reached
exactly one weekend out of eighteen.

**The season is the same object's other axis.** Along the arc is the day. Across
it is the year — because that is what a season physically *is*, the daily circle
riding higher or lower, which is the reason summer days are long. So there is no
second control to learn and nothing borrowed from a video player: you grab the
same sun, and which way you pull it decides whether you are moving hours or
months. The two cannot interfere, and that is arithmetic rather than luck: the
hour is measured in the plane of the arc and the declination perpendicular to it,
so each inverse is blind to the other.

**The rate is honest again, and that is what makes the two gestures feel
different rather than merely be different.** A full turn along the arc is a day.
A full sweep across it — every bit of vertical room the sky has, midwinter low to
midsummer high — is half a year. Neither number was chosen to feel good; both are
how long the real sun takes.

Three things this settled that were not obvious on paper:

**Which way is back depends on the date, so the gesture has to ask.** After
midsummer the arc sinks as time runs forward, so pulling the sun *up* is pulling
time *back*; in spring the same pull means later. A fixed convention would have
been wrong half the year. The drag reads the answer off the calendar at the
moment of the grab and holds it, so that dragging through a solstice — where the
answer flips — does not reverse under the hand. The sun still visibly stops
climbing and turns back there, which is exactly what a solstice is.

**Long history is a second grain, not a longer buffer.** Hourly for a year is
350MB at two thousand nodes; daily for a season is 2.9KB a node. But the real
argument is not storage, it is that the grains match different questions: inside
a day you want the hour a thing broke, across a season you want the week it
started sliding. The scene learned to read the coarse tier through one extra
argument to `vitalsAt`, and no component that draws a plant changed at all —
which is the second time that single indirection has paid for itself.

**Seasons changed the data, not the plants.** It is tempting to make the garden
*look* seasonal — autumn colour, bare winter branches — and it must not. Bare
branches already mean a dying plant and grey already means a dead feed; a garden
that shed its leaves every November would be saying "everything is broken" in the
one vocabulary that has to stay unambiguous. The season therefore reads in the
*light* only: the arc's height, the length of the day, the colour of the hour.
That is the horizon rule applied to time — it may be beautiful, it may not look
like it is telling you something about a plant.

Two honest limits. Within the twelve weeks a real season of data actually covers,
the sky's own seasonal cue is a whisper — three summer months at this latitude
change the day by twenty minutes — so what carries the reading over that span is
the garden itself and the readout, with the light as reinforcement. And a cursor
that lands in the dark still only says so by being dark.

## Five things we know are unresolved

**Silence looks like health.** An adapter that dies leaves a green, thriving
plant standing there, and a garden is reassuring enough that people will believe
it. This is the classic monitoring failure and the metaphor makes it worse
rather than better. Staleness therefore gets its own visual state: grey, and —
now that motion is a channel — **still**. A stale plant stops swaying, because a
plant that has merely greyed but still moves in the breeze still reads as alive;
stillness is what makes silence legible. `swayMatrix` takes a motion factor that
the scene drops to zero past the staleness threshold, so branches, leaves, and
fruit freeze together. `isStale` in `ecosystem/staleness.ts` derives the state
from `updatedAt` against the schedule its source keeps; that schedule is
per-garden, because an hourly notes scrape and a fifteen second Prometheus scrape
mean very different things by late — and because a source with a calendar can say
when it will next speak, which is a sharper question than how long it has been
quiet.

The dust is now there too, which completes the state. Grey and stillness are
silhouette cues: they work across the room, which is the reading the product is
built around, but a grey motionless plant seen from the bed is just a plant you
have not looked at hard enough. A slow fall of pale specks around the lower part
of the plant is what makes neglect legible on approach, and it is deliberately
the inverse of the mote field that carries activity — motes rise, glow, and
thicken with busyness; dust falls, dulls, and thickens with silence.

Thickness is the part that earns its place rather than restating the silhouette.
Grey is binary and stillness is binary, so a node ten minutes past its threshold
and one three days past look identical; the density ramp (`scene/dust.ts`) is the
only cue that carries *how long*. It starts at zero exactly at the threshold, so
it can never contradict the other two, and reaches full thickness at three times
late. The mock now runs one plant per garden with a dead adapter, because a
failure state nothing in the demo data can reach is a failure state nobody will
look at.

**What changed since I last looked** is a different question from what things
look like now, and it is closer to what the product actually promises. A service
that crashed and recovered overnight is invisible to a live view. The store
records `lastViewedAt` per garden and `changedSince` reports what moved, so
entering a garden can draw attention to change rather than to whatever happens to
be worst at that instant.

**Traversal is undesigned, and the world garden has stopped letting that be
theoretical.** Fifteen plants you walk around. Five hundred you cannot, and
there is still no aggregation at distance and no way to stand at bed level even
though the rollups exist in the data. At thirty-two plants this could be
deferred; at a hundred and ninety-three, across thirty-five by forty-six metres
of glasshouse, it is the first thing anybody notices. The layout change that
made that garden walkable at all — squaring off past a dozen beds instead of
wrapping into two rows — buys room and answers nothing.

**Normalization creates false comparability.** Vitality 0.6 in one garden and 0.6
in another were computed by different translators against different scales, and
separate environments keep those apart. Inside a single garden, two adapters can
still disagree about what 0.6 means, and a bed will look wrong for reasons nobody
can see. This belongs in the adapter contract: what the endpoints mean, what the
midpoint means, and what evidence justifies a given mapping.

The first adapter now exists and it has written the first two clauses of that
contract. *What the endpoints mean:* an endpoint is the worst and best case that
can really occur in the domain, not the arithmetic floor and ceiling of the
inputs — which is why the league's mid-table sits at 0.65 rather than 0.5.
*What the axes may not share:* if two axes can be moved by the same underlying
fact, one of them has to give it up, or four readings collapse into one. Both
are written out in the league section above, with the reasoning that produced
them. The clause still missing is the hardest: what evidence justifies a
weighting. The league's — 0.45 record, 0.30 differential, 0.25 availability — is
argued rather than measured, and it will stay that way until somebody watches a
garden and disagrees with it out loud.

The world garden adds a fourth clause, and it is about the axes a source must
*decline* to use. Vitality there is growth and life expectancy and nothing else,
though conflict, unrest, and population were all available and all would have
moved it. The test each failed is the same: **would including this make the
number a claim the data cannot support?** Population would have made big
countries healthy. Conflict would have made the axis a ranking of wars. Birth
rate would have called a young country a sick one. What is left is two
quantities that are unambiguously better when they go up, which is a much
smaller thing than "how is this country doing" and is the only thing a single
scalar can honestly be.

**Completion has no vocabulary.** Tasks and goals end, plants do not. Fruit and
deadwood are the obvious answer. Deferred until the scene exists.

## Recorded assumption for the first scene

Plants are planted in rows inside their beds and grafts cross the space between
them. This is the least presumptuous layout and the fastest to judge by eye. If
connected plants sitting far apart is what ruins the reading, that is exactly the
thing the first ugly scene should reveal.
