#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRuntime } from './resolve-runtime.mjs';

export async function setupRuntime({ install = true } = {}) {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) throw new Error('Artifacture requires Node.js 22.12 or newer.');
  const root = await resolveRuntime();
  if (install) {
    const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
    const installed = await Promise.all([...Object.keys(manifest.dependencies), ...Object.keys(manifest.devDependencies)].map(async name => {
      const packageJson = await readFile(join(root, 'node_modules', name, 'package.json'), 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      return packageJson !== null && JSON.parse(packageJson).version === lock.packages[`node_modules/${name}`]?.version;
    }));
    if (installed.some(ready => !ready)) {
      console.error(`Installing locked Artifacture runtime dependencies in ${root}`);
      await new Promise((resolve, reject) => {
        const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: root, stdio: ['ignore', 2, 2] });
        child.on('error', reject);
        child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Runtime dependency installation failed (${code}). Fix the npm error and retry the Artifacture command.`)));
      });
    }
  }
  return root;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || args.some(argument => argument !== '--install')) throw new Error('Usage: node setup-runtime.mjs [--install]');
    console.log(await setupRuntime({ install: args.includes('--install') }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
