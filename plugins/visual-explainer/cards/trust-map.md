# Verification explainer

An explainer that shows how the claims of a change are verified: the invariants, the claims, the checks that back them, the bugs that we planted to prove that a check can fail, the formal proofs and the code. The data comes from understando's export. You write the narrative as Markdown in one `explainer.mdx`; the components render the data, validate it and fail the export on bad data. They never compute a result again, and code comes in only through a code ref.

## A worked example first

The fixture `scripts/ve-mdx/fixtures/trust-map` is a complete page. One claim of it, from the data to the page:

1. `trust-map.json` has the claim `C08`, "The withdraw function never returns a negative balance", with `checks: ["V08"]`, `invariant: "I1"` and a code ref `{path: "wallet/core.py", symbol: "withdraw", match: "if amount > balance:"}`.
2. The check `V08` is a `lean` proof. Its `formal` block names the tool, the proof file and a conformance run that ties the model to the code.
3. The control `K08` names `V08`: it removes the guard from the model. Its `result.status` is `red`, so the proof caught the planted bug.
4. The invariant `I1`, "The balance is never below zero.", has `author: "user"` and `status: "accepted"`, so it can back a Formal claim.
5. `refs.resolved.json` holds the lines of the code ref at the head with their diff status, the patch of `K08`, and `derived.claims.C08`: strength `Formal`, its check results and its bar.
6. In the MDX, `<VerifierView data={trust} refs={refs} />` renders `C08` once, as a closed claim. Opened, it shows the evidence, the accepted invariant, the code with its added lines, and the check row of the proof with its conformance link and the diff of the planted bug.

```mdx
import { CodeRef, EvidenceGuide, ExplainerShell, Glossary, Invariants, Lead, Section, VerifierView, WorkedExample } from 'visual-explainer-mdx/components';
import trust from './trust-map.json';
import refs from './refs.resolved.json';
import explain from './explain.json';

<ExplainerShell title="Refuse overdrafts in the wallet: what is verified" paged appearance="auto" reviewTools={false}>

<Section id="ch-0" title="What does the wallet promise?" navLabel="The promise">
<Lead>

The wallet now refuses an overdraft.

</Lead>
<WorkedExample refs={refs} id="overdraft-before-after" explain={explain} />
<WorkedExample refs={refs} id="one-withdrawal" explain={explain} />
</Section>

<Section id="ch-1" title="Which rules must always hold?" navLabel="The invariants">
<Invariants data={trust} />
</Section>

<Section id="ch-2" title="How do you read the evidence?" navLabel="Reading the evidence">
<EvidenceGuide data={trust} refs={refs} checks="#ch-3" />
</Section>

<Section id="ch-3" title="Which checks back each claim?" navLabel="The claims and checks">
<VerifierView data={trust} refs={refs} explain={explain} />
</Section>

<Section id="ch-4" title="The words on this page" navLabel="Glossary">
<Glossary data={trust} only="used" />
</Section>

</ExplainerShell>
```

## The data contract

The MDX imports the JSON files from its own folder. The minimal shape is enough; each other field adds a part of the page.

| File | Must hold | Can also hold |
|---|---|---|
| `trust-map.json` | `schema_version` 1 or 2, `head`; `claims` (`{id, text, source, checks}`, and `code`, `name`, `plain`, `invariant` or `invariants`, `waiver`, `legacy_ids`, `parts`); `verifiers`, the checks (`{id, kind, claims, tier, description, provenance}`, and `name`, `command`, `baseline`, `formal`, `recorded`, `mechanical`, `artifact`); `controls`, the planted bugs (`{id, verifier, description, result.status}`: `red` caught the bug, `green` missed it) | `invariants` (`{id, text, author, status}`), `promises` (groups of claims, each claim in one), `glossary`, `flags`, `repo`, `pr` |
| `refs.resolved.json` | `schema` 2, `head`; `refs` (each resolved code ref: `{ref, path, start, end, language, excerpt, permalink, changes}`); `controls` (the patch of each control); `derived.head`, `derived.claims` (per claim: `strength`, `checks` with their `result`, `summary`, `weakest`), `derived.verify` (`result`, `tone`, `caught`, `missed`, `cannot`, `other`, `weak`, `broke`) | `derived.promises` (when the map has promises), `derived.bars`, `derived.checks`, `derived.tests`, `verify.evals`, `verify.ui`, `diff`, `examples` |
| `explain.json` | nothing | `diagrams` (architecture `{title, description, eli5, detailed}` and typed `{kind, ...}`), `risks` (`{claims, why, fix}`), `control_walkthroughs` |

Without `promises`, the claims show as one group, weakest first, and the guide skips the promise part. A check `result` is `caught`, `missed`, `cannot-fail`, `broken`, `no-bug`, `recorded`, `checked` or `none`. A strength is `Formal`, `Proven`, `Backed`, `Asserted` or `Gap`.

## The components

- `Invariants`: each rule, accepted by the user or only proposed. Only an accepted rule can make a claim Proven or Formal; a claim shows its invariants in its detail.
- `VerifierView`: each claim once, by promise when there are promises. A claim is a `ClaimDetail`: its worked examples, its evidence and bar, its invariants, its code (`ChangedCode`), then a `CheckRow` per check with its command, its result, its planted bugs as diffs and the conformance link of a formal check.
- `EvidenceGuide`: how to read the evidence, worked on this data: a promise rests on its claims, the bar of a claim, one bug with two results, and whether the checks can catch a bug at all, with the key of the marks. Its `checks` prop links to the claims.
- `CodeRef` (and `ChangedCode` in the data components): the lines of a ref at the head, highlighted, with `+`, `~` and `-` line marks from `changes`. Never paste code.
- `WorkedExample`: one run of real values through the flow, from a fixture, a trace, a vector or a control run, with the source of each value (understando `scripts/example.py`). Never member or patient data.
- `ClaimRow`, `CheckRow`, `BarCard`, `ClaimTimeline`, `PromiseLink`, `Glossed`, `Glossary`, `ArchitectureDiagram`, `TypedDiagram`, `StepThrough`: the rows, the words and the figures that the parts share.
- `PromiseList`, `PromiseChips` and `VerifyTheVerifiers` render the same data as one long level each, for a page that is not paged.

## The page

- Use `ExplainerShell paged`, one `Section` per chapter. Title each chapter with the question that it answers. A chapter that explains how something works leads with a `WorkedExample`; the diagram comes after it.
- Put each claim's detail on the page once, and each worked example that a claim names: the detail links to it. Links go to `#claim-<id>`, `#promise-<id>` and `#example-<id>`; `aliases` keep old anchors working.
- A typed diagram element with `chapter` links to that anchor, for example `claim-c01`.
- Write no CSS.

## Copy

Write the narrative and the text of `explain.json` with the asd-ste100 skill. Each sentence states a fact that the reader needs.

- No slogans and no reassurance. "Bad edits never ship." → "The accept rule undoes an edit that adds a severe finding."
- No label in front of a paragraph or a `Lead`. "**In plain words.** The wallet refuses an overdraft." → "The wallet refuses an overdraft."
- Say a fact once, where it matters. No stock phrases: "only as strong as its weakest claim" → "A promise takes the strength of its weakest claim."
- Every block answers a reader question: no raw list of every file or test, and no two titles joined by a bare word.

## The export checks

`ve:export` pre-renders the page, so it reads without JavaScript. It fails on each finding:

- **Data:** the map and the refs are valid and at the same head; each claim lists checks that the map has; each control names a check of the map.
- **Prose:** no claim, check or control ID and no code name in the narrative, outside a `Disclosure`, a table, a code ref or a data component.
- **Glossary:** each term and abbreviation has an entry; a chapter marks at most eight terms, each once, and never an everyday word.
- **Worked examples:** a chapter with a `StepThrough` or a `WorkedExample` leads with the example, and each step names its sources.
- **Links:** each `#fragment` has a target, and no id shows twice.
- **Actions:** the verify block opens with its result line ("4 of 5 checks caught their planted bug."), and each weak check and the weakest check of each claim has an action.
- **Copy:** no slogan of `scripts/ve-mdx/copy-rules.mjs`, no label run-in, no sentence twice, no title join, no opener that holds only a long list, and no hard violation of `ste-lint.py` (`--ste-lint <path>` or `VE_STE_LINT`; `off` turns it off).
- **No hand copy:** with `--guard-repo` and `--guard-head`, two lines of the MDX that match two lines of a tracked file at the head fail the export.

The export stamps the head and the SHA-256 of the map in `<meta name="ve-trust-map-head">` and `<meta name="ve-trust-map-sha256">`, so a reader can tell when the page is stale.
