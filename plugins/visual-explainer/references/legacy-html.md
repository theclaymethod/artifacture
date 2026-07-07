---
name: visual-explainer
description: Generate beautiful, self-contained HTML artifacts from MDX/React sources that visually explain systems, code changes, plans, and data. Use when the user asks for a diagram, architecture overview, diff review, plan review, project recap, comparison table, or any visual explanation of technical concepts. Also use proactively when you are about to render a complex ASCII table (4+ rows or 3+ columns) — present it as a styled generated HTML page instead.
license: MIT
compatibility: Requires a browser to view generated HTML files. Optional surf-cli for AI image generation.
metadata:
  author: nicobailon
  version: "0.6.3"
---

# Legacy HTML Reference

Status: Tier 2 fallback. Use this file only when the MDX/React pipeline is unavailable, a Tier 1 card says none of its component paths fit, or custom work needs the former hand-authored HTML procedures, diagram prose, Mermaid shell details, aesthetics, poster, slide, or video guidance. Tier 0 and cards are the normal path.

# Visual Explainer

Generate editable MDX/React sources for technical diagrams, visualizations, and data tables, then export self-contained HTML artifacts. Always open the generated result in the browser. Never fall back to ASCII art when this skill is loaded.

**Proactive table rendering.** When you're about to present tabular data as an ASCII box-drawing table in the terminal (comparisons, audits, feature matrices, status reports, any structured rows/columns), generate an HTML page instead. The threshold: if the table has 4+ rows or 3+ columns, it belongs in the browser. Don't wait for the user to ask — render it as HTML automatically and tell them the file path. You can still include a brief text summary in the chat, but the table itself should be the HTML page.

## MDX/React Authoring Pipeline

Use this source-first path by default:

1. Author the editable explainer as `.mdx`.
2. Escalate to `.tsx` when the artifact needs local React state, custom interaction, generated SVG logic, or a Hyperframes-compatible video composition.
3. Import shared primitives from `REPO/visual-explainer-mdx/components.tsx`. Resolution of `REPO` is defined in SKILL.md "Pipeline location".
4. Export the generated artifact:

```bash
npm run ve:export -- <source.mdx|source.tsx> --out ~/.agent/diagrams/<slug>.html
```

For static video compositions, use:

```bash
npm run ve:export-static -- <composition.tsx> --out ~/.agent/videos/<slug>/index.html
```

The generated HTML is the artifact, not the source of truth. Apply edits and point-and-click annotation feedback to the MDX/TSX source, then re-export. Legacy HTML templates remain reference material for visual patterns while command surfaces migrate.

### Design System Presets

Shared React surfaces accept a `preset` prop that maps to semantic CSS tokens for palette, typography, layout rhythm, borders, diagrams, slides, posters, and review tools:

```tsx
<ExplainerShell preset="mono-industrial" title="..." />
<SlideDeck preset="nothing" orientation="horizontal" title="..." />
<PosterCanvas preset="blueprint" title="..." />
```

Available presets:

- `mono-industrial` — default Swiss/monochrome, type-led hierarchy.
- `nothing` — black instrument-panel styling with red accent.
- `blueprint` — technical drawing palette and precise blue rules.
- `editorial` — warm serif editorial treatment.
- `paper-ink` — light paper surface with ink and terracotta accents.
- `terminal` — dense monospace green-on-black.

Preset tokens live in `REPO/visual-explainer-mdx/global.css`; component wiring lives in `REPO/visual-explainer-mdx/components.tsx`. Use preset tokens before custom Tailwind overrides so generated artifacts stay consistent across commands.

### Calling From Coding Agents

- **Codex Desktop:** invoke the skill by name (`$visual-explainer`) or use the installed prompt/command wrapper, then ask for the desired artifact. The agent should create MDX/TSX source in the workspace or `~/.agent/diagrams/`, run `npm run ve:export`, and browser-verify the generated HTML.
- **Claude Code:** invoke the namespaced command when installed (for example `/visual-explainer:generate-web-diagram`) or ask Claude to use the visual-explainer skill. The same MDX/React source contract applies.
- **Direct CLI path:** run `npm run ve:export -- path/to/source.mdx --out path/to/output.html` for client-hydrated explainers, or `npm run ve:export-static -- path/to/composition.tsx --out path/to/index.html` for static Hyperframes compositions.

## Available Commands

Detailed prompt templates in `../commands/`. In Pi, these are slash commands (`/diff-review`). In Claude Code, namespaced (`/visual-explainer:diff-review`). In Codex, use `/prompts:diff-review` (if installed to `~/.codex/prompts/`) or invoke `$visual-explainer` and describe the workflow.

| Command | What it does |
|---------|-------------|
| `generate-web-diagram` | Generate an HTML diagram for any topic |
| `generate-visual-plan` | Generate a visual implementation plan for a feature |
| `generate-slides` | Generate a magazine-quality slide deck (vertical or `--magazine` horizontal) |
| `generate-poster` | Generate a single-canvas rich-composition poster (HTML + PNG) via poster-ai — see `./poster.md` |
| `generate-video` | Generate an explainer video (MP4) via Hyperframes; `--style=long-form\|reel` |
| `render-video` | Convert an existing HTML deck to an MP4 via Hyperframes |
| `diff-review` | Visual diff review with architecture comparison and code review |
| `plan-review` | Compare a plan against the codebase with risk assessment |
| `project-recap` | Mental model snapshot for context-switching back to a project |
| `fact-check` | Verify accuracy of a document against actual code |
| `share` | Deploy an HTML page to Vercel and get a live URL |

## Workflow

### 0. Clarify before generating (when the content is ambiguous)

**Before starting any generation, check whether the user's request supports a confident 1-sentence brief.** The brief must cover: **topic**, **audience**, **depth**, and **aesthetic**. If any of these is genuinely unclear, ask 1–3 questions via `AskUserQuestion` before reading references or writing HTML. A cheap question prevents an expensive misfire.

**Tiered policy** (see `./clarify.md` for the full specification):

- **Tier 0 — always ask** (high-cost commands): `/generate-video`, `/render-video`, `/generate-slides --magazine`, `/generate-poster`. Ask at least style + duration + narration (video) or aesthetic + page-count (magazine) or canvas-size + focal (poster), regardless of how clear the request otherwise is. Bypass only on explicit `--no-ask`.
- **Tier 1 — ask when ambiguous** (most commands): `/generate-web-diagram`, `/generate-visual-plan`, `/generate-slides` (vertical), `/diff-review`, `/plan-review`, `/project-recap`. Ask only if the four-dimension brief is incomplete. Clear requests flow through unchanged.
- **Tier 2 — never ask** (mechanical commands): `/fact-check`, `/share`. These operate on an existing target and have no creative choices.

**Escape hatches.** The user can always skip questions via:
- `--no-ask` flag
- Phrases: "just generate", "don't ask", "go ahead", "use defaults"
- A prompt that explicitly answers all four dimensions
- A pre-made outline or structured brief

**What NOT to ask.** Never ask implementation questions (Mermaid vs SVG, which template to use), aesthetic when the default is fine, or meta-confirmation ("ready to generate?"). Skills decide those.

See `./clarify.md` for question phrasing guidelines, dialog templates for each Tier 0 command, and worked examples.

### 1. Think (5 seconds, not 5 minutes)

Before writing HTML, commit to a direction. Don't default to "dark theme with blue accents" every time.

**Visual is always default.** Even essays, blog posts, and articles get visual treatment — extract structure into cards, diagrams, grids, tables.

Prose patterns (lead paragraphs, pull quotes, callout boxes) are **accent elements** within visual pages, not a separate mode. Use them to highlight key points or provide breathing room, but the page structure remains visual.

For prose accents, see "Prose Page Elements" in `./css-patterns.md`. For everything else, use the standard freeform approach with aesthetic directions below.

**Who is looking?** A developer understanding a system? A PM seeing the big picture? A team reviewing a proposal? This shapes information density and visual complexity.

**What type of content?** Architecture, flowchart, sequence, data flow, schema/ER, state machine, mind map, class diagram, C4 architecture, data table, timeline, dashboard, or prose-first page. Each has distinct layout needs and rendering approaches (see Diagram Types below).

**What aesthetic?** **Default to Mono-Industrial** unless the user names a different one. The other aesthetics listed below remain available, but they are opt-in — they do not rotate in by default.

**Default aesthetic — Mono-Industrial (Swiss, monochrome, typography-first).** Inspired by Nothing, Braun, Teenage Engineering. Hierarchy is built from type scale, weight, and spacing — never from color. Grayscale canvas with status colors only (success / warning / error) on values themselves. Three-layer rule: display, primary, tertiary. Font budget: Space Grotesk + Space Mono + optional Geist Pixel Square for exactly one hero element per page. Zero on-load motion. One "moment of surprise" per page (an oversized number, a vast gap, a pixel-display word, a broken grid). **Before generating, read `./mono-industrial.md`.** For architecture output, base on `../templates/mono-industrial.html`. For slide decks, base on `../templates/mono-industrial-slides.html`.

**Named alternatives (use only when the user explicitly requests one).** The aesthetics below exist for users who ask for Nothing, Blueprint, Editorial, Paper/ink, Monochrome terminal, or an IDE-inspired palette by name. Do not rotate through them on your own initiative, and do not select them as a "change of pace" for variety.

**Brand aesthetics:**
- **Nothing** — instrument-panel aesthetic adapted from [dominikmartn/nothing-design-skill](https://github.com/dominikmartn/nothing-design-skill). OLED-black canvas (`#000`) in dark mode, warm off-white (`#F5F5F5`) in light. Three fonts total: Doto (hero dot-matrix, one per page), Space Grotesk (body), Space Mono (every label, ALL CAPS with 0.08em tracking). Signature motifs: segmented progress bars with square ends + 2px gaps, radial-gradient dot-grid backgrounds, bracket-notation UI states (`[ LOADING… ]`, `[ NO DATA ]`, `[ SAVED ]`), and accent red (`#D71921`) used at most once per page and only for urgent / destructive. Flat chrome — borders only, no shadows, no gradients, no blur. Break the grid in exactly one place per page. **Before generating, read `./nothing.md`.** Base on `../templates/nothing.html` (scrollable) or `../templates/nothing-magazine.html` (horizontal zine). Trigger: user says "nothing", "Nothing design", "Nothing OS", "Ndot", "dot-matrix", or "instrument panel". Always verify BOTH modes before delivery.

**Constrained aesthetics (prefer these):**
- Blueprint (technical drawing feel, subtle grid background, deep slate/blue palette, monospace labels, precise borders)
- Editorial (serif headlines like Newsreader or Crimson Pro, generous whitespace, muted earth tones or deep navy + gold)
- Paper/ink (warm cream `#faf7f5` background, terracotta/sage accents, informal feel)
- Monochrome terminal (green/amber on near-black, monospace everything, CRT glow optional)

**Flexible aesthetics (use with caution):**
- IDE-inspired (borrow a real, named color scheme: Dracula, Nord, Catppuccin Mocha/Latte, Solarized Dark/Light, Gruvbox, One Dark, Rosé Pine) — commit to the actual palette, don't approximate
- Data-dense (small type, tight spacing, maximum information, muted colors)

**Explicitly forbidden:**
- Neon dashboard (cyan + magenta + purple on dark) — always produces AI slop
- Gradient mesh (pink/purple/cyan blobs) — too generic
- Any combination of Inter font + violet/indigo accents + gradient text

**Do not rotate aesthetics on your own.** Mono-Industrial is the default for every fresh generation. Switch only when the user requests a named alternative ("do it in Editorial style", "use the Dracula palette", "make it paper/ink"). The previous guidance to "vary the choice each time" is obsolete — variety is not a goal, consistent identity is. The swap test still applies within whichever aesthetic you pick: if you replaced the fonts and colors with a generic default and nobody would notice, you haven't designed anything.

### 2. Structure

**Read the reference material** before generating. Don't memorize it — read it each time to absorb the patterns.

**For Mono-Industrial output (the default), always read `./mono-industrial.md` first.** Then, depending on output type:
- Scrollable architecture / plan / diff / recap / table / mixed: `../templates/mono-industrial.html`
- Slide deck (`--slides` or `/generate-slides`): `../templates/mono-industrial-slides.html` (still consult `./slide-patterns.md` for engine-level patterns like scroll-snap, nav chrome, and slide-type roles)

**For named alternative aesthetics** (only when the user explicitly asks for one), use these legacy reference templates instead:
- Text-heavy architecture overviews: `../templates/architecture.html`
- Flowcharts, sequence, ER, state, mind map, class, C4: `../templates/mermaid-flowchart.html`
- Data tables, comparisons, audits: `../templates/data-table.html`
- Slide decks: `../templates/slide-deck.html` + `./slide-patterns.md`
- Prose-heavy pages: "Prose Page Elements" in `./css-patterns.md` + "Typography by Content Voice" in `./libraries.md`

**For CSS/layout patterns and SVG connectors**, read `./css-patterns.md`.

**For diagram generation specifically** — the 13 supported diagram types (architecture, flowchart, sequence, state, ER, timeline, swimlane, quadrant, nested, tree, layer stack, Venn, pyramid/funnel) — **default to inline SVG**, not Mermaid. Read `./diagrams-svg.md` for the type-selection gate, shape semantics (ovals = start/end, rects = steps, diamonds = decisions, dots = merges), complexity budgets (max 9 nodes, 12 arrows, 2 accent elements), removal test, annotation primitive, sketchy filter, and anti-patterns list. Read `./diagram-tokens.md` for the per-aesthetic token mapping so the same diagram rules produce aesthetic-appropriate output across Mono-Industrial, Nothing, Editorial-Diagram, Blueprint, Paper/ink, Terminal, and IDE-inspired palettes. Start from `../templates/svg-diagram-starter.html` — it ships the `<defs>` block (dot pattern, arrow markers, sketchy filter), the 4px grid, masked arrow labels, and a bottom legend strip. Mermaid remains available as a fallback — see the table below.

**SVG layout math goes through pretext, not hand-guessed geometry.** Whenever a diagram needs to size a box around wrapped text — node rectangles, sequence-note boxes, callouts with dashed leaders, legend items, masked arrow labels — route the label through [`chenglou/pretext`](https://github.com/chenglou/pretext) to measure and wrap it, then derive `boxWidth`, `boxHeight`, and edge-anchor Y values from the returned metrics. Don't eyeball line counts or pad a guessed height "to be safe" — that leaks into brittle line breaks, mis-sized label masks, and drifted arrow anchors. Read `./pretext-layout.md` for the helper shape (`{ lines, lineCount, maxLineWidth, contentWidth, boxWidth, boxHeight, anchors }`) and the opt-out list: don't use pretext for Mermaid internals, graph routing/packing, or one-line labels in fixed-size boxes where the current rules are already stable. ELK / dagre / manual placement still own graph layout; pretext owns text measurement.

**For pages with 4+ sections** (reviews, recaps, dashboards), also read `./responsive-nav.md` for section navigation with sticky sidebar TOC on desktop and horizontal scrollable bar on mobile.

**For every scrollable page** (explainers, magazines, longform — everything except fixed-canvas slides and posters), read `./responsive-contract.md` and apply the Layer 1 CSS at the top of the `<style>` block. The contract is a single hard rule: the document body never scrolls horizontally; wide content (tables, Mermaid diagrams, inline SVGs, pipelines, directory trees) scrolls inside its own `.scroll-x` wrapper. Skipping this is the #1 cause of broken mobile layouts from this skill.

**Choosing a rendering approach:**

| Content type | Approach | Why |
|---|---|---|
| Architecture (text-heavy) | CSS Grid cards + flow arrows | Rich card content (descriptions, code, tool lists) needs CSS control |
| Architecture (topology, ≤ 14 nodes) | **Inline SVG** (see `./diagrams-svg.md`) | Editorial control, shape semantics, 4px grid, focal accent rule |
| Architecture (topology, 15+ nodes) | **Mermaid** (hybrid: Mermaid overview + CSS Grid cards) | Auto-routing beats hand-authored coordinates above the complexity budget |
| Flowchart / pipeline (≤ 9 nodes) | **Inline SVG** | Shape carries meaning (oval/rect/diamond/dot) — requires hand authoring |
| Flowchart / pipeline (10+ nodes) | **Mermaid** | Auto layout needed past the budget |
| Sequence diagram (≤ 5 lifelines) | **Inline SVG** | Activation bars, self-message U-loops, dashed return arrows are editorial decisions |
| Sequence diagram (6+ lifelines) | **Mermaid** `sequenceDiagram` | Auto layout needed past the budget |
| Data flow | **Mermaid** with edge labels | Auto edge routing beats hand-drawn lines for data pipelines |
| ER / schema diagram (≤ 8 entities) | **Inline SVG** | Cardinality labels, PK/FK glyphs, aggregate-root focal rule |
| ER / schema diagram (9+ entities) | **Mermaid** `erDiagram` | Relationship routing auto-resolves |
| State machine (≤ 9 states) | **Inline SVG** | Self-loops, start/end glyphs, `event [guard] / action` labels |
| State machine (10+ states) | **Mermaid** `stateDiagram-v2` / `flowchart TD` | See `stateDiagram-v2` label caveat below |
| Timeline | **Inline SVG** with honest intervals | Unequal intervals must get unequal spacing — Mermaid can't do this |
| Swimlane | **Inline SVG** | Lane dividers, handoff arrows, eyebrow lane labels |
| Quadrant | **Inline SVG** | Axis-end labels, focal "do first" accent |
| Nested containment | **Inline SVG** | Concentric rounded rects with escalating stroke opacity |
| Tree (≤ depth 4) | **Inline SVG** | Orthogonal elbow connectors, never diagonal |
| Layer stack | **Inline SVG** | 4–6 horizontal bands with mono index + sans name + context note |
| Venn (2–3 circles) | **Inline SVG** | Proportional circle sizes, set-specific hairline strokes |
| Pyramid / funnel | **Inline SVG** | Honest proportional widths — Mermaid can't enforce this |
| Mind map | **Mermaid** `mindmap` | Radial layout is ergonomic in Mermaid and doesn't benefit from SVG control |
| Class diagram | **Mermaid** `classDiagram` | Inheritance/composition routing is Mermaid's strength |
| C4 architecture | **Mermaid** `graph TD` + `subgraph` | Use flowchart-as-C4 (native `C4Context` ignores themes) |
| Data table | HTML `<table>` | Semantic markup, accessibility, copy-paste behavior |
| Dashboard | CSS Grid + Chart.js | Card grid with embedded charts |

**Mermaid theming:** Always use `theme: 'base'` with custom `themeVariables` so colors match your page palette. Use `layout: 'elk'` for complex graphs (requires the `@mermaid-js/layout-elk` package — see `./libraries.md` for the CDN import). Override Mermaid's SVG classes with CSS for pixel-perfect control. See `./libraries.md` for full theming guide.

**Mermaid containers:** Always center Mermaid diagrams with `display: flex; justify-content: center;`. Add zoom controls (+/−/reset/expand) to every `.mermaid-wrap` container. Include the click-to-expand JavaScript so clicking the diagram (or the ⛶ button) opens it full-size in a new tab.

**⚠️ Never use bare `<pre class="mermaid">`.** It renders but has no zoom/pan controls — diagrams become tiny and unusable. Always use the full `diagram-shell` pattern from `templates/mermaid-flowchart.html`: the HTML structure (`.diagram-shell` > `.mermaid-wrap` > `.zoom-controls` + `.mermaid-viewport` > `.mermaid-canvas`), the CSS, and the ~200-line JS module for zoom/pan/fit. Copy it wholesale.

**Mermaid scaling:** Diagrams with 10+ nodes render too small by default. For 10-12 nodes, increase `fontSize` in themeVariables to 18-20px and set `INITIAL_ZOOM` to 1.5-1.6. For 15+ elements, don't try to scale — use the hybrid pattern instead (simple Mermaid overview + CSS Grid cards). See "Architecture / System Diagrams" below.

**Mermaid layout direction:** Prefer `flowchart TD` (top-down) over `flowchart LR` (left-to-right) for complex diagrams. LR spreads horizontally and makes labels unreadable when there are many nodes. Use LR only for simple 3-4 node linear flows. See `./libraries.md` "Layout Direction: TD vs LR".

**Mermaid line breaks in flowchart labels:** Use `<br/>` inside quoted labels. Never use escaped newlines like `\n` (Mermaid renders them as literal text in HTML output). Example: `A["Copilot Backend<br/>/api + /api/voicebot"]`.

**Mermaid CSS class collision constraint:** Never define `.node` as a page-level CSS class. Mermaid.js uses `.node` internally on SVG `<g>` elements with `transform: translate(x, y)` for positioning. Page-level `.node` styles (hover transforms, box-shadows) leak into diagrams and break layout. Use the namespaced `.ve-card` class for card components instead. The only safe way to style Mermaid's `.node` is scoped under `.mermaid` (e.g., `.mermaid .node rect`).

**AI-generated illustrations (optional).** If [surf-cli](https://github.com/nicobailon/surf-cli) is available, you can generate images via Gemini and embed them in the page for creative, illustrative, explanatory, educational, or decorative purposes. Check availability with `which surf`. If available:

```bash
# Generate to a temp file (use --aspect-ratio for control)
surf gemini "descriptive prompt" --generate-image /tmp/ve-img.png --aspect-ratio 16:9

# Base64 encode for self-containment (macOS)
IMG=$(base64 -i /tmp/ve-img.png)
# Linux: IMG=$(base64 -w 0 /tmp/ve-img.png)

# Embed in HTML and clean up
# <img src="data:image/png;base64,${IMG}" alt="descriptive alt text">
rm /tmp/ve-img.png
```

See `./css-patterns.md` for image container styles (hero banners, inline illustrations, captions).

**When to use:** Hero banners that establish the page's visual tone. Conceptual illustrations for abstract systems that Mermaid can't express (physical infrastructure, user journeys, mental models). Educational diagrams that benefit from artistic or photorealistic rendering. Decorative accents that reinforce the aesthetic.

**When to skip:** Anything Mermaid or CSS handles well. Generic decoration that doesn't convey meaning. Data-heavy pages where images would distract. Always degrade gracefully — if surf isn't available, skip images without erroring. The page should stand on its own with CSS and typography alone.

**Prompt craft:** Match the image to the page's palette and aesthetic direction. Specify the style (3D render, technical illustration, watercolor, isometric, flat vector, etc.) and mention dominant colors from your CSS variables. Use `--aspect-ratio 16:9` for hero banners, `--aspect-ratio 1:1` for inline illustrations. Keep prompts specific — "isometric illustration of a message queue with cyan nodes on dark navy background" beats "a diagram of a queue."

**Code-driven embedded graphics via poster-ai (optional).** When you need a *structured* inline graphic — a KPI card, a Sankey diagram, a hierarchy figure, a dashboard strip — and you want determinism instead of generative output, use `poster-ai` as the image generator (the peer to surf-cli's Gemini illustrations). Check availability with `which poster`. If available:

```bash
# Write TSX to a temp file (sized for the embed slot, e.g. 1200×400 hero banner)
cat > /tmp/ve-graphic.tsx <<'TSX'
export default function() {
  return (<div className="w-[1200px] h-[400px] bg-black text-white ...">...</div>);
}
TSX

# Rasterize via headless Chrome
poster export /tmp/ve-graphic.tsx -o /tmp/ve-graphic.png --quiet

# Base64 encode for inline embedding (macOS)
IMG=$(base64 -i /tmp/ve-graphic.png)
# Linux: IMG=$(base64 -w 0 /tmp/ve-graphic.png)

# Embed:  <img src="data:image/png;base64,${IMG}" alt="...">
rm /tmp/ve-graphic.tsx /tmp/ve-graphic.png
```

**Poster vs surf:** use `poster` when the graphic is structural (dashboards, charts, schematics, data-art with exact layouts, diagrams you want to iterate on in code). Use `surf` when the graphic is illustrative (hero photography, conceptual art, mood imagery, anything generative). They are complements — pick based on whether you want deterministic/code-driven or generative/prompt-driven output. See `./poster.md` for canvas sizes, Mono-Industrial TSX idioms, and the full constraints list (no Mermaid inside posters, single-element root, etc.). Degrade gracefully — skip if `poster` isn't installed.

**Recorded UI demos (optional).** When the page explains a *running UI feature* — a form flow, a hover reveal, a multi-step wizard — a short silent webm loop beats a still screenshot. The video stays self-contained in the HTML via a base64 data URI, just like surf images and poster graphics.

Capture path (pick whichever is available):

- **Playwright MCP (preferred).** Use `browser_navigate`, `browser_resize`, `browser_take_screenshot` to save 6–12 numbered frames (`frame-001.png` … `frame-012.png`) into `~/.agent/diagrams/<slug>/`. Wait ~400ms between beats so animations settle.
- **`agent-browser` CLI (shortcut).** If installed, `agent-browser record start <out.webm>` / `record stop` captures continuously while you run interactions between them.

Encode and embed:

```bash
# Stitch frames → webm (skip if you used agent-browser record)
bash {{skill_dir}}/scripts/frames-to-webm.sh \
  ~/.agent/diagrams/<slug> \
  ~/.agent/diagrams/<slug>.webm \
  2  # fps

# Emit a self-contained <video> snippet with base64 inline
bash {{skill_dir}}/scripts/embed-media.sh ~/.agent/diagrams/<slug>.webm
# → <video autoplay loop muted playsinline><source src="data:video/webm;base64,..."></video>
```

Paste the `<video>` snippet directly into the section that introduces the feature. Keep the source webm under 2MB before encoding — above that, the base64-inflated HTML gets sluggish. The helper warns on stderr when you cross that line.

See `./demo-capture.md` for the full capture workflow, frame pacing, aesthetic framing per theme, and when to skip the demo entirely. `embed-media.sh` also handles PNG/JPG/GIF/WebP/MP4, so use it anywhere you'd otherwise hand-roll a `base64 -i | sed` pipeline. Degrade gracefully — if `ffmpeg` or a browser capture tool isn't available, fall back to a still screenshot or a Mermaid illustration.

### 3. Style

**If generating Mono-Industrial (the default), follow `./mono-industrial.md` — not the rules below.** The guidance in this section (font rotation, multi-accent palettes, staggered fade-in animation) applies only when the user has explicitly requested a named alternative aesthetic (Blueprint, Editorial, Paper/ink, Monochrome terminal, IDE-inspired). Mono-Industrial overrides all of it: fixed typography (Space Grotesk + Space Mono + optional Geist Pixel Square), grayscale palette with status colors only, zero on-load motion.

Apply these principles to every diagram in a **named alternative aesthetic**:

**Typography is the diagram.** Pick a distinctive font pairing from the list in `./libraries.md`.

**Forbidden as `--font-body`:** Inter, Roboto, Arial, Helvetica, system-ui alone. These are AI slop signals.

**Good pairings (use these):**
- Sora + Fira Code (technical, precise)
- Newsreader + JetBrains Mono (editorial, refined)
- IBM Plex Sans + IBM Plex Mono (reliable, readable)
- Bricolage Grotesque + Fragment Mono (bold, characterful)
- Albert Sans + Azeret Mono (rounded, approachable)

Load via `<link>` in `<head>`. Include a system font fallback in the `font-family` stack for offline resilience.

**Color tells a story.** Use CSS custom properties for the full palette. Define at minimum: `--bg`, `--surface`, `--border`, `--text`, `--text-dim`, and 3-5 accent colors. Each accent should have a full and a dim variant (for backgrounds). Name variables semantically when possible (`--pipeline-step` not `--blue-3`). Support both themes.

**Forbidden accent colors:** `#8b5cf6` `#7c3aed` `#a78bfa` (indigo/violet), `#d946ef` (fuchsia), the cyan-magenta-pink combination. These are Tailwind defaults that signal zero design intent.

**Good accent palettes (use these):**
- Terracotta + sage (`#c2410c`, `#65a30d`) — warm, earthy
- Teal + slate (`#0891b2`, `#0369a1`) — technical, precise
- Rose + cranberry (`#be123c`, `#881337`) — editorial, refined
- Amber + emerald (`#d97706`, `#059669`) — data-focused
- Deep blue + gold (`#1e3a5f`, `#d4a73a`) — premium, sophisticated

Put your primary aesthetic in `:root` and the alternate in the media query:

```css
/* Light-first (editorial, paper/ink, blueprint): */
:root { /* light values */ }
@media (prefers-color-scheme: dark) { :root { /* dark values */ } }

/* Dark-first (neon, IDE-inspired, terminal): */
:root { /* dark values */ }
@media (prefers-color-scheme: light) { :root { /* light values */ } }
```

**Surfaces whisper, they don't shout.** Build depth through subtle lightness shifts (2-4% between levels), not dramatic color changes. Borders should be low-opacity rgba (`rgba(255,255,255,0.08)` in dark mode, `rgba(0,0,0,0.08)` in light) — visible when you look, invisible when you don't.

**Backgrounds create atmosphere.** Don't use flat solid colors for the page background. Subtle gradients, faint grid patterns via CSS, or gentle radial glows behind focal areas. The background should feel like a space, not a void.

**Visual weight signals importance.** Not every section deserves equal visual treatment. Executive summaries and key metrics should dominate the viewport on load (larger type, more padding, subtle accent-tinted background zone). Reference sections (file maps, dependency lists, decision logs) should be compact and stay out of the way. Use `<details>/<summary>` for sections that are useful but not primary — the collapsible pattern is in `./css-patterns.md`.

**Surface depth creates hierarchy.** Vary card depth to signal what matters. Hero sections get elevated shadows and accent-tinted backgrounds (`ve-card--hero` pattern). Body content stays flat (default `.ve-card`). Code blocks and secondary content feel recessed (`ve-card--recessed`). See the depth tiers in `./css-patterns.md`. Don't make everything elevated — when everything pops, nothing does.

**Animation earns its place.** Staggered fade-ins on page load are almost always worth it — they guide the eye through the diagram's hierarchy. Mix animation types by role: `fadeUp` for cards, `fadeScale` for KPIs and badges, `drawIn` for SVG connectors, `countUp` for hero numbers. Hover transitions on interactive-feeling elements make the diagram feel alive. Always respect `prefers-reduced-motion`. CSS transitions and keyframes handle most cases. For orchestrated multi-element sequences, anime.js via CDN is available (see `./libraries.md`).

**Forbidden animations:**
- Animated glowing box-shadows (`@keyframes glow { box-shadow: 0 0 20px... }`) — this is AI slop
- Pulsing/breathing effects on static content
- Continuous animations that run after page load (except for progress indicators)

Keep animations purposeful: entrance reveals, hover feedback, and user-initiated interactions. Nothing should glow or pulse on its own.

### 4. Copy — unslop every line of prose before you write it to HTML

Before you render any prose into the page, **run the copy through the `/unslop` skill**. Generated HTML often looks right structurally while the text underneath reads like generic AI output — predictable rhythms, overused connectors, manufactured emphasis, "Here's the thing:" phrasings. The template design will not save you if the copy is slop.

**What counts as "copy" (must be unslopped):**

- Headlines and sub-headlines
- Lead paragraphs, body paragraphs, descriptions under sections or modules
- Module/card descriptions
- Callout text, pull quotes, blockquotes
- Slide body copy
- Any complete-sentence content meant to be read as prose

**What does NOT count as copy (leave untouched):**

- Space Mono ALL CAPS labels (`LAST UPDATED`, `SOURCE`, `STATUS`)
- Numeric values, units, timestamps
- Code snippets, filenames, identifiers
- Mermaid node labels (they're diagram labels, not prose — keep them terse and technical)
- Table header cells and column names
- System messages in square brackets (`[NO DATA]`, `[ERROR: ...]`)
- Version strings, section numbers, counters

**Workflow:**

1. Draft the full set of prose copy for the page as a plain-text block before writing HTML.
2. Invoke `/unslop` on that block. The skill runs its two-pass diagnosis-then-reconstruction and returns revised copy.
3. If `/unslop` is unavailable in the current surface (for example, Codex CLI), apply the embedded de-slop rubric in `../scripts/verify/rubrics/pass-copy.md` yourself, using the same instruction hierarchy as the verification protocol: deterministic checks first, then fresh-context copy judgment.
4. Paste the unslopped copy into the HTML template. Do not paraphrase it again or "polish" it further — `/unslop` already did that work, and re-editing reintroduces the patterns it removed.

If you skip this step and your prose still reads as AI-generated (telltale phrases like "it's important to note", "let that sink in", "in today's fast-paced landscape", predictable three-item lists, transitional "however"s and "moreover"s), the output has failed the craft bar regardless of how good the visual design is.

### 5. Deliver

**Output location:** Write to `~/.agent/diagrams/`. Use a descriptive filename based on content: `modem-architecture.html`, `pipeline-flow.html`, `schema-overview.html`. The directory persists across sessions.

**Open in browser:**
- macOS: `open ~/.agent/diagrams/filename.html`
- Linux: `xdg-open ~/.agent/diagrams/filename.html`

**Tell the user** the file path so they can re-open or share it.

### 6. Verify in a browser (mandatory)

Run deterministic verification first:

```bash
node {{skill_dir}}/scripts/verify/ve-verify.mjs <artifact.html> --json <report.json> --screens <screens-dir>
```

Exit `0` means no error-severity failures; warnings still require judgment. Exit `1` means fix the root cause, re-export from source, and rerun. Exit `2` means the verifier crashed; fix the invocation/environment or disclose that verification could not run.

Do not run LLM visual passes until `ve-verify` exits `0`. Use at most 3 deterministic repair cycles. If failures remain, deliver only with explicit unresolved check IDs and evidence.

After `ve-verify` passes, run the LLM passes in `./verification.md`: hierarchy, aesthetic, visual-tells, diagram, completeness, copy, and poster as required by the report/profile. Claude Code should dispatch the `ve-verifier-*` agents in parallel. Single-agent environments should run the same files in `../scripts/verify/rubrics/` sequentially.

Each LLM pass returns only:

```json
{"pass":true,"findings":[]}
```

If any pass fails, fix only the named findings, re-export, rerun `ve-verify`, then rerun the affected LLM pass. Use at most 2 LLM repair cycles.

If no browser automation is available, open the file for the user and say that browser verification could not be performed. Do not claim the artifact is verified.

Poster output has an extra PNG gate: after every `poster export`, inspect the exported PNG, not just the HTML preview. The canvas-fit loop and failure disclosure rules live in `./verification.md` and `./poster.md`.

The delivery message must include the artifact path, the `ve-verify` report path, pass/fail results for every LLM pass that ran, and either `Verified`, `Could not fully verify`, or `Verification failed after bounded repair` wording per `./verification.md`.

## Diagram Types

**The full rules, shape semantics, complexity budgets, removal test, and anti-patterns for all 13 supported diagram types live in `./diagrams-svg.md`.** This section summarizes the rendering-approach decision per type. Aesthetic token mappings for every diagram type live in `./diagram-tokens.md`.

Before authoring any diagram, pick the type via the Type Selection Gate in `diagrams-svg.md`, check the complexity budget, and run the Removal Test before emitting.

### Architecture / System Diagrams
Three approaches depending on complexity:

**Topology (≤ 14 elements):** Use **inline SVG** (start from `../templates/svg-diagram-starter.html`). Group nodes by tier or trust boundary. Focal accent on 1–2 critical integration points. Dashed rectangles for region boundaries with masked boundary labels.

**Text-heavy overviews (under 15 elements):** CSS Grid with explicit row/column placement when cards need descriptions, code references, tool lists, or other rich content that SVG nodes can't hold. Reference: `../templates/architecture.html`.

**Complex architectures (15+ elements):** Use the **hybrid pattern** — a simple Mermaid overview (5–8 nodes showing module relationships) followed by detailed CSS Grid cards for each module's internals. Auto-routing beats hand-authored coordinates above the complexity budget.

### Flowcharts / Pipelines
**Inline SVG for ≤ 9 nodes; Mermaid above that.** Shape carries meaning, not color: ovals (`rx=20`) for start/end, rectangles (`rx=6`) for steps, diamonds for decisions (≤ 3 exits or nest diamonds), filled dots (`r=4`) for merge points. Vertical flow. "Yes" → right, "No" → down. Label every edge. Accent on the happy path OR the most consequential decision — not every decision.

### Sequence Diagrams
**Inline SVG for ≤ 5 lifelines; Mermaid above that.** Actors in boxes at the top. Vertical dashed lifelines. Horizontal message arrows. Time flows down only. Activation bars 8px wide, muted fill, 0.8 stroke. Self-messages as U-loops. Return arrows dashed. Accent on the primary success response only.

### Data Flow Diagrams
**Mermaid** with edge labels. Data flow diagrams emphasize auto-routed connections over hand-placed boxes.

### Schema / ER Diagrams
**Inline SVG for ≤ 8 entities; Mermaid above that.** Two-part entity shape: header (type tag + name) + field list. `#` marks PK, `→` marks FK. Cardinality (`1`, `N`, `0..1`, `1..*`) placed 10–12px from connecting edge. Cluster related entities; don't draw every FK on a huge model. Accent on the aggregate root.

### State Machines / Decision Trees
**Inline SVG for ≤ 9 states; Mermaid above that.** Rounded rects (`rx=8`) for states. Start = filled dot (`r=6`). End = ringed dot. Transition labels in the pattern `event [guard] / action`. Self-loops arc above the node. Never draw "from any state" lines from every state — annotate once.

**`stateDiagram-v2` label caveat:** Transition labels have a strict parser — colons, parentheses, `<br/>`, HTML entities, and most special characters cause silent parse failures ("Syntax error in text"). If your labels need any of these (e.g., `cancel()`, `curate: true`, multi-line labels), use `flowchart TD` instead with rounded nodes and quoted edge labels (`|"label text"|`). Flowcharts handle all special characters and support `<br/>` for line breaks. Reserve `stateDiagram-v2` for simple single-word or plain-text labels.

### Mind Maps / Hierarchical Breakdowns
**Use Mermaid.** Use `mindmap` syntax for hierarchical branching from a root node. Mermaid handles the radial layout automatically. Style with `themeVariables` to control node colors at each depth level.

### Class Diagrams
**Use Mermaid.** Use `classDiagram` syntax for domain modeling, OOP design, and entity relationships with typed properties and methods. Supports relationships: association (`-->`), composition (`*--`), aggregation (`o--`), and inheritance (`<|--`). Add multiplicity labels (e.g., `"1" --> "*"`) and abstract/interface markers (`<<interface>>`, `<<abstract>>`). For simple entity boxes without OOP semantics (no methods, no inheritance), prefer `erDiagram` instead — it produces cleaner output for pure data modeling.

### C4 Architecture Diagrams
**Use Mermaid flowchart syntax — NOT native C4.** Use `graph TD` with `subgraph` blocks for C4 boundaries. Native `C4Context` hardcodes sharp corners, its own font, blue icons, and inline SVG colors that ignore `themeVariables` — it always clashes with custom palettes.

**Flowchart-as-C4 pattern:** Persons → rounded nodes `(("Name"))`, systems → rectangles `["Name"]`, databases → cylinders `[("Name")]`, boundaries → `subgraph` blocks, relationships → labeled arrows `-->|"protocol"|`. Use `classDef` + `:::className` to visually differentiate external systems (e.g., dashed borders). This inherits `themeVariables`, `fontFamily`, and CSS overrides like every other Mermaid diagram.

### Data Tables / Comparisons / Audits
Use a real `<table>` element — not CSS Grid pretending to be a table. Tables get accessibility, copy-paste behavior, and column alignment for free. The reference template at `../templates/data-table.html` demonstrates all patterns below.

**Use proactively.** Any time you'd render an ASCII box-drawing table in the terminal, generate an HTML table instead. This includes: requirement audits (request vs plan), feature comparisons, status reports, configuration matrices, test result summaries, dependency lists, permission tables, API endpoint inventories — any structured rows and columns.

Layout patterns:
- Sticky `<thead>` so headers stay visible when scrolling long tables
- Alternating row backgrounds via `tr:nth-child(even)` (subtle, 2-3% lightness shift)
- First column optionally sticky for wide tables with horizontal scroll
- Responsive wrapper with `overflow-x: auto` for tables wider than the viewport
- Column width hints via `<colgroup>` or `th` widths — let text-heavy columns breathe
- Row hover highlight for scanability

Status indicators (use styled `<span>` elements, never emoji):
- Match/pass/yes: colored dot or checkmark with green background
- Gap/fail/no: colored dot or cross with red background
- Partial/warning: amber indicator
- Neutral/info: dim text or muted badge

Cell content:
- Wrap long text naturally — don't truncate or force single-line
- Use `<code>` for technical references within cells
- Secondary detail text in `<small>` with dimmed color
- Keep numeric columns right-aligned with `tabular-nums`

### Timeline / Roadmap Views
**Inline SVG.** Horizontal hairline baseline. Ticks at meaningful intervals with monospace date labels. Events as dots with labels alternating above and below (thin connector lines to their dots). **Time scale must be honest** — unequal intervals get unequal spacing. Break the axis visibly when density demands it. For multi-phase roadmaps with rich content per phase, fall back to the CSS card pattern (central line pseudo-element + alternating cards).

### Swimlane Diagrams
**Inline SVG.** One lane per actor, max 5 lanes. Lane labels in the eyebrow style (mono, small, UPPERCASE, 0.18em tracking) in the left margin. 1px hairline dividers between lanes. Accent on high-impact boundary-crossing handoffs. Never assign one step to two lanes.

### Quadrant / Priority Matrices
**Inline SVG.** Centered axis cross. Axis labels at axis **ends**, not midpoints. Items as dots (`r=4`) with text labels. Accent on the "do first" item (top-right quadrant). ~12 items max. Never place items on axis lines. Never fill the four quadrants with different colors.

### Nested Containment
**Inline SVG.** 3–5 concentric rounded rects. Horizontal padding 24–32px, vertical padding 32–36px. Eyebrow label top-left on a small masked overlay across the ring. Stroke opacity escalates inward (0.30 → 0.45 → accent innermost). Accent on the innermost focal ring only.

### Tree / Hierarchy
**Inline SVG for depth ≤ 4; Mermaid `mindmap` for deeper or wider trees.** Root at top (or left). Nodes 120–180w × 40–52h. Name in sans 12px/600, optional sublabel in mono 9px. **Connectors orthogonal (elbow-style), never diagonal.** Max 5 children per level. Accent on one node only: either root or a critical leaf, not both.

### Layer Stack / Abstraction Levels
**Inline SVG.** 4–6 horizontal bands, 56–72px tall, 800–880px wide in a 1000 viewBox. Row content left-to-right: mono index · sans 600 layer name · contextual note. Fills alternate subtle shades OR all-paper with hairline dividers. Accent on the "bottleneck / pays-rent" layer. Direction indicator (arrow glyph) outside the left margin.

### Venn Diagrams
**Inline SVG.** 2 or 3 circles (never 4). Hairline 1px strokes in set-specific colors. Fills are very-low-opacity rgba versions of the same colors. Set names outside circles, intersection terms inside. One accent overlap = focal. Circle sizes proportional to cardinality, not fake-equal.

### Pyramid / Funnel
**Inline SVG.** 4–6 layers, 56–72px tall each. **Widths must be honest** (proportional to count or percentage). Centered name in sans 600 per layer, optional sublabel and optional side annotation. Accent on the apex (pyramid) or the conversion layer (funnel), never the base. Pick pyramid-up OR funnel-down and commit.

### Dashboard / Metrics Overview
Card grid layout. Hero numbers large and prominent. Sparklines via inline SVG `<polyline>`. Progress bars via CSS `linear-gradient` on a div. For real charts (bar, line, pie), use **Chart.js via CDN** (see `./libraries.md`). KPI cards with trend indicators (up/down arrows, percentage deltas).

### Implementation Plans

For visualizing implementation plans, extension designs, or feature specifications. The goal is **understanding the approach**, not reading the full source code.

**Don't dump full files.** Displaying entire source files inline overwhelms the page and defeats the purpose of a visual explanation. Instead:
- Show **file structure with descriptions** — list functions/exports with one-line explanations
- Show **key snippets only** — the 5-10 lines that illustrate the core logic
- Use **collapsible sections** for full code if truly needed

**Code blocks require explicit formatting.** Without `white-space: pre-wrap`, code runs together into an unreadable wall. See the "Code Blocks" section in `./css-patterns.md` for the base pattern.

**Mono-Industrial code blocks are terminal-dark with syntax highlighting.** Every code block on a Mono-Industrial page uses a near-black background (`#0a0a0a`) regardless of whether the page is in light or dark mode, paired with Prism.js for syntax highlighting using the restrained token palette in `./libraries.md` → "Prism.js — Syntax Highlighting". The terminal block is the one place in the aesthetic that breaks the grayscale rule — it uses the existing status colors (`--warn` for strings/numbers, `--err` for tags/deletions, `--ok` for diff insertions) plus three levels of foreground opacity for everything else. No new colors are introduced. See `./mono-industrial.md` § 16 for the rationale and the full token mapping.

**Structure for implementation plans:**
1. Overview/purpose (what problem does this solve?)
2. Flow diagram (Mermaid or CSS cards)
3. File structure with descriptions (not full code)
4. Key implementation details (snippets)
5. API/interface summary
6. Usage examples

### Documentation (READMEs, Library Docs, API References)

When visualizing documentation, extract structure into visual elements:

| Content | Visual Treatment |
|---------|------------------|
| Features | Card grid (2-3 columns) |
| Install/setup steps | Numbered cards or vertical flow |
| API endpoints/commands | Table with sticky header |
| Config options | Table |
| Architecture | Mermaid diagram or CSS card layout |
| Comparisons | Side-by-side panels or table |
| Warnings/notes | Callout boxes |

Don't just format the prose — transform it. A feature list becomes a card grid. Install steps become a numbered flow. An API reference becomes a table.

### Prose Accent Elements

Use these sparingly within visual pages to highlight key points or provide breathing room. See "Prose Page Elements" in `./css-patterns.md` for CSS patterns.

- **Lead paragraph** — larger intro text to set context before diving into cards/grids
- **Pull quote** — highlight a key insight; one per page maximum
- **Callout box** — warnings, tips, important notes
- **Section divider** — visual break between major sections

**When to use:** A visual page explaining an essay might use a lead paragraph for the thesis, then cards for key arguments. A README visualization might use callout boxes for warnings but otherwise stay card/table-focused.

## Slide Deck Mode (vertical + `--magazine` horizontal)

An alternative output format for presenting content as a magazine-quality slide presentation instead of a scrollable page. **Opt-in only** — the agent generates slides when the user invokes `/generate-slides`, passes `--slides` to an existing prompt (e.g., `/diff-review --slides`), or explicitly asks for a slide deck. Never auto-select slide format.

**Two orientations.**
- **Vertical (default)** — `scroll-snap-type: y mandatory`. Each slide is 100dvh. Feels like a presentation.
- **Horizontal (`--magazine` flag)** — `scroll-snap-type: x mandatory`. Each page is 100vw × 100vh. Feels like a print zine. Full-bleed edge-to-edge, nav dots at bottom, arrow-key + swipe navigation, dark cover + dark back cover + ≥ 1 interior dark panel, per-page tint rotation, at least one full-bleed stat page with 100px+ anchor.

Magazine is a slide mode, not a separate format — the compositional rules, content-completeness rules, aesthetic presets, and all the slide types (title, content, split, diagram, dashboard, table, code, quote, full-bleed) work in both orientations. Magazine adds additional layouts (quadrant, full-bleed stat, dark panel, color block, viewport-filling grid) that **also work in vertical mode**. See `./slide-patterns.md` § Magazine Mode (Horizontal) for the full specification.

**Before generating slides**, read `./slide-patterns.md` (engine CSS, slide types, transitions, nav chrome, presets, magazine mode) and one of:
- `../templates/mono-industrial-slides.html` (vertical, Mono-Industrial)
- `../templates/mono-industrial-magazine.html` (horizontal, Mono-Industrial — default magazine)
- `../templates/nothing-magazine.html` (horizontal, Nothing — when the user asks for Nothing / instrument-panel / dot-matrix)
- `../templates/slide-deck.html` (vertical, legacy aesthetics)

Also read `./css-patterns.md` for shared patterns, `./libraries.md` for Mermaid/Chart.js theming, and `./diagram-tokens.md` for the per-aesthetic tint ramps that magazine mode uses across interior pages.

**Slides are not pages reformatted.** They're a different medium. Each slide is exactly one viewport (100dvh vertical or 100vw × 100vh horizontal) with no internal scrolling. Typography is 2–3× larger than scrollable pages. Compositions are bolder. The agent composes a narrative arc (impact → context → deep dive → resolution, or cover → opening → body → back cover for magazine) rather than mechanically paginating the source.

**Content completeness.** Changing the medium does not mean dropping content. Follow the "Planning a Deck from a Source Document" process in `slide-patterns.md` before writing any HTML: inventory the source, map every item to slides, verify coverage. Every section, decision, data point, specification, and collapsible detail from the source must appear in the deck. If a plan has 7 sections, the deck covers all 7. If there are 6 decisions, present all 6 — not the 2 that fit on one slide. Collapsible details in the source become their own slides. Add more slides rather than cutting content. A 22-slide deck that covers everything beats a 13-slide deck that looks polished but is missing 40% of the source.

**Slide types (15):** Title/Cover, Section Divider, Content, Split (left/right color-block), Diagram, Dashboard, Table, Code, Quote, Full-Bleed, plus magazine-added types usable in both orientations: Quadrant (2×2), Full-Bleed Stat (100px+ anchor), Dark Panel, Color Block, Viewport-Filling Grid (3×2 or 4×3). Each has a defined layout in `slide-patterns.md`. Content that exceeds a slide's density limit splits across multiple slides — never scrolls within a slide.

**Visual richness:** Check `which surf` at the start. If surf-cli is available, generate 2–4 images (title slide background, full-bleed background, optional content illustrations) before writing HTML — see the Proactive Imagery section in `slide-patterns.md` for the workflow. Also use SVG decorative accents, per-slide background gradients, inline sparklines, and small Mermaid diagrams. Visual-first, text-second.

**Compositional variety:** Consecutive slides must vary spatial approach — centered, left-heavy, right-heavy, split, edge-aligned, full-bleed. Three centered slides in a row means push one off-axis.

**Curated presets:** Four slide-specific presets as starting points (Midnight Editorial, Warm Signal, Terminal Mono, Swiss Clean) plus the existing 8 aesthetic directions adapted for slides. Pick one and commit. See `slide-patterns.md` for preset CSS values.

**`--slides` flag on existing prompts:** When a user passes `--slides` to `/diff-review`, `/plan-review`, `/project-recap`, or other prompts, the agent gathers data using the prompt's normal data-gathering instructions, then presents the content as a slide deck instead of a scrollable page. The slide version tells the same story with different structure and pacing — but the same breadth of coverage. Don't use the slide format as an excuse to summarize or skip sections that the scrollable version would have included.

**`--poster-export` flag (optional).** When the user passes `--poster-export` to `/generate-slides`, the agent produces the interactive HTML deck first (canonical), then *additionally* renders each slide to its own fixed-canvas PNG via `poster-ai`. Slides go to `~/.agent/diagrams/<deck-name>/slides/<NN>-<title>.png` at 1920×1080 (or 1600×900 for tighter 16:9). Use these PNGs to share individual slides or to import into Keynote / Google Slides. Check `which poster` first; if missing, tell the user the flag is unavailable and proceed with HTML-only. See `./poster.md` → "Slide decks as per-slide posters" for the workflow.

## Video Output Mode

An alternative output format: MP4 / WebM video via [Hyperframes](https://github.com/heygen-com/hyperframes) (Apache 2.0, HeyGen). **Opt-in only** — the agent generates video when the user invokes `/generate-video` or `/render-video`, or explicitly asks for an "explainer video," "reel," or "mp4." Never auto-select video.

**Two commands:**
- `/generate-video` — greenfield. Takes a topic/outline, builds a Hyperframes composition from scratch, renders MP4.
- `/render-video` — takes an existing HTML deck (from `/generate-slides` or `/generate-slides --magazine`) and converts it to MP4.

**Two styles, picked explicitly:**
- `long-form` — 16:9 landscape, 1920×1080, 60–180s, slide-paced dwell scenes, TTS narration, minor shader transitions. For meetings, onboarding, LinkedIn.
- `reel` — 30–60s, hard cuts every 1.2–1.8s, kinetic typography, progressive diagram reveal, burned-in captions. Supports two aspect ratios via `--aspect=9:16` (vertical 1080×1920 — Shorts/Reels/TikTok) or `--aspect=16:9` (landscape 1920×1080 — X/LinkedIn/YouTube-embedded/desktop). Same format, different canvas — see `./reel-patterns.md` § Two aspect ratios for what differs between them.

**Before generating video, read `./hyperframes.md` (runtime, constraints, CLI flags), `./gsap-rules.md` (hard constraints — timelines must be `{ paused: true }`, no `Math.random`, no `repeat: -1`), and — for reel style — `./reel-patterns.md` (beat structure, kinetic typography, progressive diagram reveal, TTS + burned-in captions).** Start compositions from `../templates/hyperframes-longform.html` (16:9 long-form), `../templates/hyperframes-reel.html` (9:16 reel), or `../templates/hyperframes-reel-landscape.html` (16:9 reel).

**Runtime requirements.** Hyperframes needs Node ≥ 22 and FFmpeg on PATH. The skill runs `bash {{skill_dir}}/scripts/hyperframes-doctor.sh` at the start of any video command; if it exits non-zero, abort and forward install hints to the user. Do not attempt to render with missing deps.

**Verification flow is mandatory.** Video is a high-cost command.
1. `npx hyperframes lint && npx hyperframes validate` before render (validate runs WCAG contrast audit)
2. `npx hyperframes render --quality draft` for fast preview
3. `bash {{skill_dir}}/scripts/extract-keyframes.sh <draft.mp4>` → 3 keyframes (start/mid/end)
4. Show keyframes to user, ask for approval
5. On approval: `npx hyperframes render --quality standard` for delivery

Because video is high-cost, the AskUserQuestion caveat (see `./clarify.md`) **always fires** for video commands — even if the user's request is otherwise clear. Minimum questions: style (long-form vs reel) and duration. Bypass only on explicit `--no-ask` flag.

**Video output location:** `~/.agent/videos/<slug>.mp4` (not `~/.agent/diagrams/`). Keyframes to `~/.agent/videos/<slug>/keyframes/`. Intermediate assets (narration.wav, captions.vtt) to `~/.agent/videos/<slug>/`.

## File Structure

Every diagram is a single self-contained `.html` file. No external assets except CDN links (fonts, optional libraries). Structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Descriptive Title</title>
  <link href="https://fonts.googleapis.com/css2?family=...&display=swap" rel="stylesheet">
  <style>
    /* CSS custom properties, theme, layout, components — all inline */
  </style>
</head>
<body>
  <!-- Semantic HTML: sections, headings, lists, tables, inline SVG -->
  <!-- No script needed for static CSS-only diagrams -->
  <!-- Optional: <script> for Mermaid, Chart.js, or anime.js when used -->
</body>
</html>
```

## Sharing Pages

Share visual explainer pages instantly via Vercel. No account or authentication required.

**Usage:**
```bash
bash {{skill_dir}}/scripts/share.sh <html-file>
```

**Example:**
```bash
bash {{skill_dir}}/scripts/share.sh ~/.agent/diagrams/my-diagram.html

# Output:
# ✓ Shared successfully!
# Live URL:  https://skill-deploy-abc123.vercel.app
# Claim URL: https://vercel.com/claim-deployment?code=...
```

**How it works:**
1. Copies HTML file to temp directory as `index.html`
2. Deploys via the vercel-deploy skill (zero-auth claimable deployment)
3. URL is live immediately — works in any browser

**Requirements:**
- vercel-deploy skill (should be pre-installed; if not: `pi install npm:vercel-deploy`)

**Notes:**
- Deployments are public — anyone with the URL can view
- Preview deployments have configurable retention (default: 30 days)
- Claim URL lets you transfer the deployment to your Vercel account

See `../commands/share.md` for the `/share` command template.

## Quality Checks

The full protocol lives in `./verification.md`; the executable rubric questions live in `../scripts/verify/rubrics/`.

The irreducible judgment checks are:
- **Layout judgment:** hierarchy, visible clipping, fixed chrome obstruction, semantic table need, slide focal clarity, composition repetition, and sparse slide diagnosis.
- **Aesthetic judgment:** active-preset fidelity, both-mode visual inversion, status-color meaning, moment-of-surprise, grid-break intent, red-accent intent, and demo embed fit.
- **Visual-tells judgment:** whether the visual choices communicate the source material through specific hierarchy, motifs, data emphasis, and format-appropriate tells.
- **Diagram judgment:** legend fidelity, focal dominance, proportional honesty, type coherence, removal simplicity, and whether a diagram is necessary.
- **Completeness judgment:** source inventory mapped to rendered content, plus whether a demo adds motion/interaction value.
- **Copy judgment:** extracted prose passes `/unslop` standards.
- **Poster judgment:** exported PNG preserves canvas fit, hierarchy, and the intended hero/moment-of-surprise.

Deterministic checks cover file structure, console/runtime errors, placeholder leaks, body overflow, link/style contracts, Mermaid container mechanics, preset tokens, slide sizing, poster bounds, video/transcript rules, and other machine-checkable constraints.

## Anti-Patterns (AI Slop)

These patterns are explicitly forbidden. They signal "AI-generated template" and undermine the skill's purpose of producing distinctive, high-quality diagrams. Review every generated page against this list. Each ban includes the positive alternative to use instead.

### Typography

- Do not use Inter, Roboto, Arial, Helvetica, or `system-ui, sans-serif` alone as the primary `--font-body`; pick from the font pairings in `./libraries.md` or preserve a real project font stack.
- Cap each page at four named font families. Prefer one family in three or four weights over fake variety.
- Do not pair two fonts from the same class, such as two geometric sans or two humanist sans faces. Contrast on a real axis, such as serif plus sans or mono plus sans, or stay within one family.
- Do not reach for reflex webfonts such as Fraunces, Playfair Display, Cormorant, Lora, Syne, Space Grotesk, DM Sans/Serif, Outfit, Plus Jakarta Sans, or Instrument Sans/Serif as the voice face on a custom page. Pick against three brand-voice words from a real catalog; mono variants inside code are fine.
- Keep a committed type scale. Adjacent levels need at least a 1.25x difference carried by size plus weight or color; avoid 14/15/16px muddle and lone 500-vs-400 weight bumps.
- Set body and running prose at 16px or larger in `rem`. Never ship `user-scalable=no` or `maximum-scale=1`.
- Bound `clamp()` type: max/min should stay at or below about 2.5, and hero/display max should stay at or below about `6rem`.
- Add `0.05em` to `0.12em` tracking to all-caps labels unless a house aesthetic sets its own value.
- Load webfonts with `font-display: swap`; Google Fonts links must include `&display=swap`.

### Color

- Do not use indigo/violet defaults (`#8b5cf6`, `#7c3aed`, `#a78bfa`) or the cyan + magenta + pink neon set (`#06b6d4` -> `#d946ef` -> `#f472b6`). Build palettes from reference templates or from a real named theme.
- Do not default body or surface neutrals to warm cream/sand (`OKLCH` L `.84-.99`, C `<.06`, hue `40-100`, or tokens such as `--paper`, `--cream`, `--sand`, `--linen`) unless the aesthetic explicitly owns paper. Tint neutrals toward the real brand hue or stay chroma-0; carry warmth through accent, type, or imagery.
- Do not use indigo/blue around hue 250 or warm orange around hue 60 as the only accent without a brand reason. Choose accents that match the subject, theme, or data semantics.
- Cap decorative chrome at about four hue families. Chart series, syntax highlighting, and semantic status colors are exempt.
- Never put mid-gray text on a saturated background. Use the ink color at reduced alpha or a shade of the background hue.
- Verify body-text contrast at 4.5:1 or better, and large/bold text at 3:1 or better, against the real rendered background in both themes.
- Never encode meaning by color alone. Add a label, icon, shape, or texture; avoid legends made only of bare swatches.

### Backgrounds & Effects

- Do not use full-bleed violet-to-blue/cyan or purple-to-pink gradient washes as backgrounds. Use a solid brand color, a real image/chart, or an intentional non-default multi-stop gradient.
- Do not add ambient decorative layers such as blurred gradient orbs, particle canvases, floating dot grids, or multiple radial glows. Tie atmosphere to real content, once and restrained.
- Do not use gradient text on headings. Use actual type scale, weight, layout, and color contrast.
- Do not use glassmorphism (`backdrop-blur` plus translucent surface) as the default card/nav/modal treatment. Reserve one frosted moment over real imagery; otherwise use opaque surfaces with a hairline or shadow.
- Do not use animated glowing box-shadows or pulsing/breathing effects on static content. Use entrance reveals, hover feedback, or user-initiated transitions only.
- Do not use a colored one-sided `border-left` or `border-right` stripe as a card accent. Use a full hairline border, a background tint, or a leading glyph.
- Do not copy-paste one box-shadow onto every raised element. Use two or three elevation levels tied to importance, or rely on spacing and borders.

### Layout & Structure

- Do not center everything with uniform padding. Build hierarchy with visible differences in scale, alignment, density, and section rhythm.
- Do not style every card identically. Hero, primary, secondary, and reference material need different weight.
- Do not nest a card directly inside another card. Use spacing, a divider, or a subheading for subgrouping.
- Do not box every block by default. Render standalone paragraphs, images, and lone stats as plain flow content.
- Do not stamp out big-number plus small-label stat tiles unless the numbers are real, sourced data. Use narrative cards, tables, or diagrams when the values are illustrative.
- Do not dump a wall of eight or more undifferentiated bullets. Group the content into two to four labeled clusters, a table, or a diagram; flat glossaries and changelogs are exceptions.
- Derive spacing from one small scale such as `4/8/12/16/24/32/48/64`. Avoid scattered one-off values like `13px`, `17px`, and `22px`.
- Create rhythm: tight spacing within groups, generous spacing between sections.
- Vary section structure to match content type. Do not force a diff, timeline, and comparison into one grid mold. Break the grid once for a deliberate focal point.
- Avoid symmetric layouts where both halves mirror each other without a reason.

### Motion

- Reveal animations must enhance already-visible content. Never default content to `opacity: 0` gated on a JavaScript class; headless, PDF, and PNG exports can ship blank.
- Gate reveals behind CSS scroll timelines or provide reduced-motion and `noscript` fallbacks.
- Do not loop the same fade-and-rise on every section or choreograph header, sections, and footer on load. Pick one hero moment; stagger only siblings within a list.
- Use ease-out quart/quint/expo curves. Do not use bounce or elastic curves, including `cubic-bezier()` control points outside `[0,1]`.
- Animate `transform` and `opacity`, not `width`, `height`, `top`, `left`, or `margin`.
- Keep hover and press feedback at or below 300ms.
- Never write `outline: none` on a focusable element without a `:focus-visible` replacement. Give interactive controls at least a `44px` by `44px` hit area.
- Do not stage a spinner or skeleton in a static artifact that fetches nothing.

### Iconography

- Do not use emoji icons in section headers or inline body bullets. Use styled monospace labels, numbered badges, asymmetric section dividers, or inline SVG that matches the palette.
- Pick one icon system per role and use it uniformly. Do not mix emoji, inline SVG, and unicode glyphs for equivalent items.
- Do not repeat the same icon-in-rounded-box pattern for every section header.

### Copy

- Open with the claim. Cut throat-clearing such as "Here's the thing:", chatbot artifacts such as "Great question!" and "I hope this helps", and significance inflation such as "stands as a testament to".
- Do not let a heading restate its own next sentence. The first sentence after a heading must add a fact, number, or mechanism.
- Do not repeat a point across sections. Say it once in the strongest place.
- Define load-bearing jargon on first use.
- Keep one capitalization convention per heading level.
- Use zero or one em dash per section. Avoid colon-before-dramatic-reveal and manufactured "not just X, it's Y" parallelism.
- Run `/unslop` on drafted copy when available. If it is unavailable, apply the rubric in `../scripts/verify/rubrics/pass-copy.md` before writing prose into HTML.
- Code blocks should use a simple header with filename or language label, never three-dot window chrome.

### The Slop Test

Before delivering, apply this test: **Would a developer looking at this page immediately think "AI generated this"?** The telltale signs:

1. Inter or Roboto font with purple/violet gradient accents
2. Every heading has `background-clip: text` gradient
3. Emoji icons leading every section
4. Glowing cards with animated shadows
5. Cyan-magenta-pink color scheme on dark background
6. Perfectly uniform card grid with no visual hierarchy
7. Three-dot code block chrome

If two or more of these are present, the page is slop. Regenerate with a different aesthetic direction — Editorial, Blueprint, Paper/ink, or a specific IDE theme. These constrained aesthetics are harder to mess up because they have specific visual requirements that prevent defaulting to generic patterns.
