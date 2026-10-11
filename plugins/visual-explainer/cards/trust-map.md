# Trust-map explainer: the guided review

An explainer for one PR's trust map (understando). It is a **guided review**: chapters that take a reviewer from what the PR does, through how it works and what changed, to the checklist and the merge call. You write the narrative as Markdown in one `explainer.mdx`; each chapter that comes from data is a component of `visual-explainer-mdx/guided-review.tsx` or `trust-map.tsx` that you drop in. The components validate their data, so the export fails on bad data. They render the derived values of understando (`scripts/derive.py`) and never compute them again. Code comes in only through `CodeRef` and the resolved refs; never paste it.

## The data contract

The MDX imports three JSON files from its own folder:

| File | Written by | Holds |
|---|---|---|
| `trust-map.json` | the map, the controls and the verdicts | `schema_version` 1 or 2 (promise, claim, check), `head`, `claims`, `verifiers`, `controls`, `promises`, `flags`, `summary`, `glossary`, `invariants`. Each claim lists `checks` (verifier ids), and can have `legacy_ids` and `parts`. Each promise, claim and check has a plain `name`. |
| `refs.resolved.json` | `understando explain` (it resolves each ref at the head; `derive.py` writes `derived`) | `schema` 2, `head`, `derived`, `refs` (each `{ref, path, start, end, span, language, excerpt, permalink, changes}`; `changes` is the diff status of the excerpt lines: `added` and `modified` head lines, and `removed` base lines `{at, base, text}` that show before head line `at`), `controls` (the patch of each control), `diff` (`files`, `deleted`, `created`, `added`, `symbols`). |
| `explain.json` | you, in strict STE | `diagrams` (architecture diagrams `{title, description, eli5, detailed}` and typed diagrams `{kind, ...}`), `walkthroughs`, `change.areas`, `change.chapters`, `unclaimed` (`notes`, `roles`, `core`), `risks`, `verdict.checks`, `control_walkthroughs`, `bullets`. |

`derived` holds each value that the review CLI, the PR body and the page share:

- `promises`, `claims`, `bars`, `verify`, `unclaimed`, `bugs`, `ready`: as before.
- `merge`: `{form, items, blockers, accept}`. `items` are the blockers (not ready) or the risks to accept; `accept` holds the risks to accept in each form. The checklist lists the blockers, then the risks to accept, in this order: the riskiest first.
- `spine`: the changed files by chapter. Each group `{id, name, tier, explain, files, flags, reviewable}`; each file `{path, file, added, removed, role, claims, status, main, flags, diff}`. `status.kind` is `check`, `ask`, `read` (no claim), `partial` (covered in part), `protected`, `skim`, `test`, `other` or `deleted`. `unassigned` lists each changed non-test file that no chapter holds.
- A **flag** ("look closely") is `{level, source, path, line, text, trigger, ref}`: `risk`, `question` or `nit`, from a verified source only: a find-bugs finding, a check that missed or cannot fail (at the line its planted bug changed), or risky code with no claim. Zero flags is valid.
- `checks`: per check `{name, kind, result, claims (with the parts it backs), tests, controls, ref}`. `tests`: how many changed tests back no claim (`orphan_tests`, `summary`, `action`).

## The chapters

The page is an `ExplainerShell paged`: one `Section` per chapter, ids `ch-0` to `ch-8`. With JavaScript, one chapter shows at a time, with previous and next links, a "you are here" marker in the rail, and "Read as one page". Without JavaScript, every chapter renders in sequence.

| Chapter | Content |
|---|---|
| `ch-0` Start | A `Lead` of about three plain lines, then `ReviewStart`: "Not ready: N things to review", the progress, the riskiest three, the ways in. |
| `ch-1` The problem and the change | A `DefinitionList` (before, after, the main risk) and the story diagram in Simple and Detailed. |
| `ch-2` How it works | A `StepThrough` around a numbered `ArchitectureDiagram` and its `Steps`: one finding (or one request) through the loop, one step at a time, its station lit. |
| `ch-3` What changed | `DiffSpine`: the files to read first, then the chapters of the change. A chapter shows each file to act on with its claims (each claim once), its flags and its main change; the rest of its files is one line with a link to the diff. |
| `ch-4` Reading the evidence | `EvidenceGuide`: promise to claim (parts) to check; surface to bar to met or below; one bug with two results; can the checks catch a bug; the marks. |
| `ch-5` The checks | `VerifierView`: how many changed tests back no claim, then the checks by promise, each a check row. |
| `ch-6` Check yourself | `UnderstandingCheck`: two or three questions from the data, answered at once, never stored. |
| `ch-7` The review | `ReviewChecklist`: each item, its evidence inline, the reviewer's call (OK, Needs a fix, Accept the risk) and a note, kept in this browser. |
| `ch-8` The verdict | `ReviewVerdict`, `ApproveChecks`, the trade-offs and concerns in Markdown, then `Glossary only="used"`. |

Title each chapter with the question it answers. Open it with a `Lead` where it helps. Write no CSS.

## Copy

Write the narrative and the text of `explain.json` with the asd-ste100 skill: apply its rules as you write, and do not only make the lint pass. Each sentence states a fact that the reader needs.

- No slogans and no reassurance. "It only copies. Nothing is posted." → delete it. "Bad edits never ship." → "The accept rule undoes an edit that adds a severe finding."
- No label in front of a paragraph or a `Lead`. "**In plain words.** The wallet refuses an overdraft." → "The wallet refuses an overdraft."
- A control's label says what it does, and nothing else: "Copy as Markdown", not "Copy my review (nothing is sent)".
- Say a fact once, where it matters. Where the review calls are stored goes in the `ch-7` `Lead`: "This browser stores your calls and notes for this PR head." Never under each control.
- No stock phrases: "only as strong as its weakest claim" → "A promise takes the strength of its weakest claim."
- **Every block answers a reader question; no raw enumerations; no title-joins.** Before a block goes on the page, say what it helps the reader understand or decide. A list of every file, link, test or check, a count with no meaning, or the same data a second time answers nothing: cut it, or say what matters in one sentence. "Run it all from one command imports Trim the old pipelines: 27 imports." joins two titles with a bare word → cut it. "Show all 71 files" over a list of test names → "301 changed tests back no claim."

## The chapters of the change (`change.chapters`)

- One idea each, titled as a plain action ("Gate every finding before the editor sees it"), never a file name.
- `tier`: `core`, `supporting`, `wiring`, `data`, `docs` or `generated`; the page reads them in this order, the core change first.
- `explain`: one or two paragraphs of 25 to 60 words: what happens at runtime and why. Do not restate the diff.
- `files`: paths or path prefixes, in reading order. Each changed non-test file must be in exactly one chapter: the longest prefix wins. A file in none goes to a chapter "Files that no chapter holds", with the action to read it. Test files are not a chapter: they show as the checks they provide (`ch-5`).
- `diagrams`: names of typed diagrams of `explain.json` to draw at the top of the chapter.
- Ids `code`, `test`, `other`, `deleted` and `unassigned` are reserved.

## Typed diagrams

Draw a typed diagram when a picture explains faster than prose. They use Diagram Design's grammar (see `references/diagram-design.md`) with our layers on top: a `status` per element (`added`, `changed`, `removed`, `same`) that drives a Before / After switch, a `code` name per element for the Detailed mode, and a `chapter` that links an element to its chapter.

- `sequence`: `actors` (at most 5) and `steps` (at most 12 messages): `{from, to, label, reply?, async?, headline?}`, `{note, over}`, `{loop, over}` ... `{end: true}` (one loop frame), `{divider}`.
- `state`: `start`, `nodes` (`end`, `focal`), `edges` with a label each (the event that moves the state).
- `schema`: `entities` (`fields` with `key: pk|fk` and their own status) and `links` with `cardinality`.
- `flow`: `nodes` and `edges`.

## Before you approve (`verdict.checks`)

Each check is a thing to do: `check` (a verifier id: the page shows its real command), `run` (a command), `ref` (lines to read at the head), `file` (a file to compare) or `inputs` (real inputs for a manual test). The export fails on a check with none of these. No generic advice.

## Stable anchors

- The chapters `#ch-0` to `#ch-8`. The old level anchors still land, as aliases: `#story`, `#why`, `#loop`, `#changed`, `#change`, `#unclaimed`, `#verifiers`, `#checks`, `#exercises`, `#promises`, `#tradeoffs`, `#glossary`.
- `#merge` for the merge state; `#promise-<id>` and `#claim-<id>`, lowercased; an old claim id of `legacy_ids` opens the claim that joins it; `#file-<path>` and `#spine-<chapter>`.

A link to a target in another chapter shows that chapter and opens each block around the target. Each claim's full detail shows once on the page: in its checklist item, else in its promise. Every other place shows its claim row.

## The page

```mdx
import { ApproveChecks, ArchitectureDiagram, CodeRef, Definition, DefinitionList, DiffSpine, Disclosure, EvidenceGuide, ExplainerShell, Glossary, Glossed, Lead, PromiseLink, ReviewChecklist, ReviewStart, ReviewVerdict, Section, Step, Steps, StepThrough, UnderstandingCheck, VerifierView } from 'visual-explainer-mdx/components';
import trust from './trust-map.json';
import refs from './refs.resolved.json';
import explain from './explain.json';

<ExplainerShell title="PR #7: Refuse overdrafts in the wallet" summary="A guided review." paged appearance="auto" reviewTools={false}>

<Section id="ch-0" title="What does this PR do, and can it merge?" navLabel="Start" aliases={['story']}>
<Glossed data={trust} expand><Lead>

The wallet now refuses an overdraft. A planted bug proves the overdraft rule.

</Lead></Glossed>
<ReviewStart data={trust} refs={refs} />
</Section>

{/* ch-1 to ch-8 as the table above: DiffSpine, EvidenceGuide, VerifierView, UnderstandingCheck, ReviewChecklist, ReviewVerdict with ApproveChecks and Glossary */}

</ExplainerShell>
```

The earlier level ladder (`MergeVerdict`, `PromiseList`, `VerifyTheVerifiers`, `UnclaimedChanges`, `WhatChanged`) still renders for an older MDX.

## The export checks

`ve:export` pre-renders the page (React on the server, then the browser hydrates it), so every chapter shows its text without JavaScript. It fails on each finding:

- **Data:** the trust map and the refs are valid and at the map head; the change areas, the chapters (paragraph length, titles, the diagrams that they name) and the typed diagrams (their elements and Diagram Design's budgets) are valid; each verdict check is concrete.
- **Narrative prose:** no `[CVK]\d+` ID and no backticked code name outside a `Disclosure` body, a table, a `CodeRef` or a data component.
- **Glossary:** each `Term` and each abbreviation of the prose has an entry. `Glossed` marks a term once per chapter, at most eight per chapter, and never an everyday word (draft, check, editor, loop, document, test: `glossary-policy.mjs`); the export fails on more. It spells out each abbreviation once on the page, so count those words against the 25-word sentence cap, and do not put an abbreviation inside parentheses.
- **Links and anchors:** each `#fragment` link has a target, and no id shows twice (so each claim's detail renders once).
- **Actions:** the evidence chapter opens its checks with the result line; each weak check, the weakest check of each claim and each unclaimed file has an action.
- **No hand copy:** with `--guard-repo` and `--guard-head`, two or more lines of the MDX that match two lines of a tracked file at the head fail the export.
- **Copy:** no sentence that matches a slogan rule of `scripts/ve-mdx/copy-rules.mjs`, no label run-in, and no sentence twice. A repeat counts in the narrative and in a component outside its records; the same value in two claims, checks or files is data.
- **Enumerations:** no block joins two titles of the page (chapter titles, headings, promise labels) with one or two bare words, as in "<Title> imports <Title>", and no opener (a `Disclosure`) holds only a list of more than 10 items with no sentence that says why to read it (`copy-rules.mjs`).
- **STE:** `ste-lint.py` of the asd-ste100 skill finds no hard violation in the narrative and the component text (records excluded). `--ste-lint <path>` or `VE_STE_LINT` points at another lint; `off` turns the check off.

The reviewer's calls, the Reviewed boxes and the done boxes stay in `localStorage` under `understando-review:<head>:<trust-map sha256>`. The export button copies them as Markdown for a PR comment.
