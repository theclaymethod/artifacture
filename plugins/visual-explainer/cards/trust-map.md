# Trust-map explainer

An explainer for one PR's trust map (understando): it gets a reader up to speed on the PR, then shows how far to trust each promise. You write the narrative as Markdown in one `explainer.mdx`. Each level that comes from data is a component of `visual-explainer-mdx/trust-map.tsx` that you drop in. The components validate their data, so the export fails on bad data. They render the derived values of understando (`scripts/derive.py`). They never compute them again. Code comes in only through `CodeRef`; never paste it.

## The data contract

The MDX imports three JSON files from its own folder:

| File | Written by | Holds |
|---|---|---|
| `trust-map.json` | the map, the controls and the verdicts | `schema_version` 1 or 2 (`TRUST_MAP_SCHEMAS`), `head`, `claims`, `verifiers`, `controls`, `promises`, `flags`, `summary`, `glossary`, `invariants`. Schema 2 is promise, claim, check. A promise is one thing that the PR guarantees. A claim is one statement that a reviewer accepts or rejects. A check is one verifier with its controls. Each claim lists `checks` (verifier ids, never empty). Each verifier is a check of one or more claims. A verifier of kind `none` is a placeholder: no tool checks the claim. A claim can have `legacy_ids` (the old claim ids that it joins), `parts` (the old statements) and `invariants`. Each promise, claim and check has a plain `name`. Schema 1 has no `claims[].checks`: each verifier lists its claims. |
| `refs.resolved.json` | `understando explain` (it resolves each ref at the head, and `scripts/derive.py` writes `derived`) | `schema` 2 (an older file fails: run `understando explain` again), `head` (it must equal the map head), `derived`, `refs` (each `{ref, path, start, end, span, language, excerpt, permalink}`), `controls` (per control id, each changed file as a `patch`, a `before`/`after` pair or a `note`), `diff` (`files` as `path: [added, removed]`, `deleted`, `created`, `added` line ranges, and `symbols`). |
| `explain.json` | you, in strict STE | `diagrams` (each `{title, description, eli5, detailed}`), `walkthroughs`, `change.areas` (`{id, name, paths, replaced_by or note, rollup}`), `unclaimed` (`notes`, `roles` as plain file roles, `core` path prefixes), `risks` (`{claims, why, fix}`), `control_walkthroughs`, `bullets` (for the PR body). No narrative: the narrative is the MDX. |

`derived` holds each value that the review CLI, the PR body and the page share. The components read it and do not compute it again:

- `promises`: `{id, strength, claims, count, tally}`, weakest first. The strength of a promise is the strength of its weakest claim.
- `claims`: per claim id, `{strength, tier, checks, n, counts, summary, weakest}`. The strength of a claim is the strength of its weakest check. `summary` is the check line, for example "5 checks: 4 caught their bug, 1 missed.". `weakest` is `{id, name, result, strength, text, action}`.
- `verify`: `{result, other, tone, weak, by_promise, tiers, broke}`. `result` counts checks, not controls. `broke` is the full "what we broke" sentence of each control.
- `unclaimed`: `{files, core, summary}`. `summary` is `{risky, rest, lead, quiet}`.
- `merge`, `ready`, `risky_unclaimed`, `bugs`.

At export, the pipeline highlights the code of `refs.resolved.json` and stamps the page with `<meta name="ve-trust-map-head">` and `<meta name="ve-trust-map-sha256">` (the SHA-256 of `trust-map.json`), so a reader can tell when the page is stale.

## Parts and evidence bars

A claim holds parts, one for each statement. A part is as strong as its strongest check, and a claim is as strong as its weakest part (`derived.claims[id].parts`, `weakest`, `flagged`). A check that missed its bug is a flag with an action, not a score.

Each claim has an evidence bar for its surface (`derived.claims[id].bar`), and the PR has a bar summary (`derived.bars`). understando's `references/evidence-bars.md` is the only source of the bars: do not restate them in a page or a card. The components show the bars from the derived data:

- The merge verdict lists each risky claim below its bar. "Why you can trust it, by evidence bar" names the bars that the PR met.
- Each claim summary has a bar chip ("Bar: proof · met"). Each promise shows "N of M claims meet their bar".
- "Can these checks catch a bug?" has one part for each kind of control. The parts are degraded variants for evals (`derived.verify.evals`), broken-UI runs (`derived.verify.ui`), and planted bugs and mutants.
- A frontend check with `artifact.video` shows the recorded video in a Disclosure, with its screenshots. The video has controls, a poster frame, and captions or a summary. It never plays by itself. Without JavaScript, the poster frame and a link show.
- the PR section has a Surface and a Bar column, and the bar summary line.

## Stable anchors

Other tools deep-link into the page, so keep these ids:

- the levels: `#story`, `#why`, `#loop`, `#changed`, `#promises`, `#verifiers`, `#unclaimed`, `#tradeoffs`, `#exercises`, `#glossary` (the `Section` ids);
- `#merge` for the merge verdict;
- `#promise-<id>` and `#claim-<id>`, lowercased, for example `#claim-c05`. An old claim id of `legacy_ids` opens the claim that joins it.

A link to a collapsed claim opens it and each block around it. Without JavaScript the pre-rendered page still lands on it and shows its body.

## The components

Import them from `visual-explainer-mdx/components` (the export resolves the bare name). Pass `data={trust}`, and `refs={refs}` and `explain={explain}` where the table says so.

| Component | Level | Renders |
|---|---|---|
| `MergeVerdict` (refs) | story, first | "Can you merge it?" from `derived.merge`: Not ready, Ready if you accept, or Ready, with up to three items, each a link. (derive.py: a Gap or Asserted promise with a reviewer action blocks unless each weak claim is waived; a failed ready gate blocks; a Backed promise with an action, a waived claim and changed code with risk and no claim are risks to accept.) Then the bugs found, in the find-bugs heading format, each with its detail collapsed, and the ready checklist when ready.json is at the map head. |
| `PromiseChips` (refs), `VerdictLegend` | story | One chip per promise, weakest first, with its strength; the verdict key (`#story-legend`). |
| `ArchitectureDiagram spec={explain.diagrams.x}` | any | A diagram in a Simple and a Detailed mode. The export fails when a mode is missing, when Detailed has more than 1.5 times the boxes, or when Simple shows a code name. |
| `Walkthrough spec={...}` | loop | A step-by-step motion figure, collapsed. |
| `PromiseLink id="G1"` | loop | "Promise: <label>", a link to the promise. |
| `CodeRef refs={refs} path=... symbol=... [match, context, part]` | any | The lines of a ref at the head with their permalink. Write the attributes as strings or JSON, so `understando explain` can read the ref from the MDX. |
| `Invariants` | why | The invariants, confirmed or proposed, collapsed. |
| `WhatChanged` (refs, explain) | changed | The before-and-after diagram and the "replaced by" table, from the diff. |
| `PromiseList` (refs, explain) | promises | Each promise, weakest first: sentence, strongest tier, strength pill, the claim count and tally of `derived.promises` ("Its 4 claims: 3 Proven, 1 Gap."), reviewer action, cheapest fix. Its claims are collapsed, each a `ClaimDetail`. A risk can name an old claim id. |
| `ClaimDetail` (refs, claim) | promises | The summary row: the strength pill and the claim name. The body: the `summary` of `derived.claims`, the weakest check with its action, the plain what and proof, the verdict, tier, source and invariant. Then the statements that the claim joins (collapsed), the code from refs, and all checks in one collapsed block. A kind `none` check is one plain line. |
| `VerifyTheVerifiers` (refs, explain) | verifiers | From `derived.verify`. It opens with `result` ("42 of 44 checks caught their planted bug.") and a tone, then `other` in a quieter line. Then one card per `weak` entry (what we broke, what happened, why it matters, one reviewer action, the planted bug collapsed), the checks that caught their bug by promise, the checks per tier, and the example motion, the map and the full table, collapsed. Each "what we broke" text is a sentence of `broke`. Title the level "Can these checks catch a bug?". |
| `UnclaimedChanges` (refs, explain) | unclaimed | From `derived.unclaimed`. It opens with `summary.lead`, then `summary.quiet` in a quieter line. Then each file that no claim covers, riskiest first (five cards, the rest collapsed), with its role, what changed, why it is risky and one action. Then the commands for the author and the core files, covered in part. |
| `Glossary` | glossary | The map's words, then understando's words. |
| `Glossed` | any | Wrap narrative Markdown in it: the first use of each glossary word shows its definition. `expand` spells out each abbreviation at its first use; set it on the first level. |
| `promiseAnchors(trust, refs)` | promises | The rail anchors of the promises, for `<Section anchors={...}>`. |

## The page

```mdx
import { ArchitectureDiagram, CodeRef, Definition, DefinitionList, Disclosure, ExplainerShell, Glossary, Glossed, MergeVerdict, PromiseChips, PromiseLink, PromiseList, Section, Step, Steps, UnclaimedChanges, VerifyTheVerifiers, WhatChanged, promiseAnchors } from 'visual-explainer-mdx/components';
import trust from './trust-map.json';
import refs from './refs.resolved.json';
import explain from './explain.json';

<ExplainerShell title="PR #7: Refuse overdrafts in the wallet" summary="One sentence." chapterNav appearance="auto" reviewTools={false}>

<Section id="story" title="The story: what changed, and why you can trust it" navLabel="The story" anchors={[{ id: 'merge', label: 'Can you merge it?' }, { id: 'story-promises', label: 'What the PR promises' }]}>

<MergeVerdict data={trust} refs={refs} explain={explain} />

<Glossed data={trust} expand>
<DefinitionList size="lead">
<Definition term="The problem">Before this PR, a withdrawal could take the balance below zero.</Definition>
<Definition term="The change">The withdraw function now refuses an amount above the balance.</Definition>
<Definition term="Why you can trust it">A planted bug proves the overdraft rule.</Definition>
</DefinitionList>
</Glossed>

<ArchitectureDiagram spec={explain.diagrams.story} name="story" />

<PromiseChips data={trust} refs={refs} />

</Section>

<Section id="loop" title="The loop: one run, step by step" navLabel="The loop">

<Steps label="The steps of one run">
<Step id="loop-step-1">
A caller asks the wallet to take an amount. <PromiseLink data={trust} id="P1" />

<Disclosure summary="Show the code for this step">
<CodeRef refs={refs} path="wallet/core.py" symbol="withdraw" />
</Disclosure>
</Step>
</Steps>

</Section>

{/* changed: WhatChanged; promises: PromiseList with anchors={promiseAnchors(trust, refs)}; verifiers: VerifyTheVerifiers; unclaimed: UnclaimedChanges; tradeoffs: Markdown lists; glossary: Glossary */}

</ExplainerShell>
```

Write the story, the why, the loop and the trade-offs in plain Markdown, in strict STE. The why level quotes the user's requests from the journal as `<blockquote data-quote="user">`, each with the claims it asked for in a `Disclosure`.

## The export checks

`ve:export` pre-renders a page that uses these components (React on the server, then the browser hydrates it), so the page shows its text, tables, the merge verdict, the promises and the claims with JavaScript off. Then it runs these checks and fails on each finding:

- **Data:** the trust map and the refs are valid (the schema version, each claim in exactly one promise, in schema 2 each claim with checks that exist and each verifier a check of a claim, a derived row for each claim, each weak promise with a reviewer action, no claim, verifier or control ID in a promise label, sentence or action, refs at the map head, each code ref resolved), the change areas and the unclaimed notes name changed files, the diagrams have two modes.
- **Narrative prose:** no `[CVK]\d+` ID and no backticked code name outside a `Disclosure` body, a table and a `CodeRef`. The data components keep their own rules.
- **Glossary:** each `Term` and each abbreviation on the page has an entry in the glossary.
- **Links and anchors:** each `#fragment` link has a target, and no id shows twice.
- **Actions:** the verify level opens with its result line ("N of M checks caught their planted bug"). Each weak check, the weakest check of each claim and each risky unclaimed file has an action.
- **No hand copy:** with `--guard-repo <repo> --guard-head <sha>` (or `VE_GUARD_REPO` and `VE_GUARD_HEAD`), a block of two or more lines of the MDX that is the same, whitespace aside, as two lines of a tracked file at the head fails the export. Use a `CodeRef`.

`understando explain` resolves the refs, then runs `artifacture export explainer.mdx --out explainer.html --guard-repo <repo> --guard-head <head>` and `node scripts/ve-mdx/trust-map.mjs pr-section` for the PR-body section, from the same rules as the page. Fix a failure in the MDX or the data, never in the HTML.
