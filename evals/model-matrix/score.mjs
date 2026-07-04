import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

export async function scoreRun(runDir, { models = null, tasks = null } = {}) {
  const cells = await collectCells(runDir, { models, tasks });
  const summary = buildSummary(cells);
  await fs.writeFile(path.join(runDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  await fs.writeFile(path.join(runDir, 'summary.md'), renderSummaryMarkdown(summary));
  return summary;
}

export function scoreCell({ exportOk, report }) {
  if (!exportOk) return 0;
  const errors = report?.summary?.errors || 0;
  const warns = report?.summary?.warns || 0;
  return Math.max(0, 100 - (15 * errors) - (3 * warns));
}

export function buildSummary(cells) {
  const normalized = cells.map((cell) => {
    const exportOk = Boolean(cell.meta?.export_ok);
    const report = cell.report || null;
    const checksFailed = failedChecks(report);
    const score = Number.isFinite(cell.meta?.score) ? cell.meta.score : scoreCell({ exportOk, report });
    const scoreFirstTry = Number.isFinite(cell.meta?.score_first_try) ? cell.meta.score_first_try : score;
    const scoreAfterRepair = Number.isFinite(cell.meta?.score_after_repair) ? cell.meta.score_after_repair : score;
    const acuityScore = Number.isFinite(cell.meta?.acuity?.score) ? cell.meta.acuity.score : null;
    return {
      model: cell.meta?.model_slug || cell.model,
      task: cell.meta?.task || cell.task,
      status: cell.meta?.status || 'unknown',
      export_ok: exportOk ? 1 : 0,
      verify_errors: report?.summary?.errors || 0,
      verify_warns: report?.summary?.warns || 0,
      checks_failed: checksFailed,
      llm_passes_required: report?.llm_passes_required || [],
      score,
      score_first_try: scoreFirstTry,
      score_after_repair: scoreAfterRepair,
      acuity_score: acuityScore,
      acuity: cell.meta?.acuity || null,
      cell_dir: cell.relativeDir || cell.dir,
      prompt: cell.meta?.prompt || null,
      usage: cell.meta?.usage || null,
    };
  }).sort((a, b) => `${a.model}/${a.task}`.localeCompare(`${b.model}/${b.task}`));

  const modelMeans = meansBy(normalized, 'model', 'score_after_repair');
  const modelMeansFirst = meansBy(normalized, 'model', 'score_first_try');
  const modelMeansRepaired = meansBy(normalized, 'model', 'score_after_repair');
  const taskMeans = meansBy(normalized, 'task', 'score_after_repair');
  const taskMeansFirst = meansBy(normalized, 'task', 'score_first_try');
  const taskMeansRepaired = meansBy(normalized, 'task', 'score_after_repair');
  const acuityMeans = meansBy(normalized.filter((cell) => Number.isFinite(cell.acuity_score)), 'model', 'acuity_score');
  const matrix = {};
  for (const cell of normalized) {
    matrix[cell.model] ||= {};
    matrix[cell.model][cell.task] = cell.score_after_repair;
  }

  return {
    run_id: path.basename(path.resolve(normalized[0]?.cell_dir ? path.dirname(path.dirname(normalized[0].cell_dir)) : '.')),
    generated_at: new Date().toISOString(),
    cells: normalized,
    model_means: modelMeans,
    model_means_first_try: modelMeansFirst,
    model_means_repaired: modelMeansRepaired,
    model_acuity_means: acuityMeans,
    task_means: taskMeans,
    task_means_first_try: taskMeansFirst,
    task_means_repaired: taskMeansRepaired,
    matrix,
    failure_histogram: failureHistogram(normalized),
  };
}

export function renderSummaryMarkdown(summary) {
  const models = Object.keys(summary.matrix).sort();
  const tasks = Array.from(new Set(summary.cells.map((cell) => cell.task))).sort();
  const lines = [
    `# Model Matrix Summary`,
    '',
    `Generated: ${summary.generated_at}`,
    '',
    '## Matrix',
    '',
    table(['Model', ...tasks, 'Mean First', 'Mean Repaired', 'Acuity'], models.map((model) => [
      model,
      ...tasks.map((task) => formatScore(summary.matrix[model]?.[task])),
      formatScore(summary.model_means_first_try?.[model]),
      formatScore(summary.model_means_repaired?.[model]),
      formatScore(summary.model_acuity_means?.[model]),
    ])),
    '',
    '## Task Means',
    '',
    table(['Task', 'Mean First', 'Mean Repaired'], Object.keys(summary.task_means_repaired || summary.task_means).sort((a, b) => a.localeCompare(b)).map((task) => [
      task,
      formatScore(summary.task_means_first_try?.[task]),
      formatScore(summary.task_means_repaired?.[task] ?? summary.task_means?.[task]),
    ])),
    '',
    '## Check Failure Histogram',
    '',
  ];

  if (summary.failure_histogram.length === 0) {
    lines.push('No check failures recorded.');
  } else {
    lines.push(table(['Check', 'Count'], summary.failure_histogram.map((row) => [row.id, String(row.count)])));
  }

  lines.push('', '## Cells', '');
  lines.push(table(
    ['Model', 'Task', 'Status', 'Export', 'Errors', 'Warns', 'Score First', 'Score Repaired', 'Acuity'],
    summary.cells.map((cell) => [
      cell.model,
      cell.task,
      cell.status,
      String(cell.export_ok),
      String(cell.verify_errors),
      String(cell.verify_warns),
      formatScore(cell.score_first_try),
      formatScore(cell.score_after_repair),
      formatScore(cell.acuity_score),
    ]),
  ));
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function table(headers, rows) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(' | ')} |`),
  ].join('\n');
}

function escapeCell(value) {
  return String(value ?? '').replaceAll('|', '\\|');
}

function formatScore(value) {
  return Number.isFinite(value) ? value.toFixed(1) : '';
}

function meansBy(cells, key, scoreKey = 'score') {
  const buckets = {};
  for (const cell of cells) {
    buckets[cell[key]] ||= [];
    if (Number.isFinite(cell[scoreKey])) buckets[cell[key]].push(cell[scoreKey]);
  }
  return Object.fromEntries(Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([, scores]) => scores.length > 0)
    .map(([name, scores]) => [name, scores.reduce((sum, score) => sum + score, 0) / scores.length]));
}

function failedChecks(report) {
  if (!report?.checks) return [];
  return report.checks
    .filter((check) => check.status === 'fail' || check.status === 'warn' || check.status === 'unimplemented')
    .map((check) => check.id);
}

function failureHistogram(cells) {
  const counts = new Map();
  for (const cell of cells) {
    for (const id of cell.checks_failed || []) {
      counts.set(id, (counts.get(id) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

async function collectCells(runDir, { models, tasks }) {
  const out = [];
  const modelFilter = models ? new Set(models) : null;
  const taskFilter = tasks ? new Set(tasks) : null;
  const modelEntries = await safeReaddir(runDir, { withFileTypes: true });
  for (const modelEntry of modelEntries.filter((entry) => entry.isDirectory())) {
    if (modelFilter && !modelFilter.has(modelEntry.name)) continue;
    const modelDir = path.join(runDir, modelEntry.name);
    const taskEntries = await safeReaddir(modelDir, { withFileTypes: true });
    for (const taskEntry of taskEntries.filter((entry) => entry.isDirectory())) {
      if (taskFilter && !taskFilter.has(taskEntry.name)) continue;
      const dir = path.join(modelDir, taskEntry.name);
      const meta = await readJson(path.join(dir, 'meta.json'));
      const report = await readJson(path.join(dir, 'report.json'));
      out.push({
        model: modelEntry.name,
        task: taskEntry.name,
        dir,
        relativeDir: path.relative(process.cwd(), dir),
        meta,
        report,
      });
    }
  }
  return out;
}

async function safeReaddir(dir, options) {
  try {
    return await fs.readdir(dir, options);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const runDir = process.argv[2];
  if (!runDir) {
    console.error('Usage: node evals/model-matrix/score.mjs <out/run-id>');
    process.exit(2);
  }
  const summary = await scoreRun(path.resolve(process.cwd(), runDir));
  console.log(renderSummaryMarkdown(summary));
}
