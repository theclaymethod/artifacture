# Animation engine choices

Artifacture uses one editable graphic scene across posters, diagrams, animations, slides, and videos. Browser rendering with HyperFrames is the default. For advanced mathematics, the recommended additional backend is a pinned Manim Community environment. Original ManimGL remains an option when compatibility with 3b1b's Python source matters. Manim Community and Psychopomp now have optional pinned native adapters; see [native engine usage](native-engines.md).

## The scene is the foundation

Graphics primitives provide shapes, paths, and text. Diagrams add relationships and stable object identities. Animation samples those objects at an authored time. Slides compose an explanation around a graphic; a video sequences slides and adds delivery timing. A poster selects a useful static pose. Reuse the source geometry without requiring every output to use the same page layout.

The integrated API lives in [`visual-explainer-mdx/components.tsx`](../visual-explainer-mdx/components.tsx):

| API | Responsibility |
| --- | --- |
| `createDiagramScene` | Resolve diagram layout into a graphic scene with stable object IDs. |
| `GraphicCanvas` | Render that scene as accessible SVG for a page, poster, or diagram. |
| `sampleScene` | Produce a pose at a finite authored time without advancing a frame clock. |
| `createSlideScene`, `GraphicSlide` | Compose a graphic with its title and explanation. |
| `sequenceSlides`, `GraphicVideo` | Place slides on a finite sequence clock and render its current pose. |

The initial motion surface supports opacity, path reveal, highlight, and illustration translation. Diagram nodes are not independently translated: their routes and labels must remain connected, so geometry changes require diagram layout. It does not implement general contour morphing, equation matching, 3D rendering, or the Manim API.

[`shared-graphics-source.ts`](../examples/visual-explainer-mdx/shared-graphics-source.ts) supplies the same diagram to the poster, slide, and video examples. HyperFrames captures the browser composition; it does not define graphic meaning or diagram identity. New compositions use the [default explainer theme](../plugins/visual-explainer/references/default-explainer-theme.md).

## Native options

The native adapters are separate from the shared scene API. They retain editable source, pins, clips, selected stills and provenance. Browser geometry stays editable; rendered native pixels enter through `NativeClip` and `NativeStill`.

| Choice | Best use | Adoption scope and limits |
| --- | --- | --- |
| Browser SVG + [HyperFrames](https://github.com/heygen-com/hyperframes) | Editable diagrams, code-review and nontechnical explanations, shared collections | Default preview and capture path. Extend specific 2D operations when a real scene needs them; retain vector source and meaningful still poses. |
| [Manim Community 0.21.0](https://pypi.org/project/manim/) | Equations, derivations, function graphs, and 3D mathematics | Integrated optional source-to-clip backend in isolated Python 3.12.11 with a hash-locked dependency environment. Preserve Python source, renderer settings, clips, and selected stills under the episode's identity. Browser review plays those rendered assets. MIT. |
| [3b1b ManimGL](https://github.com/3b1b/manim) | Literal 3b1b scene/source compatibility | Alternate Python renderer, with an explicit package version or source SHA. Published `manimgl` 1.7.2 uses OpenGL dependencies; inspected master uses wgpu while still declaring 1.7.2. Avoid treating those as the same renderer. MIT. |
| [Psychopomp](https://github.com/kitlangton/psychopomp) | Native code-review films and interruptible presentations | Integrated optional Rust/wgpu source-to-clip adapter at `156444d4fee830a9c88307b2c27352412cd5c18d`, with Rust 1.99.0 and a bounded paint-only theme bridge. Scene Plans validate before render. Upstream now includes an MIT license. Native GPU required; presentation controls are not part of this adapter. |

Manim Community supplies [MathTex](https://docs.manim.community/en/stable/reference/manim.mobject.text.tex_mobject.MathTex.html), [TransformMatchingTex](https://docs.manim.community/en/stable/reference/manim.animation.transform_matching_parts.TransformMatchingTex.html), and [Axes](https://docs.manim.community/en/stable/reference/manim.mobject.graphing.coordinate_systems.Axes.html). MathTex requires TeX tooling; optional [MathTypst](https://docs.manim.community/en/stable/reference/manim.mobject.text.typst_mobject.MathTypst.html) compiles another formula source to SVG. Installing a math backend does not make its Python geometry directly editable in the browser. Validate its output codec and compositing before promising transparent overlays.

Psychopomp's [PR walkthrough](https://github.com/kitlangton/psychopomp/blob/46fd6121d0c2067f22a176e2187924a9914e9453/scenes/pr-walkthrough/README.md) pairs broken/fixed sequence diagrams with stable code edits. Its checked-in reel contains 12 segments covering five PR stories plus an introduction and ending. [Scene Plans](https://github.com/kitlangton/psychopomp/blob/46fd6121d0c2067f22a176e2187924a9914e9453/SCENE_PLANS.md) provide inspectable JSON, exact cues, narration timing, and arbitrary-time sampling for native presentation and video. Those ideas inform independently authored browser work. Native presentation currently excludes some state/media recipes that file export accepts; it is not a drop-in replacement for the browser workflow.

## Concrete adoption scope

Keep browser scenes as the default collection source. Code-review episodes preserve unchanged code identity, demonstrate the broken behavior and fixed replay, and cite their source. Nontechnical episodes explain one causal mechanism with familiar language. Mathematical episodes can embed separately rendered Manim clips. Share figure identities, terminology, visual treatment, and prerequisite order across episodes; presentation modes should not create separate geometry libraries.

The native adapter boundary is a source scene plus explicit theme, dimensions, frame rate, and requested poses, producing clips and stills with their source provenance. Do not begin a full Manim or Psychopomp port: general path alignment, equation glyphs, updaters, shaders, cameras, and 3D depth are a much larger compatibility commitment than the required 2D foundation.

## Initial research evidence and limits (2026-10-04)

The engine assessment inspected these exact source revisions on 2026-10-04. They are research snapshots, not installed dependency pins:

- Manim Community: [`5dc0d3b8dfe23b1dbf2284cca111c5d146a44db0`](https://github.com/ManimCommunity/manim/tree/5dc0d3b8dfe23b1dbf2284cca111c5d146a44db0).
- ManimGL: [`fafa083a4fb274bba9cabde0b6e2f50ba6da0622`](https://github.com/3b1b/manim/tree/fafa083a4fb274bba9cabde0b6e2f50ba6da0622). Compare its [camera implementation](https://github.com/3b1b/manim/blob/fafa083a4fb274bba9cabde0b6e2f50ba6da0622/manimlib/camera/camera.py) with [publisher metadata](https://pypi.org/pypi/manimgl/1.7.2/json) before choosing a renderer.
- Psychopomp: [`46fd6121d0c2067f22a176e2187924a9914e9453`](https://github.com/kitlangton/psychopomp/tree/46fd6121d0c2067f22a176e2187924a9914e9453).

A separate disposable SVG/GSAP prototype sampled times `0, 1, 3, 5, 7.5, 3`. Backward seeking produced identical curve, contour, and point geometry, with no browser errors. It demonstrated a 241-vertex circle-to-square transform and a code insertion preserving the prefix's DOM identity and position. Static SVG versus the animation's SVG crop differed in 10 of 576,000 pixels, by at most 3/255 per channel. These demonstrations establish feasibility; they are not additional integrated APIs or Manim/Psychopomp execution.

On the assessed host, Rust and TeX tools were absent. An isolated Python 3.14.4 probe, `uv pip install --python <scratch-venv>/bin/python --only-binary :all: manim==0.21.0`, failed because usable ModernGL wheels were unavailable. No system dependencies or compile fallback were installed. No native render or comparative speed result is claimed.

Session-local receipts and exact reproduction commands are retained under `/Users/claytonkim/.codex/investigations/artifacture-video-upgrade-2026-10-04/engines/`: `browser-proof.json`, `commands.md`, `manim-install-probe.json`, and `psychopomp-source-receipt.json`. The Artifacture worktree baseline was `e5e131eae83b068eb158a1ee67c4b4f70d1b0b34`; the new foundation is described by the source files in this change, rather than attributed to that baseline commit.

## Native integration evidence (2026-10-05)

The pinned Manim Community adapter rendered a 14-second, 1920×1080/30-fps secant-to-tangent scene using MathTypst formulas and a matching-shape derivative transform without TeX. The pinned Psychopomp adapter rendered an 8-second connection/packet scene on Apple M1 Max Metal. Both were rendered in Hairline and 3b1b, normalized to H.264/yuv420p, probed for actual frame settings, and decoded into three selected stills per clip. Manim output has 420 frames; Psychopomp delivery has 240, with native 60-fps rendering recorded separately. These examples are unnarrated component clips. No comparative performance or ManimGL execution is claimed.
