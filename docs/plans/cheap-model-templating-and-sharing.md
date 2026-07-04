# Plan: Cheap-Model Templating + Team Sharing

Author: Fable (session 2026-07-04). Implementation: Codex. Adversarial verify: Opus. Final check: Fable.
Grounded in measured analysis of sideshow (token economics), sharehtml (deployment), and this repo
(read/emit audit). Numbers below are measured, not estimated (see scratchpad econ-analysis.json).

## Problem, quantified

- Read cost per common flow today: web-diagram ≈ 62,078 tokens across 11 mandated files;
  code-heavy visual-plan ≈ 57,829; data-table ≈ 36,750. A Sonnet/GPT-mini-tier model drowns
  before writing a line.
- Emit cost is already solved for covered cases (MDX sources 300–1,900 tokens; the Vite
  exporter deterministically expands to ~237KB artifacts, 96.6% byte-identical scaffolding).
  But components.tsx covers 1 of 13 documented diagram types (FlowDiagram — linear only,
  confirmed viewBox overflow at index 4: x = 40 + i*250 vs viewBox 960) and has no CodeBlock,
  so diagrams and code pages fall back to full legacy read+hand-author costs.
- Sideshow's verified lesson: typed data surfaces + pre-built rendering yield 87–96% output
  savings (I re-measured their claims: diagram 92.6%, json 96.2%, table 87.2%; their 42%
  interactive-UI claim reproduced at only 27.3%); leverage 5.6–32.9× artifact bytes per emitted
  byte. Also their caveat: an unamortized ~6.7k-token upfront read offsets savings for short
  sessions — our Tier structure must keep the mandatory read under ~3k tokens.
- Sharing today: share.sh → new public *.vercel.app URL every run, zero access control, no
  updates-in-place, no feedback loop.

## Design decisions (frozen)

D1. Authoring contract stays component-heavy MDX/TSX. No JSON-spec-compiled-to-MDX layer:
    TypeScript props are a compile-time schema, stronger than runtime zod; an extra layer adds
    indirection without safety. (Rejected alternative: sideshow-style server; we have no server
    and the Vite exporter already plays that role.)
D2. Structural impossibility over rule-reading: agents never emit coordinates for covered
    diagram types; layout is computed. Rules that survive only as prose move into ve-verify.
D3. Weak-model path = Tier 0 + Tier 1 only (≤ ~2,800 tokens read for a covered flow, ~4.5% of
    today). Tier 2 deep references remain for custom/bespoke work — full freedom preserved for
    PosterCanvas, video, Venn/nested/pyramid, sketchy annotation primitives, brand matching.
D4. Sharing is dual-backend behind the existing one-command interface: sharehtml when the team
    has configured it, Vercel fallback otherwise.

## Workstream A — components (Codex run G1)

A1. `DiagramCanvas` in visual-explainer-mdx/components.tsx:
    props: nodes {id, label, detail?, shape?: 'rect'|'oval'|'diamond'|'dot', accent?}, edges
    {from, to, label?, style?: 'solid'|'dashed'|'bidirectional'}, layout: 'flow'|'tree'|
    'swimlane'|'timeline' (+ lanes/dates props for the latter two).
    Layout computed: topological rank → columns, in-rank index → rows; viewBox derived from
    computed extents (kills the overflow class structurally). Shape semantics per
    diagrams-svg.md (oval start/end rx=20, rect steps rx=6, diamond decisions, dot merges);
    accent budget enforced in-component (max 2); emits data-diagram-role attributes so
    ve-verify's counting checks run deterministically. Covers architecture, flowchart, state,
    tree, swimlane, timeline (6/13 types). FlowDiagram becomes a thin deprecated wrapper over
    DiagramCanvas(layout:'flow') — existing examples keep building.
A2. `CodeBlock`: props {code, language, filename?, highlightLines?, annotations? [{line, note}],
    diff?: 'unified'}. Shiki at build time (add devDependency; NO runtime CDN), terminal-dark
    per mono-industrial.md §16 token mapping, honors --ve-* tokens both modes, pre-wrap policy
    per css-patterns.md. Absorbs everything code pages currently hand-roll.
A3. `MermaidBlock`: props {chart, caption?}. Wraps the full diagram-shell (zoom/pan/expand
    ~200-line JS block from mermaid-flowchart.html) once, themed from --ve-* tokens, light/dark
    at runtime. Covers ER, class/C4, complex state, mindmap, quadrant, gantt — the 6 types
    where Mermaid grammar beats JSON geometry for weak models.
A4. Build-time referential integrity in scripts/ve-mdx/export.mjs (or a pre-pass): fail the
    export with a precise message when an edge references an undeclared node id, DecisionMatrix
    row keys are inconsistent, or a computed viewBox would clip a node. `--draft` flag downgrades
    to warnings (sideshow's strict/loose split). ve:check gains fixtures exercising each failure.
A5. New examples: examples/visual-explainer-mdx/{code-walkthrough.tsx? no — .mdx, diagram-
    canvas.mdx, mermaid-block.mdx} added to check.mjs outputs list; each ≤ ~60 lines source.

## Workstream B — docs restructure (Codex run G2, AFTER current Opus findings + fix run land)

B1. SKILL.md → Tier 0 bootstrap (~150–250 lines): component import list + the non-negotiables
    (use --ve-* tokens; never hand-roll what a component covers; MDX/TSX is the source of
    truth; export command; run ve-verify) + a routing table to Tier 1 cards. The current ~700
    lines of legacy hand-HTML procedure move to references/legacy-html.md (explicitly labeled
    fallback), NOT deleted — Tier 2.
B2. Tier 1 cards: plugins/visual-explainer/cards/{web-diagram,visual-plan,comparison-table,
    slide-deck,code-walkthrough}.md — each ~150–300 tokens: which components, one filled
    skeleton, escalation pointer ("none of these fit → read references/diagrams-svg.md").
    Commands reference their card instead of the reference-file shopping list.
B3. Escalation contract: cards say exactly when to read Tier 2 (custom diagram types, poster,
    video, brand work). Anti-pattern section stays in Tier 0 (it is short post-E2 merge and
    load-bearing for slop prevention).
B4. Token-economics note in PRODUCT.md: the measured numbers above + the target budget, so
    future edits keep the read-cost discipline.

## Workstream C — team sharing (Codex run G1, disjoint files)

C1. share.sh: if `VE_SHAREHTML_URL` set (or ~/.config/visual-explainer/share.json exists) →
    `sharehtml deploy <file>` (update-in-place stable URL, private-by-default; print share-mode
    hint). Else → current Vercel path unchanged. commands/share.md documents both.
C2. docs/TEAM-SHARING.md: sharehtml self-host quickstart (pnpm run setup wizard, Cloudflare
    Access scoped to email domain, $5/mo Workers Paid for Durable Objects, custom-domain
    follow-up), when to prefer which backend, limits (last-write-wins, no version history).
C3. Do NOT vendor sharehtml; depend on its CLI being installed (document `bun install -g` /
    repo path). Keep our surface a thin adapter.

## Acceptance (Fable runs these)

1. Read-budget: sum of Tier 0 SKILL.md + one card ≤ 3,000 tokens (measure chars/4).
2. A diagram page authored ONLY with DiagramCanvas passes ve-verify (incl. data-diagram-role
   counting checks) with zero errors at both viewports/schemes.
3. A code-walkthrough page via CodeBlock passes ve-verify; Shiki output honors both themes.
4. export.mjs integrity checks: seeded bad-edge/bad-viewBox fixtures fail strict, pass --draft
   with warnings.
5. ve:check green including new examples; evals suite still green (no verifier changes in G1).
6. share.sh with VE_SHAREHTML_URL unset behaves exactly as today (bash -n + dry run).
7. Weak-model E2E probe: a Sonnet-tier agent given ONLY Tier 0 + the web-diagram card produces
   a page that exports + verifies green (run via Task with model sonnet as the final gate).

## Sequencing

- G1 (A + C) can start immediately: touches visual-explainer-mdx/, scripts/ve-mdx/, examples/,
  share.sh, commands/share.md, docs/ — disjoint from the in-flight adversarial fix targets
  (scripts/verify/, evals/, SKILL.md).
- G2 (B) starts after the Opus doc findings + resulting fix run land (SKILL.md is their
  target; restructuring first would invalidate their line-anchored findings).
- Opus adversarially verifies G1+G2 against this plan's acceptance list; Fable final check.
