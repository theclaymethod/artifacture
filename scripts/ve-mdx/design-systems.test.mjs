import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BUILTIN_PRESETS,
  DesignSystemError,
  designSystemSearchPaths,
  presetNamesInSource,
  resolveDesignSystem,
  scopeTokensCss,
} from './design-systems.mjs';

function tempRegistries() {
  const root = mkdtempSync(join(tmpdir(), 've-ds-test-'));
  const envDir = join(root, 'env-registry');
  const home = join(root, 'home');
  const repoRoot = join(root, 'repo');
  mkdirSync(envDir, { recursive: true });
  mkdirSync(join(home, '.artifacture/design-systems'), { recursive: true });
  mkdirSync(join(repoRoot, 'design-systems'), { recursive: true });
  return { root, envDir, home, homeRegistry: join(home, '.artifacture/design-systems'), repoRoot };
}

function writeSystem(registryDir, name, accent) {
  const dir = join(registryDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'tokens.css'), `:root {\n  --ve-accent: ${accent};\n}\n`);
  writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify({ name })}\n`);
}

test('search paths follow env > home > repo order and dedupe the repo-clone collision', () => {
  const paths = designSystemSearchPaths({
    env: { ARTIFACTURE_DESIGN_DIR: '/custom/dir' },
    home: '/home/u',
    repoRoot: '/repo',
  });
  assert.deepEqual(paths, ['/custom/dir', '/home/u/.artifacture/design-systems', '/repo/design-systems']);

  // ~/.artifacture IS the repo clone → user-global and repo-local registries
  // are the same directory, consulted once.
  const collided = designSystemSearchPaths({ env: {}, home: '/home/u', repoRoot: '/home/u/.artifacture' });
  assert.deepEqual(collided, ['/home/u/.artifacture/design-systems']);
});

test('resolution order: env registry beats home registry beats repo-local', () => {
  const { root, envDir, home, homeRegistry, repoRoot } = tempRegistries();
  try {
    writeSystem(envDir, 'acme', '#111111');
    writeSystem(homeRegistry, 'acme', '#222222');
    writeSystem(join(repoRoot, 'design-systems'), 'acme', '#333333');

    const withEnv = resolveDesignSystem('acme', { env: { ARTIFACTURE_DESIGN_DIR: envDir }, home, repoRoot });
    assert.match(withEnv.tokensCss, /#111111/);

    const withoutEnv = resolveDesignSystem('acme', { env: {}, home, repoRoot });
    assert.match(withoutEnv.tokensCss, /#222222/);

    const repoOnly = resolveDesignSystem('acme', { env: {}, home: join(root, 'nohome'), repoRoot });
    assert.match(repoOnly.tokensCss, /#333333/);

    assert.equal(resolveDesignSystem('missing', { env: {}, home, repoRoot }), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('malformed systems fail loudly instead of falling through', () => {
  const { root, home, homeRegistry, repoRoot } = tempRegistries();
  try {
    const dir = join(homeRegistry, 'broken');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'tokens.css'), ':root { --ve-accent: #123456; }\n');
    writeFileSync(join(dir, 'manifest.json'), '{ nope');
    assert.throws(
      () => resolveDesignSystem('broken', { env: {}, home, repoRoot }),
      (error) => error instanceof DesignSystemError && /malformed manifest/.test(error.message),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('scopeTokensCss re-scopes :root declarations to the preset attribute', () => {
  const scoped = scopeTokensCss(':root {\n  --ve-bg: #fff;\n  --ve-text: #111;\n}\n', 'acme');
  assert.match(scoped, /^\[data-ve-preset="acme"\] \{/);
  assert.match(scoped, /--ve-bg: #fff;/);
  assert.match(scoped, /--ve-text: #111;/);
  assert.throws(() => scopeTokensCss('body { color: red; }', 'acme'), /no custom-property declarations/);
});

test('presetNamesInSource finds preset props and data attributes, builtin set intact', () => {
  const code = `
    <ExplainerShell preset="acme-terracotta" />
    <main data-ve-preset="acme-dark" />
    <SlideDeck preset={'terminal'} />
  `;
  assert.deepEqual(presetNamesInSource(code).sort(), ['acme-dark', 'acme-terracotta', 'terminal']);
  assert.equal(BUILTIN_PRESETS.has('terminal'), true);
  assert.equal(BUILTIN_PRESETS.has('acme-terracotta'), false);
});
