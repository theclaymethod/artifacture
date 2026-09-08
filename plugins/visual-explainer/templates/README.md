# Templates

Use the MDX pipeline for new pages, chart JSON for standalone charts, and these starters for custom HTML. They show layout and export mechanics; replace the subject, copy, and illustrative data together. Lieflat is the default: Inter, paper gray, charcoal, and readable data marks.

| Starter | Use |
| --- | --- |
| [architecture.html](architecture.html) | Small ordered architecture with a stacked mobile layout |
| [svg-diagram-starter.html](svg-diagram-starter.html) | Explicit SVG geometry, readable labels, and accessible descriptions |
| [mermaid-flowchart.html](mermaid-flowchart.html) | ELK layout with pan, zoom, and a readable initial scale |
| [data-table.html](data-table.html) | Requirement comparisons with a locally scrolling table |
| [slide-deck.html](slide-deck.html) | Paper-and-charcoal slides with keyboard navigation |
| [algebrica.html](algebrica.html) | Warm mathematical reading layout, serif headings, and precise SVG |
| [mono-color.html](mono-color.html) | Image-led two-ink editorial composition with editable type |
| [mono-industrial.html](mono-industrial.html) | Optional restrained technical report |
| [mono-industrial-slides.html](mono-industrial-slides.html) | Optional technical slides |
| [mono-industrial-magazine.html](mono-industrial-magazine.html) | Optional horizontally paged technical story |
| [nothing-magazine.html](nothing-magazine.html) | Optional cool monochrome magazine |
| [mono-industrial-poster.tsx](mono-industrial-poster.tsx) | Fixed 1600 × 1000 poster source |
| [hyperframes-longform.html](hyperframes-longform.html) | 1920 × 1080, 60-second narrated explainer |
| [hyperframes-reel-landscape.html](hyperframes-reel-landscape.html) | 1920 × 1080, 32-second video |
| [hyperframes-reel.html](hyperframes-reel.html) | 1080 × 1920, 32-second video |

`algebrica.html` replaces the retired `nothing.html` dashboard. Named styles are opt-ins; they do not redefine the default.

Keep `mono-color.html` beside its `assets/` folder while editing. For single-file delivery, replace its image element with the snippet emitted by `bash plugins/visual-explainer/scripts/embed-media.sh plugins/visual-explainer/templates/assets/repair-mouse.webp "Opened mouse with a removable shell and exposed components"`. Its original repair illustration is included; replace the subject and copy together.

Preserve units, measurement windows, accessible diagram names, theme controls, and export identifiers. Remove any section the subject does not need. Diagrams keep their text readable and scroll locally when necessary.

Lieflat and Algebrica informed the visual direction; these templates contain original layouts, prose, and geometry. No upstream templates or restricted example assets are bundled. For generated architecture visuals, use the Archify adapter described in the diagram guidance.
