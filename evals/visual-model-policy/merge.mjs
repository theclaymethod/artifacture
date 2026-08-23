#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { canonicalJson } from '../lib/canonical-json.mjs';
import {
  DEFAULT_THRESHOLDS,
  qualificationFor,
} from './select.mjs';

export function mergeMeasurements(measurements, {
  sourceFiles = [],
  sourceSha256 = [],
} = {}) {
  if (!Array.isArray(measurements) || measurements.length === 0) {
    throw new Error('measurements[] is required');
  }
  const first = measurements[0];
  validateMeasurementSet(first);
  const candidatesIdentity = canonicalJson(first.candidates);
  const thresholdsIdentity = canonicalJson(first.thresholds || {});
  const corpusSha256 = first.source.corpus_sha256;
  const results = [];
  const resultKeys = new Set();
  const pendingAdjudication = new Set();
  const experimentContracts = new Set();
  const artifactByModelPass = new Map();
  const measurementByModelPass = new Map();

  if (
    sourceSha256.length !== measurements.length
    || sourceSha256.some((hash) => !/^[a-f0-9]{64}$/.test(hash))
  ) {
    throw new Error('sourceSha256 must provide one exact artifact hash per measurement set');
  }

  for (const [measurementIndex, measurement] of measurements.entries()) {
    validateMeasurementSet(measurement);
    if (
      canonicalJson(measurement.candidates) !== candidatesIdentity
      || canonicalJson(measurement.thresholds || {}) !== thresholdsIdentity
    ) {
      throw new Error('measurement sets must use identical candidates and thresholds');
    }
    if (measurement.source.corpus_sha256 !== corpusSha256) {
      throw new Error('measurement sets must use the identical corpus contract');
    }
    experimentContracts.add(measurement.source.experiment_contract_id);
    const measuredModels = new Set(measurement.results.map((result) => result.model));
    if (measuredModels.size !== 1) {
      throw new Error('each measurement set must contain exactly one candidate model');
    }
    const measuredModel = [...measuredModels][0];
    for (const pass of new Set(measurement.results.map((result) => result.pass))) {
      const key = `${measuredModel}\u0000${pass}`;
      if (artifactByModelPass.has(key)) {
        throw new Error(`candidate ${measuredModel} pass ${pass} spans multiple measurement sets`);
      }
      artifactByModelPass.set(key, sourceSha256[measurementIndex]);
      measurementByModelPass.set(key, measurement);
    }
    for (const result of measurement.results) {
      const key = [
        result.pass,
        result.model,
        result.batch_size,
        result.image_detail,
      ].join('\u0000');
      if (resultKeys.has(key)) throw new Error(`duplicate measurement cell ${key}`);
      resultKeys.add(key);
      results.push(result);
    }
    for (const observationId of measurement.pending_adjudication || []) {
      pendingAdjudication.add(observationId);
    }
  }

  validateLadderCoverage({
    candidates: first.candidates,
    thresholds: { ...DEFAULT_THRESHOLDS, ...first.thresholds },
    results,
    artifactByModelPass,
    measurementByModelPass,
  });

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    source: {
      measurement_files: [...sourceFiles],
      measurement_sha256: [...sourceSha256],
      measurement_sets: measurements.length,
      corpus_id: first.source.corpus_id,
      corpus_sha256: corpusSha256,
      experiment_contract_ids: [...experimentContracts].sort(),
    },
    thresholds: first.thresholds,
    candidates: first.candidates,
    results: results.sort(compareResults),
    pending_adjudication: [...pendingAdjudication].sort(),
  };
}

function validateLadderCoverage({
  candidates,
  thresholds,
  results,
  artifactByModelPass,
  measurementByModelPass,
}) {
  const ordered = [...candidates].sort((a, b) => Number(a.rank) - Number(b.rank));
  const passes = [...new Set(results.map((result) => result.pass))];
  for (const pass of passes) {
    const measured = ordered.filter((candidate) => (
      results.some((result) => result.pass === pass && result.model === candidate.id)
    ));
    const expectedPrefix = ordered.slice(0, measured.length);
    if (
      measured.length === 0
      || expectedPrefix.some((candidate, index) => candidate.id !== measured[index]?.id)
    ) {
      throw new Error(`measurements for ${pass} must form a contiguous smallest-first candidate prefix`);
    }
    for (let index = 1; index < measured.length; index += 1) {
      const current = measured[index];
      const measurement = measurementByModelPass.get(`${current.id}\u0000${pass}`);
      const completed = measurement.source.ladder_state?.completed_candidates || [];
      for (let lowerIndex = 0; lowerIndex < index; lowerIndex += 1) {
        const lower = measured[lowerIndex];
        const evidence = completed
          .find((entry) => entry.id === lower.id)
          ?.pass_evidence?.[pass];
        const lowerResults = results.filter(
          (result) => result.pass === pass && result.model === lower.id,
        );
        const expectedStatus = lowerResults.some(
          (result) => qualificationFor(result, thresholds).qualified,
        ) ? 'qualified' : 'disqualified';
        const expectedHash = artifactByModelPass.get(`${lower.id}\u0000${pass}`);
        if (
          evidence?.status !== expectedStatus
          || evidence?.evidence_sha256 !== expectedHash
        ) {
          throw new Error(
            `${current.id}:${pass} does not bind verified evidence for prior candidate ${lower.id}`,
          );
        }
      }
    }
  }
}

function validateMeasurementSet(measurement) {
  if (
    measurement?.schema_version !== 1
    || !measurement.source?.corpus_id
    || !/^[a-f0-9]{64}$/.test(measurement.source.corpus_sha256 || '')
    || !/^[a-f0-9]{64}$/.test(measurement.source.experiment_contract_id || '')
    || measurement.source.experiment_complete !== true
    || !Array.isArray(measurement.candidates)
    || !Array.isArray(measurement.results)
  ) {
    throw new Error('each measurement set requires a complete experiment and corpus contract');
  }
  if (measurement.results.some((result) => result.experiment_complete !== true)) {
    throw new Error('measurement results must come from a complete experiment matrix');
  }
}

function compareResults(a, b) {
  return (
    String(a.pass).localeCompare(String(b.pass))
    || String(a.model).localeCompare(String(b.model))
    || Number(a.batch_size) - Number(b.batch_size)
    || String(a.image_detail).localeCompare(String(b.image_detail))
  );
}

function parseArgs(argv) {
  const args = { inputs: [], output: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--input') args.inputs.push(argv[++index]);
    else if (argv[index] === '--out') args.output = argv[++index];
    else throw new Error(`unknown argument ${argv[index]}`);
  }
  if (args.inputs.length === 0) {
    throw new Error('usage: merge.mjs --input measurements.json [--input more.json] [--out merged.json]');
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = args.inputs.map((file) => path.resolve(file));
  const sources = await Promise.all(files.map((file) => fs.readFile(file, 'utf8')));
  const measurements = sources.map((source) => JSON.parse(source));
  const sourceSha256 = sources.map((source) => (
    crypto.createHash('sha256').update(source).digest('hex')
  ));
  const merged = mergeMeasurements(measurements, {
    sourceFiles: files,
    sourceSha256,
  });
  const rendered = `${JSON.stringify(merged, null, 2)}\n`;
  if (args.output) {
    const output = path.resolve(args.output);
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, rendered, { flag: 'wx' });
    process.stdout.write(`${output}\n`);
  } else {
    process.stdout.write(rendered);
  }
  if (
    merged.pending_adjudication.length > 0
    || merged.results.some((result) => (
      result.synthetic || !result.telemetry_complete || !result.adjudication_complete
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
