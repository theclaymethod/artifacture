# Component references

These references guide the next editable blocks. They are design and API references, not bundled dependencies or copied upstream assets. Hairline remains the default. 3b1b, Mono Color, and Algebrica share the same geometry and data contracts.

| Reference | Useful parts | Local fit |
| --- | --- | --- |
| [Hairline](https://hairline.lucasmarkes.com/) | Rounded isometric solids, silhouettes, creases, and pointer response | Illustration scenes and diagram objects. The pinned native engine and its MIT notice live in `plugins/visual-explainer/vendor/hairline-create`. The React scene adapter accepts prepared paths. |
| [Mafs plots](https://mafs.dev/guides/display/plots) and [movable points](https://mafs.dev/guides/interaction/movable-points) | Function plots, parametric curves, vector fields, and parameter controls | Mathematical explanations. Sample a function into scene geometry and drive its point or parameter with the shared clock. |
| [Manim matching transforms](https://docs.manim.community/en/stable/reference/manim.animation.transform_matching_parts.TransformMatchingTex.html) | Match equation parts across a transformation | Refine 3b1b explanations by retaining the identity of symbols as their meaning changes. Current SVG math text uses Unicode and STIX Two Math; it does not implement TeX matching. |
| [Motion Canvas Code](https://motioncanvas.io/docs/code/) | Code selection, animated replacement, and insertion | Code review explanations. Keep the code readable, focus the changed lines, and connect the edit to the affected diagram object. |
| [Code Hike annotations](https://codehike.org/docs/concepts/annotations) | Annotations tied to code lines and tokens | Anchor explanations to source ranges instead of duplicating code in captions. |
| [Observable Plot marks](https://observablehq.github.io/plot/features/marks) | Layered marks and channels that bind data to visual properties | Extend the original charts with reusable dots, rules, bands, and labels. Preserve quantitative encodings across themes. |
| [D3 shape](https://d3js.org/d3-shape) | Line and area geometry, curves, symbols, and arcs | Geometry helpers that return paths usable in diagrams, posters, slides, and video. |
| [React Flow sub-flows](https://reactflow.dev/learn/layouting/sub-flows) | Parent-relative placement and bounded child groups | Architecture diagrams with nested systems. Existing scene composition already scopes object IDs and fits child scenes into frames. |
| [shadcn registry items](https://ui.shadcn.com/docs/registry/registry-item-json) | Source files, registry dependencies, npm dependencies, and destination paths | The source-copy CLI and new workspace setup. Consumers own the copied code and import local modules. |
| [Motion Engineering by rari](https://x.com/0xwhrrari/status/2105643919119696297) | Seekable frames, explicit story states, a shared timeline, and frame review | Workspace motion uses the existing finite sampler. A preview can jump directly to any authored time without replaying earlier frames. |

## Shared design rules

Each block owns geometry or behavior. Theme tokens own color, fonts, and stroke roles. Hairline diagrams and charts use thin structural and detail strokes, with one contrasting accent for the current focus. Mathematical scenes use 3b1b's black background, readable math, and motion that demonstrates a causal step.

A poster samples a scene at a chosen state. A diagram explains relationships in that scene. Slides frame and sequence the scene, and video advances the same sequence clock. Source copies keep those levels connected without requiring the full MDX renderer.

The next useful additions are function axes with parameter controls, equation-part transforms, source-range code focus, nested diagram groups, and chart mark helpers. These are reference-backed candidates, not claims that those new components have been implemented.

The motion article was read in the browser on 2026-10-04. Its relevant guidance is to preserve object identity through state changes, use movement to direct attention, inspect frames at major beats and fast transitions, and compose each aspect ratio deliberately. It describes selective springs and controlled settling, but does not supply a tested spring implementation. Those effects need their own runtime proof before entering the reusable catalog.

## Expanded source audit

The [implemented catalog](component-catalog.md) now includes copyable React leaves
and seven scene builders grounded in Chalkboarding, Diagram Design, Lieflat
encodings, and shader data contracts. The pinned source table records actual
implementation versus reference material. Map geometry and interface masks remain
prototypes to build, with source details in [candidate research](research/primitive-candidates-2026-10-04.md).
