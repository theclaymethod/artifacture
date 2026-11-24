import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { checkWgslDirectory, compileWgslDirectory, renderSceneStill } from '@artifacture/gpu/node';
import { blindsGlassScene, liquidPrismScene } from '@artifacture/gpu/scenes';
import { type ReviewSurface, runProjectChecks, runReview } from '@artifacture/verify';
import { resolveCliPackageRoot } from '../catalog.ts';

const execFileAsync = promisify(execFile);

export async function runShaders(dirArg = '.', emit = false, json = false): Promise<string> {
  const targetDir = path.resolve(dirArg);
  const wgsl = await checkWgslDirectory(targetDir);
  const failed = wgsl.filter((item) => !item.ok);
  const compiled = emit && failed.length === 0 ? await compileWgslDirectory(targetDir) : [];

  if (json) {
    return JSON.stringify({ ok: failed.length === 0, wgsl, compiled }, null, 2);
  }
  if (failed.length > 0) {
    const details = failed
      .map((item) => `  FAIL ${item.file}: ${item.error ?? 'unknown error'}`)
      .join('\n');
    throw new Error(`WGSL validation failed:\n${details}`);
  }
  return [
    `Validated ${wgsl.length} WGSL file(s) under ${targetDir} via Dawn.`,
    ...(compiled.length > 0 ? [`Compiled ${compiled.length} static .wgsl.ts module(s).`] : []),
  ].join('\n');
}

export async function runStills(dirArg = '.'): Promise<string> {
  const targetDir = path.resolve(dirArg);
  const customScript = path.join(targetDir, 'scripts/render-stills.mjs');
  if (existsSync(customScript)) {
    const { stdout, stderr } = await execFileAsync(process.execPath, [customScript], {
      cwd: targetDir,
    });
    return [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
  }

  const assetsDir = path.join(targetDir, 'assets');
  const results = await Promise.all([
    renderSceneStill({
      scene: liquidPrismScene,
      outPath: path.join(assetsDir, 'prism-pose-0.png'),
      params: { morph: 0.0, yaw: 0.45, pitch: 0.22, zoom: 1.0, offsetX: 0.36 },
    }),
    renderSceneStill({
      scene: liquidPrismScene,
      outPath: path.join(assetsDir, 'prism-pose-1.png'),
      params: { morph: 1.0, yaw: -0.35, pitch: 0.32, zoom: 0.9, offsetX: -0.02 },
    }),
    renderSceneStill({
      scene: blindsGlassScene,
      outPath: path.join(assetsDir, 'blinds-cover.png'),
      params: { focusX: 0.8, focusY: 0.46 },
    }),
  ]);
  return JSON.stringify(results, null, 2);
}

export async function runCheck(
  dirArg = '.',
  json = false,
): Promise<{ ok: boolean; output: string }> {
  const report = await runProjectChecks({ rootDir: path.resolve(dirArg) });
  if (json) {
    return { ok: report.ok, output: JSON.stringify(report, null, 2) };
  }
  const lines = [
    `WGSL checked: ${report.wgsl.length} (${report.wgsl.filter((w) => !w.ok).length} failed)`,
    `Placeholders: ${report.placeholders.length}`,
  ];
  for (const w of report.wgsl.filter((item) => !item.ok)) {
    lines.push(`  FAIL ${w.file}: ${w.error ?? 'validation failed'}`);
  }
  for (const hit of report.placeholders) {
    lines.push(`  PLACEHOLDER ${hit.file}:${hit.line} (${hit.token})`);
  }
  return { ok: report.ok, output: lines.join('\n') };
}

export async function runReviewCli(opts: {
  url: string;
  surface: ReviewSurface;
  outDir?: string;
  pages?: number[];
  allPages?: boolean;
  seekTimes?: number[];
  expectWebGpu?: boolean;
}): Promise<{ ok: boolean; output: string }> {
  const report = await runReview({
    url: opts.url,
    surface: opts.surface,
    outDir: opts.outDir ?? path.join(process.cwd(), '.artifacture-review', opts.surface),
    pages: opts.pages,
    allPages: opts.allPages,
    seekTimes: opts.seekTimes,
    expectWebGpu: opts.expectWebGpu,
  });

  const summary = {
    ok: report.ok,
    surface: report.surface,
    browserMode: report.browserMode,
    captures: report.captures.map((c) => ({
      id: c.id,
      file: c.file,
      stddev: c.stddev,
      webgpu: {
        hasAdapter: c.webgpu.hasAdapter,
        readyCount: c.webgpu.readyCount,
        fallbackCount: c.webgpu.fallbackCount,
        errorCount: c.webgpu.errorCount,
      },
      geometryViolations: c.geometry.violations.length,
      drillVerified: c.drillVerified ?? null,
      errors: c.consoleErrors.length + c.pageErrors.length + c.httpFailures.length,
    })),
    videoDeterminism: report.videoDeterminism ?? null,
    reportPath: report.reportPath,
    contactSheetPath: report.contactSheetPath,
  };

  return {
    ok: report.ok,
    output: JSON.stringify(summary, null, 2),
  };
}

export async function runPlaygroundStatus(repoArg?: string, json = false): Promise<string> {
  const cliRoot = await resolveCliPackageRoot();
  const repoRoot = path.resolve(cliRoot, '../..');
  const portfolioDir = path.resolve(repoArg ?? path.join(repoRoot, '..', 'clayton-portfolio'));
  const contractPath = path.join(repoRoot, 'docs', 'playground-blocks-contract.md');
  const v2ManifestPath = path.join(portfolioDir, 'apps/portfolio/src/lib/playground-blocks.json');
  const legacyCatalogPath = path.join(
    portfolioDir,
    'apps/portfolio/src/lib/artifacture-catalog.json',
  );

  const status: {
    portfolioDir: string;
    portfolioExists: boolean;
    contractDoc: string;
    v2Manifest: {
      path: string;
      exists: boolean;
      blockCount?: number;
      promotionCandidates?: string[];
    };
    legacyCatalog: { path: string; exists: boolean; entryCount?: number };
  } = {
    portfolioDir,
    portfolioExists: existsSync(portfolioDir),
    contractDoc: contractPath,
    v2Manifest: { path: v2ManifestPath, exists: existsSync(v2ManifestPath) },
    legacyCatalog: { path: legacyCatalogPath, exists: existsSync(legacyCatalogPath) },
  };

  if (status.v2Manifest.exists) {
    const parsed = JSON.parse(await readFile(v2ManifestPath, 'utf8')) as {
      blocks?: Array<{ id: string; promotionCandidate?: boolean }>;
    };
    status.v2Manifest.blockCount = parsed.blocks?.length ?? 0;
    status.v2Manifest.promotionCandidates =
      parsed.blocks?.filter((b) => b.promotionCandidate).map((b) => b.id) ?? [];
  }

  if (status.legacyCatalog.exists) {
    const parsed = JSON.parse(await readFile(legacyCatalogPath, 'utf8')) as {
      blocks?: unknown[];
    };
    status.legacyCatalog.entryCount = Array.isArray(parsed.blocks) ? parsed.blocks.length : 0;
  }

  if (json) {
    return JSON.stringify(status, null, 2);
  }

  return [
    `Playground repo: ${status.portfolioDir} (${status.portfolioExists ? 'present' : 'not found'})`,
    `Contract doc: ${status.contractDoc}`,
    status.v2Manifest.exists
      ? `v2 manifest: present (${status.v2Manifest.blockCount} blocks, ${status.v2Manifest.promotionCandidates?.length ?? 0} promotion candidates)`
      : `v2 manifest: missing (${v2ManifestPath}) — pending migration from legacy catalog`,
    status.legacyCatalog.exists
      ? `Legacy catalog: present (${status.legacyCatalog.entryCount ?? 0} entries in artifacture-catalog.json)`
      : 'Legacy catalog: none',
  ].join('\n');
}
