# Artifacture system map — truth brief

## Scope

Show the repository's primary authoring, export, preview, verification, visual-review, and finalization paths. The map is an engineering overview, not a deployment topology: each building represents a code-owned subsystem rather than a separately deployed service.

## Verified claims

1. The skill routes a request to a focused card, keeps MDX/TSX as editable source, exports through `ve:export`, and then requires verification evidence. Source: `plugins/visual-explainer/SKILL.md:25-32`.
2. Shared React components and presentation primitives are exported through one component entry point. Source: `visual-explainer-mdx/components.tsx:28-85` and `visual-explainer-mdx/components.tsx:202-250`.
3. The export CLI accepts MDX/TSX/JSX, builds with Vite, MDX, React, and Tailwind, inlines generated JavaScript and CSS, resolves preset CSS, and writes one HTML artifact. Source: `scripts/ve-mdx/export.mjs:15-27`, `scripts/ve-mdx/export.mjs:43-60`, and `scripts/ve-mdx/export.mjs:73-140`.
4. The developer preview creates a session, serializes mutations, validates preview POSTs, patches source when a publisher is available, rebuilds, and rolls back selected files after a failed rebuild. Source: `plugins/visual-explainer/scripts/preview.mjs:207-238` and `plugins/visual-explainer/scripts/preview.mjs:291-365`.
5. The verification engine builds context, optionally runs browser checks and screenshot capture, executes the mechanics catalog, and builds a report. The browser stage renders the required matrix and records screenshots plus rendered inventory. Source: `plugins/visual-explainer/scripts/verify/lib/engine.mjs:12-35` and `plugins/visual-explainer/scripts/verify/lib/browser.mjs:13-45`.
6. The mechanics report includes the profile, check summary, screenshots, required review passes, dispatch plan, and a review contract bound to the artifact, truth brief, rendered inventory, and evidence hashes. Source: `plugins/visual-explainer/scripts/verify/lib/report.mjs:7-46` and `plugins/visual-explainer/scripts/verify/lib/report.mjs:87-125`.
7. Visual-review dispatch resolves a generated model policy when present and otherwise returns a disclosed `unqualified-fallback`. Source: `plugins/visual-explainer/scripts/verify/lib/model-policy.mjs:21-91`.
8. The finalizer validates the contract and current artifact/evidence identities, then returns `failed`, `incomplete`, or `verified`. Source: `plugins/visual-explainer/scripts/verify/ve-finalize.mjs:9-35` and `plugins/visual-explainer/scripts/verify/ve-finalize.mjs:39-104`.

## Diagram contract

`pattern=none; type=architecture; format=html; size=fit; detail=faithful; audience=engineer; renderer=inline-svg; motion=step`

The faithful redraw exception is deliberate: nineteen code-owned subsystems and twenty-two labeled paths are zoned into four indexed stages so the authoring, build, feedback, and evidence loops can be traced without inventing deployment boundaries. The supplied reference image controls the atlas composition, parchment palette, density, and inspector layout; it does not supply system facts. Secondary PDF, per-slide image, hosting, and video outputs remain outside the primary control loop.

## Fidelity ledger

- Split the prior nine conceptual buildings into nineteen code-owned subsystems where the cited files expose distinct control responsibilities.
- Added the browser matrix, route-card layer, mutation queue, rollback store, session ledger, bundle staging, and report/policy boundary; each is grounded in a cited repository file.
- Kept the generated HTML artifact as the dominant payload and the finalization gate as the terminal control point.
- Omitted secondary output adapters because they branch after HTML and do not change the authoring, preview, or verification contract.
