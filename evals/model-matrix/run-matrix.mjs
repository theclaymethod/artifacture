#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { buildPrompt } from './prompt.mjs';
import { scoreCell, scoreRun, renderSummaryMarkdown } from './score.mjs';
import { buildGallery } from './gallery.mjs';

const repoRoot = process.cwd();
const matrixRoot = path.join(repoRoot, 'evals/model-matrix');
const outRoot = path.join(matrixRoot, 'out');
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const RESPONSE_CHAR_LIMIT = 60000;
const ACUITY_MODEL = 'anthropic/claude-opus-4.8';
const ACUITY_CALL_LIMIT = 20;
const OPENROUTER_TIMEOUT_MS = 5 * 60 * 1000;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const models = await loadModels(args.models);
  const tasks = await loadTasks(args.tasks);
  const runId = args.runId || defaultRunId();
  const runDir = path.join(outRoot, runId);

  if (args.dryRun) {
    await printDryRun({ runId, models, tasks, acuity: args.acuity });
    return;
  }

  if ((models.some((model) => model.kind === 'openrouter') || args.acuity) && !process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY must be set for OpenRouter models. The harness never reads or stores the key itself.');
  }

  await fs.mkdir(runDir, { recursive: true });
  if (args.rejudge) {
    console.log(`Run ${runId}: re-judging acuity only (${models.length} model(s) x ${tasks.length} task(s))`);
    for (const model of models) {
      for (const task of tasks) {
        const metaPath = path.join(runDir, model.slug, task, 'meta.json');
        const meta = await readJson(metaPath);
        if (meta && meta.acuity) { delete meta.acuity; await writeMeta(metaPath, meta); }
      }
    }
  } else {
    console.log(`Run ${runId}: ${models.length} model(s) x ${tasks.length} task(s)`);
    await Promise.all(models.map((model) => runModel({ model, tasks, runDir })));
  }
  if (args.acuity) {
    try {
      await judgeAcuity(runDir, { models: models.map((model) => model.slug), tasks });
    } catch (error) {
      await fs.writeFile(path.join(runDir, 'acuity-error.json'), `${JSON.stringify({
        error: error.message || String(error),
        at: new Date().toISOString(),
      }, null, 2)}\n`);
      console.warn(`Acuity aborted: ${error.message || error}`);
    }
  }
  const summary = await scoreRun(runDir, {
    models: models.map((model) => model.slug),
    tasks,
  });
  await buildGallery(runDir);
  console.log(renderSummaryMarkdown(summary));
  console.log(`Wrote ${path.relative(repoRoot, path.join(runDir, 'summary.md'))}`);
  console.log(`Wrote ${path.relative(repoRoot, path.join(runDir, 'gallery.html'))}`);
}

function parseArgs(argv) {
  const args = {
    runId: null,
    models: null,
    tasks: null,
    dryRun: false,
    acuity: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--run-id') args.runId = requireValue(argv, ++i, arg);
    else if (arg === '--models') args.models = splitList(requireValue(argv, ++i, arg));
    else if (arg === '--tasks') args.tasks = splitList(requireValue(argv, ++i, arg));
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--acuity') args.acuity = true;
    else if (arg === '--rejudge') { args.rejudge = true; args.acuity = true; }
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
  return value;
}

function splitList(value) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

async function loadModels(slugs) {
  const all = JSON.parse(await fs.readFile(path.join(matrixRoot, 'models.json'), 'utf8'));
  if (!slugs) return all;
  const wanted = new Set(slugs);
  const selected = all.filter((model) => wanted.has(model.slug));
  const missing = slugs.filter((slug) => !selected.some((model) => model.slug === slug));
  if (missing.length > 0) throw new Error(`Unknown model slug(s): ${missing.join(', ')}`);
  return selected;
}

async function loadTasks(taskSlugs) {
  const entries = await fs.readdir(path.join(matrixRoot, 'tasks'));
  const all = entries
    .filter((entry) => entry.endsWith('.md'))
    .map((entry) => path.basename(entry, '.md'))
    .sort();
  if (!taskSlugs) return all;
  const known = new Set(all);
  const missing = taskSlugs.filter((task) => !known.has(task));
  if (missing.length > 0) throw new Error(`Unknown task slug(s): ${missing.join(', ')}`);
  return taskSlugs;
}

async function printDryRun({ runId, models, tasks, acuity }) {
  console.log(`Dry run ${runId}`);
  console.log(`Models: ${models.map((model) => model.slug).join(', ')}`);
  console.log(`Tasks: ${tasks.join(', ')}`);
  console.log('Export repair: enabled, one same-model retry after export failure');
  console.log(`Acuity: ${acuity ? `enabled, judge ${ACUITY_MODEL}, cap ${ACUITY_CALL_LIMIT} cells` : 'disabled'}`);
  for (const task of tasks) {
    const promptInfo = await buildPrompt({ task, repoRoot });
    console.log(`${task}: ${promptInfo.bytes} bytes, ${promptInfo.chars} chars, approx ${promptInfo.approxTokens} tokens, sha256 ${promptInfo.sha256}`);
  }
  console.log('Cells:');
  for (const model of models) {
    for (const task of tasks) console.log(`- ${model.slug} / ${task}`);
  }
}

async function runModel({ model, tasks, runDir }) {
  for (const task of tasks) {
    await runCell({ model, task, runDir });
  }
}

async function runCell({ model, task, runDir }) {
  const cellDir = path.join(runDir, model.slug, task);
  const sourcePath = path.join(cellDir, 'source.mdx');
  const artifactPath = path.join(cellDir, 'artifact.html');
  const reportPath = path.join(cellDir, 'report.json');
  const screensDir = path.join(cellDir, 'screens');
  const metaPath = path.join(cellDir, 'meta.json');
  await fs.mkdir(screensDir, { recursive: true });

  const startedAt = new Date().toISOString();
  const promptInfo = await buildPrompt({ task, repoRoot });
  const meta = {
    run_id: path.basename(runDir),
    model_slug: model.slug,
    model_kind: model.kind,
    model_id: model.id || null,
    task,
    status: 'started',
    started_at: startedAt,
    prompt: {
      sha256: promptInfo.sha256,
      bytes: promptInfo.bytes,
      chars: promptInfo.chars,
      approx_tokens: promptInfo.approxTokens,
      paths: promptInfo.paths,
      warning: promptInfo.warning,
    },
    export_ok: false,
    verify_ok: false,
    score: 0,
    usage: null,
    commands: {},
    errors: {},
    score_first_try: null,
    score_after_repair: null,
    repair: { attempted: false },
    acuity: null,
  };

  await fs.writeFile(path.join(cellDir, 'prompt.txt'), promptInfo.prompt);
  await writeMeta(metaPath, meta);

  try {
    const generation = model.kind === 'openrouter'
      ? await generateOpenRouter(model, promptInfo.prompt)
      : await generateCodexCli({ prompt: promptInfo.prompt, sourcePath, cellDir });
    meta.usage = generation.usage || null;
    meta.generation = generation.meta || {};

    if (generation.status === 'timeout') {
      meta.status = 'timeout';
      meta.errors.first_try = { stage: 'generation', error: 'codex-cli generation timed out' };
      await writeReport(reportPath, syntheticReport({ id: 'model.timeout', stage: 'generation', error: 'codex-cli generation timed out' }));
      return;
    }

    if (generation.status === 'empty-response' || generation.status === 'oversized' || generation.status === 'refusal') {
      meta.status = generation.status;
      meta.errors.first_try = { stage: 'generation', error: generation.error || generation.status, diagnostic: generation.diagnostic || '' };
      await writeReport(reportPath, syntheticReport({
        id: `model.${generation.status}`,
        stage: 'generation',
        error: generation.error || generation.status,
        stdout: generation.diagnostic || '',
      }));
      return;
    }

    if (generation.source != null) {
      await fs.writeFile(sourcePath, stripCodeFences(generation.source).trimStart());
    }

    if (!(await exists(sourcePath))) {
      meta.status = 'source-missing';
      meta.errors.first_try = { stage: 'generation', error: 'source.mdx was not produced' };
      await writeReport(reportPath, syntheticReport({ id: 'model.source-missing', stage: 'generation', error: 'source.mdx was not produced' }));
      return;
    }

    await prepareComponentResolution({ cellDir, runDir });
    const first = await evaluateSourceAttempt({ sourcePath, artifactPath, reportPath, screensDir });
    meta.commands.export = first.commands.export;
    if (first.commands.verify) meta.commands.verify = first.commands.verify;
    meta.export_ok = first.exportOk;
    meta.verify_ok = first.verifyOk;
    meta.score_first_try = first.score;
    meta.score_after_repair = first.score;
    meta.score = first.score;
    meta.status = first.status;
    if (!first.exportOk) meta.errors.first_try = { stage: 'export', error: first.errorText };

    if (!first.exportOk) {
      const firstReportPath = path.join(cellDir, 'report.first_try.json');
      const firstSourcePath = path.join(cellDir, 'source.first_try.mdx');
      if (await exists(reportPath)) await fs.copyFile(reportPath, firstReportPath);
      if (await exists(sourcePath)) await fs.copyFile(sourcePath, firstSourcePath);
      const repairPrompt = buildRepairPrompt(promptInfo.prompt, first.errorText);
      meta.repair = {
        attempted: true,
        reason: 'export-failed',
        prompt_appended: 'Your previous output failed to export with this error: ... Return the corrected full file.',
      };
      const repairGeneration = model.kind === 'openrouter'
        ? await generateOpenRouter(model, repairPrompt)
        : await generateCodexCli({ prompt: repairPrompt, sourcePath, cellDir });
      meta.repair.usage = repairGeneration.usage || null;
      meta.repair.generation = repairGeneration.meta || {};

      const repairFailure = generationFailure(repairGeneration);
      if (repairFailure) {
        meta.status = 'export-failed';
        meta.repair.failure = repairFailure;
        meta.errors.repair = { stage: 'generation', error: repairFailure.error, diagnostic: repairFailure.diagnostic };
        meta.export_ok = false;
        meta.verify_ok = false;
        meta.score_after_repair = meta.score_first_try;
        meta.score = meta.score_first_try;
        return;
      }

      if (repairGeneration.source != null) {
        await fs.writeFile(sourcePath, stripCodeFences(repairGeneration.source).trimStart());
      }
      const repaired = await evaluateSourceAttempt({ sourcePath, artifactPath, reportPath, screensDir });
      meta.commands.export_after_repair = repaired.commands.export;
      if (repaired.commands.verify) meta.commands.verify_after_repair = repaired.commands.verify;
      meta.export_ok = repaired.exportOk;
      meta.verify_ok = repaired.verifyOk;
      meta.score_after_repair = repaired.score;
      meta.score = repaired.score;
      meta.status = repaired.status;
      if (!repaired.exportOk) meta.errors.repair = { stage: 'export', error: repaired.errorText };
    }
  } catch (error) {
    meta.status = 'error';
    meta.error = error.stack || error.message || String(error);
    meta.errors.harness = { stage: 'harness', error: error.message || String(error) };
    await writeReport(reportPath, syntheticReport({ id: 'harness.failure', stage: 'harness', error: error.message || String(error) }));
  } finally {
    meta.finished_at = new Date().toISOString();
    if (meta.status === 'export-failed' || meta.status === 'source-missing' || meta.status === 'timeout' || meta.status === 'error') {
      const report = await readJson(reportPath);
      meta.score = scoreCell({ exportOk: meta.export_ok, report });
    }
    if (!Number.isFinite(meta.score_first_try)) meta.score_first_try = meta.score;
    if (!Number.isFinite(meta.score_after_repair)) meta.score_after_repair = meta.score;
    await writeMeta(metaPath, meta);
    console.log(`${model.slug}/${task}: ${meta.status} score=${meta.score}`);
  }
}

async function evaluateSourceAttempt({ sourcePath, artifactPath, reportPath, screensDir }) {
  const exportResult = await runCommand('node', [
    'scripts/ve-mdx/export.mjs',
    sourcePath,
    '--out',
    artifactPath,
  ], { timeoutMs: 10 * 60 * 1000 });
  const exportOk = exportResult.exitCode === 0 && await exists(artifactPath);
  if (!exportOk) {
    const report = syntheticReport({
      id: 'export.failed',
      stage: 'export',
      error: 'export failed',
      stderr: exportResult.stderr,
      stdout: exportResult.stdout,
    });
    await writeReport(reportPath, report);
    return {
      exportOk: false,
      verifyOk: false,
      status: 'export-failed',
      score: scoreCell({ exportOk: false, report }),
      commands: { export: commandMeta(exportResult) },
      errorText: [exportResult.stderr, exportResult.stdout].filter(Boolean).join('\n').slice(-8000),
    };
  }

  const verifyResult = await runCommand('node', [
    'plugins/visual-explainer/scripts/verify/ve-verify.mjs',
    artifactPath,
    '--json',
    reportPath,
    '--screens',
    screensDir,
  ], { timeoutMs: 10 * 60 * 1000 });
  const report = await readJson(reportPath) || syntheticReport({
    id: 'verify.report-missing',
    stage: 'verify',
    error: 'verify did not write report.json',
    stderr: verifyResult.stderr,
    stdout: verifyResult.stdout,
  });
  if (!(await exists(reportPath))) await writeReport(reportPath, report);
  const verifyOk = verifyResult.exitCode === 0;
  return {
    exportOk: true,
    verifyOk,
    status: verifyOk ? 'ok' : 'verified-with-findings',
    score: scoreCell({ exportOk: true, report }),
    commands: { export: commandMeta(exportResult), verify: commandMeta(verifyResult) },
    errorText: [verifyResult.stderr, verifyResult.stdout].filter(Boolean).join('\n').slice(-8000),
  };
}

function buildRepairPrompt(prompt, errorText) {
  return `${prompt}\n\nYour previous output failed to export with this error:\n${errorText || '(no stderr)'}\n\nReturn the corrected full file.\n`;
}

function generationFailure(generation) {
  if (generation.status === 'timeout') return { status: 'timeout', error: 'codex-cli generation timed out', diagnostic: '' };
  if (generation.status === 'quota') return { status: 'quota', error: generation.error || 'provider usage limit reached', diagnostic: '' };
  if (generation.status === 'empty-response' || generation.status === 'oversized' || generation.status === 'refusal') {
    return {
      status: generation.status,
      error: generation.error || generation.status,
      diagnostic: generation.diagnostic || '',
    };
  }
  return null;
}

async function judgeAcuity(runDir, { models, tasks }) {
  let calls = 0;
  let apiErrors = 0;
  for (const model of models) {
    for (const task of tasks) {
      if (calls >= ACUITY_CALL_LIMIT) return;
      const cellDir = path.join(runDir, model, task);
      const metaPath = path.join(cellDir, 'meta.json');
      const meta = await readJson(metaPath);
      if (!meta || meta.acuity?.score != null) continue;
      const report = await readJson(path.join(cellDir, 'report.json'));
      const screenshots = report?.screenshots || [];
      const desktop = pickScreenshot(screenshots, /1440x900-light-full\.png$/) || pickScreenshot(screenshots, /1440x900-light\.png$/) || pickScreenshot(screenshots, /1440x900.*light.*\.png$/);
      const mobile = pickScreenshot(screenshots, /390x844-light-full\.png$/) || pickScreenshot(screenshots, /390x844-light\.png$/) || pickScreenshot(screenshots, /390x844.*light.*\.png$/);
      if (!desktop || !mobile) {
        meta.acuity = { status: 'skipped', reason: 'missing required light screenshots' };
        await writeMeta(metaPath, meta);
        continue;
      }
      try {
        const taskBrief = await fs.readFile(path.join(matrixRoot, 'tasks', `${task}.md`), 'utf8');
        meta.acuity = await callAcuityJudge({ taskBrief, desktop, mobile });
        calls += 1;
        apiErrors = 0;
        await writeMeta(metaPath, meta);
      } catch (error) {
        apiErrors += 1;
        meta.acuity = {
          status: 'error',
          error: error.message || String(error),
          at: new Date().toISOString(),
        };
        await writeMeta(metaPath, meta);
        if (apiErrors >= 3) throw new Error(`acuity judge failed ${apiErrors} times in a row; last error: ${error.message || error}`);
      }
    }
  }
}

async function callAcuityJudge({ taskBrief, desktop, mobile }) {
  const body = {
    model: ACUITY_MODEL,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: acuityPrompt(taskBrief) },
        { type: 'image_url', image_url: { url: await imageDataUrl(desktop) } },
        { type: 'image_url', image_url: { url: await imageDataUrl(mobile) } },
      ],
    }],
    temperature: 0,
    max_tokens: 1200,
    reasoning: { effort: 'low', exclude: true },
    stream: false,
    response_format: { type: 'json_object' },
  };
  const response = await fetchWithRetry(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://local.visual-explainer.invalid',
      'X-Title': 'visual-explainer acuity judge',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`OpenRouter acuity ${response.status}: ${text.slice(0, 500)}`);
  const json = JSON.parse(text);
  const content = firstNonEmptyString(json.choices?.[0]?.message?.content);
  const parsed = parseJsonObject(content);
  const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
  const modelScore = Number(parsed.score);
  const rubricScore = questions.reduce((sum, item) => sum + Math.max(0, Math.min(2, Number(item.score) || 0)), 0);
  return {
    status: 'ok',
    judge_model: ACUITY_MODEL,
    score: questions.length ? rubricScore : Number.isFinite(modelScore) ? Math.max(0, Math.min(10, modelScore)) : null,
    model_reported_score: Number.isFinite(modelScore) ? modelScore : null,
    questions,
    rationale: parsed.rationale || '',
    usage: json.usage || null,
    response_id: json.id || null,
  };
}

function acuityPrompt(taskBrief) {
  return `You are judging visual acuity for a generated explainer. You are blind to the model that produced it.

Use only the task brief and the two attached screenshots: first 1440x900 light, then 390x844 light.

Task brief:
${taskBrief}

Score each question 0, 1, or 2:
1. Squint hierarchy: is there a clear dominant focal region with quieter subordinate regions?
2. Mobile clarity: does the 390px view avoid visible text clipping, blocked content, and cramped hierarchy?
3. Composition craft: do spacing, alignment, and grouping feel intentionally designed rather than flat?
4. Visual tells: would a developer avoid thinking "AI generated this" based on font, color, and generic styling tells?
5. Shipping quality: does this look like a designed artifact a human would ship?

Return only JSON with this schema:
{"score":0,"questions":[{"id":"squint_hierarchy","score":0,"reason":""},{"id":"mobile_clarity","score":0,"reason":""},{"id":"composition_craft","score":0,"reason":""},{"id":"visual_tells","score":0,"reason":""},{"id":"shipping_quality","score":0,"reason":""}],"rationale":""}`;
}

async function imageDataUrl(filePath) {
  const bytes = await fs.readFile(filePath);
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

function pickScreenshot(screenshots, pattern) {
  return screenshots.find((shot) => pattern.test(path.basename(shot)));
}

function parseJsonObject(content) {
  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`acuity judge did not return JSON: ${content.slice(0, 200)}`);
    return JSON.parse(match[0]);
  }
}

async function generateOpenRouter(model, prompt) {
  const body = {
    model: model.id,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.4,
    max_tokens: 16000,
    reasoning: { enabled: false, effort: 'low', exclude: true },
    stream: false,
  };
  let lastEmpty = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetchWithRetry(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://local.visual-explainer.invalid',
        'X-Title': 'visual-explainer model matrix',
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${text.slice(0, 500)}`);
    const json = JSON.parse(text);
    const choice = json.choices?.[0] || {};
    const message = choice.message || {};
    const source = firstNonEmptyString(message.content, message.reasoning_content, choice.reasoning_content);
    const refusal = firstNonEmptyString(message.refusal, choice.refusal);
    const baseMeta = {
      provider: json.provider || null,
      response_id: json.id || null,
      finish_reason: choice.finish_reason || null,
      attempt: attempt + 1,
    };

    if (refusal && !source) {
      return {
        status: 'refusal',
        source: null,
        usage: json.usage || null,
        meta: baseMeta,
        error: 'OpenRouter model refused the request',
        diagnostic: refusal.slice(0, 500),
      };
    }

    if (!source) {
      lastEmpty = { json, meta: baseMeta };
      if (attempt === 0) {
        await sleep(1500);
        continue;
      }
      return {
        status: 'empty-response',
        source: null,
        usage: json.usage || null,
        meta: baseMeta,
        error: 'OpenRouter response content was empty after retry',
        diagnostic: JSON.stringify({
          id: json.id || null,
          provider: json.provider || null,
          finish_reason: choice.finish_reason || null,
          message_keys: Object.keys(message),
        }).slice(0, 500),
      };
    }

    if (source.length > RESPONSE_CHAR_LIMIT) {
      return {
        status: 'oversized',
        source: null,
        usage: json.usage || null,
        meta: baseMeta,
        error: `Model source exceeded ${RESPONSE_CHAR_LIMIT} chars`,
        diagnostic: source.slice(0, 500),
      };
    }

    return {
      source,
      usage: json.usage || null,
      meta: baseMeta,
    };
  }
  return {
    status: 'empty-response',
    source: null,
    usage: lastEmpty?.json?.usage || null,
    meta: lastEmpty?.meta || {},
    error: 'OpenRouter response content was empty',
    diagnostic: '',
  };
}

function firstNonEmptyString(...values) {
  return values.find((value) => typeof value === 'string' && value.trim().length > 0) || '';
}

async function prepareComponentResolution({ cellDir, runDir }) {
  const componentDir = path.join(repoRoot, 'visual-explainer-mdx');
  await linkOrCopyDir(componentDir, path.join(cellDir, 'node_modules/visual-explainer-mdx'));
  await linkOrCopyDir(componentDir, path.join(runDir, 'visual-explainer-mdx'));
  await linkOrCopyDir(componentDir, path.join(outRoot, 'visual-explainer-mdx'));
}

async function linkOrCopyDir(source, target) {
  try {
    await fs.lstat(target);
    return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  try {
    await fs.symlink(source, target, 'dir');
  } catch (error) {
    if (error.code !== 'EEXIST') await fs.cp(source, target, { recursive: true });
  }
}

async function fetchWithRetry(url, options) {
  let lastResponse = null;
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      lastError = error;
      if (attempt === 0) {
        await sleep(1500);
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
    if (![429, 500, 502, 503, 504].includes(response.status)) return response;
    lastResponse = response;
    if (attempt === 0) await sleep(1500);
  }
  if (!lastResponse && lastError) throw lastError;
  return lastResponse;
}

async function generateCodexCli({ prompt, sourcePath, cellDir }) {
  const tmpDir = await fs.mkdtemp(path.join(cellDir, 'prompt-'));
  const tmpPrompt = path.join(tmpDir, 'prompt.txt');
  await fs.writeFile(tmpPrompt, prompt);
  const instruction = `Read ${tmpPrompt} and follow it. Write the source file to ${sourcePath} and do nothing else.`;
  const codexArgs = [
    'exec',
    '--sandbox',
    'workspace-write',
    '-c',
    'model_reasoning_effort="medium"',
    instruction,
  ];
  let result;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    // stdin must be closed: codex sniffs a piped stdin and blocks on it.
    result = await runCommand('codex', codexArgs, { timeoutMs: 30 * 60 * 1000, cwd: repoRoot, stdin: 'ignore' });
    if (result.timedOut) return { status: 'timeout', meta: { command: commandMeta(result) } };
    if (result.exitCode === 0) return { source: null, usage: null, meta: { command: commandMeta(result) } };
    const output = `${result.stderr || ''}\n${result.stdout || ''}`;
    if (/usage limit|purchase more credits/i.test(output)) {
      return { status: 'quota', error: 'codex-cli usage limit reached', meta: { command: commandMeta(result) } };
    }
    if (attempt === 0) await sleep(5000);
  }
  throw new Error(`codex-cli failed: ${result.stderr || result.stdout}`);
}

function stripCodeFences(source) {
  const trimmed = source.trim();
  const match = trimmed.match(/^```(?:mdx|tsx|jsx|typescript|ts|javascript|js)?\s*\n([\s\S]*?)\n```$/i);
  return match ? match[1] : source;
}

function commandMeta(result) {
  return {
    cmd: result.cmd,
    args: result.args,
    exit_code: result.exitCode,
    timed_out: result.timedOut,
    stdout: result.stdout.slice(-12000),
    stderr: result.stderr.slice(-12000),
  };
}

async function runCommand(cmd, args, { timeoutMs, cwd = repoRoot } = {}) {
  return await new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = timeoutMs ? setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000).unref();
    }, timeoutMs) : null;
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      if (timer) clearTimeout(timer);
      resolve({ cmd, args, exitCode: 127, timedOut, stdout, stderr: `${stderr}${error.message}` });
    });
    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      resolve({ cmd, args, exitCode: code ?? (signal ? 128 : 1), timedOut, stdout, stderr });
    });
  });
}

function syntheticReport({ id = 'harness.failure', stage = 'harness', error, stderr = '', stdout = '' }) {
  return {
    file: '',
    profile: 'page',
    preset: 'custom',
    summary: { errors: error ? 1 : 0, warns: 0, skipped: 0, passed: 0 },
    checks: error ? [{
      id,
      stage,
      severity: 'error',
      status: 'fail',
      evidence: error,
      where: '',
      fix_hint: [stderr, stdout].filter(Boolean).join('\n').slice(0, 4000),
    }] : [],
    screenshots: [],
    llm_passes_required: [],
  };
}

async function writeReport(reportPath, report) {
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

async function writeMeta(metaPath, meta) {
  await fs.writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function defaultRunId() {
  return new Date().toISOString().replaceAll(':', '').replace(/\.\d{3}Z$/, 'Z');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
