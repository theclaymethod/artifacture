# ve-verify — Module Contract (frozen)

All implementation runs code against this contract. Do not change exported names/shapes.
Plain JS (ESM, `.mjs`), Node 22. NO TypeScript syntax. NO npm/npx invocations anywhere
(broken on this machine) — direct `node` + imports only.

## Dependencies

- `playwright-core` 1.60.0 — browser stage only. Launch chromium via
  `chromium.launch({ headless: true })`; the ms-playwright cache is already populated.
  Declared in package.json devDependencies (pinned).
- `linkedom` — static-dom stage. Installed + declared in devDependencies. `import { parseHTML } from 'linkedom'`.
- `acorn` 8.16 (transitive, present) — GSAP/timeline AST checks. Guard the import with
  try/catch and fall back to conservative regex if resolution ever fails.
- `postcss` 8.5 (transitive, present) — optional for CSS rule walking; same import guard.
- Nothing else. Do not add new dependencies.

## Shared context object (built by lib/context.mjs — owned by run A)

```js
ctx = {
  filePath, html,            // absolute path, raw HTML text
  styles,                    // concatenated contents of all <style> blocks
  inlineStyles,              // array of style="" attribute values
  dom,                       // linkedom Document OR null (fallback mode)
  profile,                   // 'page'|'slides'|'magazine'|'poster'|'video-comp'
  preset,                    // 'mono-industrial'|'nothing'|'blueprint'|'editorial'|'paper-ink'|'terminal'|'ide'|'custom'
  flags: { hasMermaid, hasInlineSvgDiagram, hasDiagramRoleTags, hasAnimations, ... },
  browser: null | {          // populated only in browser stage
    runs: [ { viewport: '1440x900'|'390x844'|native, scheme: 'light'|'dark',
              consoleErrors: [...], failedRequests: [...],
              metrics: {...},        // per-check evaluate results, keyed by check id
              screenshotPath } ]
  }
}
```

## Check module shape

Every check in checks.json is implemented as an entry in a registry:

```js
// lib/checks/static-text.mjs, lib/checks/static-dom.mjs (run A)
// lib/checks/browser.mjs (run B)
export const checks = {
  'check-id': {
    appliesWhen(ctx) { return true|false },   // scope guard; false => status 'skip'
    run(ctx) { return [ { status: 'fail'|'warn'|'pass', evidence, where, fix_hint } ] }
    // browser-stage checks additionally get:
    // collect(page, runMeta) -> value   (executed per browser run; engine stores into ctx.browser.runs[i].metrics[id])
    // run(ctx) then reads ctx.browser.runs[*].metrics[id] and decides.
  }
}
```

- `severity`, `profiles`, `stage` come from checks.json — the registry only implements logic.
- A check with no registry entry and no `impl: generic` mapping => report status
  `unimplemented` (counts as warn in summary, listed at the bottom). NEVER silently skip.
- Generic executors (run A): checks.json entries MAY be satisfied by declarative params
  instead of registry code. Supported generic kinds (run A implements these interpreters):
  `regex-forbid`, `regex-require`, `dom-forbid`, `dom-require` — each with `where`
  (html|styles|inline-styles|text), `pattern`/`selector`, `exempt` patterns. Run A decides
  per check whether generic or bespoke; bespoke wins whenever fp_guards demand context.

## Report (lib/report.mjs — run A)

Exactly the JSON shape in SPEC §CLI contract (summary, checks[], screenshots[],
llm_passes_required[]). `checks[]` includes every catalog check applicable to the profile with
status pass|fail|warn|skip|unimplemented + evidence. Exit codes: 0 clean, 1 any error-severity
fail, 2 engine crash.

## Browser stage (lib/browser.mjs — run B)

- One chromium instance, one context per (viewport × scheme) run.
- Profile matrix: page → {1440x900, 390x844} × {light, dark}. slides/magazine → 1440x900 ×
  {light, dark} at native canvas semantics (no 390 sweep). poster → the declared canvas size,
  single scheme unless page declares both. video-comp → 1920x1080 (or 1080x1920 if 9:16
  markers), single run.
- `page.emulateMedia({ colorScheme })`, `page.emulateMedia({ reducedMotion: 'reduce' })` for
  one extra probe run when animations detected.
- Wait strategy: `load` + fonts.ready + a settle: if Mermaid present, wait for
  `.mermaid svg` or 8s timeout; force-open all <details>; scroll full height once (trigger
  lazy renders); then evaluate.
- Console collection: attach BEFORE navigation; collect `type() === 'error'` + pageerror +
  requestfailed (record url + failure). One retry of the whole run if a network-flake
  heuristic matches (font/CDN request failed but page otherwise clean).
- Screenshots: viewport PNG + full-page PNG per run → `<screens>/<viewport>-<scheme>[-full].png`.
- Every browser check's `collect(page, runMeta)` is executed inside ONE combined
  `page.evaluate` batch per run where feasible (perf), keyed by check id.

## Fixtures/evals (run C)

- `evals/fixtures/violations/<check-id>.html` — self-contained, minimal, violates ONLY that
  check. Build from `fixture_violation` in checks.json. Only for stages static-text,
  static-dom, browser. Include the responsive Layer-1 CSS + a compliant base skeleton (copy
  `evals/fixtures/_base.html` you create) so unrelated checks stay green.
- `evals/expectations.json`: `{ "<check-id>.html": { "must_fire": ["<check-id>"], "max_other_errors": 0 } }`
- `evals/run.mjs`: runs the CLI (`node plugins/visual-explainer/scripts/verify/ve-verify.mjs`)
  per fixture with `--json`, static-only for static fixtures, full for browser fixtures
  (batch: pass `--screens` to a tmp dir, reuse one process where the CLI supports multiple
  files: it does NOT — one file per invocation is fine for static; for browser fixtures,
  accept the per-file cost but run with `--browser-batch` NOT REQUIRED — keep v1 simple).
- Clean fixtures: one per profile (`page`, `slides`, `magazine`, `poster`, `video-comp`) that
  must produce ZERO errors and ZERO warns (unimplemented allowed).
- Output: per-check catch table + failures; exit non-zero on any unmet expectation.

## File ownership (parallel-safe)

- Run A: ve-verify.mjs, lib/engine.mjs, lib/context.mjs, lib/profile.mjs, lib/report.mjs,
  lib/generic.mjs, lib/checks/static-text.mjs, lib/checks/static-dom.mjs, package.json (devDeps
  + ve:verify/ve:eval scripts only).
- Run B: lib/browser.mjs, lib/checks/browser.mjs.
- Run C: evals/** only.
- Run D: SKILL.md §6 rewrite, references/verification.md, rubrics/*, .claude/agents/ve-verifier-*.md,
  diagrams-svg.md + svg-diagram-starter.html data-diagram-role additions.
- NOBODY touches checks.json, decisions.json, protocol-requirements.json, CONTRACT.md.
