# Section Contract — Sub-Agent Fan-Out Protocol

When a page has 3+ sections, the visual-explainer commands fan out to specialized sub-agents that each build one section in parallel. The orchestrator stitches their fragments into a single self-contained HTML file.

This file is the protocol every sub-agent and the orchestrator must follow. If you are a sub-agent reading this, **you produce one section, not a full page.** If you are the orchestrator, you publish the page shell, dispatch sub-agents in parallel, dedup imports, and run browser verification.

---

## When to fan out

| Condition | Behavior |
|---|---|
| Page outline has 1–2 sections | Sequential. Orchestrator builds the whole page itself. No sub-agents. |
| Page outline has 3+ sections | Fan out. Orchestrator dispatches one sub-agent per section in parallel via the Task tool. |
| User explicitly requests `--no-parallel` | Sequential, regardless of section count. Use when debugging stitch issues. |

Fan-out has overhead: spawning sub-agents costs time and context. It pays off only when the sections are independent enough to build in parallel and dense enough that sequential generation would be slow.

---

## The fragment that sub-agents return

Every sub-agent returns a single JSON object as its final message. Do not return anything else. Do not wrap it in prose, markdown, or code fences.

```json
{
  "role": "hero",
  "section_html": "<section class=\"ve-hero\">...</section>",
  "scoped_css": ".ve-hero { ... } .ve-hero__display { ... }",
  "fonts_needed": ["Geist Pixel Square"],
  "libraries_needed": [],
  "diagram_sources": [],
  "notes": "Used the hero-number component verbatim. Headline copy was unslopped before insertion."
}
```

| Field | Required | Meaning |
|---|---|---|
| `role` | yes | One of: `hero`, `diagram`, `table`, `dashboard`, `prose`. Identifies which sub-agent produced this. |
| `section_html` | yes | A single `<section>` element (or `<header>` for the metadata band). All classes prefixed with `.ve-{role}__`. No `<style>`, `<script>`, `<link>`, or `<head>`-level tags. |
| `scoped_css` | yes | All CSS rules used in `section_html`. Every selector must start with `.ve-{role}` or be a descendant of one. No bare element selectors (`p { ... }`), no global resets, no `:root` overrides. |
| `fonts_needed` | yes | Array of font-family names this section requires *beyond* the always-loaded Space Grotesk + Space Mono. Examples: `"Geist Pixel Square"`, `"Geist Pixel Circle"`, `"Doto"`. Empty array `[]` if none. |
| `libraries_needed` | yes | Array of library names this section requires. Currently supported: `"mermaid"`, `"chart.js"`, `"anime"`. Empty array `[]` if none. |
| `diagram_sources` | yes | Array of `{ id, source }` objects for any Mermaid sources embedded in `section_html`. The orchestrator's bottom-of-page script reads these and renders into the corresponding `.ve-diagram__canvas[data-id="..."]`. Empty array `[]` if no diagrams. |
| `notes` | optional | Free-text notes for the orchestrator. Use to flag issues, dependencies, or assumptions. |

**Rejection conditions** (orchestrator will refuse and re-dispatch):
- `section_html` contains `<head>`, `<link>`, `<script>`, or `<style>` tags
- `scoped_css` contains selectors that don't start with `.ve-{role}`
- `scoped_css` redefines tokens (`:root { --bg: ... }`)
- `fonts_needed` includes a font not in the approved list (Geist Pixel variants, Doto, Space Grotesk, Space Mono)
- `libraries_needed` includes a library not in the supported list
- The whole response is not valid JSON

---

## Orchestrator responsibilities

1. **Plan the outline.** Decide section count and roles. Assign each section a `role` from the role table below.
2. **Decide fan-out.** If sections ≥ 3 and not `--no-parallel`, dispatch sub-agents.
3. **Dispatch in parallel.** Use a single message containing one `Task` tool-use per section. Each Task carries:
   - `subagent_type`: `ve-{role}-builder` (e.g., `ve-hero-builder`, `ve-diagram-builder`)
   - `prompt`: a self-contained brief — the section's content, the role, the index number `{{NN}}`, and a pointer to read `./references/tokens.md`, `./references/components.md`, and this file.
4. **Collect fragments.** Each sub-agent returns one JSON object. Parse them.
5. **Validate.** Reject any fragment that violates the rejection conditions. Re-dispatch with corrected brief if needed (max 1 retry per section).
6. **Stitch.**
   - Build `<head>`: meta tags, title, font preconnects, Google Fonts `<link>` for Space Grotesk + Space Mono. If any fragment's `fonts_needed` includes a Geist Pixel variant or Doto, add the corresponding `@font-face` block (or Google Fonts param) once. **Dedup.**
   - Build a single `<style>` block with: `:root` tokens (light), `@media (prefers-color-scheme: dark) { :root { ... } }` (dark), motion rules, then the concatenated `scoped_css` from every fragment in section order.
   - Build `<body><div class="page">…</div></body>`. Inside `.page`: orchestrator emits the metadata row (top), then concatenates `section_html` from every fragment in section order.
   - If any fragment has `libraries_needed` containing `"mermaid"`, add the Mermaid CDN import + the Mono-Industrial init script + the diagram-render loop that walks `.ve-diagram__source` and renders into the matching `.ve-diagram__canvas`. **Dedup.**
   - Substitute `{{NN}}` placeholders with section index (01, 02, 03, …) in left-to-right order.
7. **Write output.** Save to `~/.agent/diagrams/<descriptive-name>.html`.
8. **Browser-verify.** Per SKILL.md § 6 — Playwright MCP screenshot at desktop and mobile, console check, hierarchy check, no overflow.
9. **Tell the user the file path** and report which sub-agents fanned out.

---

## Role table

| Role | Sub-agent | Reads | Builds |
|---|---|---|---|
| `hero` | `ve-hero-builder` | tokens, components → "Hero number" | The single moment-of-surprise. Used at most once per page. |
| `diagram` | `ve-diagram-builder` | tokens, components → "Mermaid container", `./libraries.md` Mono-Industrial Mermaid theme | A single Mermaid diagram with full zoom/pan chrome. |
| `table` | `ve-table-builder` | tokens, components → "Data table" | A real `<table>` with sticky header, status colors on values. |
| `dashboard` | `ve-dashboard-builder` | tokens, components → "Module strip", "Segmented progress bar", "Bracketed system message" | KPI strip, instrument widgets, segmented bars. |
| `prose` | `ve-prose-builder` | tokens, components → "Lead paragraph", "Pull quote" | Lead paragraphs, callouts, pull quotes. **Must run `/unslop` on copy before returning.** |

If a section doesn't fit any role, the orchestrator builds it itself rather than inventing a new role. New roles require updating this contract.

---

## Stitching examples

**Font dedup.** If `ve-hero-builder` returns `fonts_needed: ["Geist Pixel Square"]` and `ve-dashboard-builder` returns `fonts_needed: []`, the orchestrator emits the Geist Pixel `@font-face` block exactly once. If two fragments both name the same Geist Pixel variant, it's still emitted once.

**Library dedup.** If three diagram sub-agents each return `libraries_needed: ["mermaid"]`, the orchestrator emits the Mermaid script tag and init code exactly once. Each diagram's source goes into its own `<script type="text/plain" class="ve-diagram__source" data-id="...">` block, and the init code walks every match.

**CSS dedup.** Sub-agents may legitimately repeat token-using CSS (e.g., two diagrams both styling `.ve-diagram__hint`). The orchestrator concatenates `scoped_css` blocks in order. Browser CSS deduplication handles the rest — last-rule-wins is acceptable because the rules are identical. Do not attempt to deduplicate at the rule level.

---

## Forbidden in sub-agent output

- `<style>`, `<script>`, `<link>`, `<head>` tags inside `section_html`
- Global selectors (`*`, `body`, `html`, `:root`) in `scoped_css`
- Element-level selectors without a `.ve-{role}` ancestor (`p { ... }`, `h1 { ... }`)
- Inline `style="..."` attributes — put it in `scoped_css`
- Token redefinitions (`--bg`, `--space-*`, etc.)
- Animations or transitions beyond the 120ms hover rule from `tokens.md`
- New colors, new fonts, new spacing values
- `prefers-color-scheme` media queries — the orchestrator publishes the dark theme once
- `@import` rules
- Calls to external APIs

If you need something the contract doesn't allow, return your best fragment with the constraint flagged in `notes`. The orchestrator decides whether to extend the contract or work around the limitation.
