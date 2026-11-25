import { readdir, readFile, stat } from 'node:fs/promises';
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

export interface HtmlCheckIssue {
  readonly file: string;
  readonly line: number;
  readonly kind: 'svg-invalid-html-tag' | 'malformed-tag' | 'inline-script-syntax';
  readonly message: string;
}

export interface ProjectCheckReport {
  readonly ok: boolean;
  readonly rootDir: string;
  readonly wgsl: readonly WgslCheckResult[];
  readonly slideIssues: readonly SlideValidationIssue[];
  readonly htmlIssues: readonly HtmlCheckIssue[];
  readonly placeholders: readonly PlaceholderHit[];
}

const PLACEHOLDER_RE = /\b(TODO|FIXME|TBD|LOREM IPSUM)\b(?::|\s|$)/i;
const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.mdx', '.md', '.html']);
const SVG_INVALID_HTML_TAG_RE = /<(code|div|span|p|ul|ol|li|h[1-6]|table)\b/i;
const MALFORMED_FRAMEWORK_TAG_RE = /<(motion-[a-z]+)\b/i;

function lineNumberAt(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i += 1) {
    if (source.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

/**
 * Pure static validator for standalone HTML/SVG decks:
 * catches HTML tags nested directly inside `<svg>` (outside `<foreignObject>`),
 * accidental framework tags like `<motion-div>`, and inline `<script>` JS syntax errors.
 */
export function checkStandaloneHtml(source: string, fileLabel: string): readonly HtmlCheckIssue[] {
  const issues: HtmlCheckIssue[] = [];

  // 1. Check for accidental framework/JSX tags (e.g. <motion-div>)
  const malformedMatch = MALFORMED_FRAMEWORK_TAG_RE.exec(source);
  if (malformedMatch && malformedMatch.index !== undefined) {
    issues.push({
      file: fileLabel,
      line: lineNumberAt(source, malformedMatch.index),
      kind: 'malformed-tag',
      message: `Invalid framework tag "<${malformedMatch[1]}>" in standalone HTML`,
    });
  }

  // 2. Check inline <svg> blocks for invalid HTML tags outside <foreignObject>
  const svgRe = /<svg\b[^>]*>([\s\S]*?)<\/svg>/gi;
  for (const match of source.matchAll(svgRe)) {
    const svgInner = match[1] ?? '';
    const svgStart = match.index ?? 0;
    const withoutForeignObject = svgInner.replace(
      /<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject>/gi,
      (fo) => fo.replace(/[^\n]/g, ' '),
    );
    const badTag = SVG_INVALID_HTML_TAG_RE.exec(withoutForeignObject);
    if (badTag && badTag.index !== undefined) {
      const openTagLen = match[0].indexOf('>') + 1;
      issues.push({
        file: fileLabel,
        line: lineNumberAt(source, svgStart + openTagLen + badTag.index),
        kind: 'svg-invalid-html-tag',
        message: `HTML tag "<${badTag[1]}>" nested inside <svg> without <foreignObject>; use <tspan> instead`,
      });
    }
  }

  // 3. Validate inline classic <script> blocks for JavaScript syntax errors
  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  for (const match of source.matchAll(scriptRe)) {
    const attrs = match[1] ?? '';
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const typeMatch = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs);
    const scriptType = typeMatch?.[1]?.toLowerCase() ?? '';
    if (
      scriptType &&
      scriptType !== 'text/javascript' &&
      scriptType !== 'application/javascript'
    ) {
      continue;
    }
    const body = (match[2] ?? '').trim();
    if (!body) continue;
    try {
      // Parse-only check (does not execute)
      new Function(body);
    } catch (err) {
      issues.push({
        file: fileLabel,
        line: lineNumberAt(source, match.index ?? 0),
        kind: 'inline-script-syntax',
        message: `Inline <script> syntax error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return issues;
}

function scanPlaceholdersInText(text: string, fileLabel: string): PlaceholderHit[] {
  const hits: PlaceholderHit[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const match = PLACEHOLDER_RE.exec(line);
    if (match) {
      hits.push({
        file: fileLabel,
        line: index + 1,
        token: match[0].trim(),
      });
    }
  });
  return hits;
}

async function scanFiles(targetPath: string): Promise<{
  placeholders: PlaceholderHit[];
  htmlIssues: HtmlCheckIssue[];
}> {
  const placeholders: PlaceholderHit[] = [];
  const htmlIssues: HtmlCheckIssue[] = [];
  const st = await stat(targetPath).catch(() => null);
  if (!st) return { placeholders, htmlIssues };

  if (st.isFile()) {
    const text = await readFile(targetPath, 'utf8');
    const label = path.basename(targetPath);
    placeholders.push(...scanPlaceholdersInText(text, label));
    if (path.extname(targetPath).toLowerCase() === '.html') {
      htmlIssues.push(...checkStandaloneHtml(text, label));
    }
    return { placeholders, htmlIssues };
  }

  const visited = new Set<string>();
  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (
        entry.name === 'node_modules' ||
        entry.name === 'dist' ||
        entry.name === '.git' ||
        entry.name === '.open-slide' ||
        entry.name === '.artifacture-review'
      ) {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (visited.has(full)) continue;
      visited.add(full);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        const text = await readFile(full, 'utf8');
        const rel = path.relative(targetPath, full);
        placeholders.push(...scanPlaceholdersInText(text, rel));
        if (path.extname(entry.name).toLowerCase() === '.html') {
          htmlIssues.push(...checkStandaloneHtml(text, rel));
        }
      }
    }
  }

  for (const sub of ['src', 'slides', 'content']) {
    await walk(path.join(targetPath, sub));
  }
  // Also inspect top-level .html files directly in targetPath (for standalone HTML decks)
  const topEntries = await readdir(targetPath, { withFileTypes: true }).catch(() => []);
  for (const entry of topEntries) {
    if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.html') {
      const full = path.join(targetPath, entry.name);
      if (visited.has(full)) continue;
      visited.add(full);
      const text = await readFile(full, 'utf8');
      placeholders.push(...scanPlaceholdersInText(text, entry.name));
      htmlIssues.push(...checkStandaloneHtml(text, entry.name));
    }
  }

  return { placeholders, htmlIssues };
}

/**
 * Runs Dawn WGSL validation, semantic slide contract checks, standalone HTML/SVG hygiene,
 * and placeholder scans on a project directory or single standalone HTML file.
 */
export async function runProjectChecks(opts: {
  rootDir: string;
  slides?: readonly SemanticSlideSpec[];
}): Promise<ProjectCheckReport> {
  const rootDir = path.resolve(opts.rootDir);
  const st = await stat(rootDir).catch(() => null);
  const wgsl = st?.isDirectory() ? await checkWgslDirectory(rootDir) : [];
  const slideIssues = (opts.slides ?? []).flatMap((spec) => validateSlideSpec(spec));
  const { placeholders, htmlIssues } = await scanFiles(rootDir);

  const ok =
    wgsl.every((entry) => entry.ok) &&
    slideIssues.length === 0 &&
    htmlIssues.length === 0 &&
    placeholders.length === 0;

  return {
    ok,
    rootDir,
    wgsl,
    slideIssues,
    htmlIssues,
    placeholders,
  };
}
