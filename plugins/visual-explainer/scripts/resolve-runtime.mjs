#!/usr/bin/env node
import { realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const RUNTIME_FILES = ['package.json', 'visual-explainer-mdx/components.tsx'];

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

export async function resolveRuntime({ override = process.env.ARTIFACTURE_REPO, scriptPath = SCRIPT_PATH, home = homedir() } = {}) {
  if (override !== undefined) {
    const root = override.trim() ? await runtimeRoot(resolve(override)) : null;
    if (root) return root;
    throw Object.assign(new Error(`ARTIFACTURE_REPO must contain ${RUNTIME_FILES.join(' and ')}. Set it to a valid Artifacture checkout.`), { code: 'invalid-override' });
  }

  const script = await realpath(scriptPath);
  const candidates = [resolve(dirname(script), '../../..'), join(home, '.artifacture')];
  for (const candidate of candidates) {
    const root = await runtimeRoot(candidate);
    if (root) return root;
  }

  throw Object.assign(new Error('No Artifacture runtime found. Set ARTIFACTURE_REPO to a checkout containing package.json and visual-explainer-mdx/components.tsx. If ~/.artifacture does not exist, run git clone https://github.com/theclaymethod/artifacture ~/.artifacture and npm install --prefix ~/.artifacture. Preserve an existing ~/.artifacture directory; clone elsewhere and set ARTIFACTURE_REPO.'), { code: 'missing-runtime' });
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
