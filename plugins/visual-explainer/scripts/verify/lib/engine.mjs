import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContext } from './context.mjs';
import { buildReport } from './report.mjs';
import { checks as staticTextChecks } from './checks/static-text.mjs';
import { checks as staticDomChecks } from './checks/static-dom.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VERIFY_ROOT = path.resolve(__dirname, '..');

export async function runVerify(filePath, options = {}) {
  const ctx = await buildContext(filePath, options);
  const catalog = await loadCatalog();
  const browserStage = options.staticOnly ? null : await loadOptionalBrowserStage();
  const browserRegistry = browserStage?.checks || null;
  if (browserStage && hasApplicableBrowserChecks(catalog, ctx, browserRegistry)) {
    await browserStage.runBrowserStage(ctx, { screensDir: options.screens, profile: ctx.profile });
  }

  const rows = [];

  for (const definition of catalog.checks) {
    rows.push(await runOne(definition, ctx, {
      'static-text': staticTextChecks,
      'static-dom': staticDomChecks,
      browser: browserRegistry,
    }, options));
  }

  return buildReport(ctx, rows, screenshotsFor(ctx));
}

async function runOne(definition, ctx, registries, options) {
  const base = {
    id: definition.id,
    stage: definition.stage,
    severity: definition.severity,
    status: 'skip',
    evidence: '',
    where: '',
    fix_hint: definition.spec || definition.title || '',
  };

  if (!definition.profiles.includes(ctx.profile)) {
    return { ...base, status: 'skip', evidence: `profile ${ctx.profile} not in scope` };
  }

  if (definition.stage === 'llm-pass') return { ...base, status: 'llm-required', evidence: 'requires focused LLM verification pass' };
  if (definition.stage === 'transcript') return { ...base, status: 'transcript', evidence: 'requires transcript verification' };
  if (definition.stage === 'browser') {
    if (options.staticOnly) return { ...base, status: 'skipped-static', evidence: 'browser check skipped by --static-only' };
    if (!registries.browser) return { ...base, status: 'unimplemented', evidence: 'browser stage unavailable in this run' };
  }

  const registry = registries[definition.stage] || {};
  const implementation = registry[definition.id];
  if (!implementation) return { ...base, status: 'unimplemented', evidence: 'no registry entry' };

  try {
    if (implementation.appliesWhen && !implementation.appliesWhen(ctx, definition)) {
      return { ...base, status: 'skip', evidence: definition.applies_when || 'not applicable' };
    }
    const results = implementation.run(ctx, definition) || [];
    const actionable = results.filter(Boolean).filter((result) => result.status !== 'pass');
    if (actionable.length === 0) return { ...base, status: 'pass', evidence: 'ok' };
    const first = actionable[0];
    const status = first.status === 'warn' || definition.severity === 'warn' ? 'warn' : 'fail';
    return {
      ...base,
      status,
      evidence: first.evidence || definition.title || 'violation',
      where: first.where || '',
      fix_hint: first.fix_hint || definition.spec || definition.title || '',
    };
  } catch (error) {
    return {
      ...base,
      status: definition.severity === 'warn' ? 'warn' : 'fail',
      evidence: `check crashed: ${error.message}`,
      where: definition.id,
    };
  }
}

async function loadCatalog() {
  const raw = await fs.readFile(path.join(VERIFY_ROOT, 'checks.json'), 'utf8');
  return JSON.parse(raw);
}

async function loadOptionalBrowserStage() {
  try {
    const browserMod = await import('./browser.mjs');
    const checksMod = await import('./checks/browser.mjs');
    return {
      runBrowserStage: browserMod.runBrowserStage,
      checks: checksMod.checks || {},
    };
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' || /Cannot find module/.test(error.message)) return null;
    throw error;
  }
}

function hasApplicableBrowserChecks(catalog, ctx, registry) {
  for (const definition of catalog.checks) {
    if (definition.stage !== 'browser') continue;
    if (!definition.profiles.includes(ctx.profile)) continue;
    const implementation = registry[definition.id];
    if (!implementation) continue;
    if (!implementation.appliesWhen || implementation.appliesWhen(ctx, definition)) return true;
  }
  return false;
}

function screenshotsFor(ctx) {
  const paths = [];
  for (const run of ctx.browser?.runs || []) {
    if (run.screenshotPath) paths.push(run.screenshotPath);
    if (run.fullScreenshotPath) paths.push(run.fullScreenshotPath);
  }
  return paths;
}
