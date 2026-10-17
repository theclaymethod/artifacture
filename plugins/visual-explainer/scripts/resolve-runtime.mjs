#!/usr/bin/env node
import { realpath, stat, readFile, mkdir, mkdtemp, writeFile, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const RUNTIME_FILES = ['package.json', 'package-lock.json', 'visual-explainer-mdx/components.tsx', 'scripts/artifacture.mjs', 'scripts/components.mjs', 'scripts/ve-mdx/export.mjs'];

async function bundledRuntime(skillDir, cacheDir) {
  const archive = await readFile(join(skillDir, 'assets/runtime.json.gz')).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (!archive) return null;
  const digest = createHash('sha256').update(archive).digest('hex');
  const target = join(cacheDir, digest);
  const bundle = JSON.parse(gunzipSync(archive, { maxOutputLength: 64 * 1024 * 1024 }));
  if (bundle.version !== 1 || !Array.isArray(bundle.files) || !bundle.files.length) throw new Error('Invalid bundled Artifacture runtime. Reinstall the skill.');
  const paths = new Set();
  for (const file of bundle.files) {
    if (file.path !== String(file.path) || !file.path || file.path.includes('\\') || file.path.includes('\0') || /^[a-z]:/i.test(file.path) || file.path.startsWith('/') || file.path.split('/').some(part => !part || part === '.' || part === '..') || paths.has(file.path) || ![0o644, 0o755].includes(file.mode)) throw new Error('Invalid runtime archive path or mode. Reinstall the skill.');
    if (file.content !== String(file.content) || Buffer.from(file.content, 'base64').toString('base64') !== file.content) throw new Error('Invalid runtime archive content. Reinstall the skill.');
    paths.add(file.path);
  }
  if (RUNTIME_FILES.some(file => !paths.has(file))) throw new Error('The bundled runtime is incomplete. Reinstall the skill.');

  const existing = await stat(target).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (!existing) {
    await mkdir(cacheDir, { recursive: true });
    const temporary = await mkdtemp(join(cacheDir, '.extract-'));
    try {
      for (const file of bundle.files) {
        const destination = join(temporary, file.path);
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, Buffer.from(file.content, 'base64'), { flag: 'wx', mode: file.mode });
      }
      try { await rename(temporary, target); }
      catch (error) { if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error; }
    } finally { await rm(temporary, { recursive: true, force: true }); }
  }
  for (const file of bundle.files) {
    const content = await readFile(join(target, file.path)).catch(() => null);
    if (!content?.equals(Buffer.from(file.content, 'base64'))) throw new Error(`Cached runtime source differs: ${target}. Preserve edits and use ARTIFACTURE_REPO for an editable checkout, or select a fresh ARTIFACTURE_CACHE_DIR.`);
  }
  return await runtimeRoot(target);
}

async function runtimeRoot(candidate) {
  try {
    const root = await realpath(candidate);
    const files = await Promise.all(RUNTIME_FILES.map((file) => stat(join(root, file))));
    return files.every((file) => file.isFile()) ? root : null;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    throw error;
  }
}

export async function resolveRuntime({ override = process.env.ARTIFACTURE_REPO, scriptPath = SCRIPT_PATH, home = homedir(), cacheDir = process.env.ARTIFACTURE_CACHE_DIR ?? join(home, '.cache/artifacture/runtimes') } = {}) {
  if (override !== undefined) {
    const root = override.trim() ? await runtimeRoot(resolve(override)) : null;
    if (root) return root;
    throw Object.assign(new Error(`ARTIFACTURE_REPO must contain ${RUNTIME_FILES.join(' and ')}. Set it to a valid Artifacture checkout.`), { code: 'invalid-override' });
  }

  const script = await realpath(scriptPath);
  const checkout = await runtimeRoot(resolve(dirname(script), '../../..'));
  if (checkout) return checkout;
  const bundled = await bundledRuntime(resolve(dirname(script), '..'), resolve(cacheDir));
  if (bundled) return bundled;
  const legacy = await runtimeRoot(join(home, '.artifacture'));
  if (legacy) return legacy;

  throw Object.assign(new Error('No Artifacture runtime found. Reinstall the skill to receive its bundled runtime, or set ARTIFACTURE_REPO to a full checkout. Existing ~/.artifacture files are preserved.'), { code: 'missing-runtime' });
}

const entryPath = process.argv[1] ? await realpath(process.argv[1]).catch(() => null) : null;
if (entryPath === await realpath(SCRIPT_PATH)) {
  try {
    if (process.argv.length > 2) throw new Error('Usage: node resolve-runtime.mjs. Set ARTIFACTURE_REPO to select another checkout.');
    console.log(await resolveRuntime());
  } catch (error) {
    console.error(error.message);
    process.exitCode = error.code === 'missing-runtime' ? 2 : 1;
  }
}
