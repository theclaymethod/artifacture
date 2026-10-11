# Custom React slides

Author the argument in compact MDX and compose interactive scenes in ordinary TSX. `src/App.tsx` registers components by stable slide ID. Replace the examples with a question, a visual mechanism and its consequence. Inspect evidence before adding factual claims.

The editable `src/deck.tsx` is an optional presenter. Existing consumer presenters, CSS, figures and assets can replace it. Left/right advances the active slide's ordered states before changing slides; up/down changes slides directly. Focused controls own their keys. Slide URLs and browser history use stable hashes. The state hook exposes the existing cancelable `presentation-state-navigate` event and discovery attributes for capture.

Run `npm run dev`, `npm run build`, `npm run export` and `npm run typecheck` in the project. The same Vite configuration drives all outputs. Standalone mode inlines bundled imports, not arbitrary public files or remote URLs. Bring assets into the source graph and check delivery offline when portability is required.

Use native figures through direct imports. Consult Hairline and ISO Glow for isometric work, Anatomy for mechanisms, and Manim for mathematical animation. Use ordinary media paths for rendered outputs. FFrames is the preferred video route; adapt the narrative and assets into native scenes rather than assuming every interactive React figure is deterministic film source.

Before delivery inspect navigation, stable links/history, every meaningful state, keyboard interaction, reduced motion, console errors, overflow and the actual export. This starter proves a small presenter contract; it does not yet establish parity with the entire Function Intelligence deck.

For new interactive motion, use the installed `animate` skill. Use `find-animation-opportunities` for proposals, `improve-animations` for an audit, or `review-animations` for a concrete change. Discover the upstream collection with `artifacture info emil-animation`; load only the relevant skill.
