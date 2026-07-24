# SVG Diagrams — Editorial-Grade Inline SVG

**The primary diagram approach.** For the 13 supported diagram types, generate pure inline SVG with no JS dependencies. Mermaid stays available as a fallback for graphs with 15+ nodes where auto-layout beats hand-authored coordinates.

This reference is a paraphrased port of the rules and primitives from [cathrynlavery/diagram-design](https://github.com/cathrynlavery/diagram-design) (MIT, Cocoon AI), adapted to fit inside an aesthetic-aware skill. Original rules by Cathryn Lavery; adaptation here preserves the philosophy and prescriptions while integrating with this skill's token system.

---

## Philosophy

The best diagrams are done when nothing can be removed, not when everything has been added. Deletion is the highest-quality move.

- **Target density: 4/10.** Visually complete, not overwhelming. If a node can be removed without losing comprehension, remove it. If two nodes always travel together, merge them.
- **Confident restraint.** One accent color. One or two uses per diagram. One focal element.
- **Shape carries meaning, not color.** Flowchart ovals mean start/end, rects mean steps, diamonds mean decisions. Color is reserved for focal emphasis, not taxonomy.
- **Hairlines over shadows.** Shadows signal "web app"; hairline borders signal "figure in a magazine."
- **Honest proportions.** Timeline intervals space by real time. Funnel widths match real conversion. Venn circle sizes track real cardinality.

---

## The Removal Test — Pre-Output Gate

The Removal Test runs BEFORE emit; the Screenshot QA Gate (§ below) runs AFTER emit. Both are mandatory.

Run this checklist before emitting any SVG diagram. If any answer is "no," the diagram is not ready.

**Type fit**
- [ ] Does the chosen diagram type actually match the content? (See § Type Selection Gate.)
- [ ] Would a paragraph explain this better? (If yes, write the paragraph.)

**Removal**
- [ ] Can any node be removed without losing comprehension?
- [ ] Can any two nodes that always travel together be merged?
- [ ] Can any arrow be removed because the layout already implies direction?

**Signal (the focal rule)**
- [ ] Is the accent color used on ≤ 2 elements?
- [ ] Is there exactly one focal element (the place the eye should land first)?
- [ ] Are non-focal elements intentionally quieter?

**Technical**
- [ ] Are arrows drawn before nodes in z-order (so nodes sit on top of lines)?
- [ ] Is every arrow endpoint computed from its node's bounding box with a 6–10px air gap (never placed by eye, never landing inside a node)?
- [ ] Does every arrow label have an opaque paper-colored rect behind it (so it doesn't collide with strokes)?
- [ ] Is the legend a horizontal strip at the bottom of the SVG (never floating inside)?
- [ ] Is there no vertical `writing-mode` text on arrows?
- [ ] Has the SVG `viewBox` height been expanded by ~60px to make room for the legend?

**Typography**
- [ ] Are node names in the sans face (not monospace)?
- [ ] Is monospace used only for technical content (ports, types, URLs, arrow labels, eyebrow kicker)?
- [ ] Is JetBrains Mono absent from the diagram?

**Grid**
- [ ] Is every coordinate, font size, width, and gap divisible by 4? (Exemptions: stroke widths, opacity, the dot-pattern spacing of 22.)

If all boxes check, emit. Otherwise, iterate.

---

## Type Selection Gate

Before any SVG is authored, pick exactly one diagram type using this table.

| Content shape | Type |
|---|---|
| Components with visible connections | Architecture |
| Decision branches / conditional flow | Flowchart |
| Time-ordered messages between actors | Sequence |
| States with transitions and guards | State machine |
| Entities with typed fields and relationships | ER |
| Events placed in time | Timeline |
| Cross-functional process with handoffs across roles | Swimlane |
| Two-axis positioning / prioritization | Quadrant |
| Hierarchy through containment | Nested |
| Parent → children hierarchy | Tree |
| Stacked abstraction levels | Layer stack |
| Overlap between sets | Venn |
| Ranked hierarchy / conversion / drop-off | Pyramid / funnel |

**Anti-selection criteria — don't draw a diagram when:**

- A 3-column table says the same thing with less effort.
- The diagram is one generic shape with a label (write the sentence).
- A bulleted list conveys the same information.
- The content mixes two types (pick the dominant axis; if you can't, split into two diagrams).

---

## Universal Anti-Patterns

These patterns look AI-generated the second a designer sees them. Avoid every one.

| Anti-pattern | Why it fails |
|---|---|
| Dark mode + cyan/purple glow | Reads as neon-dashboard AI slop |
| JetBrains Mono as a blanket body font | Mono is for technical content only |
| Identical boxes for every node | Erases visual hierarchy |
| Legend floating inside the diagram | Must live as a horizontal strip at the bottom |
| Arrow labels without a masking rect | Text bleeds into strokes; becomes unreadable |
| Vertical `writing-mode` text on arrows | Unreadable at any size |
| Three equal-width summary cards | Too generic; vary widths |
| `box-shadow` on nodes | Use 1px hairline borders instead |
| `rounded-2xl` (16px radius) | Use 4–8px or none |
| Accent color on every "important" node | Erases focal signal |
| `background-clip: text` gradients on titles | AI slop signature |

---

## Complexity Budgets — Split the Diagram Before You Exceed These

If any budget is about to be blown, split the content into two smaller diagrams or collapse to a table.

| Type | Maximum |
|---|---|
| Generic nodes | 9 |
| Arrows / transitions | 12 |
| Focal (accent) elements | 2 |
| Sequence lifelines | 5 |
| Swimlane lanes | 5 |
| Quadrant items | 12 |
| ER entities | 8 |
| Nested containment levels | 6 |
| Tree depth | 4 (and ≤ 5 children per level) |
| Layer stack layers | 6 |
| Venn circles | 3 (4+ becomes a matrix) |
| Pyramid layers | 6 |
| Annotation callouts | 2 |

---

## Per-Type Rules

### 1. Architecture
Group nodes by tier or trust boundary. Consistent flow direction (L→R or T→B, not both). Mark regions with dashed rectangles; boundary labels sit on a small masked rect where they cross the border. Focal color lives on 1–2 critical integration points.

### 2. Flowchart
Shape carries meaning, not color:
- Oval (`rx=20`) — start / end
- Rectangle (`rx=6`) — step
- Diamond — decision (≤ 3 exits; nest diamonds if more)
- Filled dot (`r=4`) — merge point

Vertical flow. "Yes" → right, "No" → down, and **label every edge**. Accent on the happy path OR the most consequential decision — not every decision. Crossing arrows: use a small arc-jump.

### 3. Sequence
Actors in boxes at the top. Vertical dashed lifelines down the page. Horizontal message arrows. Time flows down, never up. Activation bars 8px wide with muted fill and 0.8 stroke. Self-messages are U-loops. Return arrows are dashed. Accent on the primary success response only (one or two max). No lane-style rendering (that's Swimlane, not Sequence). No unclosed activations.

### 4. State machine
Rounded rects (`rx=8`) for states. Start = filled dot (`r=6`). End = ringed dot. Transition labels use the pattern `event [guard] / action`. Self-loops arc above the node. Never draw "from any state" lines from every state — annotate once in prose or with a single global transition. If transitions exceed 2× state count, split into two state machines.

### 5. ER
Two-part entity: header (type tag + name) + field list. `#` marks the PK. `→` marks an FK. Cardinality (`1`, `N`, `0..1`, `1..*`) placed 10–12px from the connecting edge. Cluster related entities; don't draw every FK on a huge model. Accent on the aggregate root.

### 6. Timeline
Horizontal hairline baseline. Ticks at meaningful intervals with monospace date labels. Events as dots. Event labels alternate above and below the baseline with thin connector lines to their dots. **Time scale must be honest** — unequal intervals get unequal spacing. Break the axis visibly when density demands it.

### 7. Swimlane
One lane per actor. Lane labels in the eyebrow style (mono, small, UPPERCASE, 0.18em tracking) in the left margin. 1px hairline dividers between lanes. Accent on high-impact boundary-crossing handoffs. Never assign one step to two lanes.

### 8. Quadrant
Centered axis cross. Axis labels at axis **ends**, not midpoints. Items as dots (`r=4`) with text labels. Accent on the "do first" item (top-right). ~12 items max. Never place items on axis lines. Never fill the four quadrants with different colors.

### 9. Nested
3–5 concentric rounded rects. Horizontal padding 24–32px. Vertical padding 32–36px. Eyebrow label top-left on a small masked overlay across the ring. Stroke opacity escalates inward (0.30 → 0.45 → accent innermost). Fill opacity fades from 0.015 outer to accent-tinted inner. Accent on the innermost focal ring only.

### 10. Tree
Root at top (or left). Nodes sized 120–180w × 40–52h. Name in sans 12px/600, optional sublabel in mono 9px. **Connectors are orthogonal (elbow-style), never diagonal.** Max depth 4, max 5 children per level. Accent on one node only: either the root or a critical leaf, not both.

### 11. Layer stack
4–6 horizontal bands, each 56–72px high, 800–880px wide inside a 1000 viewBox. Row content left-to-right: mono index · layer name (sans 600) · contextual note. Fills alternate subtle shades OR all-paper with hairline dividers. Accent on the "bottleneck / pays-rent" layer. Direction indicator (arrow glyph) outside the left margin.

### 12. Venn
2 or 3 circles (never 4). Hairline 1px strokes in set-specific colors. Fills are very-low-opacity rgba versions of the same colors. Set names outside circles. Intersection terms inside. One accent overlap = focal. Circle sizes proportional to cardinality, not fake-equal.

### 13. Pyramid / funnel
4–6 layers, each 56–72px tall. **Widths must be honest** (proportional to count or percentage). Centered name in sans 600 per layer, optional sublabel and optional side annotation. Accent on the apex (pyramid) or the conversion layer (funnel), never the base. No mixed orientations — pick pyramid up or funnel down and commit.

---

## Primitives

Two accent primitives lift a diagram from "fine" to "editorial."

### Annotation callout
Italic serif + dashed leader line + landing dot. Signals "editorial voice" against the diagram's sans/mono body. Max 2 per diagram. Leader is **dashed only** (solid risks confusion with flow arrows). Placement in margins only; never overlaps content. Neutral callouts use ink text + 40% opacity leader. Focal callouts use the accent color for both text and leader.

```
┌─────────────────────────────┐
│  [node]  ┄┄┄┄┄┄┄┄● Italic serif annotation
│                     text
└─────────────────────────────┘
```

### Sketchy filter
SVG `feTurbulence` + `feDisplacementMap` to produce a wobbly, hand-drawn feel. **Critical rule: filter shapes, not text.** Displacement-mapped text becomes illegible; text sits in an unfiltered group above. Parameters:
- `baseFrequency` 0.01–0.04
- `numOctaves` 1–3 (2 typical)
- `scale` 1–6
- `seed` set for deterministic output

Use for narrative / essay contexts; skip for technical docs, dense labels, and dark backgrounds.

---

## Technical Implementation

### Machine-checkable tagging

Every emitted SVG diagram element that represents semantic diagram content must carry `data-diagram-role` with one of these values: `node`, `arrow`, `arrow-label`, `legend`, `lifeline`, `step`, `decision`, `merge`, `entity`, `lane`, `layer`, `ring`, or `item`. Use this attribute for counting and classification. Never use a class named `node`; Mermaid owns `.node`.

```xml
<g data-diagram-role="node"><rect x="80" y="160" width="160" height="80" rx="6" /></g>
<path data-diagram-role="arrow" d="M 240 200 L 400 200" marker-end="url(#arrow)" />
<g data-diagram-role="arrow-label"><text x="320" y="200">batch</text></g>
```

### File shape
One self-contained `.html` file per diagram. Inline SVG. Google Fonts `<link>` is the only external reference (unless the active aesthetic bundles its fonts differently — see `diagram-tokens.md`).

### viewBox
Typical canvas is `1000 × 600`. Add ~60px of height reserved for a bottom legend strip.

### Background stack
```xml
<rect width="100%" height="100%" fill="var(--paper)" />
<rect width="100%" height="100%" fill="url(#dots)" opacity="0.55" />
```

The dot pattern gives the canvas editorial texture. Pattern cell 22×22; a 0.9-radius circle at 10% ink opacity.

### Arrow markers
Define three markers in `<defs>`:
- `arrow` — muted ink (default flow)
- `arrow-accent` — focal color
- `arrow-link` — link blue (only used for cross-references)

### Z-order
Draw arrows first, nodes second. This is a hard rule. Nodes must sit on top of lines, not the other way around.

### Arrow endpoint anchoring
Arrows terminate at the **outer edge** of a node's bounding box, never at its center, never at an arbitrary offset that happens to land inside the node. A 6–10px air gap between arrowhead tip and node border keeps the arrow visually detached from the border stroke.

Compute endpoints from the node's own geometry, not by eyeballing coordinates:

- **Rect node at `(x, y, w, h)`** → right-edge anchor is `(x + w + gap, y + h/2)`; left-edge anchor is `(x - gap, y + h/2)`; top/bottom mirror this.
- **Diamond node centered at `(cx, cy)` with half-width `hw`, half-height `hh`** → right tip is `(cx + hw + gap, cy)`; bottom tip is `(cx, cy + hh + gap)`.
- **Ellipse/pill** → project from center along the connector angle to the ellipse boundary, then add `gap`.

Tag the relationship so browser verification checks the rendered geometry, including
CSS/SVG coordinate transforms:

```html
<polyline
  data-diagram-role="arrow"
  data-diagram-target="review-queue"
  data-diagram-target-anchor="left-center"
  points="..."
/>
<g data-diagram-role="node" data-diagram-id="review-queue">...</g>
```

Use `left-center`, `right-center`, `top-center`, or `bottom-center` only when the
connector is meant to hit the midpoint of that edge. Omit the anchor attribute for
intentional off-center entry points; the air-gap and inside-node checks still run.

If the arrow must route around a sibling node, add an orthogonal elbow (one or two right-angle segments) rather than letting a diagonal segment graze other nodes. An arrow that originates or terminates **visually inside** any node — its own or a neighbor — is a routing bug, not a styling choice.

### Arrow label masking
Every arrow label is preceded by a small `<rect>` filled with the paper color, slightly larger than the label's bounding box. Prevents the label from colliding with the stroke it sits on.

### Legend
A horizontal strip at the bottom of the viewBox, separated from the diagram body by a hairline rule (`stroke="var(--rule)"`). Never float legends inside the diagram body.

### 4px grid
Every coordinate, font size, width, height, and gap is divisible by 4. Stroke widths, opacity values, and the 22×22 dot pattern are the only exemptions.

---

## Decision: SVG vs Mermaid

Pure SVG is the default for all 13 supported types. Mermaid remains available as a fallback when:

- The graph has 15+ nodes and manual coordinate authoring would be impractical.
- The content is a forest of one type (all nodes identical shape) where Mermaid's auto-layout produces cleaner results than hand-placed coordinates would.
- The user explicitly requests Mermaid.

When using Mermaid, follow all rules in `libraries.md` → Mermaid Theming and apply the same anti-patterns list above. Even Mermaid should obey the focal rule, the masking rule, and the 4px grid.

---

## Aesthetic Token Adaptation

A diagram renders inside a page. Fonts and colors come from whichever aesthetic the host page uses. See `diagram-tokens.md` for the per-aesthetic token mapping:

- Inside Mono-Industrial → Space Grotesk + Space Mono, grayscale with status colors as focal
- Inside Editorial-Diagram (the diagram-design native aesthetic) → Instrument Serif + Geist + Geist Mono, rust/coral accent
- Inside Blueprint → deep slate + cyan grid, monospace labels
- Inside other named aesthetics → inherit host tokens, preserve shape semantics and the 4px grid

Shape semantics, the 4px grid, arrow-label masking, z-order, complexity budgets, and the removal test are **aesthetic-independent** and apply to every diagram in every aesthetic.

---

## Screenshot QA Gate — Post-Generation Verification

The Removal Test (above) runs BEFORE emit. The Screenshot QA Gate runs AFTER emit. Both are mandatory — a clean file write is not a green signal. Inline SVG regularly looks correct in source and ships broken: leader lines land in empty whitespace, arrow labels collide with strokes, density forces overlapping text, and none of it surfaces until the page is actually rendered.

### When to run

After authoring ANY inline-SVG diagram (all 13 supported types), open the rendered output in a browser and capture a **per-figure screenshot** before reporting the diagram as done. If the host page contains multiple figures, screenshot each one individually (scroll the figure into view or screenshot its element). A full-page screenshot alone is not sufficient — individual figures need individual inspection.

### Playwright MCP flow (same tool set as SKILL.md § 6 Verify in a Browser)

1. If `file://` is blocked in the local environment, serve the host directory via `python3 -m http.server <port> --directory <root>` and navigate to `http://localhost:<port>/<path>`.
2. `browser_navigate` to the rendered page.
3. `browser_resize` to `1440 × 900` (desktop editorial reading width).
4. For each figure: scroll it into view via `browser_evaluate` (`element.scrollIntoView({block:'start'})`) then `browser_take_screenshot` with a descriptive `filename` (e.g. `fig01-architecture.png`).
5. `browser_console_messages` to catch JS errors (font 404s, Mermaid parse errors if a hybrid page).

### Per-figure checks (the LLM reads the screenshot)

For every figure, verify:

- **Annotation callouts: leader must visibly connect text to its target node.** Never float to empty whitespace. The leader ends at a landing dot, and the callout text reads continuously from that dot (or sits immediately adjacent). If the leader lands far from the text, or the text sits visually detached below/above an orphan dot, the callout has failed its primitive contract and must be repaired.
- **Arrow labels sit on paper-colored masking rects**, not on bare strokes. No collision between label glyphs and the arrow they label.
- **Arrow endpoints land in the air gap outside each node's border**, never inside the node's text box. Trace every arrow from tail to head: if the stroke passes through a node's name, sublabel, or eyebrow kicker (including the source node's own label), the endpoint is wrong — repair with the Arrow endpoint anchoring rule above.
- **Bottom horizontal legend strip**, separated from the diagram body by a hairline rule (`var(--rule)`). Legend items match what is actually drawn above — no ghost items, no missing items.
- **≤ 2 accent uses per diagram.** Accent lives on exactly one focal element plus at most one supporting cue (e.g., the happy-path arrow).
- **Z-order: arrows drawn before nodes.** Nodes sit on top of lines, not the other way around. If you see an arrowhead covering a node label, z-order is wrong.
- **No clipping, no overflow, no overlapping text.** All text stays inside its container. Leader curves do not pass through unrelated labels (e.g. a callout leader crossing a percentage rail label is a collision).
- **Every coordinate divisible by 4** (except stroke widths, opacity values, and the 22×22 dot pattern). Run a quick grep on the emitted SVG for non-multiple-of-4 coordinates if the visual review finds misalignment.
- **Shape semantics respected.** Flowcharts use ovals (start/end), rects (steps), diamonds (decisions), dots (merges). Sequence uses lifelines + activation bars. Swimlane uses eyebrow lane labels in the left margin.
- **Funnel widths honest to proportions.** Layer widths are proportional to the real percentages, not eyeballed-equal.
- **Quadrant axis labels at axis ENDS, not midpoints.** `LOW COST`/`HIGH COST` pin to the left/right tips of the X axis; `LOW IMPACT`/`HIGH IMPACT` pin to the bottom/top of the Y axis.
- **No console errors.** `browser_console_messages` should be empty or only expected warnings.

### Repair loop — bounded at 2 attempts

1. **Attempt 1** — fix in-place by editing the SVG source. Re-screenshot. If all checks pass, done.
2. **Attempt 2** — if issues remain, make one more targeted repair pass (reroute leaders around obstacles, enlarge masks, swap colliding labels to a different anchor, reduce density by removing nodes). Re-screenshot.
3. **If the second attempt still has unresolved issues, REPLACE that figure with Mermaid.** This is the documented fallback for "hand-authored SVG can't produce a clean layout at this density." Use Mermaid `theme: 'base'` with custom `themeVariables` mapped to the active aesthetic's tokens (see `diagram-tokens.md` for the per-aesthetic mapping). Include the Mermaid CDN, wrap in the `diagram-shell` / `mermaid-wrap` pattern from `templates/mermaid-flowchart.html` so zoom controls work, and re-screenshot to confirm the swap renders cleanly.

### Common repairs

| Failure mode | Fix |
|---|---|
| Leader lands in empty whitespace | Reroute the path so it terminates at a landing dot adjacent to the callout text. Prefer approaching the dot from a direction that keeps the last segment short. |
| Leader crosses another node or label | Reroute via a control point that takes the curve around the obstacle. Start from a different edge of the source node (bottom/side) if needed. |
| Arrow passes through a node's text (its own or a neighbor's) | Recompute the endpoint from the node's bounding box with a 6–10px air gap (see Arrow endpoint anchoring). Never set arrow `x`/`y` by eye — derive them from the node's `x + w` / `x - gap` / `y + h/2`. If the source and target overlap on the chosen axis, add an orthogonal elbow so no segment grazes another node's body. |
| Label colliding with arrow stroke | Enlarge the masking `<rect>` behind the label. Mask width should exceed the glyph bounds by ~4px each side. |
| Legend lists an item not in the diagram | Remove the legend entry, or add the missing element to the diagram body. |
| Density forces overlapping text | Drop a node per the Removal Test, or split into two diagrams. If neither is acceptable, escalate to Mermaid. |
| Funnel widths look eyeballed-equal | Recompute widths from the real percentages; layer 5 at 72% → width = 800 × 0.72 = 576, x = 500 − 288 = 212. |

The Screenshot QA Gate closes the loop that the Removal Test opens: the pre-emit gate catches design errors, the post-emit gate catches rendering errors.

---

## Attribution

This reference paraphrases and adapts the rules and philosophy from [cathrynlavery/diagram-design](https://github.com/cathrynlavery/diagram-design) (MIT License, © Cocoon AI). The original skill covers the same 13 diagram types with a fixed editorial aesthetic. This skill integrates those rules with an aesthetic-aware token system so the same rules apply regardless of the surrounding page's visual identity.
