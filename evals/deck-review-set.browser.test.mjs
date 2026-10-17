import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { describe } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runBrowserStage } from '../plugins/visual-explainer/scripts/verify/lib/browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = path.join(ROOT, 'evals/fixtures/deck-review/presentation-states.html');
const CLI = path.join(ROOT, 'plugins/visual-explainer/scripts/verify/ve-verify.mjs');

async function verify(artifact, reportPath, args = [], stateFilter) {
  try {
    await promisify(execFile)(process.execPath, [CLI, artifact, '--json', reportPath, '--quiet', ...args], {
      cwd: ROOT, encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, ARTIFACTURE_DECK_REVIEW_STATES: stateFilter || '' },
    });
  } catch (error) {
    assert.equal(error.code, 1, error.stderr || error.message);
  }
  return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
}

test('public verifier runs keep separately bound screenshot evidence', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacture-browser-evidence-'));
  const evidenceDirs = [];
  try {
    const artifact = path.join(workDir, 'poster.html');
    fs.writeFileSync(artifact, '<!doctype html><html><body><main><h1>Poster</h1></main></body></html>');
    const first = await verify(artifact, path.join(workDir, 'first.json'), ['--profile', 'poster']);
    evidenceDirs.push(first.review_contract.capture_root);
    const firstPath = first.review_contract.evidence.find((entry) => entry.kind === 'screenshot').path;
    const firstEvidence = fs.readFileSync(firstPath);
    const second = await verify(artifact, path.join(workDir, 'second.json'), ['--profile', 'poster']);
    evidenceDirs.push(second.review_contract.capture_root);
    const secondPath = second.review_contract.evidence.find((entry) => entry.kind === 'screenshot').path;
    assert.equal(first.review_contract.inventory_provenance, 'browser-rendered');
    assert.ok(first.review_contract.inventory.items.some((item) => item.text === 'Poster'));
    assert.ok(second.review_contract.inventory.items.some((item) => item.text === 'Poster'));
    assert.notEqual(first.review_contract.capture_root, second.review_contract.capture_root);
    assert.notEqual(firstPath, secondPath);
    assert.deepEqual(fs.readFileSync(firstPath), firstEvidence, 'a later CLI run must not overwrite bound evidence');
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
    for (const directory of evidenceDirs) fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('presentation capture with short and long slide IDs', { concurrency: 2 }, () => {
  for (const slideId of ['slide-two', 'a'.repeat(80)]) {
    test(`public verifier captures presentation base, drill and progressive states with a ${slideId.length}-character slide id`, async () => {
      const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacture-deck-review-'));
      try {
        const artifact = path.join(workDir, 'deck.html');
        fs.writeFileSync(artifact, fs.readFileSync(FIXTURE, 'utf8').replaceAll('slide-two', slideId));
        const report = await verify(artifact, path.join(workDir, 'report.json'), ['--screens', path.join(workDir, 'screens')]);
        const reviewSets = report.review_contract.evidence.filter((entry) => entry.kind === 'deck-manifest')
          .map((entry) => JSON.parse(fs.readFileSync(entry.path, 'utf8')));
        assert.ok(reviewSets.some((manifest) => manifest.scheme === 'light'));
        assert.ok(reviewSets.some((manifest) => manifest.scheme === 'dark'));
        for (const reviewSet of reviewSets) {
          assert.deepEqual(reviewSet.units.map((unit) => unit.state_id), [
            'slide-one--base', 'slide-one--drill--evidence', `${slideId}--base`, `${slideId}--state--1`,
            `${slideId}--drill--state-1-progressive-evidence`,
          ]);
          assert.ok(reviewSet.units.every((unit) => fs.statSync(unit.screenshot_path).size > 0));
          assert.deepEqual(reviewSet.review_groups.map((group) => [group.purpose, group.state_ids]), [
            ['state-continuity', ['slide-one--base', 'slide-one--drill--evidence']],
            ['state-continuity', [`${slideId}--base`, `${slideId}--state--1`]],
            ['state-continuity', [`${slideId}--base`, `${slideId}--drill--state-1-progressive-evidence`]],
            ['adjacent-slide-variety', ['slide-one--base', `${slideId}--base`]],
          ]);
        }
        assert.deepEqual(reviewSets[0].review_groups, reviewSets.at(-1).review_groups);
      } finally {
        fs.rmSync(workDir, { recursive: true, force: true });
      }
    });
  }
});

test('public bounded recapture retains paired context and rejects stale or unpaired requests', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacture-deck-recapture-'));
  try {
    const artifact = path.join(workDir, 'deck.html');
    fs.copyFileSync(FIXTURE, artifact);
    const validFilter = 'slide-two--base,slide-two--drill--state-1-progressive-evidence';
    const report = await verify(artifact, path.join(workDir, 'paired.json'), ['--screens', path.join(workDir, 'screens')], validFilter);
    const manifests = report.review_contract.evidence.filter((entry) => entry.kind === 'deck-manifest')
      .map((entry) => JSON.parse(fs.readFileSync(entry.path, 'utf8')));
    assert.ok(manifests.length > 0);
    for (const manifest of manifests) {
      assert.deepEqual(manifest.units.map((unit) => unit.state_id), validFilter.split(','));
      assert.deepEqual(manifest.review_groups.map((group) => group.state_ids), [validFilter.split(',')]);
    }
    const rejections = await Promise.allSettled([
      ['stale', 'slide-two--base,missing--state', /did not capture requested states: missing--state/],
      ['unpaired', 'slide-two--base', /requires paired evidence/],
      ['orphan', 'slide-two--drill--state-1-progressive-evidence', /requires two distinct states/],
    ].map(async ([name, filter, reason]) => {
      const rejected = await verify(artifact, path.join(workDir, `${name}.json`), ['--screens', path.join(workDir, 'screens')], filter);
      assert.equal(rejected.review_contract.complete, false);
      assert.match(rejected.review_contract.missing.join('\n'), reason);
      assert.ok(rejected.checks.some((check) => check.status === 'fail'), 'a capture failure must retain its mechanics report');
    }));
    for (const result of rejections) {
      if (result.status === 'rejected') throw result.reason;
    }
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test('browser verification records a failing metric when declared Mermaid content never renders', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacture-mermaid-readiness-'));
  const artifact = path.join(workDir, 'poster.html');
  const screensDir = path.join(workDir, 'screens');
  const html = '<!doctype html><html><body><main><div class="mermaid">graph TD; A--&gt;B</div></main></body></html>';
  fs.writeFileSync(artifact, html);
  const ctx = {
    filePath: artifact,
    html,
    profile: 'poster',
    preset: 'custom',
    flags: { hasAnimations: false, hasMermaid: true },
  };

  try {
    const result = await runBrowserStage(ctx, {
      screensDir,
      profile: 'poster',
      captureDeckReview: false,
      mermaidTimeoutMs: 100,
    });
    const metric = result.runs[0].metrics['mermaid-rendered'];
    assert.match(metric.readinessError, /Mermaid rendering did not complete within 100ms/);
    assert.equal(metric.offenders.length > 0, true);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test('browser verification recognizes the component-backed Mermaid shell', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacture-mermaid-shell-'));
  const artifact = path.join(workDir, 'poster.html');
  const screensDir = path.join(workDir, 'screens');
  const html = '<!doctype html><html><body><main><figure data-ve-mermaid-shell><div><svg role="img"></svg></div></figure></main></body></html>';
  fs.writeFileSync(artifact, html);
  const ctx = {
    filePath: artifact,
    html,
    profile: 'poster',
    preset: 'custom',
    flags: { hasAnimations: false, hasMermaid: true },
  };

  try {
    const result = await runBrowserStage(ctx, {
      screensDir,
      profile: 'poster',
      captureDeckReview: false,
      mermaidTimeoutMs: 100,
    });
    assert.equal(result.runs.length > 0, true);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});


for (const ids of [
  ['Case', 'middle', 'case'],
  ['punctuation.dot', 'middle', 'punctuation-dot'],
  [`${'x'.repeat(80)}one`, 'middle', `${'x'.repeat(80)}two`],
]) {
  test(`distinct authored slide ids retain distinct evidence after normalization: ${ids[0].slice(0, 20)}`, async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacture-state-ids-'));
    const artifact = path.join(workDir, 'slides.html');
    const colors = ['#ffc0cb', '#90ee90', '#add8e6'];
    const html = `<!doctype html><html><head><style>html,body{margin:0}section{height:100vh}</style></head><body data-ve-deck="vertical">${ids.map((id, index) => `<section class="slide" data-slide-id="${id}" style="background:${colors[index]}"><h1>Content ${index}</h1></section>`).join('')}</body></html>`;
    fs.writeFileSync(artifact, html);
    try {
      const result = await runBrowserStage({ filePath: artifact, html, profile: 'slides', flags: {} }, { screensDir: path.join(workDir, 'screens') });
      for (const run of result.runs) {
        const units = run.deckReview.units;
        assert.equal(units.length, 3);
        assert.equal(new Set(units.map((unit) => unit.state_id)).size, 3);
        assert.equal(new Set(units.map((unit) => unit.screenshot_path)).size, 3);
        assert.equal(new Set(units.map((unit) => fs.readFileSync(unit.screenshot_path).toString('base64'))).size, 3);
        assert.equal(units[1].state_id, 'middle--base');
      }
      const legacy = `${ids[0].toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 80)}--base`;
      const previous = process.env.ARTIFACTURE_DECK_REVIEW_STATES;
      try {
        process.env.ARTIFACTURE_DECK_REVIEW_STATES = legacy;
        await assert.rejects(runBrowserStage({ filePath: artifact, html, profile: 'slides', flags: {} }, { screensDir: path.join(workDir, 'filtered') }), /Ambiguous legacy deck review state.*use one of/);
      } finally {
        if (previous === undefined) delete process.env.ARTIFACTURE_DECK_REVIEW_STATES;
        else process.env.ARTIFACTURE_DECK_REVIEW_STATES = previous;
      }
    } finally { fs.rmSync(workDir, { recursive: true, force: true }); }
  });
}
