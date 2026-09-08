# Artifacture

Artifacture gives coding agents a way to make charts, diagrams, and presentations from editable source. Engineers use the outputs to explain code, review changes, inspect data, and present system designs.

## What gets made

An agent writes chart JSON, MDX, or TSX. Artifacture exports standalone HTML for a browser. The source stays editable; revisions happen there and are exported again. Archify uses its own typed JSON for architecture and workflow diagrams. Video compositions use the static exporter and Hyperframes.

## The default

Lieflat puts the data on the page. Countable marks show quantities, dated marks show activity, matrices show intersections, and individual paths show outcomes. Several views can use the same records so the reader can move between a total and the observations behind it.

Algebrica provides serif reading text and mathematical figures. Mono Color uses limited inks and asymmetric composition. Each theme has its own typography and layout; a new palette alone does not make a theme.

## What must hold

- Values, labels, units, sources, and uncertainty survive export.
- Charts and diagrams remain readable at their intended desktop and mobile sizes.
- Keyboard navigation, browser zoom, and reduced motion keep working.
- Color never carries a distinction by itself.
- Rendered screenshots and interactions are reviewed before delivery. Export success alone proves none of these conditions.

Remove labels, badges, captions, and containers that add no information or control. Keep the necessary state, provenance, navigation, and sequence.

## Skill structure

Keep the initial read to the entry skill and one task card, targeting at most about 3,000 tokens for covered tasks. Components and exporters supply the repeated HTML, CSS, and JavaScript. Task details belong in cards; specialized guidance belongs in references. User design systems stay outside the repository.
