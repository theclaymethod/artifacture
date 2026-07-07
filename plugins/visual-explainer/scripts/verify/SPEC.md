# ve-verify — Implementation Spec (v1)

Deterministic verifier + focused LLM verification protocol for the visual-explainer skill.
Target executors: Codex, Opus, Sonnet-tier — the checker must be runnable with ONE command and
produce machine-readable results a weak model can act on without judgment.

## Repo layout (new)

```
plugins/visual-explainer/scripts/verify/
  ve-verify.mjs          # CLI entry
  lib/engine.mjs         # runs checks, assembles report
  lib/profile.mjs        # profile auto-detection (page|slides|magazine|poster|video-comp)
  lib/static-text.mjs    # regex-stage runner
  lib/static-dom.mjs     # linkedom-stage runner
  lib/browser.mjs        # playwright-core stage: viewports × schemes, screenshots, probes
  checks.json            # THE CATALOG — data-driven check definitions (id, stage, profiles,
                         # applies_when, severity, params). Complex checks reference a named
                         # impl in lib/checks/<stage>.mjs by id.
  rubrics/               # LLM-pass rubric files (one per pass, markdown, ≤ 1 screen each)
    pass-hierarchy.md
    pass-aesthetic-<preset>.md   # one per preset; verifier loads ONLY the active preset's file
    pass-completeness.md
    pass-copy.md
evals/
  fixtures/violations/<check-id>.html   # exactly one seeded violation each
  fixtures/clean/<profile>.html         # must pass everything (false-positive guard)
  run.mjs                               # runs ve-verify over all fixtures, asserts expectations
  expectations.json                     # fixture -> {must_fire: [ids], must_not_fire: "*"}
```

## CLI contract

```
node plugins/visual-explainer/scripts/verify/ve-verify.mjs <file.html> \
  [--profile page|slides|magazine|poster|video-comp]   # default: auto-detect
  [--preset mono-industrial|nothing|...]               # default: auto-detect
  [--json <out.json>] [--screens <dir>] [--static-only] [--quiet]
```

- Exit 0 = no errors (warns allowed). Exit 1 = ≥1 error-severity failure. Exit 2 = engine crash.
- The verifier runs via bare `node` with direct `import('playwright-core')` — no npm/npx at runtime, so it works in minimal agent environments.
- playwright-core + linkedom added to package.json devDependencies (pin what's in node_modules: playwright-core 1.60.0).
- Browser stage matrix: {1440×900, 390×844} × {light, dark} → 4 runs; screenshots saved as
  `<screens>/<viewport>-<scheme>.png` + full-page variants. Console messages + failed requests
  collected per run. Skip matrix rows per profile (poster: native canvas only; video-comp: 1920×1080 or 1080×1920).
- Report JSON:

```json
{
  "file": "...", "profile": "page", "preset": "mono-industrial",
  "summary": { "errors": 2, "warns": 1, "skipped": 14, "passed": 61 },
  "checks": [ { "id": "...", "stage": "...", "severity": "error",
                "status": "pass|fail|warn|skip", "evidence": "...",
                "where": "selector/line/screenshot ref", "fix_hint": "..." } ],
  "screenshots": ["..."],
  "llm_passes_required": ["hierarchy", "aesthetic-mono-industrial", "completeness", "copy"]
}
```

- Human output: compact table, failures first, each with fix_hint quoting the doc rule.

## Profile & preset auto-detection (lib/profile.mjs)

- slides: `scroll-snap-type: y mandatory` on a track + slides ≥ 100dvh
- magazine: `scroll-snap-type: x mandatory`
- poster: single fixed `w-[Npx] h-[Npx]` root or `--poster` marker / TSX source
- video-comp: hyperframes markers (gsap timeline, data-hf attrs, scene structure)
- page: fallback
- preset: explicit `data-ve-preset` attribute first (or `--preset` flag), else STRONG token signatures only (Doto in a font-family declaration = nothing; >=2 core mono token names = mono-industrial); generic font pairings and filenames must never gate preset conformance — "custom" otherwise; loose heuristics may only route LLM passes
- `applies_when` guards: each check declares a detection predicate (regex/selector) evaluated
  before running; non-applicable → status "skip" with reason. THIS IS THE FALSE-POSITIVE FIREWALL.

## Eval suite (`node evals/run.mjs`)

- For every `fixtures/violations/<id>.html`: run ve-verify (static stages always; browser stage
  only for browser-stage fixtures), assert `<id>` fires with expected severity AND no other
  error-severity check fires (warns from unrelated checks tolerated but reported).
- For every `fixtures/clean/<profile>.html`: assert zero fires (errors AND warns).
- Summary: per-check catch-rate table; exit non-zero if any expectation unmet.
- Runtime budget: static fixtures < 5s total; browser fixtures batched in one chromium instance,
  < 90s total. This is the regression suite for the checker itself.

## LLM verification protocol (rewrite of SKILL.md §6 + new references/verification.md)

Sequenced so a weak model cannot skip or blend steps:

1. Run ve-verify. If exit 1 → fix root cause → re-run. Max 3 cycles, then deliver with explicit
   failure disclosure. (Deterministic gate FIRST; no LLM review of pages that fail mechanics.)
2. LLM passes, each a separate small context consuming ONLY its named inputs:
   - P1 hierarchy/layout: 4 screenshots + pass-hierarchy.md (squint, weight, moment-of-surprise)
   - P2 aesthetic fidelity: 4 screenshots + the ACTIVE preset rubric only (swap test, motif rules)
   - P3 completeness: source material inventory + extracted section list/headings (NO screenshots)
   - P4 copy: extracted prose text only (slop patterns; unslop escalation)
   Claude Code: 4 parallel Task subagents (`.claude/agents/ve-verifier-*.md`, JSON verdict contract
   like section-contract.md). Codex/single-agent: same rubric files run as 4 sequential
   fresh-context passes. Rubric files are the single source of truth for both paths.
3. Verdict merge: any P1–P4 fail → fix → re-run affected pass only. Max 2 cycles.
4. Delivery message MUST include: report path, pass/fail per LLM pass, and either "verified" or
   the explicit could-not-verify disclosure. (Protocol requirement, reviewable from transcript.)

## Doc updates in scope

- SKILL.md §6 rewritten (shorter than today: point at ve-verify + verification.md).
- references/verification.md: full protocol incl. rubrics index + report schema.
- references/*.md: add rule-ID anchors where checks cite docs (only where curation demands).
- .claude/agents/ve-verifier-{hierarchy,aesthetic,completeness,copy}.md
- check.mjs: keep as build smoke test; add `ve:verify` + `ve:eval` npm scripts (documented as
  direct-node invocations too, given broken npm shim).

## Build loop

1. Fable: freeze checks.json catalog + this SPEC (after curation merge).
2. Codex run A: engine + CLI + browser stage. Codex run B (parallel, disjoint files): fixtures + evals/run.mjs.
   Codex run C (after A/B interfaces exist): docs + rubrics + verifier agents.
3. Opus adversarial verify: break the checker (seed tricky false-pos/false-neg pages), audit
   spec fidelity against docs, review rubric quality for weak-model followability.
4. Fable: run evals, final fidelity check, iterate 2–4 until green + no confirmed findings.
