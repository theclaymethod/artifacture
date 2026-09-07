# Custom output and HTML fallback

Use this reference for posters, video, a named aesthetic, or a concrete limitation in the shared MDX/React path. Ordinary diagrams, plans, comparisons, decks, code walkthroughs, and recaps follow their card in `../SKILL.md`.

## Route

| Need | Read |
|---|---|
| Poster / fixed PNG canvas | [poster.md](poster.md) |
| Video composition | [hyperframes.md](hyperframes.md); [reel-patterns.md](reel-patterns.md) for reels |
| Existing deck to video | [render-video.md](../commands/render-video.md) |
| Custom deck mechanics or PDF | [slide-patterns.md](slide-patterns.md) |
| Fixed-stage deck with drill-downs | [deck-navigation-shell.md](deck-navigation-shell.md) |
| Default visual language and charts | [charts.md](charts.md) |
| Requested Algebrica | [algebrica.md](algebrica.md) |
| Requested Mono Color | [mono-color.md](mono-color.md) |
| Requested Mono-Industrial | [mono-industrial.md](mono-industrial.md) |
| Requested Nothing | [nothing.md](nothing.md) |
| Specialized diagram | [diagram-design.md](diagram-design.md) |
| Custom SVG geometry | [diagrams-svg.md](diagrams-svg.md) |
| Wrapped SVG text | [pretext-layout.md](pretext-layout.md) |
| Raw CSS layout or containment | Relevant section of [css-patterns.md](css-patterns.md) |
| Mermaid, charts, syntax highlighting | Relevant section of [libraries.md](libraries.md) |
| Long-page navigation | [responsive-nav.md](responsive-nav.md) |
| Raw HTML responsive shell | [responsive-contract.md](responsive-contract.md) |
| Independent HTML fragments | [section-contract.md](section-contract.md) |
| Images or demo capture | [media.md](media.md), [demo-capture.md](demo-capture.md) |

Load the selected branch, not the whole reference library. Templates illustrate supported mechanics and composition; their sample facts are not source evidence.

## Source and export

Keep MDX/TSX as the editable source whenever possible. Resolve `REPO` using `../SKILL.md` and import `REPO/visual-explainer-mdx/components.tsx`.

```bash
npm --prefix REPO run ve:export -- <source.mdx|source.tsx> --out <artifact.html>
npm --prefix REPO run ve:export-static -- <composition.tsx> --out <index.html>
```

Use static export for Hyperframes compositions. Edit the source and re-export after feedback. When a concrete runtime limitation requires authored HTML, report that fallback and retain the editable HTML source.

Presets are `lieflat` (default), `algebrica`, `mono-color`, `oa-design`, `mono-industrial`, `nothing`, `blueprint`, `editorial`, `paper-ink`, `terminal`, and `custom`. Shared tokens live in `REPO/visual-explainer-mdx/global.css`. Named alternatives change typography and palette; they do not justify decorative metadata or unreadable labels.

## Composition

Use prose to explain reasons, tables to compare facts, and diagrams to show relationships. Let the content determine the number of sections and their visual weight. Use whitespace, alignment, type size, and rules for hierarchy. Reserve bounded surfaces for diagrams, code, tables, and interactive regions.

Remove anything whose absence changes neither meaning nor operation: document-type kickers, decorative numbering, duplicate captions, fake state, corner labels, metric tiles, and repeated cards. Include provenance, status, sequence, or ownership only when supplied by evidence and useful to the reader.

Static output is the default. Motion must explain change or respond to an action, preserve reduced-motion behavior, and finish with complete meaning. Do not add imagery or animation simply to fill space.

## Completion

Follow [verification.md](verification.md) for mechanics, artifact review, and finalization. Inspect exported output at its actual reading size, including mobile and every supported theme. Fix clipped text, unreadable diagrams, broken controls, and misleading visual claims in source. Return source, artifact, final report, and any incomplete checks.
