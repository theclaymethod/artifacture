# Diagram Design integration receipt

Research snapshot only; no integration is implemented here.

## Source pin and confidence

- Repository: [`cathrynlavery/diagram-design`](https://github.com/cathrynlavery/diagram-design).
- `main` resolved on 2026-08-14 to [`a5e3978088cf89c7caff5c20cabd99fbc2a301de`](https://github.com/cathrynlavery/diagram-design/commit/a5e3978088cf89c7caff5c20cabd99fbc2a301de), authored `2026-08-14T05:34:14+03:00` / committed at the same instant as `2026-08-13T19:34:14-07:00`. `git ls-remote ... refs/heads/main` and the shallow checkout agreed on the SHA.
- Scope read at that pin: `SKILL.md`; all 27 `type-*.md` references; `semantic-patterns.md`; `animation.md`; `style-guide.md`; output/import/export references; static, motion, and terminal templates; example/gallery assets; extractors; self-check and repository verifiers/tests; `README.md`; `LICENSE`; `THIRD_PARTY_LICENSES.md`; and `SECURITY.md`.
- Verification at the pin was green: semantic routing and all four shipped motion files; 104 geometry targets; docs sync; packaged self-check adversarial tests; 102 skin targets with the upstream baseline; and accessibility/security adversarial tests. The upstream documents these gates and their coverage in its [README][upstream-tests].

Upstream supports security fixes only on the latest `main`, not on historical pins or forks. Pinning therefore gives reproducibility, but this repository would own monitoring and backport decisions after adoption. [Source][upstream-security-policy]

## License and attribution

Diagram Design is MIT-licensed, copyright 2025 Cathryn Lavery. Copying or substantially reproducing its documentation, scripts, templates, or assets is permitted, but the copyright and MIT permission notice must remain in all copies or substantial portions; the software is provided without warranty. [Source][upstream-license]

Recommended repository notice for copied/adapted material:

> Portions adapted from Diagram Design by Cathryn Lavery, copyright 2025 Cathryn Lavery, used under the MIT License. Upstream revision: `a5e3978088cf89c7caff5c20cabd99fbc2a301de`.

The current local attribution says both “MIT, Cocoon AI” and “© Cocoon AI” in [`diagrams-svg.md`](../../plugins/visual-explainer/references/diagrams-svg.md) lines 3–5 and 334–336. That conflicts with the pinned `LICENSE`; change the copyright holder to Cathryn Lavery when that file is next edited.

If icons are copied, also carry the applicable third-party notices: Tabler Icons, log-z/logos, and Devicon are MIT; Simple Icons is CC0; the SAS asset is public domain; the Stata asset has recorded IcePanel/techicons.dev provenance; and all product marks remain their owners’ trademarks with no implied endorsement. [Source][upstream-third-party]

Practical boundary: adapting ideas and writing fresh local examples minimizes copied-expression and third-party-asset obligations. Copying the icon gallery, generated SVG symbols, templates, or scripts requires preserving the upstream MIT notice; copying bundled icons also requires the relevant third-party notices.

## Exact routing model

The model is deliberately two-axis:

1. When behavior, state, enforcement, or risk is load-bearing, choose one primary semantic pattern.
2. Choose exactly one visual type as the layout grammar. A second semantic pattern may contribute at most one supporting primitive; otherwise split the figure.
3. Apply the stricter semantic-pattern and visual-type budget.
4. Load only the chosen type reference, plus semantic or motion references when routed. Static is the default.
5. Before drawing, state the chosen pattern/type, size preset, and planned cuts. [Sources][upstream-router] [composition rules][upstream-semantic-composition]

The exact 27-type set is:

| # | Visual type | Routing trigger |
|---:|---|---|
| 1 | Architecture | Components and connections in a system |
| 2 | IT current-state | Legacy landscape grouped by phase or department |
| 3 | Flowchart | Decision logic with branches |
| 4 | Sequence | Time-ordered messages between actors |
| 5 | State machine | States, transitions, and guards |
| 6 | ER / data model | Entities, fields, and relationships |
| 7 | Timeline | Events positioned in time |
| 8 | Swimlane | Cross-functional process and handoffs |
| 9 | Quadrant | Two-axis positioning or prioritization |
| 10 | Radar / Spider | Several entities across 3–5 quantitative criteria |
| 11 | Loop | A reinforcing cycle around one shared state hub |
| 12 | Nested | Hierarchy through containment or scope |
| 13 | Tree | Parent-to-child relationships |
| 14 | Org chart | Human/agent/team ownership, routing, or escalation |
| 15 | Layer stack | Stacked abstraction levels |
| 16 | Venn | Set overlap |
| 17 | Pyramid / funnel | Ranked hierarchy or conversion drop-off |
| 18 | Bar chart | Quantitative category comparison |
| 19 | Line chart | Continuous trend over time |
| 20 | Gantt | Tasks and phases on a timeline |
| 21 | Scatter plot | Distribution and correlation of two variables |
| 22 | High-Level | End-to-end data stack on a container cluster |
| 23 | Process | Multi-actor sequential workflow with data handoffs |
| 24 | Medallion | Multi-tier data storage, quality, and access policy |
| 25 | Data flow | Role-scoped pipeline steps |
| 26 | DP integration | Data-platform sources → core → consumers topology |
| 27 | DP security matrix | Per-role/per-component permissions |

This set and each routing trigger are canonical in the pinned selection table. [Source][upstream-types]

## Semantic patterns

Semantic patterns do not add visual types. Each supplies triggers, required primitives, a tighter budget, anti-patterns, a complete static fallback, and a nearest layout type. [Source][upstream-semantic]

| Pattern | Nearest type | Key budget |
|---|---|---|
| Fan-in queue / bottleneck | Data flow; Process if service stages dominate | ≤5 sources, ≤5 queue slots, one bottleneck, two outcomes, ≤9 primary nodes |
| Stage framework with semantic slots | Process; Swimlane only when rows are owners | 3–6 stages, 3–4 slot kinds, ≤20 populated cells, ≤2 lines/cell |
| Unstructured input → structured artifact | Data flow; Process for several gates | ≤4 exchanges, ≤6 fields, one transform, ≤3 provenance links |
| Paired policy-evaluation traces | Flowchart; Sequence only when actor timing is load-bearing | Exactly 2 traces, 3–6 rules, ≤12 status cells, one first divergence |
| Secure paved road | Architecture | ≤3 trust zones, ≤8 components, ≤10 paths, ≤2 forbidden paths, one privileged gate |
| Governance / control catalog | Layer stack; DP security matrix for role permissions | 3–5 surfaces, 3–7 controls/surface, ≤24 controls, ≤3 attributes/control |
| Compensating security layers | Layer stack; Nested for containment-first stories | 3–5 layers, one risk thread, ≤2 mitigations/layer, one residual-risk statement |

Important semantic rules worth adopting intact: queues show numeric count/capacity; policy states use explicit `PASS`/`FAIL`/`SKIPPED`/`NOT REACHED`; blocked paths visibly stop before a boundary; gaps and exceptions remain visible; residual risk never silently becomes zero; and color, position, or animation never carries the meaning alone. [Source][upstream-semantic]

## Budgets, precedence, and degrade ladder

The universal overview budget is 9 nodes, 12 arrows/transitions, 2 focal/accent elements, and 2 annotation callouts. Type caps include 5 sequence lifelines, 5 swimlanes, 12 quadrant items, 8 ER entities, depth 4 for tree/org charts, 12 org-chart nodes, 6 layer-stack or pyramid layers, 3 Venn circles, 5 radar axes/series with 1 focal series, 8 bars, 5 line series, 12 Gantt tasks, and 30 scatter points. Motion adds no semantic capacity: at most 8 steps, 12 marked items, and 2 simultaneous reveals. [Source][upstream-budgets]

For imports, the four dials are format, size, detail, and audience. Detail levels are `faithful` (≤24 nodes/≤32 edges, zoned), `balanced` (≤12/≤16), and `simplified` (≤7/≤9); audience changes wording, not count. Above 9 faithful nodes, zoning is mandatory; above 24, split into overview plus zone details. [Source][upstream-output-spec]

The fixed degrade ladder is:

1. Remove decorative cells and source chrome.
2. Merge exact duplicates (`Worker ×N`).
3. Collapse all-leaf clusters to their container.
4. Remove degree-1 sinks that do not change the story.
5. Remove cross-cutting infrastructure; at `balanced`, retain at most one only when germane.
6. If still over budget, split overview and detail.

Report steps 2–6 in a fidelity ledger. [Source][upstream-degrade]

Do not port the numbers without resolving two upstream inconsistencies:

- `SKILL.md` sets the generic ceiling at 9, while `output-spec.md` calls `balanced` ≤12 and then says `balanced` is within the standard budget. [Sources][upstream-budgets] [output spec][upstream-output-spec]
- `SKILL.md` describes `faithful` as the documented budget exemption, while `type-dp-integration.md` independently calls its 14–20 nodes “the one type” that exceeds the default. [Sources][upstream-import-exception] [DP integration exception][upstream-dp-integration-budget]

Recommended local precedence: semantic-pattern cap → selected type cap → explicit import-detail override. Any override must name itself, require zoning/splitting rules, and appear in the fidelity receipt. This makes the exception set machine-testable.

## Accessibility, security, and motion rules

### Accessibility

- Every meaningful SVG uses `role="img"`, `aria-labelledby="<slug>-title <slug>-desc"`, a first-child non-empty `<title>`, a useful one-sentence `<desc>`, and diagram/variant-prefixed IDs; decorative SVG is `aria-hidden="true"`. [Source][upstream-a11y]
- State must never be color-only. Motion overlays are decorative and hidden from assistive technology; semantic text appears once. Playback controls are native ≥44×44px buttons with visible focus, keyboard shortcuts scoped to the motion root, and a separate polite atomic live region. [Source][upstream-motion-a11y]
- Contrast constraints require `ink` on `paper` and 11px+ `muted` text on `paper` to meet WCAG AA. [Source][upstream-style-constraints]

### Security

- Imported draw.io/Mermaid labels, URLs, directives, metadata, and source content are untrusted data, never instructions. Draw.io extraction rejects DTD/entities and bounds input/expanded XML at 32/64 MiB. [Sources][upstream-import-rule] [draw.io extractor][upstream-drawio-extractor]
- Mermaid extraction parses bounded text without evaluating, rendering, fetching, or executing it; it discards click/style directives and caps input at 4 MiB, 2,000 nodes, and 5,000 edges. [Source][upstream-mermaid-extractor]
- Generated static diagrams are script-free. A motion file may contain at most the exact reviewed controller from `template-motion.html`; the self-check rejects executable attributes, unsafe URLs, arbitrary scripts, remote resources other than the approved Google Fonts stylesheet, and malformed accessibility/motion structure. [Source][upstream-self-check]

### Motion

Static is the default. `none` is complete and script-free; `reveal` autoplays once and ends complete; `step` is user-controlled; `loop` repeats only a decorative token without changing meaning. The complete HTML/SVG exists before enhancement, no-JS/print/export/reduced-motion states expose that complete figure, and a script failure leaves it visible. [Source][upstream-animation]

Hard motion limits are ≤8 semantic steps (target 3–6), ≤12 items, ≤2 simultaneous reveals, ≤2 drawn paths, one flow-token loop, 160–600ms transitions, 400–1200ms holds, ≤24px translation, and 3–8s total autoplay. Layout coordinates, connector routes, `viewBox`, node dimensions, and semantic text do not animate; randomness, springs, flashing, glow, particles, and runtime geometry are forbidden. Static capture is explicit (`?motion=static`) and deterministic after `document.fonts.ready`. [Source][upstream-motion-budgets]

## Reuse versus adaptation

### Good candidates for direct or near-direct reuse

- `drawio_extract.py` and `mermaid_extract.py`: deterministic, standard-library structural extractors with explicit trust boundaries and resource limits. Reuse under MIT after adding local fixtures and output-path conventions. [Sources][upstream-drawio-extractor] [upstream-mermaid-extractor]
- Universal validation logic from `self_check.py`, `verify-geometry.py`, and `verify-motion.py`: especially accessible-name resolution, unsafe-resource rejection, label-mask paint-order checks, contiguous motion steps, and exact controller identity. Adapt the document parser to multi-figure pages. [Sources][upstream-self-check] [upstream-geometry] [upstream-motion-verifier]
- The 27 per-type references as factual/layout source material and test vectors. Preserve their parametric math and type-specific exceptions, but translate styling and output ownership to local contracts. Upstream itself treats these as progressively loaded layout modules. [Source][upstream-progressive-loading]
- The semantic-pattern and degrade-ladder tables, with attribution and the budget-precedence fix above.

### Reference assets, not drop-in production assets

- `template.html`, `template-full.html`, `template-dark.html`, `template-terminal.html`, and `template-motion.html` own a standalone page shell and upstream token system. Use them as fixtures and controller/reference sources, not as visual-explainer page templates. [Source][upstream-templates]
- The 3×27 example gallery is excellent regression/reference material, but copying all examples would import stale skin assumptions and a large maintenance surface; upstream itself notes that pre-baked examples were produced under an earlier skin. [Sources][upstream-gallery] [upstream-style-guide]
- The 55-icon gallery is reusable only with the upstream and third-party notices. Prefer the existing local icon sourcing path unless a missing icon materially blocks a type. [Sources][upstream-icons] [upstream-third-party]
- The canonical motion controller should have exactly one local owner. Do not duplicate it in section fragments or multiple templates. [Source][upstream-canonical-controller]

### Concepts to adapt, not copy literally

- Semantic-first routing, progressive disclosure, pre-draw confirmation, strict connector geometry, accessible SVG naming, static-first motion, and fidelity ledgers.
- Keep this repository’s host-aesthetic token ownership and multi-section orchestration. Do not import upstream’s first-run mutation of a shared `style-guide.md` into an embedded page workflow.
- Keep route-approved CDN behavior for Mermaid pages, but apply upstream’s no-arbitrary-resource and inert-source rules to inline-SVG generation.

## Conflicts with the current repository

| Conflict | Current local contract | Upstream contract | Resolution |
|---|---|---|---|
| Type coverage | [`diagrams-svg.md`](../../plugins/visual-explainer/references/diagrams-svg.md) lines 3 and 61–79 exposes 13 SVG types | 27 types with per-type references [source][upstream-types] | Expand routing to all 27; keep detailed rules outside the universal file. |
| Routing axis | Local selection is type-only | Semantic pattern first when behavior/risk is load-bearing [source][upstream-router] | Add a semantic router before type selection. |
| SVG/Mermaid threshold | Local uses Mermaid at 15+ nodes and after two failed SVG repairs (`diagrams-svg.md` lines 253–261, 312–316) | Generic split at 9, import detail overrides, and no renderer-coordinate carryover [sources][upstream-budgets] [upstream-degrade] | Replace the single 15-node threshold with type/detail budgets and fidelity-ledger decisions; retain Mermaid only as an explicit route or last layout fallback. |
| Connector geometry | Local requires endpoint anchoring and elbows around obstacles but does not state the full six-rule contract (`diagrams-svg.md` lines 228–249) | Orthogonal off-axis paths; 6–10px label gap; no overlap; ≥12px fanned ports; no transit behind unrelated nodes except dashed exception; no label mask clipped by later nodes [source][upstream-connectors] | Port all six universal rules and type-specific exceptions; add machine checks where geometry is tractable. |
| Background | Local reference still presents the dot texture as the normal stack (`diagrams-svg.md` lines 214–220) | Clean paper is default; dots are opt-in and inappropriate inside product pages/slides/cards [source][upstream-background] | Align the reference with the concurrently updated [`svg-diagram-starter.html`](../../plugins/visual-explainer/templates/svg-diagram-starter.html) lines 160–186, which already makes dots optional and starts clean. |
| Aesthetic ownership | Local diagrams inherit the host page across named aesthetics (`diagrams-svg.md` lines 265–275; [`diagram-tokens.md`](../../plugins/visual-explainer/references/diagram-tokens.md)) | Upstream has one mutable style guide and a first-run brand gate [sources][upstream-style-guide] [upstream-style-gate] | Keep host tokens; map upstream semantic roles into them. Offer the upstream editorial skin only as an explicit aesthetic. |
| Native editorial tokens | Local Editorial-Diagram mapping uses the older warm-stone/rust values in `diagram-tokens.md` | Pinned upstream defaults are white-smoke/jet-black/atomic-tangerine [source][upstream-style-guide] | Either rename the local skin “legacy editorial” or update it to the pin; do not call both “native.” |
| Motion | [`tokens.md`](../../plugins/visual-explainer/references/tokens.md) lines 161–178 permits only ≤120ms interactive transitions and no on-load animation; [`section-contract.md`](../../plugins/visual-explainer/references/section-contract.md) lines 111–123 forbids longer fragment motion/scripts | Optional one-shot reveal and controlled step motion up to 8s [source][upstream-animation] | Preserve the global 120ms rule; create a narrowly scoped diagram-motion exception owned by the orchestrator. Fragments remain script-free. |
| Fragment schema | `section-contract.md` lines 42–54 and 87–95 models diagram sections as Mermaid sources and the role table still says Mermaid | Upstream emits inline SVG and optional root-scoped motion | Allow inline accessible SVG in `section_html`; add structured diagram metadata/motion declarations while keeping all CSS/script ownership in the shell. |
| Accessibility | The concurrently updated starter now uses prefixed `aria-labelledby` plus first-child `<title>/<desc>` (`svg-diagram-starter.html` lines 148–159), but the universal `diagrams-svg.md` checklist does not yet make that a contract | Accessible SVG naming is universal and linted [source][upstream-a11y] | Promote the starter behavior into the universal reference, quality gate, and automated self-check. |
| Resource policy | Local route-approved Mermaid and fonts use CDNs; page source safety rejects inline handlers and source-controlled scripts/styles ([`quality.md`](../../plugins/visual-explainer/references/quality.md) lines 5–25) | Static SVG is script-free; motion allows one exact controller; arbitrary remote assets and executable markup fail lint [source][upstream-self-check] | Keep approved shell libraries, but forbid fragment-level network resources and arbitrary scripts. |
| Attribution | Local claims “© Cocoon AI” | Pinned license says copyright 2025 Cathryn Lavery [source][upstream-license] | Correct the notice and pin the revision. |
| Automated gates | Local has browser screenshot QA but no shipped diagram structural/geometry/motion linter in `plugins/visual-explainer/scripts/` | Upstream ships self-check plus adversarial geometry, accessibility, motion, docs-sync, and import tests [source][upstream-tests] | Port the smallest high-value checks and wire them into package scripts/CI. |

## Concrete file-by-file integration recommendation

1. **[`plugins/visual-explainer/SKILL.md`](../../plugins/visual-explainer/SKILL.md)** — change the diagram route to: semantic-pattern selection (conditional) → one of 27 types → size/detail/audience → optional motion. Require the pre-draw type/pattern/size/cuts receipt.
2. **[`plugins/visual-explainer/references/diagrams-svg.md`](../../plugins/visual-explainer/references/diagrams-svg.md)** — make this the universal contract only: removal test, six connector rules, base budgets/precedence, accessible SVG, clean-paper default, static-first output, and corrected MIT attribution. Remove the 13 embedded mini-specs after per-type refs land.
3. **Add `plugins/visual-explainer/references/diagram-routing.md`** — exact 27-type trigger table, semantic-first decision, SVG/Mermaid decision, and progressive-loading matrix.
4. **Add `plugins/visual-explainer/references/diagram-semantic-patterns.md`** — adapt the seven patterns, primitives, budgets, static fallbacks, and one-primary-pattern rule.
5. **Add `plugins/visual-explainer/references/diagram-types/type-{architecture,it-state,flowchart,sequence,state,er,timeline,swimlane,quadrant,radar,loop,nested,tree,org-chart,layers,venn,pyramid,bar,line,gantt,scatter,high-level,process,medallion,data-flow,dp-integration,dp-security-matrix}.md`** — adapt each upstream layout module; replace raw upstream colors/fonts with local semantic tokens; preserve parametric formulas and document every connector exception.
6. **Add `plugins/visual-explainer/references/diagram-output-spec.md`** — port size/detail/audience dials, fixed degrade ladder, and fidelity ledger; resolve the 9/12/14–20 precedence conflicts explicitly.
7. **Add `plugins/visual-explainer/references/diagram-motion.md`** — static-first modes and accessibility contract, scoped under `[data-motion-root]`; state that global page motion remains governed by `tokens.md`.
8. **[`plugins/visual-explainer/references/diagram-tokens.md`](../../plugins/visual-explainer/references/diagram-tokens.md)** — keep host-aesthetic mappings, add chart series roles, reconcile the pinned native editorial palette, and document that clean paper is default.
9. **[`plugins/visual-explainer/references/tokens.md`](../../plugins/visual-explainer/references/tokens.md)** — add one explicit, opt-in diagram-motion exception pointing to `diagram-motion.md`; do not weaken the page-wide 120ms/no-on-load default.
10. **[`plugins/visual-explainer/references/section-contract.md`](../../plugins/visual-explainer/references/section-contract.md)** — let the diagram role return inline accessible SVG plus `diagram_meta` (type, pattern, size, detail, motion mode, fidelity cuts). Keep `<script>`, global CSS, token redefinition, and network calls forbidden in fragments; the orchestrator deduplicates one approved controller if needed.
11. **[`plugins/visual-explainer/templates/svg-diagram-starter.html`](../../plugins/visual-explainer/templates/svg-diagram-starter.html)** — preserve the concurrent prefixed-ID/accessibility and clean-background fixes; add a canonical orthogonal elbow, a label with visible connector gap, and comments pointing to the six-rule contract.
12. **Add `plugins/visual-explainer/templates/svg-diagram-motion.html` only if motion is approved** — one canonical shell-owned controller, no per-type copies.
13. **[`plugins/visual-explainer/references/libraries.md`](../../plugins/visual-explainer/references/libraries.md)** — replace the 10–12/15+ informal Mermaid thresholds with the new type/detail precedence; keep Mermaid for explicit requests, unsupported automatic-layout needs, or the bounded repair fallback.
14. **[`plugins/visual-explainer/references/quality.md`](../../plugins/visual-explainer/references/quality.md)** — add resolving `aria-labelledby`, first-child title/desc, unique ID, no-color-only state, connector geometry, no-JS/static capture, reduced-motion, print, and fidelity-ledger checks.
15. **[`plugins/visual-explainer/commands/generate-web-diagram.md`](../../plugins/visual-explainer/commands/generate-web-diagram.md)** — emit the pre-draw routing receipt and post-draw fidelity ledger; pass type/pattern metadata through fan-out prompts.
16. **Add `plugins/visual-explainer/scripts/diagram-self-check.py`** — adapt upstream `self_check.py` for multiple figures and the local approved-CDN policy.
17. **Add `plugins/visual-explainer/scripts/verify-diagram-geometry.py` and `test-verify-diagram-geometry.py`** — port label-mask paint-order checks first; add connector overlap/port checks only where deterministic and testable.
18. **Add `plugins/visual-explainer/scripts/verify-diagram-motion.py` and `test-verify-diagram-motion.py`** — enforce one controller, budgets, complete source, scoped controls/status, reduced motion, print/static states, and deterministic capture.
19. **Optionally add `drawio-extract.py` and `mermaid-extract.py` under the plugin scripts directory** — near-direct MIT reuse with local naming and adversarial fixtures; do not execute source diagrams.
20. **[`package.json`](../../package.json)** — wire the new self-check, geometry, motion, docs-sync, and adversarial tests into the repository’s verification command.
21. **[`README.md`](../../README.md), [`CHANGELOG.md`](../../CHANGELOG.md), and a new `THIRD_PARTY_NOTICES.md` only if copied assets/scripts land** — record the pinned source, corrected Cathryn Lavery notice, MIT text/location, and any icon-specific licenses/trademark note.

## Recommended integration order

Land static structure first: attribution → router/semantic patterns → universal connector/accessibility contract → per-type refs → output dials/degrade ledger → starter and section contract → automated static gates. Treat import extractors and motion as separate follow-ups. This avoids weakening the current security and fragment boundaries while the static diagram contract is still moving.

[upstream-license]: https://github.com/cathrynlavery/diagram-design/blob/a5e3978088cf89c7caff5c20cabd99fbc2a301de/LICENSE#L1-L21
[upstream-third-party]: https://github.com/cathrynlavery/diagram-design/blob/a5e3978088cf89c7caff5c20cabd99fbc2a301de/THIRD_PARTY_LICENSES.md#L1-L43
[upstream-security-policy]: https://github.com/cathrynlavery/diagram-design/blob/a5e3978088cf89c7caff5c20cabd99fbc2a301de/SECURITY.md#L1-L35
[upstream-router]: https://github.com/cathrynlavery/diagram-design/blob/a5e3978088cf89c7caff5c20cabd99fbc2a301de/skills/diagram-design/SKILL.md#L69-L127
[upstream-types]: https://github.com/cathrynlavery/diagram-design/blob/a5e3978088cf89c7caff5c20cabd99fbc2a301de/skills/diagram-design/SKILL.md#L85-L123
[upstream-semantic]: https://github.com/cathrynlavery/diagram-design/blob/a5e3978088cf89c7caff5c20cabd99fbc2a301de/skills/diagram-design/references/semantic-patterns.md#L1-L115
[upstream-semantic-composition]: https://github.com/cathrynlavery/diagram-design/blob/a5e3978088cf89c7caff5c20cabd99fbc2a301de/skills/diagram-design/references/semantic-patterns.md#L117-L122
[upstream-budgets]: https://github.com/cathrynlavery/diagram-design/blob/a5e3978088cf89c7caff5c20cabd99fbc2a301de/skills/diagram-design/SKILL.md#L341-L390
[upstream-output-spec]: https://github.com/cathrynlavery/diagram-design/blob/a5e3978088cf89c7caff5c20cabd99fbc2a301de/skills/diagram-design/references/output-spec.md#L1-L99
[upstream-degrade]: https://github.com/cathrynlavery/diagram-design/blob/a5e3978088cf89c7caff5c20cabd99fbc2a301de/skills/diagram-design/references/output-spec.md#L101-L163
[upstream-import-exception]: https://github.com/cathrynlavery/diagram-design/blob/a5e3978088cf89c7caff5c20cabd99fbc2a301de/skills/diagram-design/SKILL.md#L525-L551
[upstream-dp-integration-budget]: https://github.com/cathrynlavery/diagram-design/blob/a5e3978088cf89c7caff5c20cabd99fbc2a301de/skills/diagram-design/references/type-dp-integration.md#L372-L385
[upstream-connectors]: https://github.com/cathrynlavery/diagram-design/blob/a5e3978088cf89c7caff5c20cabd99fbc2a301de/skills/diagram-design/SKILL.md#L262-L286
[upstream-background]: https://github.com/cathrynlavery/diagram-design/blob/a5e3978088cf89c7caff5c20cabd99fbc2a301de/skills/diagram-design/SKILL.md#L217-L237
[upstream-a11y]: https://github.com/cathrynlavery/diagram-design/blob/a5e3978088cf89c7caff5c20cabd99fbc2a301de/skills/diagram-design/SKILL.md#L543-L562
[upstream-style-guide]: https://github.com/cathrynlavery/diagram-design/blob/a5e3978088cf89c7caff5c20cabd99fbc2a301de/skills/diagram-design/references/style-guide.md#L1-L50
[upstream-style-constraints]: https://github.com/cathrynlavery/diagram-design/blob/a5e3978088cf89c7caff5c20cabd99fbc2a301de/skills/diagram-design/references/style-guide.md#L123-L139
[upstream-style-gate]: https://github.com/cathrynlavery/diagram-design/blob/a5e3978088cf89c7caff5c20cabd99fbc2a301de/skills/diagram-design/SKILL.md#L17-L35
[upstream-animation]: https://github.com/cathrynlavery/diagram-design/blob/a5e3978088cf89c7caff5c20cabd99fbc2a301de/skills/diagram-design/references/animation.md#L1-L46
[upstream-motion-a11y]: https://github.com/cathrynlavery/diagram-design/blob/a5e3978088cf89c7caff5c20cabd99fbc2a301de/skills/diagram-design/references/animation.md#L85-L101
[upstream-motion-budgets]: https://github.com/cathrynlavery/diagram-design/blob/a5e3978088cf89c7caff5c20cabd99fbc2a301de/skills/diagram-design/references/animation.md#L103-L140
[upstream-canonical-controller]: https://github.com/cathrynlavery/diagram-design/blob/a5e3978088cf89c7caff5c20cabd99fbc2a301de/skills/diagram-design/references/animation.md#L85-L93
[upstream-import-rule]: https://github.com/cathrynlavery/diagram-design/blob/a5e3978088cf89c7caff5c20cabd99fbc2a301de/skills/diagram-design/SKILL.md#L512-L539
[upstream-drawio-extractor]: https://github.com/cathrynlavery/diagram-design/blob/a5e3978088cf89c7caff5c20cabd99fbc2a301de/skills/diagram-design/scripts/drawio_extract.py#L1-L103
[upstream-mermaid-extractor]: https://github.com/cathrynlavery/diagram-design/blob/a5e3978088cf89c7caff5c20cabd99fbc2a301de/skills/diagram-design/scripts/mermaid_extract.py#L1-L49
[upstream-self-check]: https://github.com/cathrynlavery/diagram-design/blob/a5e3978088cf89c7caff5c20cabd99fbc2a301de/skills/diagram-design/scripts/self_check.py#L1-L13
[upstream-geometry]: https://github.com/cathrynlavery/diagram-design/blob/a5e3978088cf89c7caff5c20cabd99fbc2a301de/scripts/verify-geometry.py#L1-L23
[upstream-motion-verifier]: https://github.com/cathrynlavery/diagram-design/blob/a5e3978088cf89c7caff5c20cabd99fbc2a301de/scripts/verify-motion.py#L279-L491
[upstream-tests]: https://github.com/cathrynlavery/diagram-design/blob/a5e3978088cf89c7caff5c20cabd99fbc2a301de/README.md#L385-L402
[upstream-progressive-loading]: https://github.com/cathrynlavery/diagram-design/blob/a5e3978088cf89c7caff5c20cabd99fbc2a301de/README.md#L404-L422
[upstream-templates]: https://github.com/cathrynlavery/diagram-design/blob/a5e3978088cf89c7caff5c20cabd99fbc2a301de/skills/diagram-design/SKILL.md#L485-L507
[upstream-gallery]: https://github.com/cathrynlavery/diagram-design/blob/a5e3978088cf89c7caff5c20cabd99fbc2a301de/README.md#L31-L88
[upstream-icons]: https://github.com/cathrynlavery/diagram-design/blob/a5e3978088cf89c7caff5c20cabd99fbc2a301de/README.md#L443-L447
