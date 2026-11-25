import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../src/index.ts';

describe('artifacture CLI', () => {
  it('lists curated blocks, GPU scenes, themes, and templates as JSON', async () => {
    const res = await runCli(['list', '--json']);
    expect(res.exitCode).toBe(0);
    const parsed = JSON.parse(res.stdout) as {
      blocks: Array<{ id: string }>;
      scenes: Array<{ id: string }>;
      themes: Array<{ id: string }>;
      templates: Array<{ id: string }>;
    };
    expect(parsed.blocks.some((b) => b.id === 'lieflat-chart')).toBe(true);
    expect(parsed.scenes.some((s) => s.id === 'liquid-prism')).toBe(true);
    expect(parsed.themes.some((t) => t.id === 'iso')).toBe(true);
    expect(parsed.templates.map((tpl) => tpl.id)).toEqual(['slides', 'explainer', 'video']);
  });

  it('prints bundled docs and item info offline', async () => {
    const overview = await runCli(['docs', 'overview']);
    expect(overview.exitCode).toBe(0);
    expect(overview.stdout).toContain('Artifacture v2 Overview');

    const info = await runCli(['info', 'lieflat-chart', '--json']);
    expect(info.exitCode).toBe(0);
    expect(JSON.parse(info.stdout).id).toBe('lieflat-chart');
  });

  it('reports playground boundary status cleanly', async () => {
    const res = await runCli(['playground', 'status', '--json']);
    expect(res.exitCode).toBe(0);
    const parsed = JSON.parse(res.stdout) as { contractDoc: string };
    expect(parsed.contractDoc).toContain('playground-blocks-contract.md');
  });

  it('checks single standalone HTML files for SVG tag nesting and script syntax', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'artifacture-html-check-'));
    try {
      const badPath = path.join(tmpDir, 'bad.html');
      await writeFile(
        badPath,
        '<!doctype html><svg><text><code>oops</code></text></svg><script>const (;</script>',
        'utf8',
      );
      const bad = await runCli(['check', badPath]);
      expect(bad.exitCode).toBe(1);
      expect(bad.stdout).toContain('svg-invalid-html-tag');
      expect(bad.stdout).toContain('inline-script-syntax');

      const goodPath = path.join(tmpDir, 'good.html');
      await writeFile(
        goodPath,
        '<!doctype html><svg><text><tspan>ok</tspan></text></svg><script>const ok = 1;</script>',
        'utf8',
      );
      const good = await runCli(['check', goodPath]);
      expect(good.exitCode).toBe(0);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
