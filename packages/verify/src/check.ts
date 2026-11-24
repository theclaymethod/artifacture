import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { checkWgslDirectory, type WgslCheckResult } from '@artifacture/gpu/node';
import {
  type SemanticSlideSpec,
  type SlideValidationIssue,
  validateSlideSpec,
} from '@artifacture/kit';

export interface PlaceholderHit {
  readonly file: string;
  readonly line: number;
  readonly token: string;
}

export interface ProjectCheckReport {
  readonly ok: boolean;
  readonly rootDir: string;
  readonly wgsl: readonly WgslCheckResult[];
  readonly slideIssues: readonly SlideValidationIssue[];
  readonly placeholders: readonly PlaceholderHit[];
}

const PLACEHOLDER_RE = /\b(TODO|FIXME|TBD|LOREM IPSUM)\b(?::|\s|$)/i;
const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.mdx', '.md']);

async function findPlaceholders(rootDir: string): Promise<PlaceholderHit[]> {
  const hits: PlaceholderHit[] = [];

  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (
        entry.name === 'node_modules' ||
        entry.name === 'dist' ||
        entry.name === '.git' ||
        entry.name === '.open-slide'
      ) {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name))) {
        const text = await readFile(full, 'utf8');
        const lines = text.split(/\r?\n/);
        lines.forEach((line, index) => {
          const match = PLACEHOLDER_RE.exec(line);
          if (match) {
            hits.push({
              file: path.relative(rootDir, full),
              line: index + 1,
              token: match[0].trim(),
            });
          }
        });
      }
    }
  }

  for (const sub of ['src', 'slides', 'content']) {
    await walk(path.join(rootDir, sub));
  }
  return hits;
}

/**
 * Runs Dawn WGSL validation, semantic slide contract checks, and placeholder hygiene scans.
 */
export async function runProjectChecks(opts: {
  rootDir: string;
  slides?: readonly SemanticSlideSpec[];
}): Promise<ProjectCheckReport> {
  const rootDir = path.resolve(opts.rootDir);
  const wgsl = await checkWgslDirectory(rootDir);
  const slideIssues = (opts.slides ?? []).flatMap((spec) => validateSlideSpec(spec));
  const placeholders = await findPlaceholders(rootDir);

  const ok =
    wgsl.every((entry) => entry.ok) && slideIssues.length === 0 && placeholders.length === 0;

  return {
    ok,
    rootDir,
    wgsl,
    slideIssues,
    placeholders,
  };
}
