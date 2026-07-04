#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EVAL_ROOT = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(EVAL_ROOT, '..');
const CLI = {
  node: process.execPath,
  script: resolve(REPO_ROOT, 'plugins/visual-explainer/scripts/verify/ve-verify.mjs'),
};

const expectationsPath = join(EVAL_ROOT, 'expectations.json');
const fixturesRoot = join(EVAL_ROOT, 'fixtures');
const violationsRoot = join(fixturesRoot, 'violations');
const cleanRoot = join(fixturesRoot, 'clean');
const checksCatalog = JSON.parse(
  readFileSync(resolve(REPO_ROOT, 'plugins/visual-explainer/scripts/verify/checks.json'), 'utf8'),
).checks;
const stagesByFixture = new Map(
  checksCatalog
    .filter((check) => ['static-text', 'static-dom', 'browser'].includes(check.stage))
    .map((check) => [`${check.id}.html`, check.stage]),
);

function buildArgs(filePath, jsonPath, screensDir, stage) {
  const args = [CLI.script, filePath, '--json', jsonPath, '--quiet'];
  if (stage !== 'browser') args.push('--static-only');
  if (stage === 'browser') args.push('--screens', screensDir);
  return args;
}

function runVerifier(filePath, stage) {
  const tempDir = mkdtempSync(join(tmpdir(), 've-eval-'));
  const jsonPath = join(tempDir, 'report.json');
  const screensDir = join(tempDir, 'screens');
  const args = buildArgs(filePath, jsonPath, screensDir, stage);
  const result = spawnSync(CLI.node, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
  });

  let report = null;
  if (existsSync(jsonPath)) {
    try {
      report = JSON.parse(readFileSync(jsonPath, 'utf8'));
    } catch (error) {
      report = { parse_error: error.message };
    }
  }

  rmSync(tempDir, { recursive: true, force: true });
  return { result, report, args };
}

function failedChecks(report) {
  if (!report || !Array.isArray(report.checks)) return [];
  return report.checks.filter((check) => check.status === 'fail' || check.status === 'warn');
}

function severityFor(report, id) {
  return report?.checks?.find((check) => check.id === id)?.severity ?? 'error';
}

function checkViolation(fileName, expected) {
  const filePath = join(violationsRoot, fileName);
  const stage = stagesByFixture.get(fileName);
  const html = readFileSync(filePath, 'utf8');
  const { result, report, args } = runVerifier(filePath, stage);
  const fired = failedChecks(report);
  const firedIds = new Set(fired.map((check) => check.id));
  const allowedCoFires = new Set(expected.allowed_co_fires || []);
  const missing = expected.must_fire.filter((id) => !firedIds.has(id));
  const otherErrors = fired.filter(
    (check) => !expected.must_fire.includes(check.id) && !allowedCoFires.has(check.id) && check.severity === 'error',
  );

  return {
    fileName,
    stage,
    status: missing.length === 0 && otherErrors.length === 0 ? 'pass' : 'fail',
    missing,
    otherErrors: otherErrors.map((check) => check.id),
    exitCode: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    command: `${CLI.node} ${args.join(' ')}`,
    fired: [...firedIds],
    severity: expected.must_fire.map((id) => `${id}:${severityFor(report, id)}`).join(', '),
  };
}

function checkClean(fileName) {
  const filePath = join(cleanRoot, fileName);
  const stage = 'browser';
  const { result, report, args } = runVerifier(filePath, stage);
  const fired = failedChecks(report);
  return {
    fileName,
    status: result.status === 0 && fired.length === 0 ? 'pass' : 'fail',
    fired: fired.map((check) => `${check.id}:${check.severity}`),
    exitCode: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    command: `${CLI.node} ${args.join(' ')}`,
  };
}

if (!existsSync(CLI.script)) {
  console.error(`Verifier CLI not found: ${CLI.script}`);
  process.exit(2);
}

const expectations = JSON.parse(readFileSync(expectationsPath, 'utf8'));
const violationFiles = readdirSync(violationsRoot).filter((file) => file.endsWith('.html')).sort();
const expectationFiles = Object.keys(expectations).sort();
const missingExpectations = violationFiles.filter((file) => !expectations[file]);
const missingFixtures = expectationFiles.filter((file) => !violationFiles.includes(file));

if (missingExpectations.length || missingFixtures.length) {
  console.error('Fixture/expectation mismatch');
  if (missingExpectations.length) console.error(`Missing expectations: ${missingExpectations.join(', ')}`);
  if (missingFixtures.length) console.error(`Missing fixtures: ${missingFixtures.join(', ')}`);
  process.exit(1);
}

const violationResults = violationFiles.map((file) => checkViolation(file, expectations[file]));
const cleanResults = readdirSync(cleanRoot)
  .filter((file) => file.endsWith('.html'))
  .sort()
  .map(checkClean);

console.log('check_id,stage,status,expected_severity');
for (const row of violationResults) {
  console.log(`${basename(row.fileName, '.html')},${row.stage},${row.status},${row.severity}`);
}

const failures = [
  ...violationResults.filter((row) => row.status !== 'pass'),
  ...cleanResults.filter((row) => row.status !== 'pass').map((row) => ({ ...row, stage: 'clean' })),
];

if (failures.length) {
  console.error('\nFailures:');
  for (const failure of failures) {
    console.error(`- ${failure.fileName}: missing=[${failure.missing?.join(', ') ?? ''}] otherErrors=[${failure.otherErrors?.join(', ') ?? ''}] fired=[${failure.fired?.join(', ') ?? ''}] exit=${failure.exitCode}`);
    if (failure.stderr) console.error(failure.stderr.trim());
  }
  process.exit(1);
}

console.log(`\nAll ${violationResults.length} seeded violations and ${cleanResults.length} clean fixtures passed.`);
