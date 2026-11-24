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
});
