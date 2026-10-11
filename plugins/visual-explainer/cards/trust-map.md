# Trust-map explainer: the guided review

An explainer for one PR's trust map (understando). It is a **guided review**: chapters that take a reviewer from what the PR does, through how it works and what changed, to the checklist and the merge call. You write the narrative as Markdown in one `explainer.mdx`; each chapter that comes from data is a component of `visual-explainer-mdx/guided-review.tsx` or `trust-map.tsx` that you drop in. The components validate their data, so the export fails on bad data. They render the derived values of understando (`scripts/derive.py`) and never compute them again. Code comes in only through `CodeRef` and the resolved refs; never paste it.

## The data contract

The MDX imports three JSON files from its own folder:

| File | Written by | Holds |
|---|---|---|
| `trust-map.json` | the map, the controls and the verdicts | `schema_version` 1 or 2 (promise, claim, check), `head`, `claims`, `verifiers`, `controls`, `promises`, `flags`, `summary`, `glossary`, `invariants`. Each claim lists `checks` (verifier ids), and can have `legacy_ids` and `parts`. Each promise, claim and check has a plain `name`. |
| `refs.resolved.json` | `understando explain` (it resolves each ref at the head; `derive.py` writes `derived`) | `schema` 2, `head`, `derived`, `refs` (each `{ref, path, start, end, span, language, excerpt, permalink}`), `controls` (the patch of each control), `diff` (`files`, `deleted`, `created`, `added`, `symbols`, `imports`). |
| `explain.json` | you, in strict STE | `diagrams` (architecture diagrams `{title, description, eli5, detailed}` and typed diagrams `{kind, ...}`), `walkthroughs`, `change.areas`, `change.chapters`, `unclaimed` (`notes`, `roles`, `core`), `risks`, `verdict.checks`, `control_walkthroughs`, `bullets`. |

`derived` holds each value that the review CLI, the PR body and the page share:

- `promises`, `claims`, `bars`, `verify`, `unclaimed`, `bugs`, `ready`: as before.
- `merge`: `{form, items, blockers, accept}`. `items` are the blockers (not ready) or the risks to accept; `accept` holds the risks to accept in each form. The checklist lists the blockers, then the risks to accept, in this order: the riskiest first.
- `spine`: the changed files by chapter. Each group `{id, name, tier, explain, files, flags, reviewable}`; each file `{path, file, added, removed, role, claims, status, main, flags, diff}`. `status.kind` is `check`, `ask`, `read` (no claim), `partial` (covered in part), `protected`, `skim`, `test`, `other` or `deleted`. `unassigned` lists each changed non-test file that no chapter holds; `links` are the imports between chapters; `github` is every path in GitHub's order.
- A **flag** ("look closely") is `{level, source, path, line, text, trigger, ref}`: `risk`, `question` or `nit`, from a verified source only: a find-bugs finding, a check that missed or cannot fail (at the line its planted bug changed), or risky code with no claim. Zero flags is valid.
- `checks`: per check `{name, kind, result, claims (with the parts it backs), tests, controls, ref}`. `tests`: the changed test files as the checks they provide, and the changed tests that back no claim (`orphans`, `summary`, `action`).

## The chapters

The page is an `ExplainerShell paged`: one `Section` per chapter, ids `ch-0` to `ch-9`. With JavaScript, one chapter shows at a time, with previous and next links, a "you are here" marker in the rail, and "Read as one page". Without JavaScript, every chapter renders in sequence.

| Chapter | Content |
|---|---|
| `ch-0` Start | A `Lead` of about three plain lines, then `ReviewStart`: "Not ready: N things to review", the progress, the riskiest three, the ways in. |
| `ch-1` The problem and the change | A `DefinitionList` (before, after, the main risk) and the story diagram in Simple and Detailed. |
| `ch-2` How it works | A `StepThrough` around a numbered `ArchitectureDiagram` and its `Steps`: one finding (or one request) through the loop, one step at a time, its station lit. |
| `ch-3` What changed | `DiffSpine`: the chapters of the change, the map of how they connect, and each file with its claims, its flags and its main change. |
| `ch-4` Reading the evidence | `EvidenceGuide`: promise to claim (parts) to check; surface to bar to met or below; one bug with two results; can the checks catch a bug; the marks. |
| `ch-5` The checks | `VerifierView`: the checks by promise, each a check row; the tests that back no claim; the test files as the checks they provide. |
| `ch-6` Check yourself | `UnderstandingCheck`: two or three questions from the data, answered at once, never stored. |
| `ch-7` The review | `ReviewChecklist`: each item, its evidence inline, the reviewer's call (OK, Needs a fix, Accept the risk) and a note, kept in this browser. |
| `ch-8` The verdict | `ReviewVerdict`, `ApproveChecks`, the trade-offs and concerns in Markdown, then `Glossary only="used"`. |
| `ch-9` Every changed file | `FullDiff`: every file in GitHub's order, with its chapter and its diff on GitHub. |

Title each chapter with the question it answers. Open it with a `Lead` where it helps. Write no CSS.

## The chapters of the change (`change.chapters`)

- One idea each, titled as a plain action ("Gate every finding before the editor sees it"), never a file name.
- `tier`: `core`, `supporting`, `wiring`, `data`, `docs` or `generated`; the page reads them in this order, the core change first.
- `explain`: one or two paragraphs of 25 to 60 words: what happens at runtime and why. Do not restate the diff.
- `files`: paths or path prefixes, in reading order. Each changed non-test file must be in exactly one chapter: the longest prefix wins. A file in none goes to a chapter "Files that no chapter holds", with the action to place it. Test files are not a chapter: they show as the checks they provide (`ch-5`).
- `diagrams`: names of typed diagrams of `explain.json` to draw at the top of the chapter.
- Ids `code`, `test`, `other`, `deleted` and `unassigned` are reserved.

## Typed diagrams

Draw a typed diagram when a picture explains faster than prose. They use Diagram Design's grammar (see `references/diagram-design.md`) with our layers on top: a `status` per element (`added`, `changed`, `removed`, `same`) that drives a Before / After switch, a `code` name per element for the Detailed mode, and a `chapter` that links an element to its chapter.

- `sequence`: `actors` (at most 5) and `steps` (at most 12 messages): `{from, to, label, reply?, async?, headline?}`, `{note, over}`, `{loop, over}` ... `{end: true}` (one loop frame), `{divider}`.
- `state`: `start`, `nodes` (`end`, `focal`), `edges` with a label each (the event that moves the state).
- `schema`: `entities` (`fields` with `key: pk|fk` and their own status) and `links` with `cardinality`.
- `flow`: `nodes` and `edges`.
- The map of how the changed files connect is automatic, from the imports between chapters.

## Before you approve (`verdict.checks`)

Each check is a thing to do: `check` (a verifier id: the page shows its real command), `run` (a command), `ref` (lines to read at the head), `file` (a file to compare) or `inputs` (real inputs for a manual test). The export fails on a check with none of these. No generic advice.

## Stable anchors

- The chapters `#ch-0` to `#ch-9`. The old level anchors still land, as aliases: `#story`, `#why`, `#loop`, `#changed`, `#change`, `#unclaimed`, `#verifiers`, `#checks`, `#exercises`, `#promises`, `#tradeoffs`, `#glossary`.
- `#merge` for the merge state; `#promise-<id>` and `#claim-<id>`, lowercased; an old claim id of `legacy_ids` opens the claim that joins it; `#file-<path>` and `#spine-<chapter>`.

A link to a target in another chapter shows that chapter and opens each block around the target. Each claim's full detail shows once on the page: in its checklist item, else in its promise. Every other place shows its claim row.

## The page

```mdx
import { ApproveChecks, ArchitectureDiagram, CodeRef, Definition, DefinitionList, DiffSpine, Disclosure, EvidenceGuide, ExplainerShell, FullDiff, Glossary, Glossed, Lead, PromiseLink, ReviewChecklist, ReviewStart, ReviewVerdict, Section, Step, Steps, StepThrough, UnderstandingCheck, VerifierView } from 'visual-explainer-mdx/components';
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

{/* ch-1 to ch-9 as the table above: DiffSpine, EvidenceGuide, VerifierView, UnderstandingCheck, ReviewChecklist, ReviewVerdict with ApproveChecks and Glossary, FullDiff */}

</ExplainerShell>
```

The earlier level ladder (`MergeVerdict`, `PromiseList`, `VerifyTheVerifiers`, `UnclaimedChanges`, `WhatChanged`) still renders for an older MDX.

## The export checks

`ve:export` pre-renders the page (React on the server, then the browser hydrates it), so every chapter shows its text without JavaScript. It fails on each finding:

- **Data:** the trust map and the refs are valid and at the map head; the change areas, the chapters (paragraph length, titles, the diagrams that they name) and the typed diagrams (their elements and Diagram Design's budgets) are valid; each verdict check is concrete.
- **Narrative prose:** no `[CVK]\d+` ID and no backticked code name outside a `Disclosure` body, a table, a `CodeRef` or a data component.
- **Glossary:** each `Term` and each abbreviation of the prose has an entry.
- **Links and anchors:** each `#fragment` link has a target, and no id shows twice (so each claim's detail renders once).
- **Actions:** the evidence chapter opens its checks with the result line; each weak check, the weakest check of each claim and each unclaimed file has an action.
- **No hand copy:** with `--guard-repo` and `--guard-head`, two or more lines of the MDX that match two lines of a tracked file at the head fail the export.

The reviewer's calls, the Reviewed boxes and the done boxes stay in `localStorage` under `understando-review:<head>:<trust-map sha256>`. The export button only copies Markdown for a PR comment; nothing is posted.
