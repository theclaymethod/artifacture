import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runBrowserStage } from '../plugins/visual-explainer/scripts/verify/lib/browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = path.join(ROOT, 'evals/fixtures/deck-review/presentation-states.html');

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
