#!/usr/bin/env node
import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const checkout = process.env.ARTIFACTURE_REPO || resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const cli = resolve(checkout, 'scripts/artifacture.mjs');
const local = await access(cli).then(() => true, () => false);
const command = local ? process.execPath : process.platform === 'win32' ? 'npx.cmd' : 'npx';
const args = local ? [cli, ...process.argv.slice(2)] : ['--yes', 'artifacture@1.0.0-next.0', ...process.argv.slice(2)];
const child = spawn(command, args, { stdio: 'inherit', shell: false });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = signal ? 1 : code ?? 1; });
