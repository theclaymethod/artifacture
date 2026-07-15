#!/usr/bin/env node
// Design-system eval suite: extraction + loader.
//
// These evals are the SPEC for `ve:learn`'s deterministic extraction
// heuristics and the registry loader — fixture in, golden out. Heuristic
// changes must hill-climb this suite, in the same fixture/expectation idiom
// as the verifier evals (evals/run.mjs). Runs as the second leg of
// `npm run ve:eval`.
//
//   EXTRACTION — one case per modality:
//     code   evals/fixtures/design-systems/code/  (synthetic brand token
//            module → golden acme-terracotta tokens; exact match +
//            required-key coverage report)
//     url    evals/fixtures/design-systems/url/   (saved HTML+CSS site served
//            through an injected fetch — no live network; :root custom props,
//            @font-face, linked-stylesheet following)
//     image  evals/fixtures/design-systems/image/ (palette quantization via
//            Playwright canvas; tolerance-based match)
//
//   LOADER — resolution order ($ARTIFACTURE_DESIGN_DIR beats
//   ~/.artifacture/design-systems beats <repo>/design-systems), the
//   ~/.artifacture-is-a-repo-clone dedupe, unknown-preset fallback warning,
//   and malformed systems failing loudly.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractFromCode,
  mapExtractionToCore,
  deriveTokens,
  hexToRgb,
} from '../../scripts/ve-mdx/learn-extractors.mjs';
import { extractFromUrlSource, extractFromImageSource } from '../../scripts/ve-mdx/learn-sources.mjs';
import {
  DesignSystemError,
  REQUIRED_VE_TOKENS,
  designSystemSearchPaths,
  resolveDesignSystem,
  resolvePresetCssForExport,
} from '../../scripts/ve-mdx/design-systems.mjs';

const EVAL_ROOT = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(EVAL_ROOT, '../..');
const FIXTURES = join(REPO_ROOT, 'evals/fixtures/design-systems');
const GLOBAL_CSS = join(REPO_ROOT, 'visual-explainer-mdx/global.css');

const results = [];
function record(name, failures, detail = {}) {
  results.push({ name, status: failures.length === 0 ? 'pass' : 'fail', failures, detail });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function compareTokens(actual, expectedTokens) {
  const failures = [];
  for (const [key, expected] of Object.entries(expectedTokens)) {
    if (actual[key] !== expected) {
      failures.push(`${key}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual[key])}`);
    }
  }
  return failures;
}

function requiredCoverage(actual) {
  const produced = new Set(Object.keys(actual));
  const missing = REQUIRED_VE_TOKENS.filter((token) => !produced.has(token));
  return { producedRequired: REQUIRED_VE_TOKENS.length - missing.length, missing };
}

// ---------------------------------------------------------------------------
// Extraction evals
// ---------------------------------------------------------------------------

function evalCodeExtraction() {
  const source = readFileSync(join(FIXTURES, 'code/acme-terracotta-tokens.ts'), 'utf8');
  const golden = readJson(join(FIXTURES, 'expected/acme-terracotta-tokens.json'));
  const tokens = deriveTokens(mapExtractionToCore(extractFromCode(source)).core);
  const failures = compareTokens(tokens, golden.tokens);
  const coverage = requiredCoverage(tokens);
  if (coverage.missing.length > 0) failures.push(`missing required tokens: ${coverage.missing.join(', ')}`);
  record('extraction-code-acme-terracotta', failures, { coverage });
}

async function evalUrlExtraction() {
  // Serve the saved fixture site through an injected fetch — the real url
  // code path (linked-stylesheet following included) with no live network.
  const siteRoot = join(FIXTURES, 'url');
  const fetchImpl = async (url) => {
    const pathname = new URL(url).pathname;
    const file = join(siteRoot, pathname === '/' ? 'index.html' : pathname.replace(/^\//, ''));
    try {
      const text = readFileSync(file, 'utf8');
      return { ok: true, status: 200, text: async () => text };
    } catch {
      return { ok: false, status: 404, text: async () => '' };
    }
  };
  const golden = readJson(join(FIXTURES, 'expected/acme-url-tokens.json'));
  const extraction = await extractFromUrlSource('https://acme.example/', { fetchImpl });
  const tokens = deriveTokens(mapExtractionToCore(extraction).core);
  const failures = compareTokens(tokens, golden.tokens);
  for (const face of golden.fontFaces) {
    if (!extraction.fontFaces.includes(face)) failures.push(`@font-face not discovered: ${face}`);
  }
  const coverage = requiredCoverage(tokens);
  if (coverage.missing.length > 0) failures.push(`missing required tokens: ${coverage.missing.join(', ')}`);
  record('extraction-url-acme-site', failures, { coverage });
}

async function evalImageExtraction() {
  const golden = readJson(join(FIXTURES, 'expected/brand-palette-image.json'));
  const extraction = await extractFromImageSource(join(FIXTURES, 'image/brand-palette.png'));
  const failures = [];

  const withinTolerance = (a, b) => {
    const [ar, ag, ab] = hexToRgb(a);
    const [br, bg, bb] = hexToRgb(b);
    return (
      Math.abs(ar - br) <= golden.channelTolerance &&
      Math.abs(ag - bg) <= golden.channelTolerance &&
      Math.abs(ab - bb) <= golden.channelTolerance
    );
  };
  for (const expected of golden.palette) {
    const hit = extraction.dominant.find((color) => withinTolerance(color.value, expected.hex));
    if (!hit) failures.push(`palette color ${expected.hex} not found within tolerance`);
    else if (hit.count < expected.minShare) {
      failures.push(`palette color ${expected.hex} share ${hit.count.toFixed(3)} < ${expected.minShare}`);
    }
  }
  const core = mapExtractionToCore(extraction).core;
  for (const [slot, expected] of Object.entries(golden.core)) {
    if (!core[slot] || !withinTolerance(core[slot], expected)) {
      failures.push(`core.${slot}: expected ~${expected}, got ${core[slot]}`);
    }
  }
  const coverage = requiredCoverage(deriveTokens(core));
  if (coverage.missing.length > 0) failures.push(`missing required tokens: ${coverage.missing.join(', ')}`);
  record('extraction-image-brand-palette', failures, { coverage });
}

// ---------------------------------------------------------------------------
// Loader evals
// ---------------------------------------------------------------------------

function writeSystem(registryDir, name, accent, extra = {}) {
  const dir = join(registryDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'tokens.css'), `:root {\n  --ve-accent: ${accent};\n}\n`);
  writeFileSync(
    join(dir, 'manifest.json'),
    `${JSON.stringify({ name, description: 'loader eval fixture', ...extra }, null, 2)}\n`,
  );
  return dir;
}

function withTempRegistries(run) {
  const root = mkdtempSync(join(tmpdir(), 've-ds-eval-'));
  try {
    const envDir = join(root, 'env-registry');
    const home = join(root, 'home');
    const repoRoot = join(root, 'repo');
    mkdirSync(envDir, { recursive: true });
    mkdirSync(join(home, '.artifacture/design-systems'), { recursive: true });
    mkdirSync(join(repoRoot, 'design-systems'), { recursive: true });
    return run({
      root,
      envDir,
      home,
      homeRegistry: join(home, '.artifacture/design-systems'),
      repoRoot,
      repoRegistry: join(repoRoot, 'design-systems'),
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function evalResolutionOrder() {
  withTempRegistries(({ envDir, home, homeRegistry, repoRoot, repoRegistry }) => {
    writeSystem(envDir, 'acme', '#111111');
    writeSystem(homeRegistry, 'acme', '#222222');
    writeSystem(repoRegistry, 'acme', '#333333');

    const failures = [];
    const accentOf = (opts) => {
      const system = resolveDesignSystem('acme', opts);
      return system?.tokensCss.match(/--ve-accent:\s*(#\w+)/)?.[1] ?? null;
    };

    const envWins = accentOf({ env: { ARTIFACTURE_DESIGN_DIR: envDir }, home, repoRoot });
    if (envWins !== '#111111') failures.push(`$ARTIFACTURE_DESIGN_DIR should win: got ${envWins}`);
    const homeWins = accentOf({ env: {}, home, repoRoot });
    if (homeWins !== '#222222') failures.push(`~/.artifacture should beat repo-local: got ${homeWins}`);
    const repoFallback = accentOf({ env: {}, home: join(home, 'empty-home'), repoRoot });
    if (repoFallback !== '#333333') failures.push(`repo-local fallback should resolve: got ${repoFallback}`);
    const missEverywhere = resolveDesignSystem('nope', { env: {}, home, repoRoot });
    if (missEverywhere !== null) failures.push('unknown system should resolve to null');
    record('loader-resolution-order', failures);
  });
}

function evalCollisionDedupe() {
  // ~/.artifacture may BE a clone of this repo: then the user-global registry
  // and the repo-local registry are the same directory, which must be
  // searched exactly once (at the higher-priority slot).
  withTempRegistries(({ home }) => {
    const failures = [];
    const cloneRoot = join(home, '.artifacture');
    const paths = designSystemSearchPaths({ env: {}, home, repoRoot: cloneRoot });
    const expected = join(cloneRoot, 'design-systems');
    if (paths.length !== 1 || paths[0] !== expected) {
      failures.push(`expected deduped single path ${expected}, got ${JSON.stringify(paths)}`);
    }
    record('loader-collision-dedupe', failures);
  });
}

function evalUnknownPresetFallback() {
  withTempRegistries(({ home, repoRoot }) => {
    const failures = [];
    const { css, warnings } = resolvePresetCssForExport('<Shell preset="not-a-real-system" />', {
      env: {},
      home,
      repoRoot,
      globalCssPath: GLOBAL_CSS,
    });
    if (warnings.length !== 1 || !/unknown preset "not-a-real-system"/.test(warnings[0] ?? '')) {
      failures.push(`expected a clear unknown-preset warning, got ${JSON.stringify(warnings)}`);
    }
    if (!css || !css.includes('[data-ve-preset="not-a-real-system"]')) {
      failures.push('fallback CSS should scope built-in tokens to the unknown name');
    }
    if (!css || !css.includes('--ve-bg: #09090b')) {
      failures.push('fallback CSS should carry the default built-in (mono-industrial) tokens');
    }
    record('loader-unknown-preset-fallback', failures);
  });
}

function evalBuiltinsNotShadowed() {
  // Built-in preset names must never hit the registry (a user system named
  // "terminal" must not silently restyle built-in artifacts).
  withTempRegistries(({ home, homeRegistry, repoRoot }) => {
    const failures = [];
    writeSystem(homeRegistry, 'terminal', '#bad000');
    const { css, warnings } = resolvePresetCssForExport('<Shell preset="terminal" />', {
      env: {},
      home,
      repoRoot,
      globalCssPath: GLOBAL_CSS,
    });
    if (css !== null) failures.push('built-in preset must not be shadowed by a registry system');
    if (warnings.length !== 0) failures.push(`expected no warnings for a built-in preset, got ${JSON.stringify(warnings)}`);
    record('loader-builtin-not-shadowed', failures);
  });
}

function evalMalformedSystemsFailLoudly() {
  withTempRegistries(({ home, homeRegistry, repoRoot }) => {
    const failures = [];
    const opts = { env: {}, home, repoRoot };

    // Malformed manifest.json → loud DesignSystemError, not a silent skip.
    const brokenDir = join(homeRegistry, 'broken');
    mkdirSync(brokenDir, { recursive: true });
    writeFileSync(join(brokenDir, 'tokens.css'), ':root { --ve-accent: #123456; }\n');
    writeFileSync(join(brokenDir, 'manifest.json'), '{ not json');
    try {
      resolveDesignSystem('broken', opts);
      failures.push('malformed manifest.json should throw');
    } catch (error) {
      if (!(error instanceof DesignSystemError) || !/malformed manifest\.json/.test(error.message)) {
        failures.push(`malformed manifest threw the wrong error: ${error.message}`);
      }
    }

    // Missing tokens.css → loud error too (a half-formed system must not
    // silently shadow a lower-priority one).
    const bareDir = join(homeRegistry, 'bare');
    mkdirSync(bareDir, { recursive: true });
    writeFileSync(join(bareDir, 'manifest.json'), '{"name":"bare"}\n');
    try {
      resolveDesignSystem('bare', opts);
      failures.push('missing tokens.css should throw');
    } catch (error) {
      if (!(error instanceof DesignSystemError) || !/missing tokens\.css/.test(error.message)) {
        failures.push(`missing tokens.css threw the wrong error: ${error.message}`);
      }
    }
    record('loader-malformed-fails-loudly', failures);
  });
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

evalCodeExtraction();
await evalUrlExtraction();
await evalImageExtraction();
evalResolutionOrder();
evalCollisionDedupe();
evalUnknownPresetFallback();
evalBuiltinsNotShadowed();
evalMalformedSystemsFailLoudly();

console.log('case,status');
for (const row of results) console.log(`${row.name},${row.status}`);
for (const row of results) {
  if (row.detail?.coverage) {
    const { producedRequired, missing } = row.detail.coverage;
    console.log(
      `coverage ${row.name}: ${producedRequired}/${REQUIRED_VE_TOKENS.length} required tokens produced${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`,
    );
  }
}

const failures = results.filter((row) => row.status !== 'pass');
if (failures.length > 0) {
  console.error('\nFailures:');
  for (const failure of failures) {
    for (const message of failure.failures) console.error(`- ${failure.name}: ${message}`);
  }
  process.exit(1);
}
console.log(`\nAll ${results.length} design-system eval cases passed.`);
