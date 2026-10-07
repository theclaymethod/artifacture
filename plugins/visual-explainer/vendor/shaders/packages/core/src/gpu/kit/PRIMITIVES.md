# Building shader primitives

This document is for whoever **works on the kit itself** — adding a primitive, changing one, or
deciding whether a piece of shader math belongs here at all. It is not a catalog. If you are
*authoring a shader* and want to know what already exists, read `CATALOG.md` (next to this file)
instead.

A "primitive" here means a reusable building block bigger than a math function (`mix`, `sin`) and
smaller than a shader component (Glass, Aurora): an SDF mask tail, an edge-handling mode, a
gradient color path, a fluid solver, a definition-level scaffold. The value of the layer is that
a fix made once propagates to every consumer — which only holds if primitives follow the same
rules. Those rules are C1–C9 below.

---

## C1 — Calling convention: structs over scalar lists

`tgpu.fn` caps out at roughly 15 arguments. This is the single hardest constraint on
decomposition: shaders that hit it hand-pack `p0..p3` vec4 bundles (LiquidMetal, Chrome, Plastic,
Frost, Water all do this today), and a bundle is opaque — the next reader cannot tell what `p2.z`
means.

A primitive taking more than about five parameters MUST accept a `d.struct`. Never a long scalar
list, and never bespoke vec4 packing. The precedents are `MarchParams` (`kit/sdf3d.ts`) and
`ShapeMask` (`kit/sdf.ts`, `{overallMask, strokeBlend}`).

Structs also give you a named return shape, which matters when a primitive computes two related
values that callers would otherwise have to recompute.

Note the uniform-layout constraint that applies to structs written per-frame from the CPU: hidden
`_pad f32` members, not `d.align` decorators — typegpu's partial IO cannot patch Decorated
members. Decorated structs must be written whole.

## C2 — Dual-form where both surfaces need it

There are two authoring surfaces, and they cannot call each other:

- **Body level** (`'use gpu'` TGSL). Operates on concrete vec *values*. Ships as a `tgpu.fn`.
- **Composition level.** A shader's `fragment` / `uvRemap` builder assembles `Expr` trees at
  composition time and cannot call value-level fns on them.

Where both surfaces need the same operation, ship both forms side by side and keep the names
paired. `kit/edges.ts` is the model: `applyEdgeToUV` / `applyEdgeToUVExpr`, `composeEdgeRemap` /
`composeEdgeRemapExpr`, `applyEdgeHandling` / `applyEdgeHandlingExpr`. The Expr forms emit
`call(<perModeFn>, hint, [...])` against the *same* per-mode `tgpu.fn`s, with hints matching the
value-level fn names so the emitted WGSL — and therefore the snapshots — are identical either way.

The pure GPU math lives in the `tgpu.fn`s; those are the durable, resolve-tested artifacts. The
builders are the thin JS-branching layer on top. Keep the split in that order, not the reverse.

Dual-form is also the cost of admission for later serving runtime-generated (AI) shaders through
`customWgsl.ts`, which has no build-time transpile step.

## C3 — Higher-order primitives live at the builder level

TGSL cannot take functions as arguments. Anything parameterized *by a function* —
`fbm(fieldFn)`, `domainWarp(fieldFn)`, a per-shape weight function — must be a JS-level builder
that emits a specialized `tgpu.fn`.

Two working shapes for this:

- **Composition-time fn passing.** `noiseStylize.applyNoiseReliefExpr(params, heightFn, hint)` —
  the caller hands in `stone12` or `wool12` and the builder wires it into the shared relief path.
- **Memoized variant tables / factories.** `colorMixing.mixColorsVariants` (one fn per color
  space, selected by a compile-time mode), `agents.makeAgentWeightFn(shape)` (bakes one shape's
  SDF into a reusable fn).

Factories MUST `$name` their output and memoize per option-key. Two differently-configured
instances of the same factory in one tree otherwise collide on WGSL identifiers — Form3D and
LightEdge set the precedent. Add a resolve test that composes two configurations together; that is
the only cheap way to catch a collision.

## C4 — A primitive exports its field requirements; the caller declares them

A primitive cannot allocate uniforms. When a primitive needs per-frame CPU-written values, it
exports an `*_EXTRA_FIELDS` constant that the consuming shader spreads into its own `extraFields`.
`ANALYTIC_SDF_EXTRA_FIELDS` and `VOLUMETRIC_FIELD_EXTRA_FIELDS` are the existing pair; the
shape-effect shaders declare both.

This keeps ownership honest: the shader definition remains the single place where its uniform
surface is visible, and the primitive stays composable with shaders that already have their own
fields.

## C5 — Compile-time vs runtime is an explicit axis

Every primitive documents, per parameter, whether it is:

- **structural** — a JS value read at composition time, branched on in the builder, and part of the
  pipeline hash (so changing it recompiles), or
- **runtime** — a uniform read on the GPU.

Getting this wrong is not a style issue. A structural value read as a uniform silently freezes at
its first value; a runtime value branched on in JS recompiles on every frame it changes.

Scaffolds own the `compileTimeWhen` identity-bypass pattern so it is applied uniformly. A filter
whose strength is zero should return its child untouched, and the scaffold — not each shader — is
where that decision belongs.

## C6 — Texture-taking primitives follow the fn-arg rule

`tgpu.slot`-per-texture throws in TypeGPU 0.11.9 (see the note at the top of `gpu/contract.ts`).
So a primitive that samples takes the texture as an **fn argument** (`d.texture2d(d.f32)`), and
uses the four shared samplers from `SHARED_SAMPLER_LAYOUT` — a fixed ABI, not a per-shader choice.

Compute-side sampling should prefer a declared filtering sampler plus `textureSampleLevel` (the
TimeTrail pattern) over hand-rolled bilinear `textureLoad` arithmetic: it is fewer instructions and
uses the hardware path.

## C7 — Verification gates: classify every change before making it

Classify each extraction or migration up front. The gate determines what evidence is required, and
saying "probably fine" is not one of the options.

- **Gate A — byte-identical.** The emitted WGSL must be byte-identical before and after, for every
  consumer. Verified by the existing per-shader `tgpu.resolve` snapshot tests; snapshots must not
  move. No visual check needed. This is the target for mechanical extractions.
- **Gate B — pixel-neutral by argument.** The WGSL text changes (a fn rename, reordered
  declarations, different `$name` prefixes) but the math is provably identical. Snapshot update
  plus a reviewer reading the diff.
- **Gate C — pixel-changing.** Output changes: bug fixes, constant corrections, anti-aliasing
  improvements, hash unification. Requires visual sign-off, one shader at a time, and an
  entry in the running Gate C changelog.

Two things that look like Gate A but are not:

- **Float-op reordering.** Refactoring an expression into "the same" primitive can reorder
  additions and multiplies. Associativity is not free in floating point. Any non-byte-identical
  WGSL is Gate B minimum — this bites hardest on HDR radiance models (studio environments) and
  fbm loops.
- **Renames.** Function names appear in the emitted WGSL, so a rename moves snapshots. Keep
  rename-only commits separate from logic commits so the diffs stay readable.

**Standard verification chain**, from `packages/core` unless noted:

1. `npx tsc --noEmit`
2. `npx vitest run src/__tests__/gpu` — the GPU-free composition/resolve gates. Update snapshots
   with `vitest -u` only for classified Gate B/C units, and read the diff.
3. `pnpm lib:build` from the repo root — regenerates `shaderRegistry.ts` and the framework
   components.

**Bail-out rule.** If a Gate A migration cannot reach byte-identical WGSL within reasonable
effort, skip that consumer and log why. A primitive must not contort itself to absorb an outlier —
permanent outliers are a legitimate outcome, and each category keeps an explicit list of them.

## C8 — Every kit module gets a GPU-free test

Pattern set by `kit-geom.test.ts` and `kit-mask.test.ts` in `src/__tests__/gpu/`: compose the
primitive, `tgpu.resolve` it, assert the body-fn names appear, and snapshot the WGSL. Pure-float
fns (no hash, no texture) are additionally CPU-executable under vitest as DualFns, so they get
golden-value assertions — `noiseColor.noiseToneKColor` and `media.*` are written specifically to
allow this, and new pure-math primitives should preserve that property.

Scaffold factories get one extra test during migration: **factory output resolves identically to
the hand-written original.** That test is what makes a Gate A claim checkable rather than asserted.

## C9 — Naming and placement

- **TGSL / Expr primitives** → namespaced files under `gpu/kit/`, re-exported through
  `kit/index.ts` as a namespace (`export * as noise from './noise'`). Shaders import from
  `@coreroot/gpu/kit`; nothing outside `src/gpu/**` may import `typegpu` directly (lint-enforced).
- **Definition-level factories (scaffolds)** → `gpu/scaffolds/`. They import from the kit and from
  `contract.ts`, and are re-exported through `porters.ts` because shaders consume them.
- **CPU-side lifecycle helpers** (media loaders, pointer trackers, canvas rasterizers) →
  `gpu/kit/host/`. Not GPU code, but consumed only by shader definitions.
- **Prop-config factories** → `src/utilities/`. Precedents: `colorStopsPropConfig` in
  `utilities/colorStops.ts`, `reliefStylizeProps` in `utilities/noiseStylize.ts`.
- **Verb prefixes:** `define*` for definition factories (`definePointwiseFilter`,
  `defineSdfShapeShader`), `create*` for runtime objects (`createStateBuffer`,
  `createGuardedCompute`, `createAgentSystem`), `apply*Expr` / `*Expr` for composition-time
  builders, plain nouns for `tgpu.fn`s.

---

## Resolved conventions

### Coordinate convention (D-1)

- **Center-scaled is canonical.** A center position in UV space is aspect-corrected as
  `center.x * aspect`, matching `sdf.shapeLocalCoords`. Do not scale the UV instead and leave the
  center alone — it produces a different, subtly wrong offset at non-square aspects.
- **The aspect divide is always guarded.** `viewport.x / max(viewport.y, 1e-6)`. An unguarded
  divide produces NaN for the single frame where a canvas initializes at zero height, and NaN
  propagates through everything downstream.
- **`flipY` is an explicit required option with no default.** Sibling shaders currently disagree
  about it, and a default would silently pick a winner. Making it required forces each migration to
  state its choice.

Shaders using other conventions keep their current look until deliberately migrated, with the
deviation documented at the migration.

### Luma policy (D-2)

Both standards exist in the library and both stay:

- **ITU-R BT.709** — `0.2126, 0.7152, 0.0722`. This is `blend.luminance`.
- **ITU-R BT.601** — `0.299, 0.587, 0.114`.

Named helpers exist for each. When migrating an inline luma computation, adopt the helper that
matches **the weights that file uses today** — that keeps the migration Gate A. Unifying a shader
from 601 to 709 (or the reverse) is a separate, pixel-changing decision and is explicitly not
bundled with extraction work.

### Hash policy (D-6)

Two hash families, deliberately not unified:

- **`noise.hash*`** — bit-exact integer hashes. **New shaders use these.**
- **The legacy sin-fract hash** — kept byte-identical as the shared `cells.cellHash` so existing
  shaders keep their exact look. Do not "improve" it.

### Scaffold naming (D-9)

See C9. `define*` for definition factories, `create*` for runtime objects, and scaffolds live in
`gpu/scaffolds/`.

---

## Learned during implementation

Rules that were NOT obvious from the design and cost real time to discover while building the kit.

### Emitted WGSL names come from the REFERENCE site, in both directions (refines C7, C8)

The house pattern is that the **consumer** names a call, via the composer's `call(fn, hint, …)`, so a
kit `tgpu.fn` needs no `$name` of its own. The full rule, after several phases got surprised by half
of it, is that the name comes from wherever the fn is REFERENCED:

- **Through `call(fn, hint, …)` the HINT names it.** That is what makes aliasing a kit fn under a
  shader's historical name free: `noiseColor.noiseToneKColor = tone.toneUnitPivotInverted` was Gate A
  across ten shaders, and `Grid`'s `mapSampleUVs` still emits `gridCellCenterUV` from a one-line
  wrapper. It only works because **parameter names also land in the emitted WGSL** — which is why
  `toneUnitPivotInverted`'s first parameter is deliberately called `noise01`.
- **From inside another `'use gpu'` body the LOCAL VARIABLE names it.** Under `names: 'strict'` the
  unplugin derives the name from the binding, so `const ambientGlow = lightfields.radialGaussianGlow`
  emits `fn ambientGlow` (that is how StudioBackground's lobe moved into the kit with a zero-line
  snapshot diff), and a kit fn referenced by its own export name emits under that name. So a kit
  module's resolve gate CAN assert `fn <name>` for these; it cannot for fns invoked only through
  `call(...)`, which is what the first draft of `kit-reveal.test.ts` tripped over.
- **A memoized factory still needs an explicit `$name` carrying its option key** —
  `mapSourceScalar_alpha` — because there is no call site to disambiguate two configurations in one
  tree (C3's collision rule).
- **A pure MOVE of a `tgpu.fn` between modules is Gate A, not Gate B.** As long as the body text and
  the reference-site name are untouched, the emitted WGSL is byte-identical — Form3D's trace moved
  into the kit and its snapshot did not budge. Only a **rename** costs a snapshot. Plan extractions
  accordingly: the expensive part is renaming, not relocating.

### A JS builder renames the fn it captures

`fields.fbmGated(noise.mxNoiseFloat2, …)` emits `fn octaveField(p: vec2f)`, not `fn mxNoiseFloat2`.
A transpiled body registers its externals under the identifier the SOURCE TEXT uses, and inside the
builder that identifier is the builder's own local — the same mechanism renamed WorleyNoise's exported
`worleyEvalOctave` to `octaveField` at the call site.

Harmless (the resolver uniquifies collisions with a `_1` suffix), but it has two consequences:
**pick a descriptive local name for a captured fn**, because that name is what future readers of the
WGSL see; and expect an fbm-style migration's snapshot diff to look bigger than it is, since the field
fn appears renamed as well as the loop moved.

### TGSL cannot destructure a struct return, and aliasing a member emits a pointer

`const {cell, local} = squareTiling(p)` fails hard at transpile: `Unsupported JS functionality:
ObjectPattern`. And the obvious workaround is a trap of its own — `const local = tile.local` makes
typegpu promote the struct to a `var` and bind a WGSL POINTER:

```wgsl
var tile = squareTiling(scaledUV);
let local = (&tile.local);
... (*local).x ...
```

Valid WGSL with identical math, and any backend's mem2reg will erase the `var`, but it is noise in
every snapshot and it puts a hot fragment local into mutable storage for no reason. **Read struct
members inline** (`tile.local.x`) and the emitted WGSL is `let tile = squareTiling(...)` with direct
member access.

This is also the constraint that decides **when a struct-returning primitive is worth it at all**:
few reads → return the struct; many reads threaded through one expression → leave the pair inline.
TriangularGrid reads its in-cell coordinate seven times across an anti-diagonal test and a four-way
`min` chain, so `cells.squareTiling` would have meant seven `tile.local.x` reads inside one
expression — a net loss in legibility for two lines saved, and it stayed inline.

### Module-scope namespace destructuring is the clean re-bind

The constants rule below (member access does not fold) has a functional counterpart. Kit FUNCTIONS
reached through a namespace do resolve (`noise.mxNoiseFloat3(...)` is fine), but a shader with a
`cells` prop has a second problem: the prop shadows the `cells` namespace inside the body. Module-scope
destructuring solves both at once and mirrors the `const DEG_TO_RAD = constants.DEG_TO_RAD`
convention:

```ts
import {tgpu, d, std, geom, cells as cellKit, aa} from "@coreroot/gpu/kit"
const {aspectOf, rotateAboutCanvasCentre} = geom
const {squareTiling} = cellKit
const {lineMaskFromField} = aa
```

Plain identifiers, one import line, facade-only, no shadowing. Every migrated shader uses it.

Also worth knowing: nested `tgpu.fn`s stay CPU-executable. A DualFn composed of other DualFns still
runs under vitest, so extracting into kit fns does not forfeit C8's golden-value tier.

### Namespace member access does not fold inside a `'use gpu'` body

The transpiler folds a module-scope `const` whose value is a JS number into a WGSL literal. A **member
expression on an imported namespace object** (`constants.DEG_TO_RAD` inside a body) is not that
pattern and must not be relied on. Every migrated shader keeps a one-line module-scope re-binding
(`const DEG_TO_RAD = constants.DEG_TO_RAD`) with a comment saying why; a named import
(`import {DEG_TO_RAD} from './constants'`) works directly. `constants.ts`'s header documents both
forms.

### Prop KEY ORDER is Gate A-relevant

`createGpuUniformsMap` walks a definition's `props` to lay out the node's uniform struct, so reordering
prop keys reorders the emitted WGSL struct members — and separately drives the settings-panel order
via the generated `shaderMetadata.ts`. Any refactor that rebuilds a props object (a scaffold, a
prop-config factory) must emit the fleet-canonical order, and needs an override hook for the one
shader whose existing order differs (`defineSdfShapeShader`'s `propOrder`, used only by Circle). A
prop-order assertion belongs in the scaffold's test.

### The identity bypass is blind to mouse/auto drivers

`propValues` is deliberately driver-unaware (`composer.ts propValuesFor` reads the handle mirror), so a
compile-time identity bypass keyed on a prop's base value **kills any driver on that prop**: a Vignette
with `intensity` mouse-driven from a base of 0 would never appear. This pre-existed in
Saturation/HueShift/Sharpness and the filter scaffolds widened the exposure by adding eight more
bypasses.

The scaffolds close the worst case — a **map** driver, which varies per pixel — by refusing the bypass
when `getMapInfo(prop)` is non-null (also a small behavior fix for the three shaders that already had
a bypass). **Mouse and auto drivers remain undetectable from a fragment builder.** Fixing them needs a
`GpuFragmentParams` addition carrying driver presence per prop, which is a contract change;
`isFilterIdentity` is the only place that would need to change once it lands.

So: when you add an identity bypass, the prop needs `compileTimeWhen` (or `compileTime`) or the bypass
sticks, `identity.props` must list every prop the predicate reads, and the bypass must be **provable**
at the identity value — see `Tint`, which has none because its default `preserveLuminosity` body is
only exactly identity above a luminance floor.

### TGSL cannot read a struct member by a computed name

A scaffold that wants to read a consumer's uniform struct cannot take the member name as an option —
`params[nameFromConfig]` inside a `'use gpu'` body has no WGSL form. Two workable shapes:

- **Standardize the member names as a fixed ABI** and document them. `buildStableFluidsKernels`
  requires exactly `dt`, `curlStrength`, `velFade` (+ `dyeFade`, `colorDecay` under their options);
  extra members are free. This is what forced `velFade` to become a uniform at all — four consumers
  had baked it as a module constant, and there was no way to let each keep its own spelling.
- **Take a function-argument getter**, i.e. the consumer supplies a small always-valid `tgpu.fn` that
  reads its own struct.

The same rule is why a whole-kernel builder that needs `layout.$[keyFromConfig]` is not buildable:
verify that mechanism in isolation before designing anything on top of it, because the failure mode is
silently wrong WGSL, not an error.

### A captured `null` does not fold out of a dead branch

Passing `childDrive: fn | null` and branching `if (childDrive)` inside a body fails to resolve with
`Identifier childDrive not found` — **the transpiler resolves identifiers on the dead path**, and
`null` has no WGSL form. Comparing a captured PRIMITIVE does fold (that is why `buildScoreFn(mode)`
and `buildKeyScale(keyMode)` work), but any *fn* referenced inside the dead branch still has to
resolve.

The fix is to carry the variation in a fn that is ALWAYS valid: each variant supplies its own
`rates(feed, kill, cx, cy) → vec2f` and the kernel just calls it. That is what let
ReactionDiffusion's two kernels collapse to one source emitted twice.

Related and useful: **a bind-group layout CAN be a factory parameter.** `layout.$.readBuf` inside a
`'use gpu'` body resolves fine when `layout` arrives as a factory argument rather than a module const
(`kit/blur.ts`'s `buildFixedBlurGraph` relied on this first). So kernel bodies deduplicate across two
layouts even when the LAYOUTS must stay split — and they often must, since a WebGPU bind-group layout
is part of a pipeline's identity, and making a generator variant declare the child variant's extra
texture entry would mean allocating and binding a dummy texture on every childless preset.

### `d.struct(...).$name(...)` is part of the WGSL ABI

The plugin derives a struct's name from its JS binding, so moving a struct-returning fn into the kit
RENAMES the struct (PixelThrow's tap struct became `PixelThrowBicubicSetupTaps`) and moves the
consumer's snapshot. Passing the name explicitly restores byte-identical output. **Any kit primitive
that returns a struct needs an explicit `$name`, and a factory needs it parameterized**, or a
migration that should have been Gate A silently becomes Gate B. `sampling.bSplineTapSetup` takes both
`fnName` and `structName` for exactly this reason.

### Solver factories must be two-stage: kernels at module scope, passes per instance

The obvious design — `createStableFluidsSolver(root, opts)` returning buffers, layouts and passes —
does not work. The kernels are module-scope `tgpu.fn`s that must reference a module-scope layout, so
creating the layout per component instance would create a fresh pipeline per instance. Hence the
split: a **builder** takes the shader's layout and returns kernels (module scope), and a separate
**`createStableFluidsPasses(root, kernels, {n, bindGroup})`** handles the per-instance bind group and
pipelines. This also keeps the shader's uniform surface visible in the shader (C4) and keeps its
kernels exportable for the resolve gates.

Hand-written structural interfaces work as the layout parameter type: `FluidSolverLayout` declares
`{$: {velA: d.v4f[], pressure: number[], params: {…}}}`, a real `tgpu.bindGroupLayout` is assignable
to it, and TGSL transpiles `layout.$.velA[idx] = …` through a function parameter correctly.

### The layout-introspection seam (the recommended shape for sim scaffolds)

`createAgentSystem` allocates its buffers by introspecting `layout.entries`, and the kernels stay in
the shader written against the shader's own layout. **Put the layout and the kernels in the shader; put
the allocation, binding and dispatch in the scaffold — the seam is the layout object.**

Two payoffs. The layout literal becomes the single source of truth, so a shader that adds a state
buffer cannot forget to allocate it and the allocation cannot drift from the WGSL. And because WGSL
identifiers come only from the layout's key names and each kernel's `$name`, both of which the shader
owns, **the compute-side WGSL cannot move at all** — the five agent migrations were snapshot-clean
apart from deliberate helper extractions. A harness that generated kernels would need every name
reproduced by configuration, and every one of those is a chance to silently rename a WGSL symbol.

Corollary on expectations: that migration removed only ~127 shader lines against +459 of harness. Five sim
shaders are ~85% the same *architecture* but only ~30 lines each of literally duplicated text. **Do not
justify a sim harness on deletion.** Justify it on subtle invariants getting one home (the per-axis
splat window, the dt clamp, the size-reference decoupling, the fixed-point gains), on allocation
drift becoming impossible, and on the next shader in the family being a config block.

### Storage-texture typing: `d.WgslStorageTexture` is not assignable to `std.textureStore`

It is missing `kind`. The working spelling is a concrete
`d.textureStorage2d<'rgba16float', 'write-only'>` (the fluids scaffold exports it as
`FluidStorageTexture`). In practice the format becomes part of the primitive's ABI — which is fine
when it is load-bearing anyway: half floats are what give the fragment hardware-bilinear filtering
free on an upsample.

### `import.meta.env` does not carry your env var into a vitest worker — `process.env` does

Relevant when parameterizing a before/after WGSL diff by a `BASELINE_DIR`-style variable.
`import.meta.env` only exposes variables matching Vite's `envPrefix` (default `VITE_`), so in a
test file read `process.env`, or prefix the variable `VITE_`.

### Multiply GROUPING is part of a Gate A/B claim, not just addition order

C7 warns that associativity is not free, with fbm loops and HDR accumulation in mind. The subtler
version bites on one-line adoptions: `-k·d·d` and `-(d·d·k)` are equal in exact arithmetic and round
differently. That is exactly where a reviewer waves a change through, because it looks like a pure
substitution — three gaussian falloff sites (`LensFlare`'s `coreSoft` and `vertFall`, `Aurora`'s core
brightness) stayed inline for this reason rather than adopting
`lightfields.radialGaussianFalloff`, which spells the product the other way round.

### `applyRemapWindow`'s six flat scalars are C1's documented counter-example

C1 says a primitive over about five parameters should take a `d.struct`. `blur.applyRemapWindow` takes
six flat scalars instead, deliberately, because the five window fields live INSIDE each consumer's own
uniform struct. A struct parameter would mean either nesting a `RemapWindow` into five uniform layouts
— changing the CPU write shape at five sites for no behavioral gain — or constructing a throwaway
struct in the kernel body, which adds ops to the emitted WGSL. Six flat scalars keep every consumer's
uniform layout byte-identical.

So the rule has a stated exception: **when the parameters are already members of a caller-owned
uniform layout, flat scalars win**, because the struct boundary would have to cut across that layout.
If C1 ever gets a numeric threshold, write it against this case.

### A host-lifecycle primitive's FIRST migration grows the codebase

The GPU-side extractions removed more than they added, because the duplicated thing WAS the
artifact. A lifecycle helper is different: the honest version documents the races — dispose during
await, retry policy, readiness gating, autoplay disagreement — that the copies each handled
implicitly and inconsistently, so the shared module ends up longer than the sum of what it replaced
(the media migration: −336 shader lines against +827 of `host/` + `media.ts`).

The payoff is the 8th consumer, not the 7th. Budget for that rather than treating line count as the
success metric — the same correction the sim-harness note above makes, arrived at independently.

---

## Two failure modes worth naming

**Decomposition that costs performance.** A primitive must not add function-call indirection where
the original body was deliberately fused so the compiler could share subexpressions. Glitch's
single-struct body and Blob's fused field are fused on purpose. Rule: fused monoliths stay fused;
primitives take over only where the original was already separable. Anything that reads an `Expr`
twice needs a local-hoisting mechanism first, or it silently double-evaluates.

**Documentation lag.** The whole point of the layer is that future shaders — human-written or
AI-generated — compose from primitives instead of hand-rolling. A primitive that exists but is not
in the consumption catalog will be re-implemented inline by the next author. So landing a primitive
is not done until it has an entry in `CATALOG.md`. Rationale and builder-facing rules belong here;
the consumption index belongs there.
