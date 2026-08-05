import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { aggregateRecords } from './aggregate.mjs';
import { evidenceSha256, expandCorpus, loadCorpus } from './corpus.mjs';
import {
  buildExperimentPlan,
  experimentContractId,
  requestMatrixId,
  requestIdFor,
} from './run.mjs';

function record({
  requestId,
  replicate,
  caseId,
  humanLabel,
  predictedLabel,
  grounded = true,
  latencyMs = 100,
  cost = 0.001,
  imageSha256 = null,
  visibleText = caseId,
  truthExcerpt = caseId,
}) {
  const renderedSha256 = imageSha256
    || crypto.createHash('sha256').update(caseId).digest('hex');
  const evidenceIdentity = evidenceSha256(renderedSha256, {
    visible_text: visibleText,
    truth_excerpt: truthExcerpt,
  });
  return {
    schema_version: 1,
    record_type: 'visual-eval-request',
    request_id: requestId,
    experiment_id: 'experiment-1',
    experiment_contract_id: 'd'.repeat(64),
    request_matrix_sha256: 'e'.repeat(64),
    replicate,
    provider: 'fixture',
    model: 'tiny',
    model_rank: 1,
    model_class: 'small',
    pass: 'layout',
    criterion_id: 'text-visibly-clipped',
    configured_batch_size: 1,
    actual_batch_size: 1,
    image_detail: 'high',
    prefix_id: 'a'.repeat(64),
    suffix_sha256: 'b'.repeat(64),
    randomization_key: 'c'.repeat(64),
    case_ids: [caseId],
    image_ids: [`image:${caseId}`],
    response: { json_valid: true, abstained: false },
    telemetry: {
      latency_ms: latencyMs,
      time_to_first_token_ms: latencyMs / 2,
      input_tokens: 100,
      cache_read_tokens: 50,
      cache_write_tokens: 0,
      output_tokens: 20,
      actual_cost_usd: cost,
    },
    observations: [{
      observation_id: `${requestId}:${caseId}`,
      case_id: caseId,
      image_id: `image:${caseId}`,
      image_sha256: renderedSha256,
      evidence_sha256: evidenceIdentity,
      criterion_id: 'text-visibly-clipped',
      human_label: humanLabel,
      predicted_label: predictedLabel,
      grounded,
      json_valid: true,
      abstained: false,
    }],
    synthetic: false,
  };
}

test('aggregation emits selector counts, unique evidence, telemetry, and p95', () => {
  const records = [
    record({ requestId: 'r1-fire', replicate: 1, caseId: 'fire-a', humanLabel: 'fire', predictedLabel: 'fire', latencyMs: 100 }),
    record({ requestId: 'r1-clean', replicate: 1, caseId: 'clean-a', humanLabel: 'clean', predictedLabel: 'clean', latencyMs: 200 }),
    record({ requestId: 'r2-fire', replicate: 2, caseId: 'fire-a', humanLabel: 'fire', predictedLabel: 'fire', latencyMs: 300 }),
    record({ requestId: 'r2-clean', replicate: 2, caseId: 'clean-a', humanLabel: 'clean', predictedLabel: 'clean', latencyMs: 400 }),
  ];
  const measurements = aggregateRecords(records, {
    candidates: [{ id: 'tiny', rank: 1, class: 'small', provider: 'fixture' }],
  });
  const [result] = measurements.results;

  assert.equal(result.runs, 2);
  assert.equal(result.cases, 4);
  assert.equal(result.positives, 2);
  assert.equal(result.negatives, 2);
  assert.equal(result.unique_cases, 2);
  assert.equal(result.unique_positives, 1);
  assert.equal(result.unique_negatives, 1);
  assert.equal(result.unique_images, 2);
  assert.equal(result.unique_image_positives, 1);
  assert.equal(result.unique_image_negatives, 1);
  assert.equal(result.tp, 2);
  assert.equal(result.tn, 2);
  assert.equal(result.grounded, 2);
  assert.equal(result.grounding_total, 2);
  assert.equal(result.total_cost_usd, 0.004);
  assert.equal(result.p95_latency_ms, 400);
  assert.equal(result.adjudication_complete, true);
  assert.equal(result.synthetic, false);
  assert.equal(result.telemetry_complete, true);
  assert.equal(result.experiment_complete, false);
});

test('aggregation collapses a failed paid attempt into its successful retry', () => {
  const success = record({
    requestId: 'retry-me',
    replicate: 1,
    caseId: 'clean-a',
    humanLabel: 'clean',
    predictedLabel: 'clean',
  });
  success.telemetry.complete = true;
  const failure = {
    ...success,
    response: { json_valid: false, error: 'provider timeout' },
    telemetry: { ...success.telemetry, complete: false },
    observations: [],
  };
  const measurements = aggregateRecords([failure, success], {
    candidates: [{ id: 'tiny', rank: 1, class: 'small', provider: 'fixture' }],
  });
  assert.equal(measurements.source.request_records, 1);
  assert.equal(measurements.results[0].cases, 1);
  assert.equal(measurements.results[0].tn, 1);
});

test('unique evidence is keyed by the image-and-source evidence bundle', () => {
  const sharedImageSha256 = crypto.createHash('sha256').update('shared-pixels').digest('hex');
  const first = record({
    requestId: 'pixel-copy-a',
    replicate: 1,
    caseId: 'case-a',
    humanLabel: 'fire',
    predictedLabel: 'fire',
    imageSha256: sharedImageSha256,
    visibleText: 'Same visible evidence',
    truthExcerpt: 'Same source evidence',
  });
  const second = record({
    requestId: 'pixel-copy-b',
    replicate: 2,
    caseId: 'case-b',
    humanLabel: 'fire',
    predictedLabel: 'fire',
    imageSha256: sharedImageSha256,
    visibleText: 'Same visible evidence',
    truthExcerpt: 'Same source evidence',
  });
  const measurements = aggregateRecords([first, second], {
    candidates: [{ id: 'tiny', rank: 1, class: 'small', provider: 'fixture' }],
  });
  assert.equal(measurements.results[0].cases, 2);
  assert.equal(measurements.results[0].unique_cases, 1);
  assert.equal(measurements.results[0].unique_positives, 1);
  assert.equal(measurements.results[0].unique_images, 1);
});

test('source-conditioned labels remain independent when rendered pixels match', () => {
  const sharedImageSha256 = crypto.createHash('sha256').update('confidence-meter').digest('hex');
  const fire = record({
    requestId: 'source-conditioned-fire',
    replicate: 1,
    caseId: 'unsupported-confidence',
    humanLabel: 'fire',
    predictedLabel: 'fire',
    imageSha256: sharedImageSha256,
    visibleText: 'Confidence 87%',
    truthExcerpt: 'No measurement supports the displayed confidence.',
  });
  const clean = record({
    requestId: 'source-conditioned-clean',
    replicate: 1,
    caseId: 'measured-confidence',
    humanLabel: 'clean',
    predictedLabel: 'clean',
    imageSha256: sharedImageSha256,
    visibleText: 'Confidence 87%',
    truthExcerpt: '87 of 100 checks passed in the attached run.',
  });
  assert.equal(
    clean.observations[0].image_sha256,
    fire.observations[0].image_sha256,
  );
  assert.notEqual(
    clean.observations[0].evidence_sha256,
    fire.observations[0].evidence_sha256,
  );

  const measurements = aggregateRecords([fire, clean], {
    candidates: [{ id: 'tiny', rank: 1, class: 'small', provider: 'fixture' }],
  });
  assert.equal(measurements.results[0].unique_cases, 2);
  assert.equal(measurements.results[0].unique_positives, 1);
  assert.equal(measurements.results[0].unique_negatives, 1);
  assert.equal(measurements.results[0].unique_images, 1);
  assert.equal(measurements.results[0].unique_image_positives, 1);
  assert.equal(measurements.results[0].unique_image_negatives, 1);
});

test('unadjudicated disagreements remain visible and cannot become policy evidence', () => {
  const records = [
    record({
      requestId: 'false-positive',
      replicate: 1,
      caseId: 'clean-a',
      humanLabel: 'clean',
      predictedLabel: 'fire',
    }),
  ];
  const measurements = aggregateRecords(records, {
    candidates: [{ id: 'tiny', rank: 1, class: 'small', provider: 'fixture' }],
  });
  assert.equal(measurements.results[0].fp, 1);
  assert.equal(measurements.results[0].adjudication_complete, false);
  assert.deepEqual(measurements.pending_adjudication, ['false-positive:clean-a']);
});

test('append-only adjudication records can confirm a disagreement', () => {
  const request = record({
    requestId: 'false-positive',
    replicate: 1,
    caseId: 'clean-a',
    humanLabel: 'clean',
    predictedLabel: 'fire',
  });
  const adjudication = {
    schema_version: 1,
    record_type: 'visual-eval-adjudication',
    observation_id: 'false-positive:clean-a',
    decision: 'confirm-corpus-label',
    adjudicator: 'human-reviewer',
    notes: 'The authored asymmetry is intentional and the model finding is false.',
    recorded_at: '2026-07-25T00:00:00.000Z',
  };
  const measurements = aggregateRecords([request, adjudication], {
    candidates: [{ id: 'tiny', rank: 1, class: 'small', provider: 'fixture' }],
  });
  assert.equal(measurements.results[0].adjudication_complete, true);
  assert.deepEqual(measurements.pending_adjudication, []);
});

test('a corpus relabel applies consistently to every replicate of the case', () => {
  const first = record({
    requestId: 'relabel-r1',
    replicate: 1,
    caseId: 'case-a',
    humanLabel: 'fire',
    predictedLabel: 'clean',
  });
  const second = record({
    requestId: 'relabel-r2',
    replicate: 2,
    caseId: 'case-a',
    humanLabel: 'fire',
    predictedLabel: 'clean',
  });
  const adjudication = {
    schema_version: 1,
    record_type: 'visual-eval-adjudication',
    observation_id: 'relabel-r1:case-a',
    decision: 'relabel-corpus',
    human_label: 'clean',
    adjudicator: 'human-reviewer',
    notes: 'The reviewed state is an intentional clean control.',
    recorded_at: '2026-07-25T00:00:00.000Z',
  };
  const measurements = aggregateRecords([first, second, adjudication], {
    candidates: [{ id: 'tiny', rank: 1, class: 'small', provider: 'fixture' }],
  });
  assert.equal(measurements.results[0].tn, 2);
  assert.equal(measurements.results[0].adjudication_complete, true);
  assert.deepEqual(measurements.pending_adjudication, []);
});

test('synthetic adapter records are marked non-policy evidence', () => {
  const synthetic = {
    ...record({
      requestId: 'fixture-only',
      replicate: 1,
      caseId: 'fire-a',
      humanLabel: 'fire',
      predictedLabel: 'fire',
    }),
    synthetic: true,
  };
  const measurements = aggregateRecords([synthetic], {
    candidates: [{ id: 'tiny', rank: 1, class: 'small', provider: 'fixture' }],
  });
  assert.equal(measurements.results[0].synthetic, true);
});

test('aggregation rejects undersized requests in a configured batch cell', () => {
  const undersized = record({
    requestId: 'undersized',
    replicate: 1,
    caseId: 'fire-a',
    humanLabel: 'fire',
    predictedLabel: 'fire',
  });
  undersized.configured_batch_size = 4;
  assert.throws(
    () => aggregateRecords([undersized], {
      candidates: [{ id: 'tiny', rank: 1, class: 'small', provider: 'fixture' }],
    }),
    /actual_batch_size must equal configured_batch_size/,
  );
});

test('aggregation fails closed on malformed batch cardinality and missing provenance', () => {
  const malformed = record({
    requestId: 'malformed-batch',
    replicate: 1,
    caseId: 'fire-a',
    humanLabel: 'fire',
    predictedLabel: 'fire',
  });
  malformed.configured_batch_size = 2;
  malformed.actual_batch_size = 2;
  assert.throws(
    () => aggregateRecords([malformed], {
      candidates: [{ id: 'tiny', rank: 1, class: 'small', provider: 'fixture' }],
    }),
    /evidence arrays must match configured_batch_size/,
  );

  const missingProvenance = record({
    requestId: 'missing-provenance',
    replicate: 1,
    caseId: 'clean-a',
    humanLabel: 'clean',
    predictedLabel: 'clean',
  });
  delete missingProvenance.synthetic;
  assert.throws(
    () => aggregateRecords([missingProvenance], {
      candidates: [{ id: 'tiny', rank: 1, class: 'small', provider: 'fixture' }],
    }),
    /requires synthetic/,
  );
});

test('incomplete telemetry remains null rather than becoming a zero measurement', () => {
  const incomplete = record({
    requestId: 'incomplete-telemetry',
    replicate: 1,
    caseId: 'fire-a',
    humanLabel: 'fire',
    predictedLabel: 'fire',
  });
  incomplete.telemetry = {
    complete: false,
    latency_ms: 100,
    time_to_first_token_ms: null,
    input_tokens: null,
    cache_read_tokens: null,
    cache_write_tokens: null,
    output_tokens: null,
    actual_cost_usd: null,
  };
  const measurements = aggregateRecords([incomplete], {
    candidates: [{ id: 'tiny', rank: 1, class: 'small', provider: 'fixture' }],
  });
  assert.equal(measurements.results[0].total_cost_usd, null);
  assert.equal(measurements.results[0].p95_latency_ms, null);
  assert.equal(measurements.results[0].p95_time_to_first_token_ms, null);
});

test('aggregation binds qualification to the complete expected request matrix', async () => {
  const corpusPath = fileURLToPath(new URL('./corpus.json', import.meta.url));
  const corpus = await loadCorpus(corpusPath);
  const candidate = { id: 'tiny', rank: 1, class: 'small', provider: 'fixture' };
  const experiment = {
    id: 'matrix-contract',
    corpus_path: corpusPath,
    run_candidate: candidate.id,
    candidates: [candidate],
    image_detail: 'high',
    batch_sizes: [4],
    replicates: 1,
    passes: ['layout'],
    thresholds: {},
    ladder_state: { completed_candidates: [] },
  };
  const cases = expandCorpus(corpus, { corpusPath })
    .filter((entry) => entry.family === 'layout');
  const plan = buildExperimentPlan(experiment, cases);
  const preparedPlan = plan.map((cell) => {
    const requestId = requestIdFor(experiment.id, cell);
    return {
      ...cell,
      experiment_id: experiment.id,
      request: {
        prefix_manifest: {
          prefix_id: crypto.createHash('sha256').update(`prefix:${requestId}`).digest('hex'),
          images: cell.cases.map((entry) => ({
            id: entry.image.id,
            sha256: crypto.createHash('sha256').update(entry.case_id).digest('hex'),
          })),
        },
        suffix: {
          suffix_sha256: crypto.createHash('sha256').update(`suffix:${requestId}`).digest('hex'),
        },
      },
    };
  });
  const matrixId = requestMatrixId(preparedPlan);
  const contractId = experimentContractId(experiment, corpus, matrixId);
  const records = preparedPlan.map((cell) => {
    const requestId = requestIdFor(experiment.id, cell);
    return {
      schema_version: 1,
      record_type: 'visual-eval-request',
      request_id: requestId,
      experiment_id: experiment.id,
      experiment_contract_id: contractId,
      request_matrix_sha256: matrixId,
      replicate: cell.replicate,
      provider: candidate.provider,
      model: candidate.id,
      model_rank: candidate.rank,
      model_class: candidate.class,
      pass: cell.pass,
      criterion_id: cell.criterion_id,
      configured_batch_size: cell.configured_batch_size,
      actual_batch_size: cell.actual_batch_size,
      image_detail: cell.image_detail,
      prefix_id: cell.request.prefix_manifest.prefix_id,
      suffix_sha256: cell.request.suffix.suffix_sha256,
      randomization_key: cell.randomization_key,
      case_ids: cell.cases.map((entry) => entry.case_id),
      image_ids: cell.cases.map((entry) => entry.image.id),
      response: { json_valid: true, abstained: false },
      telemetry: {
        complete: true,
        latency_ms: 100,
        time_to_first_token_ms: 50,
        input_tokens: 100,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        output_tokens: 20,
        actual_cost_usd: 0.001,
      },
      observations: cell.cases.map((entry) => {
        const imageSha256 = crypto.createHash('sha256').update(entry.case_id).digest('hex');
        return {
          observation_id: `${requestId}:${entry.case_id}`,
          case_id: entry.case_id,
          image_id: entry.image.id,
          image_sha256: imageSha256,
          evidence_sha256: evidenceSha256(imageSha256, entry),
          criterion_id: entry.criterion_id,
          human_label: entry.human_label,
          predicted_label: entry.human_label,
          grounded: entry.human_label === 'fire',
          json_valid: true,
          abstained: false,
        };
      }),
      synthetic: false,
    };
  });
  const options = {
    candidates: [candidate],
    experiment,
    corpus,
    preparedPlan,
  };
  const complete = aggregateRecords(records, options);
  assert.equal(complete.results.every((entry) => entry.experiment_complete), true);
  const partial = aggregateRecords(records.slice(1), options);
  assert.equal(partial.results.every((entry) => !entry.experiment_complete), true);
});
