# Visual eval prefix caching

## Decision

Use one immutable evidence prefix per exact screenshot set, then append one
criterion-specific suffix per judgment. Treat coding-agent caching as
best-effort; use direct model API calls when cache telemetry or controlled
small-model selection matters.

The cacheable request order is:

1. fixed tool definitions;
2. fixed system/verdict contract;
3. fixed evidence interpretation instructions;
4. optional active design-system exception excerpt;
5. exact image blocks in stable state-id order;
6. cache breakpoint;
7. selected check ids and criterion prompt.

The image belongs before the variable criterion. The same PNG bytes, image
order, detail setting, model, tools, and shared instructions must be reused.

## What is possible

OpenAI prompt caching supports exact prompt-prefix reuse, including images.
Images and their `detail` setting must be identical. Direct Responses API calls
can place an explicit breakpoint on an `input_image` block and reuse a stable
`prompt_cache_key`.

Anthropic prompt caching also supports image blocks. The cache covers tools,
system, and messages through the selected breakpoint. The first request must
begin returning before concurrent requests can read the newly written cache.

Primary references:

- https://developers.openai.com/api/docs/guides/prompt-caching
- https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- https://code.claude.com/docs/en/sub-agents#how-forks-differ-from-named-subagents

## Coding-agent constraints

### Claude Code

Named subagents start with fresh context and a separate prompt cache. Separate
`ve-verifier-*` agents therefore cannot be assumed to share an image prefix.
Conversation forks share the parent's cache, but inherit the parent's system
prompt, tools, model, and history. That makes forks useful for same-model review
branches, not for switching every visual judgment to a cheaper model.

Artifacture's current `ve-verifier-*` agents are not image-prefix shaped. Their
agent definitions differ before the task begins, and each agent receives a
screenshot path in its variable task prompt, then reads the image through a tool.
The image tool result therefore arrives after the divergent prompt content.
Changing only rubric wording cannot make those calls share an image prefix. A
generic agent improves system/tool stability, but the image must still be
attached in the first request or loaded once before forking.

A cache-friendly Claude Code experiment is:

1. Load one evidence package in the parent.
2. Wait until that turn has begun returning.
3. Fork one branch per criterion, appending only the criterion suffix.
4. Compare with fresh named subagents.

Do not call this a cache hit unless provider usage exposes
`cache_read_input_tokens`.

### Codex

Codex is engineered around exact prefix reuse, including images and tools, but
changing the model, tool list, sandbox, approval mode, or working directory can
break the prefix. Full-history subagent forks preserve more of the prefix but
inherit the parent model. A fresh small-model subagent may be cheaper, but it
does not provide a measurable shared-image cache contract.

Do not infer cache success from elapsed time. Codex subagent results currently
do not expose `cached_tokens` or `cache_write_tokens` to Artifacture.

Codex source tests show root and child threads can share a session-derived
`prompt_cache_key`, which is necessary but not sufficient. Exact model,
instructions, tools, history, and image content must still match. A thin
evidence-loading root followed by `fork_turns=all` children is the strongest
agent-native experiment; treat it as unverified until token telemetry confirms
the read.

## Artifacture request families

`evals/visual-cache/prefix.mjs` defines a provider-neutral prefix manifest. A
request belongs to the same cache family only when its `prefix_id` matches.
The identity includes:

- provider and model;
- exact system, shared-instruction, design-system, and tool-definition hashes;
- image byte hashes;
- image state ids, stable order, and detail settings.

Criterion prompts are suffixes and do not affect `prefix_id`.

Delegated skills are separate request families. Artifacture may share an exact
image prefix only among its own compatible visual passes.
`impeccable:critique` retains Impeccable's skill context and cache family;
Artifacture does not flatten or copy that rubric merely to manufacture cache
reuse. `unslop:cleanup-report` is text-only and never shares an image prefix.
The explicit `artifacture:slop-gap` pass may share an Artifacture image prefix
only when its crop and source/truth evidence are byte-for-byte identical to the
other requests in that family.

Recommended grouping:

- group by one rendered state whenever possible;
- use the same image tuple only for criteria that genuinely need every image;
- never add a “helpful” extra screenshot to only one request in a family;
- keep timestamps, output paths, candidate ids, and rubric questions after the
  breakpoint;
- warm one request before parallel suffix fan-out.

## Eval matrix

For each model and screenshot family, compare:

| Mode | Shape |
|---|---|
| cold-independent | separate requests with intentionally distinct cache keys |
| warm-suffix | one cache write, then identical prefix plus criterion suffixes |
| one-grouped-pass | one image prefix and all compatible criteria in one output |
| coding-agent-named | one fresh named subagent per criterion |
| coding-agent-fork | one evidence-loading turn, then one fork per criterion |

Test suffix counts `1, 2, 4, 8` and image counts `1, 2, 4`. Run the warm write
before parallel reads.

Use at least 10 randomized cold replicates and 20 randomized warm replicates.
For Claude, use `DISABLE_PROMPT_CACHING=1` for the cold agent control. For
Codex/direct API, use a new session or cache key for the cold condition.

Record:

- catch rate and false-positive rate per criterion;
- silence accuracy;
- evidence grounding to the correct image and region;
- cross-criterion contamination;
- input, cache-write, cache-read, and output tokens;
- time to first token and total latency;
- provider/model/detail/image tuple and `prefix_id`;
- primer cost separately and included in end-to-end cost.

A configuration graduates only when:

1. cache-read tokens are non-zero on warm suffix requests;
2. the warm path reduces measured input cost or latency;
3. criterion accuracy stays within the accepted tolerance of cold-independent;
4. evidence grounding and silence do not degrade as suffix count increases.

## Current recommendation

Use direct API suffix fan-out for the controlled small-model eval harness.
Keep coding-agent subagents as the orchestration fallback and quality
cross-check, not as the mechanism used to prove cache savings.

Model qualification and runtime routing now live in
`evals/visual-model-policy/`. The selector chooses the smallest model and
cheapest qualified batch size per pass after quality gates. The main agent does
not perform screenshot judgment as an implicit fallback; an unqualified or
unavailable route is reported as `no-eval-qualified-model`.
