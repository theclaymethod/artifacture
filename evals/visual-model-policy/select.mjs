#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { canonicalJson } from '../lib/canonical-json.mjs';

export const DEFAULT_THRESHOLDS = Object.freeze({
  min_runs: 3,
  min_positives: 10,
  min_negatives: 10,
  min_criterion_positives: 1,
  min_criterion_negatives: 1,
  precision: 0.9,
  recall: 0.9,
  silence_accuracy: 0.95,
  grounding_accuracy: 0.95,
  json_validity: 0.99,
  max_abstention_rate: 0.05,
  max_p95_latency_ms: 30000,
  max_cost_per_case_usd: 0.01,
});

const RUNTIME_ESCALATION_TRIGGERS = Object.freeze([
  'invalid-json-after-one-retry',
  'explicit-abstain',
  'evidence-not-attributable-to-one-image-and-region',
  'provider-error-or-timeout-after-one-retry',
  'out-of-distribution-input',
]);

export function metricsFor(result) {
  const responses = positiveInt(result.responses, 'responses');
  const cases = positiveInt(result.cases, 'cases');
  return {
    precision: ratio(result.tp, Number(result.tp) + Number(result.fp), 1),
    recall: ratio(result.tp, Number(result.tp) + Number(result.fn), 1),
    silence_accuracy: ratio(result.tn, Number(result.tn) + Number(result.fp), 1),
    grounding_accuracy: ratio(result.grounded, result.grounding_total, 0),
    json_validity: ratio(result.json_valid, responses, 0),
    abstention_rate: ratio(result.abstentions, responses, 0),
    cost_per_case_usd: result.total_cost_usd === null
      ? null
      : Number(result.total_cost_usd) / cases,
    p95_latency_ms: result.p95_latency_ms === null
      ? null
      : Number(result.p95_latency_ms),
  };
}

export function qualificationFor(result, thresholds = DEFAULT_THRESHOLDS) {
  const metrics = metricsFor(result);
  const reasons = [];
  const requireAtLeast = (field, actual, minimum) => {
    if (Number(actual) < Number(minimum)) reasons.push(`${field} ${actual} < ${minimum}`);
  };
  const requireAtMost = (field, actual, maximum) => {
    if (actual === null || !Number.isFinite(Number(actual)) || Number(actual) > Number(maximum)) {
      reasons.push(`${field} ${actual} > ${maximum}`);
    }
  };

  requireAtLeast('runs', result.runs, thresholds.min_runs);
  requireAtLeast('positives', result.positives, thresholds.min_positives);
  requireAtLeast('negatives', result.negatives, thresholds.min_negatives);
  if (result.unique_positives !== undefined || result.unique_negatives !== undefined) {
    requireAtLeast('unique_positives', result.unique_positives, thresholds.min_positives);
    requireAtLeast('unique_negatives', result.unique_negatives, thresholds.min_negatives);
  }
  requireAtLeast(
    'unique_image_positives',
    result.unique_image_positives,
    thresholds.min_positives,
  );
  requireAtLeast(
    'unique_image_negatives',
    result.unique_image_negatives,
    thresholds.min_negatives,
  );
  if (result.adjudication_complete !== true) {
    reasons.push('adjudication_complete must be true');
  }
  if (result.synthetic !== false) {
    reasons.push('synthetic measurements are not policy evidence');
  }
  if (result.telemetry_complete !== true) {
    reasons.push('telemetry_complete must be true');
  }
  if (result.experiment_complete !== true) {
    reasons.push('experiment_complete must be true');
  }
  if (Array.isArray(result.criteria)) {
    for (const criterion of result.criteria) {
      requireAtLeast(
        `criterion ${criterion.id} unique_positives`,
        criterion.unique_positives,
        thresholds.min_criterion_positives,
      );
      requireAtLeast(
        `criterion ${criterion.id} unique_negatives`,
        criterion.unique_negatives,
        thresholds.min_criterion_negatives,
      );
      requireAtLeast(
        `criterion ${criterion.id} unique_image_positives`,
        criterion.unique_image_positives,
        thresholds.min_criterion_positives,
      );
      requireAtLeast(
        `criterion ${criterion.id} unique_image_negatives`,
        criterion.unique_image_negatives,
        thresholds.min_criterion_negatives,
      );
    }
  }
  requireAtLeast('precision', metrics.precision, thresholds.precision);
  requireAtLeast('recall', metrics.recall, thresholds.recall);
  requireAtLeast('silence_accuracy', metrics.silence_accuracy, thresholds.silence_accuracy);
  requireAtLeast('grounding_accuracy', metrics.grounding_accuracy, thresholds.grounding_accuracy);
  requireAtLeast('json_validity', metrics.json_validity, thresholds.json_validity);
  requireAtMost('abstention_rate', metrics.abstention_rate, thresholds.max_abstention_rate);
  requireAtMost('p95_latency_ms', metrics.p95_latency_ms, thresholds.max_p95_latency_ms);
  requireAtMost('cost_per_case_usd', metrics.cost_per_case_usd, thresholds.max_cost_per_case_usd);

  return { qualified: reasons.length === 0, reasons, metrics };
}

export function selectVisualModelPolicy(input) {
  validateInput(input);
  const thresholds = { ...DEFAULT_THRESHOLDS, ...input.thresholds };
  const candidateById = new Map(input.candidates.map((candidate) => [candidate.id, candidate]));
  const passes = [...new Set(input.results.map((result) => result.pass))].sort();
  const routes = {};
  const blocked = {};

  for (const pass of passes) {
    const evaluated = input.results
      .filter((result) => result.pass === pass)
      .map((result) => {
        const candidate = candidateById.get(result.model);
        if (!candidate) throw new Error(`result references unknown model ${result.model}`);
        return {
          ...result,
          model_rank: candidate.rank,
          model_class: candidate.class || null,
          provider: candidate.provider || null,
          ...qualificationFor(result, thresholds),
        };
      });

    const qualified = evaluated.filter((row) => row.qualified);
    if (qualified.length === 0) {
      blocked[pass] = {
        reason: 'no-eval-qualified-model',
        evaluated: evaluated.map(compactEvaluation),
      };
      continue;
    }

    const bestByModel = new Map();
    for (const row of qualified) {
      const prior = bestByModel.get(row.model);
      if (!prior || compareWithinModel(row, prior) < 0) bestByModel.set(row.model, row);
    }
    const ladder = [...bestByModel.values()].sort(compareModels);
    const selected = ladder[0];
    const evidence = {
      runs: selected.runs,
      cases: selected.cases,
      positives: selected.positives,
      negatives: selected.negatives,
    };
    if (selected.unique_cases !== undefined) {
      Object.assign(evidence, {
        unique_cases: selected.unique_cases,
        unique_positives: selected.unique_positives,
        unique_negatives: selected.unique_negatives,
        unique_images: selected.unique_images,
        unique_image_positives: selected.unique_image_positives,
        unique_image_negatives: selected.unique_image_negatives,
      });
    }
    routes[pass] = {
      model: selected.model,
      model_class: selected.model_class,
      provider: selected.provider,
      batch_size: selected.batch_size,
      metrics: roundMetrics(selected.metrics),
      evidence,
      escalation_chain: ladder.slice(1).map((row) => ({
        model: row.model,
        model_class: row.model_class,
        provider: row.provider,
        batch_size: row.batch_size,
      })),
      escalation_triggers: [...RUNTIME_ESCALATION_TRIGGERS],
    };
  }

  const canonicalInput = canonicalJson(input);
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    source_sha256: crypto.createHash('sha256').update(canonicalInput).digest('hex'),
    policy: 'smallest-eval-qualified-model-first',
    thresholds,
    routes,
    blocked,
  };
}

function validateInput(input) {
  if (!input || !Array.isArray(input.candidates) || !Array.isArray(input.results)) {
    throw new Error('input requires candidates[] and results[]');
  }
  if (input.candidates.length === 0 || input.results.length === 0) {
    throw new Error('input requires non-empty candidates[] and results[]');
  }
  const ids = new Set();
  const ranks = new Set();
  for (const candidate of input.candidates) {
    if (!candidate.id || !Number.isInteger(Number(candidate.rank)) || Number(candidate.rank) <= 0) {
      throw new Error('each candidate requires id and positive integer rank');
    }
    if (ids.has(candidate.id)) throw new Error(`duplicate candidate ${candidate.id}`);
    if (ranks.has(Number(candidate.rank))) throw new Error(`duplicate candidate rank ${candidate.rank}`);
    ids.add(candidate.id);
    ranks.add(Number(candidate.rank));
  }
  for (const result of input.results) {
    for (const field of [
      'pass', 'model', 'batch_size', 'runs', 'cases', 'positives', 'negatives',
      'tp', 'fp', 'tn', 'fn', 'grounded', 'grounding_total', 'json_valid',
      'responses', 'abstentions', 'total_cost_usd', 'p95_latency_ms',
      'unique_cases', 'unique_positives', 'unique_negatives',
      'unique_images', 'unique_image_positives', 'unique_image_negatives',
      'adjudication_complete', 'synthetic', 'telemetry_complete',
      'experiment_complete',
    ]) {
      const nullableIncompleteTelemetry = (
        ['total_cost_usd', 'p95_latency_ms'].includes(field)
        && result.telemetry_complete === false
      );
      if (
        result[field] === undefined
        || result[field] === ''
        || (result[field] === null && !nullableIncompleteTelemetry)
      ) {
        throw new Error(`result requires ${field}`);
      }
    }
    positiveInt(result.batch_size, 'batch_size');
    positiveInt(result.runs, 'runs');
    positiveInt(result.cases, 'cases');
    positiveInt(result.responses, 'responses');
    for (const field of [
      'positives', 'negatives', 'tp', 'fp', 'tn', 'fn', 'grounded',
      'json_valid', 'abstentions',
    ]) nonNegativeInt(result[field], field);
    for (const field of [
      'unique_cases', 'unique_positives', 'unique_negatives',
      'unique_images', 'unique_image_positives', 'unique_image_negatives',
    ]) {
      nonNegativeInt(result[field], field);
    }
    for (const field of [
      'adjudication_complete',
      'synthetic',
      'telemetry_complete',
      'experiment_complete',
    ]) {
      if (![true, false].includes(result[field])) throw new Error(`${field} must be a boolean`);
    }
    positiveInt(result.grounding_total, 'grounding_total');
    if (result.total_cost_usd !== null) {
      nonNegativeFinite(result.total_cost_usd, 'total_cost_usd');
    }
    if (result.p95_latency_ms !== null) {
      nonNegativeFinite(result.p95_latency_ms, 'p95_latency_ms');
    }
    if (Number(result.positives) + Number(result.negatives) !== Number(result.cases)) {
      throw new Error('positives + negatives must equal cases');
    }
    if (Number(result.tp) + Number(result.fn) !== Number(result.positives)) {
      throw new Error('tp + fn must equal positives');
    }
    if (Number(result.tn) + Number(result.fp) !== Number(result.negatives)) {
      throw new Error('tn + fp must equal negatives');
    }
    if (Number(result.json_valid) > Number(result.responses)) {
      throw new Error('json_valid cannot exceed responses');
    }
    if (Number(result.abstentions) > Number(result.responses)) {
      throw new Error('abstentions cannot exceed responses');
    }
    if (Number(result.grounded) > Number(result.grounding_total)) {
      throw new Error('grounded cannot exceed grounding_total');
    }
    if (
      result.unique_cases !== undefined
      && Number(result.unique_positives) + Number(result.unique_negatives) !== Number(result.unique_cases)
    ) {
      throw new Error('unique_positives + unique_negatives must equal unique_cases');
    }
    if (
      Number(result.unique_images) > Number(result.unique_image_positives)
        + Number(result.unique_image_negatives)
      || Number(result.unique_images) < Math.max(
        Number(result.unique_image_positives),
        Number(result.unique_image_negatives),
      )
    ) {
      throw new Error('unique image totals are internally inconsistent');
    }
  }
}

function compareWithinModel(a, b) {
  return (
    Number(a.metrics.cost_per_case_usd) - Number(b.metrics.cost_per_case_usd)
    || Number(b.batch_size) - Number(a.batch_size)
    || Number(a.metrics.p95_latency_ms) - Number(b.metrics.p95_latency_ms)
  );
}

function compareModels(a, b) {
  return (
    Number(a.model_rank) - Number(b.model_rank)
    || compareWithinModel(a, b)
    || String(a.model).localeCompare(String(b.model))
  );
}

function compactEvaluation(row) {
  return {
    model: row.model,
    model_class: row.model_class,
    provider: row.provider,
    batch_size: row.batch_size,
    qualified: row.qualified,
    reasons: row.reasons,
    metrics: roundMetrics(row.metrics),
  };
}

function roundMetrics(metrics) {
  return Object.fromEntries(
    Object.entries(metrics).map(([key, value]) => [
      key,
      Number.isFinite(value)
        ? Number(value.toFixed(key === 'cost_per_case_usd' ? 8 : 4))
        : value,
    ]),
  );
}

function positiveInt(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${field} must be a positive integer`);
  return number;
}

function nonNegativeInt(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new Error(`${field} must be a non-negative integer`);
  return number;
}

function nonNegativeFinite(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${field} must be a non-negative number`);
  return number;
}

function ratio(numerator, denominator, whenEmpty) {
  const den = Number(denominator);
  if (den === 0) return whenEmpty;
  return Number(numerator) / den;
}

function parseArgs(argv) {
  const out = { input: null, output: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--input') out.input = argv[++index];
    else if (argv[index] === '--out') out.output = argv[++index];
    else throw new Error(`unknown argument ${argv[index]}`);
  }
  if (!out.input) throw new Error('usage: select.mjs --input measurements.json [--out policy.json]');
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = JSON.parse(await fs.readFile(path.resolve(args.input), 'utf8'));
  const policy = selectVisualModelPolicy(source);
  const rendered = `${JSON.stringify(policy, null, 2)}\n`;
  if (args.output) {
    const output = path.resolve(args.output);
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, rendered);
    console.log(output);
  } else {
    process.stdout.write(rendered);
  }
  if (Object.keys(policy.blocked).length > 0) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(2);
  });
}
