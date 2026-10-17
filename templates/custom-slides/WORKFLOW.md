# Custom React slides

Author the argument in compact MDX and compose interactive scenes in ordinary TSX. `src/App.tsx` registers components by stable slide ID. Replace the examples with a question, a visual mechanism and its consequence. Inspect evidence before adding factual claims.

The editable `src/deck.tsx` is an optional presenter. Existing consumer presenters, CSS, figures and assets can replace it. Left/right advances the active slide's ordered states before changing slides; up/down changes slides directly. Focused controls own their keys. Slide URLs and browser history use stable hashes. The state hook exposes the existing cancelable `presentation-state-navigate` event and discovery attributes for capture.

Run `npm run dev`, `npm run build`, `npm run export` and `npm run typecheck` in the project. The same Vite configuration drives all outputs. Standalone mode inlines bundled imports, not arbitrary public files or remote URLs. Bring assets into the source graph and check delivery offline when portability is required.

Use native figures through direct imports. Consult Hairline and ISO Glow for isometric work, Anatomy for mechanisms, and Manim for mathematical animation. Use ordinary media paths for rendered outputs. FFrames is the preferred video route; adapt the narrative and assets into native scenes rather than assuming every interactive React figure is deterministic film source.

Before delivery inspect navigation, stable links/history, every meaningful state, keyboard interaction, reduced motion, console errors, overflow and the actual export. This starter proves a small presenter contract; it does not yet establish parity with the entire Function Intelligence deck.

For new interactive motion, use the installed `animate` skill. Use `find-animation-opportunities` for proposals, `improve-animations` for an audit, or `review-animations` for a concrete change. Discover the upstream collection with `artifacture info emil-animation`; load only the relevant skill.

## Scenes are the authoring unit

A slide hosts a scene with an internal progression; it is not the smallest unit of content. Author meaningful beats within a persistent visual space. Establish the subject, expose its relationships, show an intervention, and resolve the question with evidence. Keep objects recognizable as they move, reorganize, gain annotations or receive focus. A new heading or entrance animation alone is not a new beat. Add comparisons, failure cases and exploration when they improve understanding.

For interactive presentations, let viewers step forward/back through beats, pause and replay timed choreography, and explore without losing their place. Keep explicit scene navigation separate from beat navigation. Respect focused controls and reduced motion. For video, choreograph those beats with the renderer's native clock; do not merely hold a screenshot for several seconds. Scene duration follows the argument rather than a fixed slide timer. These are authoring conventions, not a new universal scene schema.

### GPU scenes

Prefer Three.js WebGPURenderer and native TSL materials for new GPU surfaces. Let the renderer select WebGPU first and a compatible WebGL2 fallback where supported. Verify the selected backend in the browser. Preserve vendor-native compute, bloom and ray-marching implementations when reusing scenes; surface an explicit unsupported state for GPU-only acts. Keep the presentation shell, navigation and accessible content in React. Vendor a bounded source snapshot with revision, hashes and license notices when a reference has no consumable package.
