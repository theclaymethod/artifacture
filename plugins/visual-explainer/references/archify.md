# Archify system maps

Use [Archify](https://github.com/tt-a1i/archify) for complex architecture, workflow, sequence, dataflow, or lifecycle visuals that need typed structure, explicit routing, and validated standalone output. Keep compact supported diagrams in `DiagramCanvas`; use [charts.md](charts.md) for quantitative data.

Archify source is typed JSON. Retain that JSON beside the generated HTML; do not wrap the diagram in MDX merely to satisfy another renderer's source convention.

## Author and deliver

1. Inspect the source system and choose one supported type: `architecture`, `workflow`, `sequence`, `dataflow`, or `lifecycle`. Record the primary question, boundaries, and evidence for nodes and relationships.
2. Run `npm run ve:archify -- setup` when the runtime is absent. It installs the pinned stable Archify `v2.16.0` revision `c826e6c3a7abad19c0f3cd1ca57207d54b1ad8de`. `npm run ve:archify -- path` prints its runtime root. Read that installation's schema and example for the chosen type. The Artifacture wrapper resolves the installation; run `npm run ve:archify -- doctor` to check availability and `npm run ve:archify -- guide "<brief>" --json` when choosing a type.
3. Author `<slug>.<type>.json`. Keep node names specific, supporting details concise, and optional stories, roles, status, or source references grounded in inspected evidence. Set `meta.visual_preset` to `"editorial"` for the restrained default. Omit animation for a static default.
4. Validate and deliver through the wrapper:

```bash
npm run ve:archify -- validate <type> <source.json> --quality showcase --json
npm run ve:archify -- deliver <type> <source.json> <output.html> --quality showcase --json
```

5. Read each failure's diagnostic code, subject, evidence, and `supportedFixes`. Repair the named source field and rerun; do not patch generated HTML or disable checks to obtain a pass.
6. Open the delivered file and inspect its initial view, labels, routes, mobile behavior, keyboard controls, and supported themes. Preserve at least 14px figure labels at the displayed scale. Split detail into supported views when the overview becomes crowded.

Archify validation establishes its rendering contract; visual review still matters. Complete Artifacture's [verification.md](verification.md) where supported and disclose any unsupported profile or incomplete gate. Return editable JSON, standalone HTML, validation receipt, and visual-review evidence. Do not claim that authored reach, routes, or comparisons establish live runtime impact, risk, or merge safety.

## Visual direction

Carry the default paper-gray/charcoal language through supported Archify preset/theme controls when possible. Keep upstream control chrome that performs a real action. Do not add outer dashboards, decorative status, metric tiles, fake legends, or tiny uppercase framing around the map. Use source evidence only when it is requested or needed for interpretation.

If Archify is unavailable, report the missing dependency and use a supported `DiagramCanvas`, Mermaid, or custom SVG route only when it preserves the requested meaning. Follow [diagram-design.md](diagram-design.md) for that choice.
