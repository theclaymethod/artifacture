# Supplemental artifact and diagram checks

Use this reference only for mechanical and diagram-specific checks that are not
already covered by `verification.md`. Impeccable owns general visual craft;
Unslop owns prose quality. A polished but incomplete, broken, or inaccessible
artifact does not pass.

## Rendered checks

- **Information completeness:** represent every requested decision, section, comparison, and important detail.
- **Responsive containment:** no body-level horizontal scrolling. Wide tables, diagrams, code, and trees scroll only inside deliberate wrappers.
- **Text integrity:** no clipped headings, inappropriate ellipses, overlapping labels, or unreadable code.
- **Interaction ownership:** buttons, links, inputs, dialogs, and declared interactive regions retain their keyboard and pointer behavior.
- **Themes:** every supported light/dark state looks intentional.
- **Runtime health:** no console errors, parse errors, failed assets, or layout shifts.
- **Artifact hygiene:** no `TODO`, `{{skill_dir}}`, fake module names, or template placeholders remain unless they are genuine content.
- **Source safety:** source excerpts are HTML-escaped; generated markup has no inline event handlers, `javascript:` URLs, `srcdoc`, or source-controlled `<script>`/`<style>` content.

## Diagram checks

- **Accessible name:** every semantic inline SVG has `role="img"`; its `aria-labelledby` IDs resolve to a first-child `<title>` followed by `<desc>`.
- **Unique IDs:** title, description, marker, mask, pattern, filter, and clip-path IDs are diagram-prefixed and unique across the page.
- **Meaning beyond color:** state, access, priority, and path status also use text, icons, shape, or line style.
- **Connector geometry:** connectors leave and enter node edges, keep an air gap before arrowheads, use orthogonal or shallow curves, and do not cross labels or unrelated nodes.
- **Static completeness:** no-JavaScript, print, export, and reduced-motion views show the complete diagram; motion overlays do not duplicate semantic text.
- **Import fidelity:** every merge, collapse, omission, split, and unresolved parse issue appears in the fidelity ledger.

## Mermaid checks

- Mermaid source renders rather than appearing as text.
- Every diagram uses the full zoom, pan, reset, and expand shell.
- Labels remain readable at the initial zoom.
- Page-level CSS does not define `.node` or leak into Mermaid internals.
- Complex diagrams use top-down layout unless a short linear flow clearly benefits from left-to-right layout.

## Motion

Diagram motion must clarify sequence, state, or interaction and follow
[`diagram-design.md`](./diagram-design.md). Respect `prefers-reduced-motion`;
fragments remain complete and script-free without animation.
