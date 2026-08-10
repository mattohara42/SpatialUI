# A graphics fidelity pass

A proposal, not a description of built state. Written to answer a plain
question — *how do we make this look a great deal better* — without quietly
undoing the reasons it looks the way it does.

Read `DESIGN.md` first for the reading language and the channel budget, because
that budget is the thing every idea in here has to survive. `ARCHITECTURE.md`
for how the scene is assembled and batched. This file is the part those two do
not carry: where the fidelity ceiling actually is, what it costs to raise it,
and the one fork — the delivery target — that decides how far it can go.

---

## The short answer

**The current look is a choice, not a ceiling.** Nothing about three.js caps the
scene where it stands; the plainness is deliberate — procedural, cheap, and
legible at a glance in a headset — and the same renderer can look dramatically
better with no change of engine. The largest single jump is a materials,
lighting, and post-processing pass, and it touches almost none of the
architecture, because it upgrades how the existing instanced geometry is *shaded*
rather than what it *is*.

**Blender and Unreal are not two answers to one question.** Blender is a tool for
*authoring* assets; Unreal is a *runtime* that would replace the whole `scene/`
layer. They belong at opposite ends of the decision:

- **Blender** makes models, materials, and textures that are then exported
  (glTF) and loaded into a runtime. It is entirely compatible with what exists —
  it feeds three.js. Use it to author the things procedural code is bad at: a
  believable leaf, a flower head, a fruit, the greenhouse ironwork.
- **Unreal** is a different product with a different delivery. It buys Nanite and
  Lumen photorealism and costs the entire premise — a thing that loads instantly
  in a browser and sits at the edge of a desk in passthrough AR. The data
  pipeline (`adapters/` → `translation/` → `state/`) is engine-agnostic
  TypeScript and could in principle feed anything; everything in `scene/` is
  three.js and would be rewritten. It is worth considering only if the delivery
  target deliberately moves off the browser and XR, and that is a product
  decision, not a graphics one.

So: **stay in three.js, author detail in Blender, and treat Unreal as a fork in
the road rather than a next step.**

---

## The three budgets any fidelity work must survive

Fidelity is not free of the design; it competes with it in three specific
places, and an idea that spends any of these without noticing is how a garden
turns back into a diagram — or worse, starts lying.

### The channel budget — the one that bites

`DESIGN.md` assigns each health signal a visual channel: vitality to droop and
colour, activity to sway and motes, and so on. **Colour is deliberately not
load-bearing** — it is a redundant encoding of health, never the encoding — and
that is exactly why `textures.ts` is achromatic. Every generated texture
modulates *luminance and never hue*, because a texture that tinted as well as
textured would quietly begin carrying signal the plant already carries through
its shape.

This is the rule the whole pass turns on. **Decoration is only affordable while
it means nothing.** A normal map that adds bark relief is free; a colour grade
that pushes healthy greens greener is not, because it doubles the vitality read
and steals contrast from a plant that is genuinely wilting. Every item below is
marked for where it sits against this line.

### The instancing budget

The entire scene is a handful of draw calls: every branch across every plant is
one `InstancedMesh`, every leaf is one mesh per leaf shape (at most four). That
is what lets 193 plants stand in a headset. Fidelity that multiplies the
*per-instance* vertex count multiplies it by the plant count, so "a nicer leaf"
is a decision about hundreds of thousands of leaves. Richer geometry has to buy
its way in against that multiplier, which usually means an authored low-poly mesh
carrying its detail in a normal map rather than in triangles.

### The frame budget, and the fork under it

The stated aim is peripheral awareness in passthrough AR. A headset is 90Hz
across two eyes — call it a ~5.5ms frame — and that is the real cap on how far
any of this can go. This was the fork that mattered more than Blender-vs-Unreal,
and **it is now decided: XR stays a target.** So the constrained budget is the
one that governs; the expensive, desktop-only tier at the bottom of the ladder
stays off the default path, and the rungs above it are chosen for what survives a
headset frame. Where an effect is a desktop luxury it is marked as one — it may
still ship as a desktop-only enhancement, but it is never the baseline.

That decision also settles the engine question underneath it, and settles it
*for* three.js. **WebXR is a browser standard, not a per-vendor SDK:** the same
build runs on Meta Quest's browser, on Apple Vision Pro (Safari, visionOS 2+),
on Pico and other Android-based headsets, and falls back to a flat desktop window
where there is no device — with `@react-three/xr` bridging R3F to the session.
One codebase reaches every headset. Unreal buys photorealism at the price of
per-platform native builds and no browser story at all, which is the opposite of
"loads instantly, sits at the edge of the desk, works on whatever headset the
viewer has". Cross-headset reach is a first-class reason to stay where we are.

---

## The ladder, cheapest and safest first

Roughly in order of value for effort. Each rung says what it buys, what it costs
against the three budgets, and where it sits against the channel rule.

### 1. Materials and lighting — the biggest jump for the least risk

The leaves are flat-shaded solids (`OctahedronGeometry`, `ConeGeometry`) on a
bare `meshStandardMaterial` with no maps; branches carry a low-contrast
achromatic bark map and nothing else. The lighting is a competent daylight rig —
hemisphere fill, a shadow-casting sun, a moon that takes the key at night, a cool
camera-side fill — and it already scrubs with the sun for free. Almost all of the
"plastic" read comes from the *materials*, not the lights.

- **Leaf translucency (do this first).** A leaf is thin; light comes *through* it.
  A backlit-transmission term — real `transmission`/`thickness` on a physical
  material, or a cheap wrap-light approximation in a custom shader — makes a
  canopy glow when the sun is behind it and is, per pixel of code, the single
  most convincing thing a garden can do. *Channel-safe:* it is a lighting
  response, not a hue shift, and it strengthens the existing daylight read rather
  than competing with health.
- **PBR maps on bark and leaves.** Normal and roughness maps, generated the way
  `textures.ts` already generates its grain, so bark catches a highlight and reads
  as bark. *Channel-safe by construction* if the maps stay achromatic, which is
  the rule that module already keeps.
- **Softer, contact-truer shadows.** A larger shadow map or PCSS-style softening,
  and contact shadows under the beds so plants sit in the soil rather than
  hovering. *Watch the frame budget in XR;* a second shadow cascade is a desktop
  luxury.

This rung is a materials swap and a shader or two. It does not touch the store,
the layout, the instancing structure, or the health reads.

### 2. Post-processing

There is no post-processing library in the dependencies today. Adding
`postprocessing` (or drei's `<EffectComposer>`) opens a set of near-free wins:

- **Depth of field, as tilt-shift on the bonsai table.** The table view
  (`scene/bonsai.ts`) is a miniature seen from outside; a shallow focus plane
  makes it read as a *physical model* the way a tilt-shift photograph makes a city
  look like a train set. This is the effect that most rewards the mode that
  shipped most recently, and it is a few lines.
- **SSAO** to seat plants in their beds and give the greenhouse frame weight.
- **Bloom**, restrained, on the sun and on bright blooms.
- **Colour grading** — *the one to hold at arm's length.* A filmic grade is the
  fastest way to make a scene feel authored and the fastest way to spend the
  colour channel by accident. Any grade has to be neutral with respect to the
  green→brown vitality ramp; the moment it flatters healthy foliage it is
  carrying signal. Ship the others first and treat grading as a deliberate,
  measured decision, not a default.

*Cost:* post is a full-screen pass per effect and the first real bite out of the
XR frame budget. This rung may be desktop-mostly.

### 3. Richer geometry

- **Better leaf and petal meshes** — a curved, slightly cupped blade instead of a
  solid — authored low-poly so the silhouette improves without inflating the
  per-instance count. Detail lives in the normal map.
- **Per-instance taper and UV scale on branches.** `Branches.tsx` already notes
  the gap: a cylinder cannot narrow along its length and a twig gets a trunk's
  worth of bark grain, both for want of a custom instanced shader. The radii are
  already in the buffer waiting for it. This is one shader that closes two visible
  compromises at once.
- **Ground and understory scatter** — grass tufts, pebbles, leaf litter — as an
  instanced layer, denser under healthy plants. *Channel-watch:* density here must
  not start reading as health; it is ground cover, not a plant.

### 4. Authored assets — where Blender enters

Hand-modelled leaves, flower heads, fruit, and the greenhouse ironwork and props,
made in Blender, exported as glTF, and instanced through the same batching. drei's
loaders make this routine. The discipline is unchanged: an authored mesh is a
*container* property like the planting kind, chosen by a hash of the node id so a
bed looks grown, and it must not encode health — health still reads through
droop, colour, and how much foliage survives.

### 5. The expensive tier — desktop, and only if XR is dropped

Vertex-shader wind (moving the CPU sway in `Foliage.tsx` and `Branches.tsx` onto
the GPU, which also lifts the per-frame matrix cost), volumetric light shafts
through the glass, true subsurface scattering, high-res shadow cascades. Each is a
real renderer project and each assumes the desktop budget. Named here so the
ladder is complete, not because they are near.

---

## The one deep tension: health lives in the geometry

This is the thing to understand before authoring anything, because it is where
fidelity and the design genuinely pull against each other.

Plant geometry is generated in pure code and **memoized on quantized vitals** so
that shape moves *continuously* with health — a plant wilts, sheds foliage, and
recovers, and the generator rebuilds it only when a vital crosses a bucket. A
sick plant is not a healthy plant tinted brown; it is a different, thinner, more
drooping *shape*, and that shape is the primary read.

Static authored meshes do not have this. The moment a leaf becomes a fixed glTF
asset, it stops wilting on its own. Keeping the health read while raising leaf
fidelity therefore means one of:

- **Shape stays procedural, shading gets richer** — rungs 1 and 2 in full, which
  is why they are first: they raise fidelity without touching the thing that
  carries meaning.
- **Authored assets deform** — via morph targets (healthy ↔ wilted blends driven
  by the same vitals) or a vertex shader that droops the mesh, so an authored
  leaf still sags. This is the price of admission for rung 4 on anything whose
  shape is load-bearing, and it should be budgeted as such rather than discovered
  late.

A safe rule: **author the things that do not carry signal** — the greenhouse,
the props, the fruit, the ground scatter — and keep procedural the things that
do — the plant's branching and its foliage density. Fidelity earned on the former
is free; on the latter it has a deformation bill attached.

---

## Recommended first PR

Small, low-risk, and it lands the two effects with the highest ratio of "looks
transformed" to "lines changed", both channel-safe:

1. **Leaf translucency** — a backlit-transmission term on the leaf material, so
   the canopy glows when the sun is behind it.
2. **A tilt-shift depth of field on the bonsai table** — add a post-processing
   composer, enabled in table mode, focused on the miniature.

Optionally fold in **PBR normal/roughness maps** on bark and leaves, generated in
`textures.ts` under the achromatic rule it already enforces.

What to hold back from that PR, deliberately: colour grading (spends the colour
channel), authored assets (carry a deformation bill), and anything on the
expensive tier. And measure the table DoF against the XR frame budget before
assuming it can stay on in the headset — the room view may want it off.

The test of the whole pass is the one `textures.ts` already states: after it
ships, a stranger should still read a wilting plant as wilting and a thriving weed
as alarming, at a glance, from the edge of their vision. Fidelity that survives
that is decoration doing its job. Fidelity that fails it has started carrying
signal, and the garden was built to keep signal in the plant.
