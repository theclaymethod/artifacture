#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
  evidenceSha256,
  expandCorpus,
  loadCorpus,
  validateCorpus,
} from './corpus.mjs';
import {
  buildExperimentPlan,
  corpusContractId,
  experimentContractId,
  prepareExperimentPlan,
  requestMatrixId,
  requestIdFor,
  isTerminalRequestRecord,
} from './run.mjs';
import { normalizeTelemetry } from './telemetry.mjs';

export function aggregateRecords(records, {
  candidates,
  thresholds,
  sourceFiles = [],
  requiredCriteriaByPass = {},
  experiment = null,
  corpus = null,
  preparedPlan = null,
} = {}) {
  if (!Array.isArray(records)) throw new Error('records[] is required');
  records = collapseRequestAttempts(records);
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error('candidates[] is required');
  }
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const requestIds = new Set();
  const adjudicationByObservation = new Map();
  const requestRecords = [];
  let expectedByRequest = null;
  let expectedContractId = null;
  let expectedMatrixId = null;
  if (experiment || corpus) {
    if (!experiment || !corpus) throw new Error('experiment and corpus must be supplied together');
    if (!preparedPlan) {
      throw new Error('preparedPlan is required for experiment-bound aggregation');
    }
    const plan = preparedPlan;
    if (plan.length === 0) throw new Error('expected experiment request matrix cannot be empty');
    expectedByRequest = new Map(plan.map((cell) => [
      requestIdFor(experiment.id, cell),
      cell,
    ]));
    expectedMatrixId = preparedPlan ? requestMatrixId(preparedPlan) : null;
    expectedContractId = experimentContractId(experiment, corpus, expectedMatrixId);
  }

  for (const record of records) {
    if (record?.schema_version !== 1) throw new Error('every record requires schema_version=1');
    if (record.record_type === 'visual-eval-adjudication') {
      validateAdjudication(record);
      if (adjudicationByObservation.has(record.observation_id)) {
        throw new Error(`duplicate adjudication for ${record.observation_id}`);
      }
      adjudicationByObservation.set(record.observation_id, record);
      continue;
    }
    validateRequestRecord(record);
    if (requestIds.has(record.request_id)) throw new Error(`duplicate request_id ${record.request_id}`);
    requestIds.add(record.request_id);
    if (expectedByRequest) {
      const expected = expectedByRequest.get(record.request_id);
      if (!expected) throw new Error(`unexpected request_id ${record.request_id}`);
      if (
        record.experiment_id !== experiment.id
        || record.experiment_contract_id !== expectedContractId
      ) {
        throw new Error(`request ${record.request_id} does not match the experiment contract`);
      }
      const expectedFields = {
        provider: expected.provider,
        model: expected.model,
        model_rank: expected.model_rank,
        model_class: expected.model_class,
        pass: expected.pass,
        criterion_id: expected.criterion_id,
        configured_batch_size: expected.configured_batch_size,
        actual_batch_size: expected.actual_batch_size,
        image_detail: expected.image_detail,
        replicate: expected.replicate,
        randomization_key: expected.randomization_key,
      };
      for (const [field, value] of Object.entries(expectedFields)) {
        if (record[field] !== value) {
          throw new Error(`request ${record.request_id} does not match planned ${field}`);
        }
      }
      const expectedCaseIds = expected.cases.map((entry) => entry.case_id);
      const expectedImageIds = expected.cases.map((entry) => entry.image.id);
      if (
        JSON.stringify(record.case_ids) !== JSON.stringify(expectedCaseIds)
        || JSON.stringify(record.image_ids) !== JSON.stringify(expectedImageIds)
      ) {
        throw new Error(`request ${record.request_id} evidence does not match the expected matrix`);
      }
      if (expected.request) {
        if (
          record.request_matrix_sha256 !== expectedMatrixId
          || record.prefix_id !== expected.request.prefix_manifest.prefix_id
          || record.suffix_sha256 !== expected.request.suffix.suffix_sha256
        ) {
          throw new Error(`request ${record.request_id} prompt identity does not match the expected matrix`);
        }
        const expectedHashByImage = new Map(
          expected.request.prefix_manifest.images.map((image) => [image.id, image.sha256]),
        );
        const expectedCaseById = new Map(
          expected.cases.map((evalCase) => [evalCase.case_id, evalCase]),
        );
        for (const observation of record.observations) {
          const evalCase = expectedCaseById.get(observation.case_id);
          if (
            !evalCase
            || observation.image_id !== evalCase.image.id
            || observation.criterion_id !== evalCase.criterion_id
            || observation.human_label !== evalCase.human_label
            || observation.image_sha256 !== expectedHashByImage.get(evalCase.image.id)
            || observation.evidence_sha256 !== evidenceSha256(
              expectedHashByImage.get(evalCase.image.id),
              evalCase,
            )
          ) {
            throw new Error(
              `observation ${observation.observation_id} does not match expected corpus evidence`,
            );
          }
        }
      }
    }
    if (!candidateById.has(record.model)) {
      throw new Error(`record references unknown candidate ${record.model}`);
    }
    const candidate = candidateById.get(record.model);
    if (
      Number(record.model_rank) !== Number(candidate.rank)
      || record.provider !== candidate.provider
    ) {
      throw new Error(`record candidate metadata does not match ${record.model}`);
    }
    requestRecords.push(record);
  }

  const experimentIds = new Set(requestRecords.map((record) => record.experiment_id));
  const contractIds = new Set(requestRecords.map((record) => record.experiment_contract_id));
  if (experimentIds.size > 1 || contractIds.size > 1) {
    throw new Error('records from different experiment contracts cannot be aggregated together');
  }
  const experimentComplete = expectedByRequest !== null
    && requestIds.size === expectedByRequest.size
    && [...expectedByRequest.keys()].every((requestId) => requestIds.has(requestId));
  const observationById = new Map();
  for (const record of requestRecords) {
    for (const observation of record.observations) {
      if (observationById.has(observation.observation_id)) {
        throw new Error(`duplicate observation_id ${observation.observation_id}`);
      }
      observationById.set(observation.observation_id, observation);
    }
  }
  const relabelByCase = new Map();
  for (const adjudication of adjudicationByObservation.values()) {
    const observation = observationById.get(adjudication.observation_id);
    if (!observation) {
      throw new Error(`adjudication references unknown observation ${adjudication.observation_id}`);
    }
    if (adjudication.decision !== 'relabel-corpus') continue;
    const prior = relabelByCase.get(observation.case_id);
    if (prior && prior !== adjudication.human_label) {
      throw new Error(`conflicting corpus relabels for case ${observation.case_id}`);
    }
    relabelByCase.set(observation.case_id, adjudication.human_label);
  }
  for (const adjudication of adjudicationByObservation.values()) {
    const observation = observationById.get(adjudication.observation_id);
    if (
      adjudication.decision === 'confirm-corpus-label'
      && relabelByCase.has(observation.case_id)
    ) {
      throw new Error(`conflicting confirm and relabel decisions for case ${observation.case_id}`);
    }
  }

  const grouped = new Map();
  for (const record of requestRecords) {
    const key = [
      record.provider,
      record.model,
      record.pass,
      record.configured_batch_size,
      record.image_detail,
    ].join('\u0000');
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(record);
  }

  const pendingAdjudication = new Set();
  const results = [...grouped.values()].map((cellRecords) => {
    const observations = [];
    for (const record of cellRecords) {
      for (const observation of record.observations) {
        const adjudication = adjudicationByObservation.get(observation.observation_id);
        const corpusRelabel = relabelByCase.get(observation.case_id) || null;
        const effective = applyAdjudication(observation, adjudication, corpusRelabel);
        if (effective.disagreement && !adjudication && !corpusRelabel) {
          pendingAdjudication.add(observation.observation_id);
        }
        if (!effective.excluded) observations.push(effective);
      }
    }
    const classified = observations.filter(
      (entry) => entry.json_valid && !entry.abstained && entry.predicted_label,
    );
    const positives = classified.filter((entry) => entry.human_label === 'fire');
    const negatives = classified.filter((entry) => entry.human_label === 'clean');
    const uniqueEvidence = new Map();
    const uniqueImages = new Set();
    const uniquePositiveImages = new Set();
    const uniqueNegativeImages = new Set();
    const evidenceByCase = new Map();
    for (const observation of classified) {
      const priorEvidence = evidenceByCase.get(observation.case_id);
      if (
        priorEvidence
        && (
          priorEvidence.image_sha256 !== observation.image_sha256
          || priorEvidence.evidence_sha256 !== observation.evidence_sha256
          || priorEvidence.human_label !== observation.human_label
        )
      ) {
        throw new Error(`case ${observation.case_id} has inconsistent evidence identity`);
      }
      evidenceByCase.set(observation.case_id, {
        image_sha256: observation.image_sha256,
        evidence_sha256: observation.evidence_sha256,
        human_label: observation.human_label,
      });
      if (!uniqueEvidence.has(observation.evidence_sha256)) {
        uniqueEvidence.set(observation.evidence_sha256, observation.human_label);
      } else if (uniqueEvidence.get(observation.evidence_sha256) !== observation.human_label) {
        throw new Error(
          `evidence bundle ${observation.evidence_sha256} has inconsistent human labels`,
        );
      }
      uniqueImages.add(observation.image_sha256);
      (observation.human_label === 'fire'
        ? uniquePositiveImages
        : uniqueNegativeImages
      ).add(observation.image_sha256);
    }
    const first = cellRecords[0];
    const criterionMetrics = aggregateCriteria(
      classified,
      requiredCriteriaByPass[first.pass] || [],
    );
    const telemetryComplete = cellRecords.every(
      (record) => record.telemetry.complete === true,
    );
    const totalCost = telemetryComplete
      ? sum(cellRecords.map((record) => record.telemetry.actual_cost_usd))
      : null;
    const jsonValid = observations.filter((entry) => entry.json_valid).length;
    const abstentions = observations.filter((entry) => entry.abstained).length;
    const groundingTotal = positives.length;
    const grounded = positives.filter(
      (entry) => entry.predicted_label === 'fire' && entry.grounded,
    ).length;
    const cellPending = observations
      .filter((entry) => (
        entry.disagreement
        && !adjudicationByObservation.has(entry.observation_id)
        && !relabelByCase.has(entry.case_id)
      ))
      .map((entry) => entry.observation_id);
    return {
      pass: first.pass,
      model: first.model,
      batch_size: first.configured_batch_size,
      image_detail: first.image_detail,
      runs: new Set(cellRecords.map(
        (record) => `${record.experiment_id}:${record.replicate}`,
      )).size,
      requests: cellRecords.length,
      cases: classified.length,
      positives: positives.length,
      negatives: negatives.length,
      unique_cases: uniqueEvidence.size,
      unique_positives: [...uniqueEvidence.values()].filter((label) => label === 'fire').length,
      unique_negatives: [...uniqueEvidence.values()].filter((label) => label === 'clean').length,
      unique_images: uniqueImages.size,
      unique_image_positives: uniquePositiveImages.size,
      unique_image_negatives: uniqueNegativeImages.size,
      tp: positives.filter((entry) => entry.predicted_label === 'fire').length,
      fp: negatives.filter((entry) => entry.predicted_label === 'fire').length,
      tn: negatives.filter((entry) => entry.predicted_label === 'clean').length,
      fn: positives.filter((entry) => entry.predicted_label === 'clean').length,
      grounded,
      grounding_total: groundingTotal,
      json_valid: jsonValid,
      responses: observations.length,
      abstentions,
      total_cost_usd: totalCost === null ? null : roundMoney(totalCost),
      telemetry_complete: telemetryComplete,
      experiment_complete: experimentComplete,
      p95_latency_ms: telemetryComplete
        ? percentile(cellRecords.map((record) => record.telemetry.latency_ms), 0.95)
        : null,
      p95_time_to_first_token_ms: telemetryComplete
        ? percentile(
          cellRecords.map((record) => record.telemetry.time_to_first_token_ms),
          0.95,
        )
        : null,
      telemetry: {
        input_tokens: sumPresent(cellRecords.map((record) => record.telemetry.input_tokens)),
        cache_read_tokens: sumPresent(cellRecords.map((record) => record.telemetry.cache_read_tokens)),
        cache_write_tokens: sumPresent(cellRecords.map((record) => record.telemetry.cache_write_tokens)),
        output_tokens: sumPresent(cellRecords.map((record) => record.telemetry.output_tokens)),
        prefix_ids: [...new Set(cellRecords.map((record) => record.prefix_id))].sort(),
      },
      criteria: criterionMetrics,
      adjudication_complete: cellPending.length === 0,
      synthetic: cellRecords.some((record) => record.synthetic === true),
    };
  }).sort(compareResults);

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    source: {
      record_files: [...sourceFiles],
      request_records: requestRecords.length,
      adjudication_records: adjudicationByObservation.size,
      expected_request_records: expectedByRequest?.size ?? null,
      experiment_complete: experimentComplete,
      corpus_id: corpus?.corpus_id ?? null,
      corpus_sha256: corpus ? corpusContractId(corpus) : null,
      experiment_contract_id: expectedContractId,
      ladder_state: experiment?.ladder_state || null,
    },
    thresholds,
    candidates,
    results,
    pending_adjudication: [...pendingAdjudication].sort(),
  };
}

function collapseRequestAttempts(records) {
  const adjudications = [];
  const attemptsByRequest = new Map();
  for (const record of records) {
    if (record?.record_type === 'visual-eval-adjudication') {
      adjudications.push(record);
      continue;
    }
    if (!record?.request_id) {
      adjudications.push(record);
      continue;
    }
    const attempts = attemptsByRequest.get(record.request_id) || [];
    attempts.push(record);
    attemptsByRequest.set(record.request_id, attempts);
  }
  const requests = [...attemptsByRequest.values()].map((attempts) =>
    [...attempts].reverse().find(isTerminalRequestRecord) || attempts.at(-1));
  return [...requests, ...adjudications];
}

function aggregateCriteria(observations, requiredCriteria) {
  const groups = new Map(requiredCriteria.map((criterionId) => [criterionId, []]));
  for (const observation of observations) {
    if (!groups.has(observation.criterion_id)) groups.set(observation.criterion_id, []);
    groups.get(observation.criterion_id).push(observation);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([criterionId, rows]) => {
    const positives = rows.filter((entry) => entry.human_label === 'fire');
    const negatives = rows.filter((entry) => entry.human_label === 'clean');
    return {
      id: criterionId,
      cases: rows.length,
      unique_positives: new Set(positives.map((entry) => entry.evidence_sha256)).size,
      unique_negatives: new Set(negatives.map((entry) => entry.evidence_sha256)).size,
      unique_image_positives: new Set(positives.map((entry) => entry.image_sha256)).size,
      unique_image_negatives: new Set(negatives.map((entry) => entry.image_sha256)).size,
      tp: positives.filter((entry) => entry.predicted_label === 'fire').length,
      fp: negatives.filter((entry) => entry.predicted_label === 'fire').length,
      tn: negatives.filter((entry) => entry.predicted_label === 'clean').length,
      fn: positives.filter((entry) => entry.predicted_label === 'clean').length,
    };
  });
}

function applyAdjudication(observation, adjudication, corpusRelabel) {
  const normalized = {
    ...observation,
    human_label: corpusRelabel || observation.human_label,
    disagreement: (
      observation.predicted_label !== null
      && observation.predicted_label !== (corpusRelabel || observation.human_label)
    ),
  };
  if (!adjudication) return { ...normalized, excluded: false };
  if (adjudication.decision === 'confirm-corpus-label') {
    return { ...normalized, excluded: false, adjudication };
  }
  if (adjudication.decision === 'relabel-corpus') {
    return { ...normalized, excluded: false, adjudication };
  }
  return { ...normalized, excluded: true, adjudication };
}

function validateRequestRecord(record) {
  for (const field of [
    'request_id',
    'experiment_id',
    'experiment_contract_id',
    'request_matrix_sha256',
    'replicate',
    'provider',
    'model',
    'pass',
    'criterion_id',
    'configured_batch_size',
    'actual_batch_size',
    'image_detail',
    'prefix_id',
    'suffix_sha256',
    'randomization_key',
    'case_ids',
    'image_ids',
    'response',
    'telemetry',
    'observations',
    'synthetic',
  ]) {
    if (record?.[field] === undefined || record[field] === null) {
      throw new Error(`request record requires ${field}`);
    }
  }
  if (record.record_type !== 'visual-eval-request') {
    throw new Error(`unsupported record_type ${record.record_type}`);
  }
  if (!Array.isArray(record.observations) || record.observations.length === 0) {
    throw new Error(`request ${record.request_id} requires observations[]`);
  }
  if (![true, false].includes(record.synthetic)) {
    throw new Error(`request ${record.request_id} synthetic must be a boolean`);
  }
  if (Number(record.actual_batch_size) !== Number(record.configured_batch_size)) {
    throw new Error(
      `request ${record.request_id} actual_batch_size must equal configured_batch_size`,
    );
  }
  const batchSize = Number(record.configured_batch_size);
  if (
    !Array.isArray(record.case_ids)
    || !Array.isArray(record.image_ids)
    || record.case_ids.length !== batchSize
    || record.image_ids.length !== batchSize
    || record.observations.length !== batchSize
  ) {
    throw new Error(`request ${record.request_id} evidence arrays must match configured_batch_size`);
  }
  if (
    new Set(record.case_ids).size !== batchSize
    || new Set(record.image_ids).size !== batchSize
  ) {
    throw new Error(`request ${record.request_id} evidence identities must be unique within a batch`);
  }
  for (const field of [
    'experiment_contract_id',
    'request_matrix_sha256',
    'prefix_id',
    'suffix_sha256',
    'randomization_key',
  ]) {
    if (!/^[a-f0-9]{64}$/.test(record[field])) {
      throw new Error(`request ${record.request_id} has invalid ${field}`);
    }
  }
  for (const observation of record.observations) {
    for (const field of [
      'observation_id',
      'case_id',
      'image_id',
      'image_sha256',
      'evidence_sha256',
      'human_label',
      'criterion_id',
      'json_valid',
      'abstained',
      'grounded',
    ]) {
      if (observation[field] === undefined || observation[field] === null) {
        throw new Error(`observation in ${record.request_id} requires ${field}`);
      }
    }
    if (!/^[a-f0-9]{64}$/.test(observation.image_sha256)) {
      throw new Error(`observation ${observation.observation_id} has invalid image_sha256`);
    }
    if (!/^[a-f0-9]{64}$/.test(observation.evidence_sha256)) {
      throw new Error(`observation ${observation.observation_id} has invalid evidence_sha256`);
    }
    const caseIndex = record.case_ids.indexOf(observation.case_id);
    if (
      caseIndex < 0
      || record.image_ids[caseIndex] !== observation.image_id
      || observation.criterion_id !== record.criterion_id
    ) {
      throw new Error(
        `observation ${observation.observation_id} does not match its request evidence`,
      );
    }
    if (!['fire', 'clean'].includes(observation.human_label)) {
      throw new Error(`invalid human_label ${observation.human_label}`);
    }
    if (
      observation.predicted_label !== null
      && !['fire', 'clean'].includes(observation.predicted_label)
    ) {
      throw new Error(`invalid predicted_label ${observation.predicted_label}`);
    }
  }
  if (
    new Set(record.observations.map((entry) => entry.observation_id)).size !== batchSize
    || new Set(record.observations.map((entry) => entry.case_id)).size !== batchSize
    || new Set(record.observations.map((entry) => entry.image_id)).size !== batchSize
  ) {
    throw new Error(`request ${record.request_id} observations must be unique within a batch`);
  }
  record.telemetry = normalizeTelemetry(record.telemetry, {
    allowIncomplete: true,
    context: `request ${record.request_id} telemetry`,
  });
}

function validateAdjudication(record) {
  for (const field of ['observation_id', 'decision', 'adjudicator', 'notes', 'recorded_at']) {
    if (!record?.[field]) throw new Error(`adjudication requires ${field}`);
  }
  if (!['confirm-corpus-label', 'relabel-corpus', 'exclude'].includes(record.decision)) {
    throw new Error(`unsupported adjudication decision ${record.decision}`);
  }
  if (
    record.decision === 'relabel-corpus'
    && !['fire', 'clean'].includes(record.human_label)
  ) {
    throw new Error('relabel-corpus adjudication requires human_label fire or clean');
  }
}

function percentile(values, quantile) {
  if (values.length === 0) throw new Error('cannot compute percentile of empty values');
  const sorted = [...values].map(Number).sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)];
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value), 0);
}

function sumPresent(values) {
  return values.some((value) => value === null) ? null : sum(values);
}

function roundMoney(value) {
  return Number(value.toFixed(12));
}

function compareResults(a, b) {
  return (
    String(a.pass).localeCompare(String(b.pass))
    || String(a.model).localeCompare(String(b.model))
    || Number(a.batch_size) - Number(b.batch_size)
    || String(a.image_detail).localeCompare(String(b.image_detail))
  );
}

export async function readJsonlFiles(files) {
  const records = [];
  for (const file of files) {
    const source = await fs.readFile(file, 'utf8');
    for (const [index, rawLine] of source.split('\n').entries()) {
      const line = rawLine.trim();
      if (!line) continue;
      try {
        records.push(JSON.parse(line));
      } catch (error) {
        throw new Error(`${file}:${index + 1}: ${error.message}`);
      }
    }
  }
  return records;
}

function parseArgs(argv) {
  const args = { records: [], experiment: null, output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--records') args.records.push(argv[++index]);
    else if (arg === '--experiment') args.experiment = argv[++index];
    else if (arg === '--out') args.output = argv[++index];
    else throw new Error(`unknown argument ${arg}`);
  }
  if (args.records.length === 0 || !args.experiment) {
    throw new Error('usage: aggregate.mjs --records records.jsonl [--records more.jsonl] --experiment experiment.json [--out measurements.json]');
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const experiment = JSON.parse(await fs.readFile(args.experiment, 'utf8'));
  const files = args.records.map((file) => path.resolve(file));
  const records = await readJsonlFiles(files);
  const experimentPath = path.resolve(args.experiment);
  const corpusPath = path.resolve(
    path.dirname(experimentPath),
    experiment.corpus_path,
  );
  const corpus = await loadCorpus(corpusPath);
  validateCorpus(corpus, { corpusPath });
  const resolvedExperiment = { ...experiment, corpus_path: corpusPath };
  const requiredCriteriaByPass = {};
  const expandedCases = expandCorpus(corpus, { corpusPath });
  for (const evalCase of expandedCases) {
    if (!requiredCriteriaByPass[evalCase.family]) requiredCriteriaByPass[evalCase.family] = new Set();
    requiredCriteriaByPass[evalCase.family].add(evalCase.criterion_id);
  }
  const selectedPasses = new Set(experiment.passes || expandedCases.map((entry) => entry.family));
  const plan = buildExperimentPlan(
    resolvedExperiment,
    expandedCases.filter((entry) => selectedPasses.has(entry.family)),
  );
  if (plan.length === 0) throw new Error('experiment produced an empty request plan');
  const preparedPlan = await prepareExperimentPlan(resolvedExperiment, plan);
  const measurements = aggregateRecords(records, {
    candidates: experiment.candidates,
    thresholds: experiment.thresholds,
    sourceFiles: files,
    requiredCriteriaByPass: Object.fromEntries(
      Object.entries(requiredCriteriaByPass).map(([family, criteria]) => [
        family,
        [...criteria].sort(),
      ]),
    ),
    experiment: resolvedExperiment,
    corpus,
    preparedPlan,
  });
  const rendered = `${JSON.stringify(measurements, null, 2)}\n`;
  if (args.output) {
    const output = path.resolve(args.output);
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, rendered, { flag: 'wx' });
    process.stdout.write(`${output}\n`);
  } else {
    process.stdout.write(rendered);
  }
  if (
    measurements.pending_adjudication.length > 0
    || measurements.results.some((row) => (
      row.synthetic || !row.experiment_complete || !row.telemetry_complete
    ))
  ) {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exit(2);
  });
}
