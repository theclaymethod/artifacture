import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { buildPrompt } from './model-matrix/prompt.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const readJson = async (path) => JSON.parse(await readFile(resolve(ROOT, path), 'utf8'));

test('checked-in eval size and generation context stay inside product budgets', async () => {
  const budgets = await readJson('evals/budgets.json');
  const catalog = await readJson('plugins/visual-explainer/scripts/verify/checks.json');
  const expectations = await readJson('evals/expectations.json');
  const benchmark = await readJson('evals/product-benchmark/benchmark.json');
  assert.ok(catalog.checks.length <= budgets.mechanics_catalog_max_checks);
  assert.ok(Object.keys(expectations).length <= budgets.seeded_fixture_max_cases);
  assert.ok(benchmark.cases.length <= budgets.product_benchmark_max_cases);

  const prompts = await Promise.all(benchmark.cases.map((benchmarkCase) => buildPrompt({
    task: benchmarkCase.task.split('/').at(-1).replace(/\.md$/, ''),
    repoRoot: ROOT,
  })));
  const totalTokens = prompts.reduce((total, prompt) => total + prompt.approxTokens, 0);
  assert.ok(
    totalTokens <= budgets.product_generation_prompt_max_tokens,
    `product benchmark prompts use ${totalTokens} tokens; budget is ${budgets.product_generation_prompt_max_tokens}`,
  );
});

test('every covered skill flow stays inside the progressive-disclosure read budget', async () => {
  const budgets = await readJson('evals/budgets.json');
  const skill = await readFile(resolve(ROOT, 'plugins/visual-explainer/SKILL.md'), 'utf8');
  const cards = [
    'web-diagram.md',
    'visual-plan.md',
    'comparison-table.md',
    'slide-deck.md',
    'code-walkthrough.md',
    'explain-diff.md',
    'project-recap.md',
  ];

  for (const card of cards) {
    const cardText = await readFile(resolve(ROOT, 'plugins/visual-explainer/cards', card), 'utf8');
    const approxTokens = Math.ceil((skill.length + cardText.length) / 4);
    assert.ok(
      approxTokens <= budgets.covered_flow_max_tokens,
      `${card} requires about ${approxTokens} tokens; budget is ${budgets.covered_flow_max_tokens}`,
    );
  }
});
