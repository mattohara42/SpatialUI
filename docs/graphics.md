# A graphics fidelity pass

**Status: rungs 1 to 3 are built, rungs 4 and 5 aren't.** This started as a
proposal answering a simple question: how do we make this look much better
without undoing the reasons it looks the way it does? What shipped, and what we
learned along the way, is near the end.

Read `DESIGN.md` first for the reading language and the channel budget, because
every idea here has to fit inside that budget. `ARCHITECTURE.md` explains how the
scene is assembled and batched. This file covers where the fidelity ceiling really
is, what it costs to raise it, and the delivery target, which decides how far it
can go.

---

## The short answer

**The current look is a choice, not a limit.** Nothing about three.js holds the
scene where it is. The plain style is deliberate (procedural, cheap, and readable
at a glance in a headset), and the same renderer can look far better without
changing engine. The biggest single improvement is materials, lighting and
post-processing, and it barely touches the architecture because it changes how
the existing instanced geometry is *shaded*, not what it *is*.

**Blender and Unreal answer different questions.** Blender is for *making*
assets. Unreal is a *runtime* that would replace the whole `scene/` layer.

- **Blender** makes models, materials and textures that get exported (as glTF)
  and loaded into a runtime. It works fine with what we have, since it just feeds
  three.js. Use it for the things procedural code does badly: a believable leaf, a
  flower head, a fruit, the greenhouse ironwork.
- **Unreal** is a different product with a different delivery model. It gets you
  Nanite and Lumen photorealism and costs you the whole premise: something that
  loads instantly in a browser and sits at the edge of your desk in passthrough
  AR. The data pipeline (`adapters/` → `translation/` → `state/`) is
  engine-agnostic TypeScript and could feed anything, but everything in `scene/`
  is three.js and would be rewritten. Unreal only makes sense if the product
  deliberately moves off the browser and XR, and that's a product decision, not a
  graphics one.

So: **stay in three.js, make detailed assets in Blender, and treat Unreal as a
different product, not a next step.**

---

## The three budgets fidelity work has to fit

Fidelity competes with the design in three specific places. An idea that spends
any of these without noticing is how a garden turns back into a diagram, or
worse, starts giving wrong readings.

### The channel budget, which matters most

`DESIGN.md` gives each health signal a visual channel: vitality gets droop and
colour, activity gets sway and motes, and so on. **Colour is deliberately never
the main signal.** It backs up what the shape already says, and that's why
`textures.ts` is achromatic. Every generated texture changes brightness and never
hue, because a texture that tinted things would start carrying signal the plant
already shows through its shape.

The whole pass depends on this rule: **decoration is only affordable while it
means nothing.** A normal map that adds bark relief costs nothing. A colour grade
that makes healthy greens greener isn't free, because it doubles up the vitality
signal and takes contrast away from a plant that really is wilting. Each item
below says where it stands against this rule.

### The instancing budget

The whole scene is a handful of draw calls. Every branch on every plant is one
`InstancedMesh`, and every leaf is one mesh per leaf shape (six at most). That's
what lets 193 plants render in a headset. Anything that adds vertices per instance
multiplies by the plant count, so "a nicer leaf" is really a decision about
hundreds of thousands of leaves. Richer geometry has to justify itself against
that multiplier, which usually means a low-poly mesh with its detail in a normal
map instead of in triangles.

### The frame budget, and the decision behind it

The goal is peripheral awareness in passthrough AR. A headset runs at 90Hz for
two eyes, so roughly 5.5ms a frame, and that's the real cap on all of this. This
decision mattered more than Blender versus Unreal, and **it's settled: XR stays a
target.** The headset budget is the one that governs. The expensive desktop-only
tier at the bottom of the ladder stays off the default path, and the rungs above
it are chosen for what fits in a headset frame. Desktop-only effects are labelled
as such. They can still ship as desktop extras but they're never the baseline.

That also settles the engine question in favour of three.js. **WebXR is a browser
standard, not a vendor SDK.** The same build runs in Meta Quest's browser, on
Apple Vision Pro (Safari, visionOS 2+), on Pico and other Android-based headsets,
and in a normal desktop window when there's no headset, with `@react-three/xr`
connecting R3F to the XR session. One codebase reaches every headset. Unreal
trades that for photorealism, native builds per platform and no browser support at
all, which is the opposite of "loads instantly, sits at the edge of your desk,
works on whatever headset you have". Reaching every headset is a strong reason to
stay where we are.

---

## The ladder, cheapest and safest first

Roughly ordered by value for effort. Each rung says what it gets you, what it
costs against the three budgets, and how it fits the channel rule.

### 1. Materials and lighting: the biggest improvement for the least risk

Before this pass, leaves were flat-shaded solids (`OctahedronGeometry`,
`ConeGeometry`) on a plain `meshStandardMaterial` with no maps, and branches had
a faint achromatic bark map and nothing else. The lighting was already a decent
daylight setup (hemisphere fill, a shadow-casting sun, a moon that takes over at
night, a cool fill from the camera side), and it already followed the sun when
scrubbing. Almost all of the "plastic" look came from the materials, not the
lights.

- **Leaf translucency (do this first).** A leaf is thin and light passes through
  it. A backlit transmission term, either real `transmission`/`thickness` on a
  physical material or a cheap wrap-light approximation in a custom shader, makes
  a canopy glow when the sun is behind it. For the amount of code involved it's
  the most convincing thing a garden can do. *Channel-safe:* it's a lighting
  effect, not a hue change, and it strengthens the daylight reading instead of
  competing with health.
- **PBR maps on bark and leaves.** Normal and roughness maps, generated the same
  way `textures.ts` already generates its grain, so bark catches the light and
  looks like bark. *Channel-safe* as long as the maps stay achromatic, which that
  module already enforces.
- **Softer, better-grounded shadows.** A bigger shadow map or PCSS-style softening,
  plus contact shadows under the beds so plants sit in the soil instead of
  floating. *Watch the frame budget in XR.* A second shadow cascade is a desktop
  extra.

This rung is a materials swap and a shader or two. It doesn't touch the store,
the layout, the instancing structure or the health readings.

### 2. Post-processing (shipped, with no new dependency)

There's still no post-processing library in the dependencies, and there doesn't
need to be. Everything below uses three's own passes and two hand-written shaders,
the same approach the tilt-shift took. `scene/Post.tsx` is the single chain,
because a compositing pass takes over the render loop and two components each
running their own would fight.

- **Depth of field as tilt-shift on the bonsai table.** The table view
  (`scene/bonsai.ts`) is a miniature seen from outside. A shallow focus plane makes
  it look like a physical model, the way a tilt-shift photo makes a city look like
  a train set. It's the effect that most rewards the newest view mode, and it's a
  few lines.
- **Ambient occlusion**, to settle plants into their beds and give the greenhouse
  frame some weight. *Done* (`scene/ao.ts`), and **written by hand for a reason
  that applies to anything else that needs scene depth.** three's `SSAOPass` and
  `GTAOPass` both re-render through `scene.overrideMaterial`, which replaces the
  taper shader, so every branch would go into the AO buffers as the one-metre
  cylinder it is before tapering. Reading the depth the main pass already wrote
  avoids that entirely and costs one scene render instead of three. Normals come
  from depth derivatives, which is an approximation that's wrong along silhouettes,
  so the radius stays small.
- **Bloom**, kept subtle, on the sun and bright flowers. *Done*, and the threshold
  is the whole decision. The main buffer is linear and unclamped, so a bright sky
  sits close to white. **A threshold below one catches the sky**, and bloom over
  the whole sky acts as a soft filter over the whole garden. It lifts the black
  point and flattens the contrast between a full canopy and a thin one, which is
  the colour-grading problem sneaking in another way. With the threshold above
  one, only things genuinely brighter than white glow.
- **Colour grading**, which needs the most caution. A filmic grade is the fastest
  way to make a scene feel designed and also the fastest way to spend the colour
  channel by accident. Any grade has to leave the green-to-brown vitality ramp
  alone. Once it flatters healthy foliage it's carrying signal. Ship the others
  first and treat grading as a deliberate, measured decision, never a default.

*Cost:* each post effect is a full-screen pass and the first real cut into the XR
frame budget. This rung may end up mostly desktop.

### 3. Richer geometry (shipped)

- **Better leaf and petal meshes.** *Done* (`scene/leaf.ts`). Not modelled by
  hand and not normal-mapped: a procedural blade with a shoulder, a fold along the
  midrib and a curl at the tip, in eleven vertices and twelve triangles compared to
  the octahedron's six and eight. The detail comes from *where* the vertices sit,
  not how many there are, which is the only kind of leaf improvement that survives
  the instancing multiplier. Conifer needles keep their cone on purpose. A needle
  really is a spike, and giving it a blade would spend effort making it less
  accurate.
- **Per-instance taper and UV scale on branches.** *Done* (`scene/taper.ts`). One
  shader fixed both problems. Each instance carries its two radii and the UV
  repeats its size calls for. The vertex shader interpolates the cross-section,
  tilts the side normals to match the cone, and scales the texture coordinates so
  bark has a fixed number of cycles per metre. **One catch:** radius is no longer
  in the instance matrix, so the mesh needs a matching `customDepthMaterial`, or
  every branch casts the shadow of a one-metre cylinder.
- **Ground and understory scatter.** *Done* (`scene/scatter.ts`, `Scatter.tsx`).
  The channel concern turned out to be bigger than "density mustn't read as
  health". Ground cover **in a bed** is unsafe at any density. A bed is where
  polarity is read, and a tuft in the soil looks like a weed, which is the single
  most important shape in the whole language. So scatter is kept out of the
  plantings entirely: grass outside the glass, stones and leaf litter on the path,
  and the bed footprint passed in explicitly as an exclusion zone. Density depends
  on position and a fixed seed, so it's the same at every vitality.

### 4. Authored assets: where Blender comes in

Hand-modelled leaves, flower heads, fruit, and the greenhouse ironwork and props,
made in Blender, exported as glTF and instanced through the same batching. drei's
loaders make this routine. The rules don't change. An authored mesh is a
*container* property like the planting kind, chosen by a hash of the node id so a
bed looks naturally grown, and it mustn't encode health. Health is still shown
through droop, colour and how much foliage is left.

### 5. The expensive tier: desktop only, and only if XR is dropped

Vertex-shader wind (moving the CPU sway in `Foliage.tsx` and `Branches.tsx` onto
the GPU, which also removes the per-frame matrix cost), volumetric light shafts
through the glass, true subsurface scattering, and high-resolution shadow
cascades. Each is a real renderer project and each assumes a desktop budget.
They're listed so the ladder is complete, not because they're coming soon.

---

## The main tension: health lives in the geometry

Understand this before modelling anything, because it's where fidelity and the
design genuinely pull against each other.

Plant geometry is generated in pure code and **memoized on quantized vitals**, so
shape changes *continuously* with health. A plant wilts, loses foliage and
recovers, and the generator only rebuilds it when a vital crosses into a new
bucket. A sick plant isn't a healthy plant tinted brown. It's a different, thinner,
droopier *shape*, and that shape is the main thing people read.

Static authored meshes can't do that. As soon as a leaf becomes a fixed glTF asset
it stops wilting on its own. Keeping the health reading while improving leaf
detail means one of two things:

- **The shape stays procedural and only the shading gets richer.** That's rungs 1
  and 2, and it's why they come first: they improve fidelity without touching the
  thing that carries meaning.
- **Authored assets deform**, using morph targets (blending healthy and wilted
  versions, driven by the same vitals) or a vertex shader that makes the mesh
  droop, so a modelled leaf still sags. That's the cost of rung 4 for anything
  whose shape carries meaning, and it should be planned for up front, not
  discovered late.

A safe rule: **hand-model the things that don't carry signal** (the greenhouse,
the props, the fruit, the ground scatter) and keep procedural the things that do
(a plant's branching and how dense its foliage is). Extra detail on the first
group is free. On the second it comes with the cost of making it deform.

---

## What shipped

**Rung 1, materials and lighting.** Leaf translucency (`scene/translucency.ts`): a
backlit transmission term added to the leaf material through `onBeforeCompile`,
aimed at the sun every frame and following its intensity. Normal and roughness
maps on bark, turf, soil and all the timber (`textures.ts`), each built from the
same achromatic height field as the surface's colour map, so the ridge the colour
darkens is the same one the relief raises.

**Rung 2, post-processing.** One chain in `scene/Post.tsx` with ambient occlusion,
a subtle bloom, the tilt-shift on the table, and the output pass. No new
dependency.

**Rung 3, richer geometry.** Branch taper and per-instance bark scale
(`taper.ts`), leaf blades with a shoulder, fold and curl (`leaf.ts`), and ground
scatter outside the glass and on the path (`scatter.ts`).

### Three things we learned that weren't on the ladder

**A custom vertex shader means the scene's depth can't be re-rendered faithfully.**
Anything that re-renders the scene through an override material (three's SSAO,
GTAO and most depth-prepass effects) will draw branches as untapered cylinders.
Either read the depth the main pass wrote, or be ready to patch every override
material. This is now the biggest limit on which off-the-shelf effects can be
dropped in.

**three's passes don't agree on where their output goes.** A `ShaderPass` writes
into the write buffer. `UnrealBloomPass` sets `needsSwap = false` and blends back
into the *read* buffer it was given. A hand-built chain has to check where each
stage actually put its result instead of assuming it moved forward. Assuming cost
us a black screen and a bisect to find it.

**Bloom with the wrong threshold is a colour grade.** Colour grading was already
flagged as the effect that spends the colour channel by accident. Bloom with too
low a threshold does the same thing without anyone calling it a grade: it lifts the
black point across the whole frame and removes contrast from exactly the wilting
versus thriving reading the garden exists to show.

### Deliberately not done

Colour grading, because it spends the colour channel. Authored assets, because of
the deformation cost described above. The expensive tier. Relief and roughness
maps on the **leaves**, because a blade is eleven vertices and its shape already
does what a normal map would, so the cost outweighs the gain. The same maps on the
**metal props**, which are lots of small hand-coloured materials for not much
return.

### Not yet measured

**Frame time on a headset, or on any real GPU.** This container renders with
SwiftShader, a software rasterizer, at about 900ms a frame. That measures fill
rate on a CPU and doesn't translate to real hardware. The XR quality step-down in
`quality.ts` is built and its logic is right, but the number it's protecting
against hasn't been measured. **Anyone with a headset should measure it first.**
The quality tier makes adjusting it a one-line change.

The test for the whole pass is the one `textures.ts` already states: after it
ships, a stranger should still read a wilting plant as wilting and a thriving weed
as alarming, at a glance, out of the corner of their eye. We checked that in a real
browser this time. The league's struggling divisions still look like bare sticks
next to a full canopy, and the threats garden's thriving weed now looks like a
bramble, which is more alarming than before, not less.
