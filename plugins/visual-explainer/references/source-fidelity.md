# Source fidelity

Use a source library's actual implementation when its look or behavior is requested. Do not substitute a palette or a few similarly named primitives. Credit the author, preserve the license beside copied source, and retain the revision and file hashes in the vendored provenance manifest.

## Hairline

Run `artifacture add hairline` and import from the copied `hairline-figures` module. It reexports `@lucasmarkes/hairline@0.3.0`: all 27 original figures, geometry, pointer engine, springs, occlusion and light/dark palettes.

```tsx
import { Riffle, Phone, Exploded } from './artifacture/hairline-figures';
<Exploded theme="light" intensity={0.5} label="Layers of an application window" />
```

For a new bespoke figure, follow the unchanged [Hairline authoring skill](../vendor/hairline-create/SKILL.md), kernel and builders. The older `createHairlineScene` prepared-path adapter is useful for controlled SVG/video; it does not replace the interactive runtime.

## Shaders

`artifacture add shaders` installs the pinned official `shaders@4.0.0` package and copies its MIT notice. The `shader-components` module reexports the full original React library, including generators, materials, filters, transitions and cursor effects. Use the original props, composition and defaults; do not recreate a shader in SVG or CSS. The engine, component definitions, framework sources and documentation are bundled unchanged with a pinned revision and hash manifest. Shader Effects Inc.'s platform editor and preset assets are separate and excluded.

```tsx
import { Shader, Aurora } from './artifacture/shader-components';
<Shader disableTelemetry style={{ width: '100%', height: 500 }}><Aurora /></Shader>

import { NativeShader } from './artifacture/native-shader';
<NativeShader effect="Plasma" seconds={seconds} label="Plasma shader" />
```

`NativeShader` supports Plasma, SimplexNoise and Spiral with fixed original props. Its controller calls the original `renderSyntheticFrame` API, freezes native invalidation frames, supports backward seeking and awaits the GPU fence. `createShaderSurface(canvas, {effect, props})` returns `draw(seconds)`, `resize(width, height)` and `dispose()` for a custom presentation/video host. Pass the existing owner’s time; no independent playback clock is introduced. WebGPU failure is reported explicitly. Stateful simulations, media and cursor effects retain native live behavior and need the upstream recording workflow; they are not exposed as reversible samplers.

```bash
artifacture source shaders
artifacture source-video examples/visual-explainer-mdx/shaders.video.json --out assets/shaders
```

The shader job uses `library: "shaders"`, `example: "Plasma" | "SimplexNoise" | "Spiral"`, optional original `props`, plus duration/fps/width/height. The HTML is a generated GPU capture host, not an upstream example document. The bundle retains the editable adapter, job, pinned original-source manifest, MIT notice, clip and decoded stills. Inspect the [interactive example](../../../examples/visual-explainer-mdx/shaders.tsx).

## Diagram Design

Follow the complete [Diagram Design skill](../vendor/diagram-design/skills/diagram-design/SKILL.md), including its type-specific references, skin, geometry and motion. The original templates, 204 examples, and Python axonometry/build scripts are bundled unchanged. An explicit request for the original styling selects its defaults; for a branded project, follow its profile/onboarding workflow.

`artifacture add diagram`, `axonometric-plan`, or `exploded-axonometric` copies `DiagramDesignFigure` and the original documents:

```tsx
import { DiagramDesignFigure } from './artifacture/diagram-design-figure';
<DiagramDesignFigure example="exploded-phone-animated" height={800} />
```

The sandboxed iframe preserves the full original HTML, SVG, styles and motion controller. Original font links require a network connection. Standalone documents can be copied from the vendored assets directory with their MIT notice. Keep phone lenses, board traces, battery markings, housing lips, furniture, roads and door gaps. The compact `GraphicScene` builders are a separate shared-clock adaptation; do not present them as the original geometry.

## Chalkboarding and Mono Color

Use the unchanged [Chalkboarding skill](../vendor/chalkboarding/SKILL.md), deterministic `fonts/chalky.js`, CSS, SVG slip/dust filters, templates and beat controllers. Lily Zhang's MIT runtime is included. Its third-party PencilPete font is excluded; supply a properly licensed font for the original typography and disclose any fallback typography.

For Mono Color, follow the actual [Mono Color skill](../vendor/mono-color/SKILL.md) and its machine-readable composition, rhythm, typography, carrier and imperfection catalogs. It is an original raster image workflow, not just a page palette. Yan Liu's generated artwork and third-party reference pictures are excluded. Preserve the MIT software license and separate asset license; generate original artwork with the available image tool and the user's exact words and subject.

## Models and other sources

Living forms retain f-explainer's geometry and absolute-time poses, with the original perspective camera, fitting, material and four colored lights. Models with their own pose sampler receive no additional default spin. `NativeLivingForm` now uses the original TSL renderer, original form adapters, Fragment Mono glyph font and original settings, including pointer lighting and its WebGL 2 fallback. Use this for the original visual. Pass `seconds` to sample the native renderer directly; omitting it preserves native live motion. The separate Canvas 2D/WebGL `ModelView` adapter remains available for deliberate alternate delivery; it does not claim pixel parity with the native renderer.

Manim, Psychopomp and Archify use their real pinned engines. Lemo timing utilities retain their MIT notice. Lieflat's noncommercial source, Algebrica's noncommercial artwork and CanvasUI's restricted component code are not redistributed as MIT software. Identify independently authored encodings/effects as adaptations and compare their actual geometry and behavior before delivery.

Inspect initial and interacted figures, native playback controls, start/midpoint/end, backward seeking, desktop and narrow containment. Hash equality proves copied source; it does not replace runtime checks. Export, install and run a clean consumer before shipping.

## Vendor, adapt, render

Keep original files immutable under `vendor/<library>` with their license, pinned revision and SHA-256 manifest. Use the installed official npm package where available. Put all Artifacture integration changes in the local wrapper, never in the vendored original. [The source inventory](../../../docs/source-libraries.md) describes every supplied reference and the verified integration boundary.

`artifacture source list` discovers the inventory. `artifacture source <name>` prints the ready original directory: bundled MIT source or a separate pinned upstream checkout where redistribution is restricted. The agent handles this resolution; users do not configure checkout paths. New upstream versions require a deliberate pin/hash update and source comparison.

`SourceFigure` accepts `{title, html, source, revision, timing}`. Without `seconds`, it displays the unchanged original. With `seconds`, it wraps the original controller in an explicit clock. `diagram-design` uses the original step/render functions and CSS transitions; `chalkboarding` uses the original `paint(t)`; `smil` pauses/seeks the original SVG; `render` delegates to an original `window.render(seconds)`. Unsupported native clocks fail clearly instead of substituting an animation. `seekSourceFrame(iframe, seconds)` waits for the original source's frame acknowledgement before a capture. Controlled mode hides original playback buttons and suppresses native timeline hotkeys, leaving time ownership with the host. Use the same seconds from the presentation/video owner; no second clock is introduced in controlled mode.

```tsx
<DiagramDesignFigure example="exploded-phone-animated" seconds={seconds} />
<PrLensFigure example="postmark-refactor/data-flow/send-pipeline-view/light" seconds={seconds} />
<NativeLivingForm form="Strata" seconds={seconds} />
<NativeProceduralProp kind="boundary-found" seconds={seconds} />
```

Hairline's pointer/spring figures preserve their own interactive behavior. They are not falsely exposed as deterministic time samplers. Record native interaction with its own capture workflow when motion is required in a video.

For original Diagram Design, PR Lens or seekable Chalkboarding examples, write a JSON job with `library`, `example`, `duration`, `fps`, `width` and `height`, then run:

```bash
artifacture source-video job.json --out assets/assembly
```

The CLI handles Chromium and its pinned FFmpeg encoder automatically. The unchanged Lemo renderer samples the original source at each encoded time. Outputs include editable original/adapter HTML, job, MP4, decoded start/middle/final-frame stills, hashes and licenses. The FFmpeg process and its package retain their separate GPL notices/source links. Use `NativeClip` or `NativeStill` with `manifest.asset` and the output directory as `baseUrl` in a slide, poster, document or video composition. Host the files together when publishing HTML.

Export [the presentation example](../../../examples/visual-explainer-mdx/source-libraries.tsx) to inspect native figures on a fixed slide stage. The [video job](../../../examples/visual-explainer-mdx/diagram-design.video.json) renders the same original exploded phone. The source adapter is an integration boundary, not a universal replacement for an upstream renderer.
