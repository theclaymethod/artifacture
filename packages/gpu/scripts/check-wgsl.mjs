import { execFileSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCENES_DIR = path.join(ROOT, 'src', 'scenes');

async function findWgsl(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await findWgsl(full)));
    else if (entry.isFile() && entry.name.endsWith('.wgsl')) files.push(full);
  }
  return files;
}

const files = await findWgsl(SCENES_DIR);
for (const file of files) {
  execFileSync('pnpm', ['exec', 'vgpu', 'check', file], {
    cwd: ROOT,
    stdio: 'inherit',
  });
}
console.log(`Validated ${files.length} WGSL file(s) with vgpu check.`);
