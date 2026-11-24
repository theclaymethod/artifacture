import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { resolveShader } from '@vgpu/wgsl/runtime';

export interface WgslCheckResult {
  readonly file: string;
  readonly ok: boolean;
  readonly error?: string;
}

export async function checkWgslDirectory(rootDir: string): Promise<WgslCheckResult[]> {
  const absRoot = path.resolve(rootDir);
  const files: string[] = [];

  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && entry.name.endsWith('.wgsl')) files.push(full);
    }
  }

  await walk(absRoot);
  const results: WgslCheckResult[] = [];
  for (const file of files) {
    try {
      await resolveShader({ entry: file, rootDir: path.dirname(file), validate: 'require' });
      results.push({ file, ok: true });
    } catch (err) {
      results.push({
        file,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}
