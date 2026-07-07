# Design Note: fixture strategy for the 30 non-deterministic checks

Spike output for plan `007-llm-pass-fixture-strategy.md`. Written 2026-07-06.

## Step 1: execution-path map

**Where llm-pass "executes."** It doesn't execute in-process at all.
`plugins/visual-explainer/scripts/verify/lib/engine.mjs:49` short-circuits any
check definition with `stage === 'llm-pass'`:

```js
if (definition.stage === 'llm-pass') return { ...base, status: 'llm-required', evidence: 'requires focused LLM verification pass' };
```

`engine.mjs:50` does the identical thing for `stage === 'transcript'`:

```js
if (definition.stage === 'transcript') return { ...base, status: 'transcript', evidence: 'requires transcript verification' };
```

Neither line calls a model, a binary, or an HTTP endpoint. Both stages are
pure markers. `plugins/visual-explainer/scripts/verify/lib/report.mjs:42-53`
(`llmPassesFor`) reads those markers and computes which *pass names* the
orchestrator must run next (`hierarchy`, `aesthetic-<preset>`, `completeness`,
`copy`, plus `visual-tells` for page/slides/magazine profiles) — it still
does not call anything, and nothing downstream in
`plugins/visual-explainer/scripts/verify/` ever parses a verdict back into a
check's `status`.

**What actually runs the rubric.** Per
`plugins/visual-explainer/scripts/verify/SPEC.md:84-101`, the real execution
is an external protocol the calling agent (Claude Code or Codex) follows
*after* the deterministic gate passes: dispatch one Task subagent per rubric
pass — `.claude/agents/ve-verifier-{hierarchy,aesthetic,completeness,copy}.md`
— each reading only its named inputs, e.g.
`plugins/visual-explainer/.claude/agents/ve-verifier-completeness.md:11-18`
(reads `rubrics/pass-completeness.md` + a source-inventory file + an
extracted-text file; explicitly "Do not read page screenshots"). Spot-checked
a second: `plugins/visual-explainer/.claude/agents/ve-verifier-completeness.md`
itself confirms the frontmatter contract (`tools: Read`, output-only-JSON
instruction at lines 20-28).

**Interface / function signature.** There is none to inject — no
`callModel(prompt)` seam exists anywhere in the JS. The interface boundary is
a prompt contract, not a function: agent definition (frontmatter + Read
tool) + a prompt naming which files to read, and the agent's *entire final
message* must be one JSON object matching a schema repeated verbatim in
every rubric file's "Verdict JSON schema" line:

```json
{"pass": true, "findings": [{"check_id": "<check-id>", "evidence": "...", "fix": "..."}]}
```

Confirmed identical shape at `rubrics/pass-layout.md:15`,
`rubrics/pass-diagram.md:15`, `rubrics/pass-aesthetic.md:16`,
`rubrics/pass-completeness.md:10`, `rubrics/pass-visual-tells.md:11`,
`rubrics/pass-copy.md`, `rubrics/pass-poster.md`.

**What each rubric consumes** (from each file's "Inputs:" section):
- `rubrics/pass-layout.md:1-6` (covers `text-visibly-clipped` at line 9 and
  `fixed-ui-obscures-content` at line 10): `report.json` + the 4 standard
  screenshots (1440×900, 390×844 × light/dark) + candidate-element lists
  named by deterministic checks.
- `rubrics/pass-diagram.md:1-6` (`diagram-type-coherent` at line 11):
  `report.json` + one screenshot per rendered figure + extracted diagram
  label text + a one-line content brief per figure.
- `rubrics/pass-aesthetic.md:1-6` (`preset-both-mode-visual` at line 8):
  `report.json` with detected preset + light/dark screenshots + candidate
  extracts; loads *only* the active preset's section plus "Any named
  preset."
- `rubrics/pass-completeness.md:1-3` (`deck-content-completeness` at line
  7): source inventory + extracted rendered text — **no screenshots**
  (line 3 says so explicitly).
- Not in the Step-3 slice but confirms the pattern: `pass-copy.md` gets
  filtered prose text only; `pass-poster.md` gets the exported PNG only.

**What output shape does it parse.** The schema above is what a human/agent
orchestrator reads and acts on manually (SPEC.md:98, "Verdict merge: any
P1–P4 fail → fix → re-run affected pass only"). No code in this repo parses
it. This is the central fact this plan turns on.

**Where transcript checks read inputs.** Also unimplemented in code
(`engine.mjs:50` is the only touchpoint). Per `checks.json`:
- `reel-no-mid-word-cuts` (`checks.json:2864-2881`) is **fully
  deterministic**: cross-reference each clip's cut `data-start` against a
  word-level `transcript.json` (`{text, start, end}`); fail if a cut lands
  strictly inside a word span (±50ms). `impl_hint` at line 2877 gives the
  exact algorithm — no model involved at all.
- `reel-caption-matches-transcript` (`checks.json:2901-2918`, the check this
  plan seeds) is **mostly deterministic**: concatenate `.cap` DOM text,
  diff word-overlap/edit-distance against the transcript's word sequence for
  the same time range, fail below ~90% overlap (`checks.json:2911`). An LLM
  tie-break is invoked *only* for the 85–90% borderline band — the common
  case is pure string math.

## STOP-condition check

The plan's STOP trigger is "the llm-pass stage has no injectable model
interface (calls a hardcoded binary/API inline with no seam)." That is not
what Step 1 found. The actual finding is stronger in our favor: **there is no
model call in-process to have a seam problem with** — llm-pass/transcript
execution is deferred entirely to an external Task-agent protocol that lives
outside this JS codebase. Because Step 3's scope is a *new* runner under
`evals/` (not a modification to `engine.mjs` or the verifier), we can build
the entire seam — canned judge, verdict-to-check-status plumbing — as new
eval-only code without touching production. This is not a refactor of the
verifier; it does not trigger the STOP condition. Proceeding to Step 2.

## Step 2: mechanism comparison

| | **A. Stub judge** | **B. Recorded responses** | **C. Golden-artifact live lane** |
|---|---|---|---|
| **Catches** | Plumbing only: does a `findings[].check_id === X` verdict correctly flip check X to fail/pass with the right severity | Plumbing + real model output shape/parsing quirks (formatting, stray prose, schema drift) | End-to-end: rubric wording quality + plumbing + real model behavior |
| **Cost** | Free, no network | One-time paid capture per check, occasional paid refresh | Recurring paid calls (weekly) |
| **Flake risk** | None (fully deterministic) | None at replay time (frozen fixtures); staleness risk if rubric wording changes and recordings aren't refreshed | Real: model variance, rate limits, screenshot rendering flakiness |
| **Maintenance** | Low — fixtures are static JSON, only touched when a check's id/severity changes | Medium — needs a manual refresh script, someone has to eyeball each capture before freezing it | Low-effort per run but needs monitoring/triage of an inherently flaky signal |
| **Default-gate eligible** | Yes | Yes (replay is free) | No — explicitly excluded by plan scope |

**Why not B for this slice:** B's stated value-add over A is testing
"response-parsing against real model output shapes." Step 1 found there is
currently **no parser at all** to stress-test — the schema is a single flat
JSON shape (`{pass, findings:[{check_id, evidence, fix}]}`) repeated
verbatim across all 7 rubric files with no per-rubric variation. There's no
evidence of parsing fragility to justify a paid capture-and-refresh
pipeline before this schema has even shipped a first consumer. Revisit B if
real usage later shows agents returning malformed/prose-wrapped verdicts.

**Why C is out of scope for this slice:** matches the plan's explicit
out-of-scope line ("Live-model calls in CI by default"). Recommended as a
**secondary, non-blocking, unimplemented-in-this-slice** idea: an optional
weekly cron lane running 3-5 golden artifacts through a real model, wired up
only if/when rubric-prompt rot becomes a real incident. Not built here.

### Recommendation

**Primary: A (stub judge)**, implemented as a new `evals/run-rubrics.mjs`
that owns both the canned-verdict fixtures *and* the minimal
verdict-to-check-status plumbing (since none exists to reuse). This keeps
the default gate free and deterministic, matches the plan's LOW-risk
"additive test scaffolding" framing, and is the only option that requires no
paid API for the default gate while still proving the wiring: "if the judge
said X, does the check correctly fire/not-fire with the right severity."

**Secondary (backlog, not built now): C**, as a future non-blocking weekly
cron lane, per the plan's Maintenance notes ("stubs can't catch rubric-prompt
rot" — schedule an occasional manual real-model run before releases).

**One exception to the stub pattern:** `reel-caption-matches-transcript` is
implemented with the *real* deterministic word-overlap algorithm (not a
canned verdict) since Step 1 showed the common-case path needs no model at
all — this is a genuinely stronger test than a stub for this one check, and
is why the plan calls it out as "one transcript check included
deliberately."

## Fixture naming/layout (mirrors the deterministic suite)

Deterministic convention: `evals/fixtures/violations/<check-id>.html` +
`evals/expectations.json` keyed by filename, `must_fire` / `allowed_co_fires`.

Rubric convention (new, this plan):

```
evals/fixtures/rubrics/<check-id>/
  fire.json     # { "context": "<1-line human label>", "judge_response": {"pass": false, "findings": [{"check_id": "...", "evidence": "...", "fix": "..."}]} }
  clean.json    # { "context": "...", "judge_response": {"pass": true, "findings": []} }
```

This is the literal (artifact, canned-response, expected-check-outcome)
triple from option A's description: `context` stands in for the artifact
description (since the stub doesn't render real HTML/screenshots — it tests
wiring, not rendering), `judge_response` is the canned model output, and the
expected outcome is implicit in the filename (`fire.json` must flip the
check to fail/warn per its `checks.json` severity; `clean.json` must leave it
passing).

`reel-caption-matches-transcript` deviates because it runs a real algorithm,
not a canned verdict:

```
evals/fixtures/rubrics/reel-caption-matches-transcript/
  fire/transcript.json   # word-level {text,start,end} narration
  fire/captions.json     # burned-in .cap text, paraphrased vs. narration (< 90% overlap)
  clean/transcript.json
  clean/captions.json    # verbatim captions (> 90% overlap)
```

Both fixture families are asserted by `evals/run-rubrics.mjs`, exposed as
`npm run ve:eval-rubrics`.

## Parity accounting (Step 5 preview)

30 llm-pass/transcript checks total − 6 covered by this slice = **24
remaining**, tracked in `evals/rubric-coverage.json` (not
`evals/parity-allowlist.json` — that file is scoped to plan 003's
deterministic-stage parity gate). Full list confirmed programmatically
against `checks.json` in Step 5.
