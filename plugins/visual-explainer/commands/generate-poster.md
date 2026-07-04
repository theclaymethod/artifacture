---
description: Generate a single-canvas rich-composition poster (HTML + PNG) via poster-ai
---
Load the visual-explainer skill, then generate a fixed-canvas poster for: $@

**Authoring contract.** Prefer React source. For posters that should use shared visual-explainer components or point-and-click annotation review, write a `.tsx` source that imports from `visual-explainer-mdx/components.tsx`, then export generated standalone HTML with:

```bash
npm run ve:export -- <poster.tsx> --out ~/.agent/diagrams/<name>.poster.html
```

Capture the verified generated page as the PNG artifact with browser screenshot tooling. If the poster specifically needs `poster-ai`'s fixed-canvas rasterizer, keep the editable source as TSX and run the `poster build` / `poster export` commands below. Do not fall back to hand-written HTML; if both generated React HTML and poster-ai are blocked, stop and report the blocker.

**Clarify.** This is a Tier 0 (high-cost) command per `./references/clarify.md`. Always ask via `AskUserQuestion` before generating, at minimum: canvas size (1600×1000 landscape / 1200×1500 portrait / 1200×628 social / 1080×1080 square), focal element (stat / headline / diagram / photo), and aesthetic. Bypass only on explicit `--no-ask`.

**Read `./references/poster.md` and `./templates/mono-industrial-poster.tsx` before generating.** Poster output uses `poster-ai` (CLI binary: `poster`) to turn a single TSX file into a self-contained HTML poster and a rasterized PNG. It is **not** a replacement for the primary scrollable HTML flow — it is the right output when the content is intrinsically a fixed-canvas graphic: a shareable summary, a dashboard, an infographic, or a poster for print/social.

**Before generating:**

1. Check availability: `which poster` only if using the poster-ai path. If missing, use the generated React HTML + browser screenshot path above.
2. Pick a canvas size based on intent:
   - Architecture / landscape poster: `w-[1600px] h-[1000px]`
   - Portrait editorial: `w-[1200px] h-[1500px]`
   - Social card (Twitter/LinkedIn): `w-[1200px] h-[628px]`
   - Square (Slack, Instagram): `w-[1080px] h-[1080px]`
3. Commit to the Mono-Industrial aesthetic by default (Swiss, monochrome, hierarchy-first, Space Grotesk + Space Mono + optional Geist Pixel Square hero). Follow `./references/mono-industrial.md` for tokens and the pre-render gate. Use a named alternative only if the user requests one.

**Authoring:**

- The root of the component MUST be a single element (not a Fragment). Poster measures one element for the canvas.
- Load Google Fonts via a `<link>` inside the root element. Geist Pixel Square is **not** on Google Fonts — load it via an inline `<style>` `@font-face` block from jsDelivr. See `templates/mono-industrial-poster.tsx` for the pattern.
- Avoid Mermaid — poster's rasterizer doesn't wait long enough for Mermaid's async render. Use custom SVG, Recharts, or a pre-rendered Mermaid SVG as an `<img>`.
- Exactly one moment of surprise per poster (Geist Pixel display number, oversized word, broken-grid element).

**Workflow:**

1. Draft the TSX at `~/.agent/diagrams/<name>.poster.tsx` following the Mono-Industrial pattern.
2. Run `/unslop` on all prose copy (headlines, descriptions, body) before writing into the TSX. See SKILL.md § 4.
3. Build: `poster build ~/.agent/diagrams/<name>.poster.tsx -o ~/.agent/diagrams/<name>.poster.html`
4. Export PNG: `poster export ~/.agent/diagrams/<name>.poster.tsx -o ~/.agent/diagrams/<name>.poster.png`
5. **Verify in the browser** (see SKILL.md § 6): open the HTML, confirm canvas renders correctly, hierarchy legible, status colors only on values.
6. **Canvas-fit loop (mandatory — see `./references/poster.md` → "Canvas-fit verification loop").** Load the exported PNG and inspect it. Posters clip silently at the canvas edge, and the live HTML lies about this — only the PNG shows the real cropped result. If text is clipped, elements are cut by the boundary, empty space suggests a collapsed grid, the hierarchy no longer reads, or the moment of surprise got shrunk to fit, **rework the TSX and re-export**. Bounded at 3 attempts; if still broken, stop and report.
7. Tell the user both file paths (HTML for live viewing with the export toolbar, PNG for sharing).

Use `.poster.` as an infix in the filename (`payments-q1.poster.html`, `payments-q1.poster.png`) to distinguish from the scrollable HTML output.
