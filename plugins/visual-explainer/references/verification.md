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
  "llm_passes_required": ["hierarchy", "aesthetic-mono-industrial", "completeness", "copy", "visual-tells"]
}
```

The browser stage renders the required matrix for the detected profile. Page, slide, and magazine artifacts use 1440x900 and 390x844 in both light and dark schemes. Poster artifacts verify the native canvas. Video compositions verify the declared Hyperframes canvas.

### Producing pass inputs

In single-agent mode, YOU produce the declared inputs before running each rubric.

1. Extract prose text for P-copy with the exclusion filter in that rubric: remove code, identifiers, filenames, table headers, labels, counters, timestamps, status strings, Mermaid labels, and square-bracket system messages. A documented Node one-liner is acceptable, for example:

   ```bash
   node -e "let s=require('fs').readFileSync(process.argv[1],'utf8'); s=s.replace(/<(script|style|pre|code|svg)\b[\s\S]*?<\/\1>/gi,' '); s=s.replace(/\[[^\]]*\]/g,' ').replace(/<[^>]+>/g,' '); console.log(s.replace(/\s+/g,' ').trim())" <artifact.html>
   ```

2. Build the P-completeness source-vs-render inventory from the source material and the rendered artifact: headings, bullets, table rows, cards, collapsible details, footnotes, and demo-frame summaries. Do not use screenshots for this pass.
3. Capture P-diagram inputs one figure at a time. Scroll to each element carrying `data-diagram-role` or `.mermaid`; screenshot that element's bounding region; extract its visible labels; write a one-line content brief for the figure.
4. Use candidate element lists from each deterministic check's `evidence` and `where` fields when a pass asks for candidate extracts.

## 2. Run LLM Passes

Run each required pass as a separate context. Use only the inputs named by the pass. Do not let screenshots, source text, or rubric sections leak across passes.

Claude Code: spawn the matching `ve-verifier-*` agents in one parallel Task batch. Each agent reads one rubric and returns only verdict JSON.

Single-agent environments such as Codex CLI: run the same rubric files sequentially. Run rubrics in order; for each, load only that rubric file and its declared inputs; do not carry prior rubrics' questions, screenshots, or findings forward; emit the verdict JSON, then proceed. The files in `{{skill_dir}}/scripts/verify/rubrics/` are the single source of truth for both execution modes.

Every pass returns:

```json
{
  "pass": true,
  "findings": [
    { "check_id": "text-visibly-clipped", "evidence": "390-dark screenshot: heading is cut at right edge", "fix": "Allow wrapping or widen the container, then rerun verification." }
  ]
}
```

Use these passes:

| Pass | Run When | Inputs | Rubric |
|---|---|---|---|
| P-layout | `llm_passes_required` includes `hierarchy`, or any layout candidate exists | `report.json`; the 4 standard screenshots; candidate lists for clipping, fixed chrome, div-grid tables, slide screenshots, demo frames when referenced | `{{skill_dir}}/scripts/verify/rubrics/pass-layout.md` |
| P-aesthetic | `llm_passes_required` includes any `aesthetic-*` token, a preset is detected or declared, or any preset candidate exists | `report.json`; active preset name; light/dark screenshots; candidate extracts named in the report | `{{skill_dir}}/scripts/verify/rubrics/pass-aesthetic.md` |
| P-diagram | diagrams are present | `report.json`; one screenshot per figure; extracted diagram labels; one-line content brief for each figure | `{{skill_dir}}/scripts/verify/rubrics/pass-diagram.md` |
| P-completeness | source material or demo evidence exists | source inventory; extracted rendered headings, bullets, table rows, cards, and demo-frame summary; no page screenshots | `{{skill_dir}}/scripts/verify/rubrics/pass-completeness.md` |
| P-copy | extracted prose exists | excluded-filtered prose text only | `{{skill_dir}}/scripts/verify/rubrics/pass-copy.md` |
| P-visual-tells | `llm_passes_required` includes `visual-tells` (page/slides/magazine) | `report.json`; light/dark screenshots; candidate extracts | `{{skill_dir}}/scripts/verify/rubrics/pass-visual-tells.md` |
| P-poster | profile is `poster` | exported PNG only | `{{skill_dir}}/scripts/verify/rubrics/pass-poster.md` |

### P-layout Questions

Ask the questions tagged in `pass-layout.md`: semantic table need, global hierarchy, visible text clipping, mobile fixed-chrome obstruction, slide focal clarity, repeated slide composition, sparse diagram slide.

### P-aesthetic Questions

Load only the active preset section in `pass-aesthetic.md`. Do not judge Nothing rules on a Mono-Industrial page or generic custom pages against a named preset. Ask the generic both-mode question for any named preset.

### P-diagram Questions

Run only for rendered figures. Use per-figure screenshots, not one full-page screenshot. Apply the diagram Removal Test before emit; after emit, inspect screenshots. If a hand-authored SVG still fails after 2 repair attempts, replace the figure with Mermaid instead of continuing manual repair.

### P-completeness Questions

Compare source inventory to extracted rendered content. Do not use screenshots. Missing source sections, decision cards, table rows, collapsible details, footnotes, or demonstrably low-value demo embeds fail this pass.

### P-copy Questions

Judge only extracted prose. Do not penalize code, identifiers, filenames, table headers, labels, counters, timestamps, status strings, Mermaid labels, or square-bracket system messages.

### P-poster Questions

Inspect the exact exported PNG after every `poster export`. Check edge clipping, cut elements, unexplained blank space, hierarchy survival, hero/moment-of-surprise survival, and status color still appearing only on values. Rework and re-export at most 3 times. If still failing, stop and report the specific remaining defect and last PNG path.

## 3. Merge Verdicts And Re-Fix

1. Merge all pass verdicts into one table: pass name, `pass` boolean, finding count, check IDs.
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
3. A pass/fail line for each LLM pass that ran.
4. One of these exact disclosure shapes:
   - `Verified: ve-verify passed and required LLM verification passes passed.`
   - `Could not fully verify: <specific verifier, browser, or LLM pass limitation>.`
   - `Verification failed after bounded repair: <specific unresolved check IDs and evidence>.`

Never imply browser or visual verification happened when it did not.

## Process Boundaries

- Clarify-tier gates are defined in `{{skill_dir}}/references/clarify.md`; apply them before generation and do not duplicate them here.
- Slide, magazine, poster, and video formats are opt-in only. Do not choose them without an explicit user request or flag.
- For pages with 3 or more sections, use the fan-out policy and section retry limit in `{{skill_dir}}/references/section-contract.md`.
- For video, run the Hyperframes workflow in order: doctor, build, lint, validate, draft render, extract 3 meaningful keyframes, show the user, wait for explicit approval, then final render. Reject invalid `--fps`, `--quality`, and `--aspect` flags before rendering.
- For transcript checks, use the deterministic transcript stage in `ve-verify`; they are not LLM-pass rubrics.
- For diagrams, emit `data-diagram-role` attributes per `{{skill_dir}}/references/diagrams-svg.md` so downstream role-counting checks can run deterministically.
