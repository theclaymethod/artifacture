import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { resolveCliPackageRoot, type TEMPLATE_CATALOG } from '../catalog.ts';

export type InitSurface = (typeof TEMPLATE_CATALOG)[number]['id'];

const EXCLUDED_NAMES = new Set([
  'node_modules',
  'dist',
  'dist-singlefile',
  '.open-slide',
  'out',
  '.DS_Store',
]);

export async function runInit(surface: string | undefined, targetDirArg?: string): Promise<string> {
  if (surface !== 'slides' && surface !== 'explainer' && surface !== 'video') {
    throw new Error(
      `Unsupported template surface "${surface ?? ''}". Choose one of: slides, explainer, video.`,
    );
  }

  const cliRoot = await resolveCliPackageRoot();
  const repoRoot = path.resolve(cliRoot, '../..');
  const templateDir = path.join(repoRoot, 'templates', surface);
  if (!existsSync(templateDir)) {
    throw new Error(`Template directory not found: ${templateDir}`);
  }

  const targetDir = path.resolve(targetDirArg ?? `artifacture-${surface}`);
  await mkdir(targetDir, { recursive: true });
  await cp(templateDir, targetDir, {
    recursive: true,
    filter: (src) => !EXCLUDED_NAMES.has(path.basename(src)),
  });

  const pkgPath = path.join(targetDir, 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as { name?: string };
    pkg.name = path.basename(targetDir);
    await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  }

  return [
    `Scaffolded Artifacture ${surface} template into ${targetDir}`,
    'Next:',
    `  cd ${targetDir}`,
    '  pnpm install',
    surface === 'slides' ? '  pnpm dev' : '  pnpm dev',
  ].join('\n');
}
