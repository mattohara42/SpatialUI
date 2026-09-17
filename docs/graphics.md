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

### 2. Post-processing — **shipped, without a dependency**

Still no post-processing library in the dependencies, and there does not need to
be one: everything below is built on three's own passes and two hand-written
shaders, which is the same bargain the tilt-shift made. `scene/Post.tsx` is now
the single chain, because a pass that composites owns the render loop and two
components each running their own would fight.

- **Depth of field, as tilt-shift on the bonsai table.** The table view
  (`scene/bonsai.ts`) is a miniature seen from outside; a shallow focus plane
  makes it read as a *physical model* the way a tilt-shift photograph makes a city
  look like a train set. This is the effect that most rewards the mode that
  shipped most recently, and it is a few lines.
- **Ambient occlusion** to seat plants in their beds and give the greenhouse
  frame weight — *done* (`scene/ao.ts`), and **written rather than imported for a
  reason that will apply to anything else that wants scene depth.** three's
  `SSAOPass` and `GTAOPass` both re-render through `scene.overrideMaterial`,
  which replaces the taper shader, so every limb would enter the AO buffers as
  the one-metre cylinder it is before the taper runs. Reading the depth the
  beauty pass already wrote sidesteps that completely and costs one scene render
  instead of three. Normals come from depth derivatives, which is the
  approximation: it is wrong along a silhouette, so the radius stays small.
- **Bloom**, restrained, on the sun and on bright blooms — *done*, and the
  threshold is the whole decision. The beauty buffer is linear and unclamped, so
  a bright sky sits near white: **a threshold below one catches the sky**, and a
  bloom over the whole sky is a soft filter over the whole garden that lifts the
  black point and flattens the contrast between a full canopy and a thin one.
  That is the colour-grading trap arriving by a side door. Above one, only things
  genuinely brighter than white glow.
- **Colour grading** — *the one to hold at arm's length.* A filmic grade is the
  fastest way to make a scene feel authored and the fastest way to spend the
  colour channel by accident. Any grade has to be neutral with respect to the
  green→brown vitality ramp; the moment it flatters healthy foliage it is
  carrying signal. Ship the others first and treat grading as a deliberate,
  measured decision, not a default.

*Cost:* post is a full-screen pass per effect and the first real bite out of the
XR frame budget. This rung may be desktop-mostly.

### 3. Richer geometry — **shipped**

- **Better leaf and petal meshes** — *done* (`scene/leaf.ts`). Not authored and
  not normal-mapped: a procedural blade with a shoulder, a fold along the midrib
  and a curl at the tip, at eleven vertices and twelve triangles against the
  octahedron's six and eight. The detail is in *where* the vertices sit rather
  than in how many there are, which is the only kind of leaf improvement that
  survives the instancing multiplier. A conifer needle deliberately keeps its
  cone: a needle really is a spike, and giving it a blade would be fidelity spent
  making it less true.
- **Per-instance taper and UV scale on branches** — *done* (`scene/taper.ts`).
  One shader closed both compromises, as predicted. Each instance carries its two
  radii and the UV repeats its size asks for; the vertex stage interpolates the
  cross-section, tilts the side normals onto the resulting cone, and scales the
  map UVs so bark is a fixed number of cycles per metre. **The catch worth
  knowing:** radius left the instance matrix, so the mesh needs a matching
  `customDepthMaterial` or every branch casts a one-metre cylinder's shadow.
- **Ground and understory scatter** — *done* (`scene/scatter.ts`, `Scatter.tsx`),
  and the channel-watch turned out to bite harder than "density must not read as
  health". Ground cover **in a bed** is unsafe at any density, because a bed is
  where polarity reads and a tuft in the soil is a weed — the one shape read the
  whole language turns on. So the scatter is explicitly excluded from the
  planting: grass outside the glass, stones and litter on the path, and the bed
  footprint passed in as an exclusion rather than left to chance. Density is
  keyed on position and a fixed seed, so it is identical at every vitality.

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

## What has shipped, and what is left

Rungs 1, 2 and 3 are built. The ladder below is now a record rather than a plan
up to that point; rungs 4 and 5 are untouched and still described above.

**Rung 1, materials and lighting.** Leaf translucency
(`scene/translucency.ts`) — a backlit-transmission term folded into the leaf
material via `onBeforeCompile`, aimed at the sun each frame and riding its
intensity. Normal and roughness maps on bark, turf, soil and all timber
(`textures.ts`), each derived from the same achromatic height field as the
surface's albedo, so the ridge the map darkens is the one the relief raises.

**Rung 2, post-processing.** One chain in `scene/Post.tsx`: ambient occlusion,
a restrained bloom, the tilt-shift on the table, and the output pass. No new
dependency.

**Rung 3, richer geometry.** Branch taper and per-instance bark scale
(`taper.ts`), leaf blades with a shoulder, a fold and a curl (`leaf.ts`), and
ground scatter outside the glass and on the path (`scatter.ts`).

### The three things this pass learned that were not on the ladder

**A custom vertex shader makes the scene's depth non-reproducible.** Anything
that re-renders the scene through an override material — three's SSAO, GTAO, and
most depth-prepass effects — will draw branches as untapered cylinders. Either
read the depth the beauty pass wrote, or be prepared to patch every override
material. This is now the single largest constraint on which library effects can
be dropped in.

**three's passes disagree about where their output goes.** A `ShaderPass` writes
into the write buffer; `UnrealBloomPass` sets `needsSwap = false` and blends back
into the *read* buffer it was handed. A hand-driven chain has to ask each stage
where its result landed rather than assume it moved forward. Assuming cost a
black screen and a bisect to find.

**Bloom is a colour grade if its threshold is wrong.** The doc already flagged
grading as the effect that spends the colour channel by accident. An
under-thresholded bloom does the same thing without ever being called a grade,
because it lifts the black point across the whole frame and takes contrast out of
exactly the wilting-versus-thriving read the garden exists to carry.

### Still deliberately not done

Colour grading (spends the colour channel). Authored assets (carry the
deformation bill described above). The expensive tier. Relief and roughness maps
on the **leaves** — a blade is eleven vertices and its shape now does the work a
normal map would have, so the cost still outruns the gain — and on the **metal
props**, which are many small hand-coloured materials for a modest return.

### What has genuinely not been measured

**Frame time on a headset, or on any GPU.** This container renders through
SwiftShader, a software rasterizer, at roughly 900ms a frame — which measures
fill rate on a CPU and is not a ratio that transfers to hardware. So the XR
step-down in `quality.ts` is built and correct in its logic, and the number it is
defending against is still unmeasured. **Measuring it is the first thing anyone
with a headset should do**, and the tier makes that a one-line change rather than
a rewrite.

The test of the whole pass is the one `textures.ts` already states: after it
ships, a stranger should still read a wilting plant as wilting and a thriving
weed as alarming, at a glance, from the edge of their vision. That was checked in
a real browser this time rather than asserted — the league's struggling divisions
still read as bare sticks beside a full canopy, and the threats garden's thriving
weed now reads as a bramble, which is more alarming than it was, not less.
