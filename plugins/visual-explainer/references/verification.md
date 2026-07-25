# Verification Protocol

Use this protocol before reporting any generated artifact as done. A written file, successful export, or clean build is not verification.

## 1. Run `ve-verify`

1. Set `{{skill_dir}}` to the installed visual-explainer skill directory. In-repo runs use `plugins/visual-explainer/...`, matching the agent files.
2. Run the deterministic verifier before any LLM judgment:

```bash
node {{skill_dir}}/scripts/verify/ve-verify.mjs <artifact.html> --json <report.json> --screens <screens-dir>
```

3. Add `--profile page|slides|magazine|poster|video-comp` only when auto-detection is wrong. Add `--preset mono-industrial|nothing|blueprint|editorial|paper-ink|terminal|ide|custom` only when auto-detection is wrong. Add `--static-only` when browser automation is unavailable. Add `--quiet` when only the exit code and JSON report matter.
4. Interpret exits exactly:
   - `0`: no error-severity failures. Continue to Step 2.
   - `1`: one or more error-severity checks failed. Fix the root cause, re-export from the MDX/TSX source, and rerun this command.
   - `2`: verifier engine crash. Fix the verifier invocation or environment if possible; otherwise disclose that deterministic verification could not run.
5. Repeat the fix -> re-export -> rerun loop at most 3 times. Count the initial run plus 3 repair runs as the full budget.
6. If exit `1` remains after the budget, stop repairing and deliver only with the failure disclosure in Step 4.
7. If no browser automation is available, run the same command with `--static-only` first. Then open the file for the user and say: `Could not verify in a browser because browser automation was unavailable; only browser and LLM passes were skipped.` Do not say `verified`, `renders correctly`, or `looks good`.

The report JSON contains:

```json
{
  "file": "...",
  "profile": "page",
  "preset": "mono-industrial",
  "summary": { "errors": 0, "warns": 0, "skipped": 0, "passed": 0 },
  "checks": [
    {
      "id": "...",
      "stage": "browser",
      "severity": "error",
      "status": "pass",
      "evidence": "...",
      "where": "...",
      "fix_hint": "..."
    }
  ],
  "screenshots": ["..."],
  "llm_passes_required": ["hierarchy", "impeccable:critique"],
  "llm_dispatch_plan": [
    {
      "pass": "hierarchy",
      "owner": "artifacture",
      "status": "ready",
      "model": "provider-small-vision",
      "batch_size": 2
    },
    {
      "pass": "impeccable:critique",
      "owner": "impeccable",
      "status": "delegate-to-installed-skill"
    }
  ]
}
```

The browser stage renders the required matrix for the detected profile. Page, slide, and magazine artifacts use 1440x900 and 390x844 in both light and dark schemes. Poster artifacts verify the native canvas. Video compositions verify the declared Hyperframes canvas.

### Producing pass inputs

The orchestrator produces the declared inputs before dispatching each rubric.
Input extraction and screenshot capture may run in the main thread; visual
judgment may not.

1. Extract prose text for delegated Unslop review: remove code, identifiers, filenames, table headers, labels, counters, timestamps, status strings, Mermaid labels, and square-bracket system messages. A documented Node one-liner is acceptable, for example:

   ```bash
   node -e "let s=require('fs').readFileSync(process.argv[1],'utf8'); s=s.replace(/<(script|style|pre|code|svg)\b[\s\S]*?<\/\1>/gi,' '); s=s.replace(/\[[^\]]*\]/g,' ').replace(/<[^>]+>/g,' '); console.log(s.replace(/\s+/g,' ').trim())" <artifact.html>
   ```

2. Build the P-completeness source-vs-render inventory from the source material and the rendered artifact: headings, bullets, table rows, cards, collapsible details, footnotes, and demo-frame summaries. Do not use screenshots for this pass.
3. Capture P-diagram inputs one figure at a time. Scroll to each element carrying `data-diagram-role` or `.mermaid`; screenshot that element's bounding region; extract its visible labels; write a one-line content brief for the figure.
4. For P-operating-model, build a review map with one row per slide or coherent long-form section: stable unit id, unit type (`slide` or `section`), visible title, one-sentence narrative job, and screenshot path. If the source has no narrative job, use the visible claim and mark the route low-confidence. Do not use implementation source to infer intent.
5. Use candidate element lists from each deterministic check's `evidence` and `where` fields when a pass asks for candidate extracts.
6. For `impeccable:critique`, capture only the candidate screenshots and locations named by the report. For `unslop:cleanup-report`, supply only the excluded-filtered prose extract.
7. For `artifacture:slop-gap`, capture only the explicitly nominated region, its visible text, and the smallest source/truth excerpt needed to judge sequence, state/confidence, or provenance.

## 2. Run LLM Passes

Run each required pass as a separate context. Use only the inputs named by the pass. Do not let screenshots, source text, or rubric sections leak across passes.

Before dispatch, read `./model-routing.md` and consume the report's
`llm_dispatch_plan`. Use the exact model and batch size recorded for every
`ready` Artifacture pass. The current/main agent must not inspect the
screenshots itself merely because a subagent or direct model route is
inconvenient.

Prefer direct model API calls when controlled model selection, cost telemetry,
or cache measurement matters. Coding-agent subagents are an orchestration
fallback only when they can actually target the selected model. If the host
cannot run the policy's model, mark the pass skipped with
`no-eval-qualified-model`; do not silently substitute the host/frontier model.

Invoke Impeccable and Unslop through their installed skills, not copied
Artifacture agents. Load only the selected rubric/skill and declared inputs; do
not carry prior questions, screenshots, or findings forward. Artifacture rubric
files are authoritative only for Artifacture-owned passes.

### Cache-friendly visual dispatch

When multiple selected criteria consume the exact same image set, build one
immutable evidence prefix: fixed tools and verdict contract, shared evidence
instructions, optional design-system exception excerpt, then exact image blocks
in stable state-id order. Append selected check ids and rubric questions only
after that prefix.

Do not claim prefix-cache savings from coding-agent subagents without provider
usage telemetry. Claude Code named subagents use separate caches; forks share
the parent cache but inherit its model. Codex can reuse exact prefixes, but
model, tools, sandbox, approval, or working-directory changes can invalidate
them and its subagent protocol does not expose cache token counts. Use the
direct-API experiment in `docs/plans/visual-eval-prefix-caching.md` when measured
cache reads and controlled small-model selection are required.

Every pass returns:

```json
{
  "pass": true,
  "execution": {
    "model": "provider/model",
    "batch_size": 2,
    "policy_source": "~/.artifacture/visual-model-policy.json",
    "escalated_from": null
  },
  "findings": [
    { "check_id": "text-visibly-clipped", "state_id": "390-dark", "region": "hero heading", "evidence": "Heading is cut at right edge", "fix": "Allow wrapping or widen the container, then rerun verification." }
  ]
}
```

When no eval-qualified route can run:

```json
{
  "pass": null,
  "status": "skipped",
  "reason": "no-eval-qualified-model",
  "findings": []
}
```

Use these passes:

| Pass | Run When | Inputs | Rubric |
|---|---|---|---|
| P-layout | `llm_passes_required` includes `hierarchy`, or any layout candidate exists | `report.json`; the 4 standard screenshots; candidate lists for clipping, fixed chrome, div-grid tables, repeated-track layouts, slide screenshots, demo frames when referenced | `{{skill_dir}}/scripts/verify/rubrics/pass-layout.md` |
| P-aesthetic | `llm_passes_required` includes any `aesthetic-*` token, a preset is detected or declared, or any preset candidate exists | `report.json`; active preset name; light/dark screenshots; candidate extracts named in the report | `{{skill_dir}}/scripts/verify/rubrics/pass-aesthetic.md` |
| P-diagram | diagrams are present | `report.json`; one screenshot per figure; extracted diagram labels; one-line content brief for each figure | `{{skill_dir}}/scripts/verify/rubrics/pass-diagram.md` |
| P-operating-model | `llm_passes_required` includes `operating-model` | one screenshot per review unit; review map with unit id, unit type, visible title, and one-sentence narrative job; only the brief excerpts needed to resolve intent | `{{skill_dir}}/scripts/verify/rubrics/pass-operating-model.md` |
| P-completeness | source material or demo evidence exists | source inventory; extracted rendered headings, bullets, table rows, cards, and demo-frame summary; no page screenshots | `{{skill_dir}}/scripts/verify/rubrics/pass-completeness.md` |
| D-Impeccable | `llm_passes_required` includes `impeccable:critique` | candidate screenshots and locations from `report.json`; relevant design-system excerpt only | installed Impeccable skill; read-only critique/audit |
| D-Unslop | `llm_passes_required` includes `unslop:cleanup-report` | excluded-filtered prose text only | installed Unslop skill; `cleanup --report` |
| P-artifact-slop-gap | `llm_passes_required` includes `artifacture:slop-gap` | one nominated screenshot/crop; visible text; smallest source/truth excerpt needed to judge the claim | `{{skill_dir}}/scripts/verify/rubrics/pass-artifact-slop-gap.md` |
| P-poster | profile is `poster` | exported PNG only | `{{skill_dir}}/scripts/verify/rubrics/pass-poster.md` |

### P-layout Questions

Ask only the applicable questions tagged in `pass-layout.md`: semantic table need, global hierarchy, visible text clipping, mobile fixed-chrome obstruction, slide focal clarity, repeated-track symmetry, repeated slide composition, and sparse diagram slide. Repeated-track symmetry is conditional: run it only when the artifact visibly establishes equivalent columns or rows.

### P-aesthetic Questions

Load only the active named-preset section in `pass-aesthetic.md`. Do not judge generic custom pages against a named preset; general visual craft and visual AI tells route to Impeccable.

### P-diagram Questions

Run only for rendered figures. Use per-figure screenshots, not one full-page screenshot. Apply the diagram Removal Test before emit; after emit, inspect screenshots. If a hand-authored SVG still fails after 2 repair attempts, replace the figure with Mermaid instead of continuing manual repair.

### P-operating-model Questions

Route every slide or coherent page section before judging it:

- `none`: cover, divider, quote, image, agenda, simple CTA, single statistic, or one claim with one supporting fact;
- `relational`: comparison, before/after, formula, aligned evidence, or exact mappings;
- `operating-model`: sequence, routing, state, causality, provenance, uncertainty, dependencies, feedback, or resource flow; and
- `simulated-surface`: the workflow or interface itself is the claim.

Apply model-fidelity questions only to the final three routes. Do not require a
diagram when a table, formula, paired contrast, or aligned rows tell the truth.
Return a finding only when the chosen or missing structure materially weakens
or misstates the unit's narrative job.

### P-completeness Questions

Compare source inventory to extracted rendered content. Do not use screenshots. Missing source sections, decision cards, table rows, collapsible details, footnotes, or demonstrably low-value demo embeds fail this pass.

### Delegated Impeccable Questions

Invoke the installed Impeccable skill in read-only critique/audit mode with only
the routed screenshot evidence. Do not paste or paraphrase Impeccable's rubric
into Artifacture.

### Delegated Unslop Questions

Invoke Unslop as `cleanup --report` on excluded-filtered prose only. Do not
penalize identifiers, labels, counters, timestamps, status strings, Mermaid
labels, or system messages. Do not rewrite prose during verification.

### P-artifact-slop-gap Questions

Run only for explicit `data-ve-checks="artifacture:slop-gap"` regions. Ask
whether decoration falsely implies sequence, measured state/confidence, or
provenance/verification. Stay silent on every generic aesthetic or prose issue.

### P-poster Questions

Inspect the exact exported PNG after every `poster export`. Check edge clipping, cut elements, unexplained blank space, hierarchy survival, hero/moment-of-surprise survival, and status color still appearing only on values. Rework and re-export at most 3 times. If still failing, stop and report the specific remaining defect and last PNG path.

## 3. Merge Verdicts And Re-Fix

1. Merge Artifacture and delegated verdicts into one table: pass/skill name, `pass` boolean, finding count, check IDs.
2. If every pass returns `"pass": true`, continue to Step 4.
3. If any pass returns `"pass": false`, fix only the defects named in `findings`.
4. Re-export from source. Never hand-edit generated HTML when an MDX/TSX source exists.
5. Rerun `ve-verify`.
6. Rerun only the affected LLM passes.
7. Repeat this LLM fix loop at most 2 times. If any pass still fails, stop and disclose the unresolved findings.

## 4. Deliver

The delivery message must include:

1. The artifact path.
2. The `ve-verify` report path.
3. A pass/fail line for every Artifacture pass and delegated skill that ran.
4. One of these exact disclosure shapes:
   - `Verified: ve-verify passed and required LLM verification passes passed.`
   - `Could not fully verify: <specific verifier, browser, or LLM pass limitation>.`
   - `Verification failed after bounded repair: <specific unresolved check IDs and evidence>.`

Never imply browser or visual verification happened when it did not.

## Process Boundaries

- Delegated ownership is defined in `{{skill_dir}}/references/delegated-skills.md`; apply it without copying Impeccable or Unslop rubrics. Clarify-tier gates are defined in `{{skill_dir}}/references/clarify.md`.
- Slide, magazine, poster, and video formats are opt-in only. Do not choose them without an explicit user request or flag.
- For pages with 3 or more sections, use the fan-out policy and section retry limit in `{{skill_dir}}/references/section-contract.md`.
- For video, run the Hyperframes workflow in order: doctor, build, lint, validate, draft render, extract 3 meaningful keyframes, show the user, wait for explicit approval, then final render. Reject invalid `--fps`, `--quality`, and `--aspect` flags before rendering.
- For transcript checks, use the deterministic transcript stage in `ve-verify`; they are not LLM-pass rubrics.
- For diagrams, emit `data-diagram-role` attributes per `{{skill_dir}}/references/diagrams-svg.md` so downstream role-counting checks can run deterministically.
