#!/usr/bin/env node
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setupRuntime } from './setup-runtime.mjs';

try {
  const command = process.argv[2];
  const root = await setupRuntime({ install: ['path', 'export', 'export-static', 'video', 'fframes', 'chart', 'archify', 'verify', 'finalize', 'pdf'].includes(command) });
  if (command === 'path') console.log(root);
  else await import(pathToFileURL(join(root, 'scripts/artifacture.mjs')).href);
} catch (error) {
  console.error(`artifacture: ${error.message}`);
  process.exitCode = 1;
}
