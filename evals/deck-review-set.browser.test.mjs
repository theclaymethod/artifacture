import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { looksLikeNetworkFlake, runBrowserStage } from '../plugins/visual-explainer/scripts/verify/lib/browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = path.join(ROOT, 'evals/fixtures/deck-review/presentation-states.html');

test('transient CDN asset errors qualify for one browser retry', () => {
  assert.equal(looksLikeNetworkFlake({
    consoleErrors: [{ text: 'Failed to load resource: the server responded with a status of 404 ()' }],
    pageErrors: [],
    failedRequests: [{ url: 'https://fonts.gstatic.com/s/example.woff2', status: 404 }],
  }), true);
  assert.equal(looksLikeNetworkFlake({
    consoleErrors: [{ text: 'Uncaught TypeError: broken()' }],
    pageErrors: [],
    failedRequests: [{ url: 'https://fonts.gstatic.com/s/example.woff2', status: 404 }],
  }), false);
});

test('default browser evidence directories are unique across verification runs', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacture-browser-evidence-'));
  const artifact = path.join(workDir, 'poster.html');
  fs.writeFileSync(artifact, '<!doctype html><html><body><main><h1>Poster</h1></main></body></html>');
  const evidenceDirs = [];
  const makeContext = () => ({
    filePath: artifact,
    html: fs.readFileSync(artifact, 'utf8'),
    profile: 'poster',
    preset: 'custom',
    flags: { hasAnimations: false, hasMermaid: false },
  });

  try {
    const first = await runBrowserStage(makeContext(), { profile: 'poster', captureDeckReview: false });
    const firstPath = first.runs[0].screenshotPath;
    evidenceDirs.push(path.dirname(firstPath));
    const firstEvidence = fs.readFileSync(firstPath);

    const second = await runBrowserStage(makeContext(), { profile: 'poster', captureDeckReview: false });
    const secondPath = second.runs[0].screenshotPath;
    evidenceDirs.push(path.dirname(secondPath));

    assert.notEqual(path.dirname(firstPath), path.dirname(secondPath));
    assert.notEqual(firstPath, secondPath);
    assert.deepEqual(fs.readFileSync(firstPath), firstEvidence, 'a later run did not overwrite bound evidence');
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
    for (const evidenceDir of evidenceDirs) fs.rmSync(evidenceDir, { recursive: true, force: true });
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

test('browser stage captures every presentation base, drill, and progressive state', async () => {
  const screensDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacture-deck-review-'));
  const html = fs.readFileSync(FIXTURE, 'utf8');
  const ctx = {
    filePath: FIXTURE,
    html,
    profile: 'page',
    preset: 'custom',
    flags: { hasAnimations: false, hasMermaid: false },
  };

  try {
    const browser = await runBrowserStage(ctx, { screensDir, profile: 'page' });
    assert.equal(browser.runs.length, 4, 'the frozen page browser matrix remains unchanged');
    const reviewSets = fs.readdirSync(screensDir)
      .filter((name) => /^deck-review-.*\.json$/.test(name))
      .sort()
      .map((name) => JSON.parse(fs.readFileSync(path.join(screensDir, name), 'utf8')));
    assert.equal(reviewSets.length, 2, 'light and dark desktop runs receive sidecar review sets');
    for (const reviewSet of reviewSets) {
      assert.deepEqual(
        reviewSet.units.map((unit) => unit.state_id),
        [
          'slide-one--base',
          'slide-one--drill--evidence',
          'slide-two--base',
          'slide-two--state--1',
          'slide-two--drill--state-1-progressive-evidence',
        ],
      );
      assert.ok(reviewSet.units.every((unit) => fs.existsSync(unit.screenshot_path)));
      assert.deepEqual(reviewSet.viewport, { width: 1440, height: 900 });
      assert.deepEqual(
        reviewSet.review_groups.map((group) => [group.purpose, group.state_ids]),
        [
          ['state-continuity', ['slide-one--base', 'slide-one--drill--evidence']],
          ['state-continuity', ['slide-two--base', 'slide-two--state--1']],
          ['state-continuity', ['slide-two--base', 'slide-two--drill--state-1-progressive-evidence']],
          ['adjacent-slide-variety', ['slide-one--base', 'slide-two--base']],
        ],
      );
    }
  } finally {
    fs.rmSync(screensDir, { recursive: true, force: true });
  }
});

test('bounded recapture fails when any requested state id is stale or missing', async () => {
  const screensDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacture-deck-review-missing-'));
  const html = fs.readFileSync(FIXTURE, 'utf8');
  const priorFilter = process.env.ARTIFACTURE_DECK_REVIEW_STATES;
  process.env.ARTIFACTURE_DECK_REVIEW_STATES = 'slide-two--base,missing--state';
  const ctx = {
    filePath: FIXTURE,
    html,
    profile: 'page',
    preset: 'custom',
    flags: { hasAnimations: false, hasMermaid: false },
  };

  try {
    await assert.rejects(
      runBrowserStage(ctx, { screensDir, profile: 'page' }),
      /did not capture requested states: missing--state/,
    );
  } finally {
    if (priorFilter === undefined) delete process.env.ARTIFACTURE_DECK_REVIEW_STATES;
    else process.env.ARTIFACTURE_DECK_REVIEW_STATES = priorFilter;
    fs.rmSync(screensDir, { recursive: true, force: true });
  }
});

test('bounded recapture fails closed when a requested state has no paired context', async () => {
  const screensDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacture-deck-review-unpaired-'));
  const html = fs.readFileSync(FIXTURE, 'utf8');
  const priorFilter = process.env.ARTIFACTURE_DECK_REVIEW_STATES;
  process.env.ARTIFACTURE_DECK_REVIEW_STATES = 'slide-two--base';
  const ctx = {
    filePath: FIXTURE,
    html,
    profile: 'page',
    preset: 'custom',
    flags: { hasAnimations: false, hasMermaid: false },
  };

  try {
    await assert.rejects(
      runBrowserStage(ctx, { screensDir, profile: 'page' }),
      /requires paired evidence for states: slide-two--base/,
    );
  } finally {
    if (priorFilter === undefined) delete process.env.ARTIFACTURE_DECK_REVIEW_STATES;
    else process.env.ARTIFACTURE_DECK_REVIEW_STATES = priorFilter;
    fs.rmSync(screensDir, { recursive: true, force: true });
  }
});

test('bounded recapture rejects a drill or progressive state without its base', async () => {
  const screensDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacture-deck-review-orphan-'));
  const html = fs.readFileSync(FIXTURE, 'utf8');
  const priorFilter = process.env.ARTIFACTURE_DECK_REVIEW_STATES;
  process.env.ARTIFACTURE_DECK_REVIEW_STATES = 'slide-two--drill--state-1-progressive-evidence';
  const ctx = {
    filePath: FIXTURE,
    html,
    profile: 'page',
    preset: 'custom',
    flags: { hasAnimations: false, hasMermaid: false },
  };

  try {
    await assert.rejects(
      runBrowserStage(ctx, { screensDir, profile: 'page' }),
      /requires two distinct states in every group/,
    );
  } finally {
    if (priorFilter === undefined) delete process.env.ARTIFACTURE_DECK_REVIEW_STATES;
    else process.env.ARTIFACTURE_DECK_REVIEW_STATES = priorFilter;
    fs.rmSync(screensDir, { recursive: true, force: true });
  }
});

test('browser stage can recapture one exact affected state with its base context', async () => {
  const screensDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacture-deck-review-filter-'));
  const html = fs.readFileSync(FIXTURE, 'utf8');
  const priorFilter = process.env.ARTIFACTURE_DECK_REVIEW_STATES;
  process.env.ARTIFACTURE_DECK_REVIEW_STATES = 'slide-two--base,slide-two--drill--state-1-progressive-evidence';
  const ctx = {
    filePath: FIXTURE,
    html,
    profile: 'page',
    preset: 'custom',
    flags: { hasAnimations: false, hasMermaid: false },
  };

  try {
    await runBrowserStage(ctx, { screensDir, profile: 'page' });
    const manifests = fs.readdirSync(screensDir)
      .filter((name) => /^deck-review-.*\.json$/.test(name))
      .map((name) => JSON.parse(fs.readFileSync(path.join(screensDir, name), 'utf8')));
    assert.equal(manifests.length, 2);
    assert.ok(manifests.every((manifest) =>
      manifest.units.length === 2
      && manifest.units[0].state_id === 'slide-two--base'
      && manifest.units[1].state_id === 'slide-two--drill--state-1-progressive-evidence'
      && manifest.review_groups.length === 1
      && manifest.review_groups[0].state_ids.length === 2));
  } finally {
    if (priorFilter === undefined) delete process.env.ARTIFACTURE_DECK_REVIEW_STATES;
    else process.env.ARTIFACTURE_DECK_REVIEW_STATES = priorFilter;
    fs.rmSync(screensDir, { recursive: true, force: true });
  }
});
