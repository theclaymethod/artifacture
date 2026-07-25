#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { canonicalJson } from '../lib/canonical-json.mjs';
import {
  attachCriterionSuffix,
  buildPrefixManifest,
} from '../visual-cache/prefix.mjs';
import {
  evidenceSha256,
  expandCorpus,
  loadCorpus,
  validateCorpus,
} from './corpus.mjs';
import { normalizeTelemetry } from './telemetry.mjs';

export const VERDICT_SYSTEM_TEXT = `Return JSON only. The top-level object must be {"verdicts":[...]}. Each supplied state_id must have exactly one verdict. A verdict is either {"state_id":"...","abstain":true,"reason":"..."} or {"state_id":"...","pass":true|false,"findings":[...]}. Every finding requires check_id, image_id, region_id, evidence, and fix.`;

export const SHARED_INSTRUCTIONS = `Inspect only the supplied evidence. Judge only the selected criterion. Never infer a finding from another image or another criterion. Use the exact state_id, image_id, and region_id supplied for grounding. Stay silent when the criterion does not fire.`;

export function corpusContractId(corpus) {
  return crypto.createHash('sha256').update(canonicalJson(corpus)).digest('hex');
}

export function experimentContractId(experiment, corpus, requestMatrixSha256 = null) {
  return crypto.createHash('sha256').update(canonicalJson({
    schema_version: 1,
    experiment_id: experiment.id,
    corpus_sha256: corpusContractId(corpus),
    provider_contract: {
      candidate: experiment.candidates.find((entry) => entry.id === experiment.run_candidate),
      image_detail: experiment.image_detail,
      batch_sizes: experiment.batch_sizes,
      replicates: experiment.replicates,
      passes: experiment.passes,
      thresholds: experiment.thresholds,
      adapter_options: experiment.adapter_options || {},
      ladder_state: experiment.ladder_state || { completed_candidates: [] },
      request_matrix_sha256: requestMatrixSha256,
    },
  })).digest('hex');
}

export function requestIdFor(experimentId, cell) {
  return `${experimentId}:${cell.model}:${cell.pass}:${cell.criterion_id}:b${cell.configured_batch_size}:r${cell.replicate}:${cell.batch_index}`;
}

export function requestMatrixId(preparedPlan) {
  return crypto.createHash('sha256').update(canonicalJson(
    preparedPlan.map(({ request, ...cell }) => ({
      request_id: requestIdFor(cell.experiment_id, cell),
      provider: cell.provider,
      model: cell.model,
      model_rank: cell.model_rank,
      pass: cell.pass,
      criterion_id: cell.criterion_id,
      configured_batch_size: cell.configured_batch_size,
      image_detail: cell.image_detail,
      replicate: cell.replicate,
      batch_index: cell.batch_index,
      randomization_key: cell.randomization_key,
      case_ids: cell.cases.map((entry) => entry.case_id),
      image_ids: cell.cases.map((entry) => entry.image.id),
      image_sha256s: request.prefix_manifest.images.map((entry) => entry.sha256),
      prefix_id: request.prefix_manifest.prefix_id,
      suffix_sha256: request.suffix.suffix_sha256,
    })),
  )).digest('hex');
}

export async function buildBatchRequest({
  provider,
  model,
  imageDetail = 'high',
  pass,
  criterionId,
  criterionPrompt,
  cases,
  designSystemText = '',
  toolsJson = '[]',
}) {
  if (!Array.isArray(cases) || cases.length === 0) throw new Error('cases[] is required');
  if (cases.some((entry) => entry.family !== pass && entry.route_key !== pass)) {
    throw new Error(`all cases must belong to pass ${pass}`);
  }
  if (cases.some((entry) => entry.criterion_id !== criterionId)) {
    throw new Error(`all cases must use criterion ${criterionId}`);
  }
  const images = cases.map((entry) => ({
    id: entry.image.id,
    path: entry.image.path,
    detail: imageDetail,
  }));
  const prefixManifest = await buildPrefixManifest({
    provider,
    model,
    systemText: VERDICT_SYSTEM_TEXT,
    sharedInstructions: SHARED_INSTRUCTIONS,
    designSystemText,
    toolsJson,
    images,
  });
  const suffixCases = cases.map((entry) => ({
    case_id: entry.case_id,
    state_id: entry.state_id,
    image_id: entry.image.id,
    regions: entry.regions.map(({ id, label }) => ({ id, label })),
    visible_text: entry.visible_text,
    truth_excerpt: entry.truth_excerpt,
  }));
  const suffixPayload = {
    pass,
    criteria: [criterionId],
    prompt: criterionPrompt,
    cases: suffixCases,
  };
  const suffixIdentity = attachCriterionSuffix(prefixManifest, {
    pass,
    criteria: [criterionId],
    prompt: canonicalJson(suffixPayload),
  });
  return {
    schema_version: 1,
    prefix_manifest: prefixManifest,
    prefix: {
      tools_json: toolsJson,
      system_text: VERDICT_SYSTEM_TEXT,
      shared_instructions: SHARED_INSTRUCTIONS,
      design_system_text: designSystemText,
      images: prefixManifest.images.map((image) => ({
        id: image.id,
        detail: image.detail,
        sha256: image.sha256,
        path: cases.find((entry) => entry.image.id === image.id).image.path,
      })),
    },
    suffix: {
      ...suffixPayload,
      suffix_sha256: suffixIdentity.suffix_sha256,
    },
  };
}

export function evaluateProviderResponse({ response, cases, criterionId }) {
  const caseByState = new Map(cases.map((entry) => [entry.state_id, entry]));
  let parsed;
  try {
    parsed = JSON.parse(response.raw_text);
  } catch {
    return invalidBatch(response, cases, 'response is not valid JSON');
  }
  if (!parsed || !Array.isArray(parsed.verdicts)) {
    return invalidBatch(response, cases, 'response requires verdicts[]');
  }
  const foreignState = parsed.verdicts.find(
    (verdict) => verdict?.state_id && !caseByState.has(verdict.state_id),
  );
  if (foreignState) {
    return invalidBatch(
      response,
      cases,
      `response contains unknown state_id ${foreignState.state_id}`,
    );
  }

  const verdictsByState = new Map();
  const duplicateStates = new Set();
  for (const verdict of parsed.verdicts) {
    if (!verdict?.state_id || verdictsByState.has(verdict.state_id)) {
      if (verdict?.state_id) duplicateStates.add(verdict.state_id);
      continue;
    }
    verdictsByState.set(verdict.state_id, verdict);
  }
  const observations = cases.map((evalCase) => {
    const verdict = verdictsByState.get(evalCase.state_id);
    const validationError = validateVerdict({
      verdict,
      evalCase,
      criterionId,
      duplicate: duplicateStates.has(evalCase.state_id),
    });
    if (validationError) {
      return observationFor(evalCase, {
        predictedLabel: null,
        jsonValid: false,
        abstained: false,
        grounded: false,
        validationError,
        verdict: verdict || null,
      });
    }
    if (verdict.abstain === true) {
      return observationFor(evalCase, {
        predictedLabel: null,
        jsonValid: true,
        abstained: true,
        grounded: false,
        validationError: null,
        verdict,
      });
    }
    const matchingFindings = verdict.findings.filter(
      (finding) => finding.check_id === criterionId,
    );
    const predictedLabel = matchingFindings.length > 0 ? 'fire' : 'clean';
    const grounded = matchingFindings.length > 0 && matchingFindings.every((finding) => (
      finding.image_id === evalCase.image.id
      && evalCase.regions.some((region) => region.id === finding.region_id)
    ));
    return observationFor(evalCase, {
      predictedLabel,
      jsonValid: true,
      abstained: false,
      grounded,
      validationError: null,
      verdict,
    });
  });
  return {
    raw_text: response.raw_text,
    provider_response_id: response.provider_response_id || null,
    json_valid: observations.every((entry) => entry.json_valid),
    abstained: observations.some((entry) => entry.abstained),
    observations,
    telemetry: normalizeTelemetry(response.telemetry, {
      allowIncomplete: true,
      context: 'provider telemetry',
    }),
  };
}

export async function appendRawRecord(recordsPath, record) {
  const output = path.resolve(recordsPath);
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.appendFile(output, `${JSON.stringify(record)}\n`, {
    encoding: 'utf8',
    flag: 'a',
  });
  return output;
}

export function criterionPromptFor(rubricText, criterionId) {
  const marker = `[${criterionId}]`;
  const markerCount = [...rubricText.matchAll(/\[[a-z0-9:-]+\]/g)].length;
  if (!rubricText.includes(marker)) {
    throw new Error(`rubric does not define criterion ${criterionId}`);
  }
  if (markerCount === 1) return rubricText.trim();
  const lines = rubricText.split('\n');
  const start = lines.findIndex((line) => line.includes(marker));
  const selected = [lines[start]];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\s{2,}\S/.test(lines[index])) selected.push(lines[index]);
    else break;
  }
  return `Judge only this registered criterion:\n\n${selected.join('\n').trim()}`;
}

export async function runExperiment({
  experiment,
  corpus,
  adapter,
  recordsPath,
  dryRun = false,
  now = () => new Date(),
}) {
  validateExperiment(experiment);
  if (
    !dryRun
    && experiment.candidates.some((candidate) => (
      /replace/i.test(candidate.id) || /replace/i.test(candidate.provider)
    ))
  ) {
    throw new Error('replace all placeholder candidate and provider values before a live run');
  }
  validateCorpus(corpus);
  const unsupportedBatchSizes = experiment.batch_sizes.filter(
    (batchSize) => !corpus.target_batch_sizes.includes(batchSize),
  );
  if (unsupportedBatchSizes.length > 0) {
    throw new Error(
      `experiment requests unsupported corpus batch size(s): ${unsupportedBatchSizes.join(', ')}`,
    );
  }
  const allCases = expandCorpus(corpus, { corpusPath: experiment.corpus_path });
  const selectedPasses = new Set(experiment.passes || allCases.map((entry) => entry.family));
  const cases = allCases.filter((entry) => selectedPasses.has(entry.family));
  if (selectedPasses.size === 0 || cases.length === 0) {
    throw new Error('experiment passes must select at least one known corpus family');
  }
  const unknownPasses = [...selectedPasses].filter(
    (pass) => !allCases.some((entry) => entry.family === pass),
  );
  if (unknownPasses.length > 0) {
    throw new Error(`experiment references unknown pass(es): ${unknownPasses.join(', ')}`);
  }
  const imageHashesByCase = await readCorpusImageHashes(cases);
  const plan = buildExperimentPlan(experiment, cases);
  if (plan.length === 0) throw new Error('experiment produced an empty request plan');
  const preparedPlan = await prepareExperimentPlan(experiment, plan);
  const matrixId = requestMatrixId(preparedPlan);
  const contractId = experimentContractId(experiment, corpus, matrixId);
  if (dryRun) {
    return {
      experiment_id: experiment.id,
      dry_run: true,
      requests: preparedPlan.map(({ request, ...cell }) => cell),
    };
  }
  if (!adapter || typeof adapter.invoke !== 'function') {
    throw new Error('adapter must export invoke(request, context)');
  }
  if (
    adapter.synthetic !== true
    && corpus.label_review?.status !== 'human-reviewed'
  ) {
    throw new Error(
      'live measurements require corpus.label_review.status=human-reviewed with reviewer and reviewed_at',
    );
  }
  if (adapter.synthetic !== true && corpus.graduation_status !== 'ready') {
    throw new Error('live measurements require corpus.graduation_status=ready');
  }
  if (adapter.synthetic !== true) {
    assertGraduationImageDiversity(cases, imageHashesByCase);
  }

  let written = 0;
  for (const { request, ...cell } of preparedPlan) {
    const requestId = requestIdFor(experiment.id, cell);
    const startedAt = now();
    let adapterResponse;
    try {
      adapterResponse = await adapter.invoke(request, {
        request_id: requestId,
        experiment_id: experiment.id,
        replicate: cell.replicate,
        configured_batch_size: cell.configured_batch_size,
        adapter_options: experiment.adapter_options || {},
      });
    } catch (error) {
      adapterResponse = {
        raw_text: '',
        error: error.message || String(error),
        telemetry: {
          complete: false,
          source: 'runner-local-clock',
          latency_ms: now().getTime() - startedAt.getTime(),
          time_to_first_token_ms: null,
          input_tokens: null,
          cache_read_tokens: null,
          cache_write_tokens: null,
          output_tokens: null,
          actual_cost_usd: null,
        },
      };
    }
    const evaluated = evaluateProviderResponse({
      response: adapterResponse,
      cases: cell.cases,
      criterionId: cell.criterion_id,
    });
    const imageHashById = new Map(
      request.prefix_manifest.images.map((image) => [image.id, image.sha256]),
    );
    const record = {
      schema_version: 1,
      record_type: 'visual-eval-request',
      request_id: requestId,
      experiment_id: experiment.id,
      experiment_contract_id: contractId,
      request_matrix_sha256: matrixId,
      recorded_at: now().toISOString(),
      replicate: cell.replicate,
      provider: cell.provider,
      model: cell.model,
      model_rank: cell.model_rank,
      model_class: cell.model_class,
      pass: cell.pass,
      criterion_id: cell.criterion_id,
      configured_batch_size: cell.configured_batch_size,
      actual_batch_size: cell.cases.length,
      image_detail: cell.image_detail,
      prefix_id: request.prefix_manifest.prefix_id,
      suffix_sha256: request.suffix.suffix_sha256,
      randomization_key: cell.randomization_key,
      case_ids: cell.cases.map((entry) => entry.case_id),
      image_ids: cell.cases.map((entry) => entry.image.id),
      response: {
        provider_response_id: evaluated.provider_response_id,
        raw_text: evaluated.raw_text,
        json_valid: evaluated.json_valid,
        abstained: evaluated.abstained,
        error: adapterResponse.error || null,
      },
      telemetry: evaluated.telemetry,
      observations: evaluated.observations.map((observation) => ({
        ...observation,
        image_sha256: imageHashById.get(observation.image_id),
        evidence_sha256: evidenceSha256(
          imageHashById.get(observation.image_id),
          cell.cases.find((entry) => entry.case_id === observation.case_id),
        ),
        observation_id: `${requestId}:${observation.case_id}`,
      })),
      synthetic: adapter.synthetic === true,
    };
    await appendRawRecord(recordsPath, record);
    written += 1;
  }
  return { experiment_id: experiment.id, dry_run: false, requests_written: written, records_path: recordsPath };
}

export async function prepareExperimentPlan(experiment, plan) {
  const prepared = [];
  for (const cell of plan) {
    const rubricText = await fs.readFile(
      path.resolve(path.dirname(experiment.corpus_path), cell.rubric),
      'utf8',
    );
    const criterionPrompt = criterionPromptFor(rubricText, cell.criterion_id);
    const request = await buildBatchRequest({
      provider: cell.provider,
      model: cell.model,
      imageDetail: cell.image_detail,
      pass: cell.pass,
      criterionId: cell.criterion_id,
      criterionPrompt,
      cases: cell.cases,
    });
    prepared.push({
      ...cell,
      experiment_id: experiment.id,
      request,
    });
  }
  return prepared;
}

export function buildExperimentPlan(experiment, cases) {
  validateLadderProgress(
    experiment,
    experiment.passes || [...new Set(cases.map((entry) => entry.family))],
  );
  const plan = [];
  const candidate = experiment.candidates.find(
    (entry) => entry.id === experiment.run_candidate,
  );
  for (const selectedCandidate of [candidate]) {
    for (const batchSize of experiment.batch_sizes) {
      for (let replicate = 1; replicate <= experiment.replicates; replicate += 1) {
        const groups = groupByCriterion(cases);
        for (const [key, criterionCases] of groups) {
          const [pass, criterionId] = key.split('\u0000');
          if (criterionCases.length < batchSize) {
            throw new Error(
              `${pass}:${criterionId} has ${criterionCases.length} states and cannot measure batch ${batchSize}`,
            );
          }
          const randomizationKey = [
            experiment.id,
            selectedCandidate.id,
            pass,
            criterionId,
            batchSize,
            replicate,
          ].join('\u0000');
          const randomized = deterministicOrder(criterionCases, randomizationKey);
          const batchCount = Math.ceil(randomized.length / batchSize);
          for (let batchIndex = 0; batchIndex < batchCount; batchIndex += 1) {
            const batch = Array.from(
              { length: batchSize },
              (_, index) => randomized[(batchIndex * batchSize + index) % randomized.length],
            );
            plan.push({
              provider: selectedCandidate.provider,
              model: selectedCandidate.id,
              model_rank: selectedCandidate.rank,
              model_class: selectedCandidate.class || null,
              pass,
              criterion_id: criterionId,
              rubric: batch[0].rubric,
              image_detail: experiment.image_detail,
              configured_batch_size: batchSize,
              actual_batch_size: batch.length,
              replicate,
              batch_index: batchIndex + 1,
              randomization_key: crypto
                .createHash('sha256')
                .update(randomizationKey)
                .digest('hex'),
              cases: batch,
            });
          }
        }
      }
    }
  }
  return plan;
}

function deterministicOrder(cases, key) {
  return [...cases].sort((a, b) => {
    const score = (entry) => crypto
      .createHash('sha256')
      .update(`${key}\u0000${entry.case_id}`)
      .digest('hex');
    return score(a).localeCompare(score(b)) || a.case_id.localeCompare(b.case_id);
  });
}

function observationFor(evalCase, {
  predictedLabel,
  jsonValid,
  abstained,
  grounded,
  validationError,
  verdict,
}) {
  return {
    case_id: evalCase.case_id,
    state_id: evalCase.state_id,
    image_id: evalCase.image.id,
    criterion_id: evalCase.criterion_id,
    human_label: evalCase.human_label,
    predicted_label: predictedLabel,
    disagreement: predictedLabel !== null && predictedLabel !== evalCase.human_label,
    json_valid: jsonValid,
    abstained,
    grounded,
    validation_error: validationError,
    verdict,
  };
}

function validateVerdict({ verdict, evalCase, criterionId, duplicate }) {
  if (duplicate) return `duplicate verdict for ${evalCase.state_id}`;
  if (!verdict) return `missing verdict for ${evalCase.state_id}`;
  if (verdict.abstain === true) {
    if (!verdict.reason) return 'abstention requires reason';
    return null;
  }
  if (typeof verdict.pass !== 'boolean' || !Array.isArray(verdict.findings)) {
    return 'verdict requires pass boolean and findings[]';
  }
  for (const finding of verdict.findings) {
    for (const field of ['check_id', 'image_id', 'region_id', 'evidence', 'fix']) {
      if (!finding?.[field]) return `finding requires ${field}`;
    }
    if (finding.check_id !== criterionId) return `finding uses unexpected check_id ${finding.check_id}`;
  }
  if (verdict.pass !== (verdict.findings.length === 0)) {
    return 'pass must be true exactly when findings is empty';
  }
  return null;
}

function invalidBatch(response, cases, validationError) {
  return {
    raw_text: response.raw_text || '',
    provider_response_id: response.provider_response_id || null,
    json_valid: false,
    abstained: false,
    observations: cases.map((entry) => observationFor(entry, {
      predictedLabel: null,
      jsonValid: false,
      abstained: false,
      grounded: false,
      validationError,
      verdict: null,
    })),
    telemetry: normalizeTelemetry(response.telemetry, {
      allowIncomplete: true,
      context: 'provider telemetry',
    }),
  };
}

function groupByCriterion(cases) {
  const groups = new Map();
  for (const entry of cases) {
    const key = `${entry.family}\u0000${entry.criterion_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function validateExperiment(experiment) {
  if (
    !experiment?.id
    || !experiment.corpus_path
    || !experiment.run_candidate
    || !Array.isArray(experiment.candidates)
    || experiment.candidates.length === 0
    || !Array.isArray(experiment.batch_sizes)
    || experiment.batch_sizes.length === 0
  ) {
    throw new Error(
      'experiment requires id, corpus_path, run_candidate, candidates[], and batch_sizes[]',
    );
  }
  if (!Number.isInteger(experiment.replicates) || experiment.replicates < 1) {
    throw new Error('experiment replicates must be a positive integer');
  }
  if (!['low', 'high', 'original'].includes(experiment.image_detail)) {
    throw new Error('experiment image_detail must be low, high, or original');
  }
  if (
    experiment.batch_sizes.some((value) => !Number.isInteger(value) || value < 1)
    || new Set(experiment.batch_sizes).size !== experiment.batch_sizes.length
  ) {
    throw new Error('experiment batch_sizes must be unique positive integers');
  }
  const ranks = new Set();
  const candidateIds = new Set();
  for (const candidate of experiment.candidates) {
    if (!candidate.id || !candidate.provider || !Number.isInteger(candidate.rank) || candidate.rank < 1) {
      throw new Error('each candidate requires id, provider, and positive integer rank');
    }
    if (ranks.has(candidate.rank)) throw new Error(`duplicate candidate rank ${candidate.rank}`);
    if (candidateIds.has(candidate.id)) throw new Error(`duplicate candidate id ${candidate.id}`);
    ranks.add(candidate.rank);
    candidateIds.add(candidate.id);
  }
  if (!experiment.candidates.some((candidate) => candidate.id === experiment.run_candidate)) {
    throw new Error(`run_candidate ${experiment.run_candidate} is not present in candidates[]`);
  }
}

function validateLadderProgress(experiment, selectedPasses) {
  const candidates = [...(experiment.candidates || [])].sort(
    (a, b) => Number(a.rank) - Number(b.rank),
  );
  const completed = experiment.ladder_state?.completed_candidates || [];
  if (!Array.isArray(completed)) {
    throw new Error('ladder_state.completed_candidates must be an array');
  }
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const completedById = new Map();
  for (const entry of completed) {
    if (
      !candidateById.has(entry?.id)
      || !entry.pass_evidence
      || typeof entry.pass_evidence !== 'object'
    ) {
      throw new Error(
        'each completed candidate requires a configured id and pass_evidence',
      );
    }
    for (const [pass, evidence] of Object.entries(entry.pass_evidence)) {
      if (
        !pass
        || !['qualified', 'disqualified'].includes(evidence?.status)
        || !/^[a-f0-9]{64}$/.test(evidence?.evidence_sha256 || '')
      ) {
        throw new Error(`invalid ladder evidence for ${pass}`);
      }
    }
    if (Object.keys(entry.pass_evidence).length === 0) {
      throw new Error(`completed candidate ${entry.id} requires at least one pass evidence entry`);
    }
    if (completedById.has(entry.id)) throw new Error(`duplicate completed candidate ${entry.id}`);
    completedById.set(entry.id, entry);
  }
  for (const pass of selectedPasses) {
    const completedForPass = candidates.filter(
      (candidate) => completedById.get(candidate.id)?.pass_evidence?.[pass],
    );
    const completedPrefix = candidates.slice(0, completedForPass.length);
    if (completedPrefix.some((candidate) => !completedForPass.includes(candidate))) {
      throw new Error(
        `completed candidates for ${pass} must form a contiguous smallest-first ladder prefix`,
      );
    }
    const qualified = completedForPass.filter(
      (candidate) => (
        completedById.get(candidate.id).pass_evidence[pass].status === 'qualified'
      ),
    );
    if (qualified.length >= 2) {
      throw new Error(`${pass} already has a qualified model and escalation candidate; stop its ladder`);
    }
    const nextCandidate = candidates.find((candidate) => !completedForPass.includes(candidate));
    if (!nextCandidate) throw new Error(`all configured candidates are already completed for ${pass}`);
    if (experiment.run_candidate !== nextCandidate.id) {
      throw new Error(
        `run_candidate must be next smallest untested candidate ${nextCandidate.id} for ${pass}`,
      );
    }
  }
}

async function readCorpusImageHashes(cases) {
  const missing = [];
  const hashes = new Map();
  for (const entry of cases) {
    try {
      const bytes = await fs.readFile(entry.image.path);
      hashes.set(
        entry.case_id,
        crypto.createHash('sha256').update(bytes).digest('hex'),
      );
    } catch {
      missing.push(entry.image.path);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `corpus images are missing (${missing.length}); run npm run ve:render-visual-model-corpus`,
    );
  }
  return hashes;
}

export function assertGraduationImageDiversity(cases, imageHashesByCase) {
  const groups = new Map();
  for (const entry of cases) {
    const key = `${entry.family}\u0000${entry.human_label}`;
    const group = groups.get(key) || { images: new Set(), sources: new Set() };
    group.images.add(imageHashesByCase.get(entry.case_id));
    group.sources.add(entry.source_artifact_sha256);
    groups.set(key, group);
  }
  for (const [key, group] of groups) {
    const [family, label] = key.split('\u0000');
    if (group.images.has(undefined) || group.images.size < 10) {
      throw new Error(
        `${family}:${label} requires at least ten distinct rendered images for live graduation`,
      );
    }
    if (group.sources.has(null) || group.sources.has(undefined) || group.sources.size < 10) {
      throw new Error(
        `${family}:${label} requires at least ten distinct source artifacts for live graduation`,
      );
    }
  }
}

async function loadAdapter(adapterPath) {
  const module = await import(pathToFileURL(path.resolve(adapterPath)).href);
  if (typeof module.invoke !== 'function') {
    throw new Error(`adapter ${adapterPath} must export invoke(request, context)`);
  }
  return module;
}

function parseArgs(argv) {
  const args = { experiment: null, adapter: null, records: null, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--experiment') args.experiment = argv[++index];
    else if (arg === '--adapter') args.adapter = argv[++index];
    else if (arg === '--records') args.records = argv[++index];
    else if (arg === '--dry-run') args.dryRun = true;
    else throw new Error(`unknown argument ${arg}`);
  }
  if (!args.experiment) {
    throw new Error('usage: run.mjs --experiment experiment.json [--adapter adapter.mjs] [--records records.jsonl] [--dry-run]');
  }
  if (!args.dryRun && !args.adapter) throw new Error('--adapter is required unless --dry-run is used');
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const experimentPath = path.resolve(args.experiment);
  const experiment = JSON.parse(await fs.readFile(experimentPath, 'utf8'));
  experiment.corpus_path = path.resolve(
    path.dirname(experimentPath),
    experiment.corpus_path,
  );
  const corpus = await loadCorpus(experiment.corpus_path);
  const adapter = args.dryRun ? null : await loadAdapter(args.adapter);
  const recordsPath = path.resolve(
    args.records
      || path.join(
        path.dirname(experimentPath),
        'runs',
        experiment.id,
        'records.jsonl',
      ),
  );
  const outcome = await runExperiment({
    experiment,
    corpus,
    adapter,
    recordsPath,
    dryRun: args.dryRun,
  });
  if (args.dryRun) {
    const summary = {
      experiment_id: outcome.experiment_id,
      dry_run: true,
      requests: outcome.requests.length,
      cells: [...new Set(outcome.requests.map((entry) => (
        `${entry.model}/${entry.pass}/b${entry.configured_batch_size}`
      )))],
    };
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(outcome, null, 2)}\n`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exit(1);
  });
}
