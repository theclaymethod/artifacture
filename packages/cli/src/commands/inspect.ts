import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { getFullCatalog, resolveCliPackageRoot } from '../catalog.ts';

export function runList(json = false): string {
  const catalog = getFullCatalog();
  if (json) {
    return JSON.stringify(catalog, null, 2);
  }

  const lines: string[] = [];
  lines.push('Blocks (@artifacture/kit & @artifacture/gpu):');
  for (const b of catalog.blocks) {
    lines.push(`  - ${b.id.padEnd(18)} [${b.surfaces.join(', ')}] — ${b.summary}`);
  }
  lines.push('');
  lines.push('GPU Scenes (@artifacture/gpu/scenes):');
  for (const s of catalog.scenes) {
    lines.push(`  - ${s.id.padEnd(18)} params: ${s.params.join(', ')}`);
  }
  lines.push('');
  lines.push('Themes (@artifacture/themes):');
  for (const t of catalog.themes) {
    lines.push(`  - ${t.id.padEnd(22)} (${t.appearance}) — ${t.useWhen}`);
  }
  lines.push('');
  lines.push('Templates:');
  for (const tpl of catalog.templates) {
    lines.push(`  - ${tpl.id.padEnd(12)} (${tpl.host}) — ${tpl.summary}`);
  }
  return lines.join('\n');
}

export function runInfo(id: string | undefined, json = false): string {
  if (!id) {
    throw new Error('Provide a block, scene, theme, or template id: `artifacture info <id>`.');
  }
  const catalog = getFullCatalog();
  const match =
    catalog.blocks.find((b) => b.id === id || b.title.toLowerCase() === id.toLowerCase()) ??
    catalog.scenes.find((s) => s.id === id) ??
    catalog.themes.find((t) => t.id === id) ??
    catalog.templates.find((tpl) => tpl.id === id);

  if (!match) {
    throw new Error(
      `Unknown catalog entry "${id}". Run \`artifacture list\` to see available ids.`,
    );
  }
  return json ? JSON.stringify(match, null, 2) : JSON.stringify(match, null, 2);
}

export async function runDocs(topic = 'overview'): Promise<string> {
  const cliRoot = await resolveCliPackageRoot();
  const docsDir = path.join(cliRoot, 'docs');
  const files = (await readdir(docsDir))
    .filter((file) => file.endsWith('.md'))
    .map((file) => file.replace(/\.md$/, ''))
    .sort();

  if (topic === 'list') {
    return `Available topics: ${files.join(', ')}`;
  }

  const target = path.join(docsDir, `${topic}.md`);
  if (!existsSync(target)) {
    throw new Error(`Unknown docs topic "${topic}". Available topics: ${files.join(', ')}`);
  }
  return readFile(target, 'utf8');
}

export async function runSkills(installDir?: string): Promise<string> {
  const cliRoot = await resolveCliPackageRoot();
  const skillPath = path.resolve(cliRoot, '../../skills/artifacture/SKILL.md');
  if (!existsSync(skillPath)) {
    throw new Error(`Skill file missing at ${skillPath}`);
  }
  if (!installDir) {
    return `Skill path: ${skillPath}`;
  }
  const destDir = path.resolve(installDir);
  await mkdir(destDir, { recursive: true });
  const dest = path.join(destDir, 'SKILL.md');
  await copyFile(skillPath, dest);
  return `Installed Artifacture skill to ${dest}`;
}
