#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import {
  expandCorpus,
  loadCorpus,
  validateCorpus,
} from './corpus.mjs';

const VIEWPORT = Object.freeze({ width: 960, height: 600 });

export function renderCaseHtml(evalCase) {
  const { template, variant } = evalCase.render;
  const scene = renderTemplate(template, variant, evalCase);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { box-sizing: border-box; }
  html, body { width: 100%; height: 100%; margin: 0; }
  body {
    overflow: hidden;
    background: #e9e6df;
    color: #171714;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .frame {
    width: 960px;
    height: 600px;
    padding: 44px 48px;
    background:
      linear-gradient(90deg, rgba(23,23,20,.035) 1px, transparent 1px) 0 0 / 32px 32px,
      #f7f5ef;
    position: relative;
  }
  .eyebrow { font: 700 12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .12em; text-transform: uppercase; color: #626159; }
  h1 { margin: 12px 0 28px; font-size: 38px; line-height: 1.04; letter-spacing: -.04em; max-width: 720px; }
  h2, h3, p { margin: 0; }
  .muted { color: #6c6a61; }
  .panel { border: 1px solid #aaa79e; background: rgba(255,255,255,.62); }
  .ink { background: #22231f; color: #f6f3eb; }
  .accent { color: #9f3a27; }
  .grid { display: grid; gap: 14px; }
  .row { display: flex; align-items: center; gap: 14px; }
  .node { min-width: 132px; padding: 18px; border: 1px solid #7e7b73; background: #fffdf8; }
  .node strong { display: block; margin-bottom: 6px; }
  .arrow { font: 700 22px/1 ui-monospace, monospace; color: #69675f; }
  .chip { border: 1px solid #8f8c82; padding: 7px 10px; font: 700 11px/1 ui-monospace, monospace; text-transform: uppercase; letter-spacing: .06em; }
  .rule { height: 1px; background: #aaa79e; }
  .metric { font: 800 34px/.95 ui-monospace, monospace; letter-spacing: -.06em; }
  .caption { font: 600 12px/1.3 ui-monospace, monospace; color: #6c6a61; }
  [data-region] { position: relative; }
</style>
</head>
<body>
<main class="frame" data-state-id="${escapeHtml(evalCase.state_id)}">
  <div class="eyebrow">${escapeHtml(evalCase.family)} / ${escapeHtml(evalCase.criterion_id)}</div>
  ${scene}
</main>
</body>
</html>`;
}

export async function renderCorpus({
  corpusPath,
  outputRoot,
  caseIds = null,
} = {}) {
  const resolvedCorpusPath = path.resolve(corpusPath);
  const corpus = await loadCorpus(resolvedCorpusPath);
  validateCorpus(corpus, { corpusPath: resolvedCorpusPath });
  let cases = expandCorpus(corpus, { corpusPath: resolvedCorpusPath });
  if (caseIds) {
    const wanted = new Set(caseIds);
    cases = cases.filter((entry) => wanted.has(entry.case_id));
    const missing = [...wanted].filter((id) => !cases.some((entry) => entry.case_id === id));
    if (missing.length > 0) throw new Error(`unknown corpus case(s): ${missing.join(', ')}`);
  }
  const root = outputRoot
    ? path.resolve(outputRoot)
    : path.dirname(cases[0]?.image.path || path.resolve('corpus/rendered/placeholder.png'));
  await fs.mkdir(root, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const renderHashes = new Map();
  const caseByHash = new Map();
  const renderedImages = [];
  try {
    const page = await browser.newPage({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      colorScheme: 'light',
    });
    for (const evalCase of cases) {
      await page.setContent(renderCaseHtml(evalCase), { waitUntil: 'load' });
      const file = path.join(root, `${evalCase.image.id}.png`);
      const bytes = await page.screenshot({ path: file, type: 'png' });
      const hash = crypto.createHash('sha256').update(bytes).digest('hex');
      const duplicate = caseByHash.get(hash);
      if (duplicate) {
        throw new Error(
          `duplicate rendered pixels for ${duplicate.case_id} and ${evalCase.case_id}`,
        );
      }
      caseByHash.set(hash, evalCase);
      const pairKey = `${evalCase.family}\u0000${evalCase.pair_id}`;
      const prior = renderHashes.get(pairKey);
      if (prior?.hash === hash && prior.human_label !== evalCase.human_label) {
        throw new Error(
          `opposite labels rendered identical pixels for ${evalCase.family}:${evalCase.pair_id}`,
        );
      }
      renderHashes.set(pairKey, { hash, human_label: evalCase.human_label });
      renderedImages.push({
        case_id: evalCase.case_id,
        image_id: evalCase.image.id,
        path: file,
        sha256: hash,
      });
    }
  } finally {
    await browser.close();
  }
  const manifest = {
    schema_version: 1,
    corpus_id: corpus.corpus_id,
    rendered_at: new Date().toISOString(),
    viewport: VIEWPORT,
    images: renderedImages,
  };
  await fs.writeFile(
    path.join(root, 'render-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return manifest;
}

function renderTemplate(template, variant, evalCase) {
  const regionId = evalCase.regions[0].id;
  const text = escapeHtml(evalCase.visible_text);
  if (template === 'text') {
    const clipped = variant === 'clipped-right';
    const width = clipped ? 410 : 640;
    const wrap = clipped ? 'white-space:nowrap; overflow:hidden;' : 'white-space:normal;';
    return `<h1>${sceneHeading(template)}</h1>
      <section class="panel" data-region="${regionId}" style="width:${width}px; padding:26px; ${wrap}">
        <div style="font-size:48px; line-height:1.02; font-weight:800; letter-spacing:-.055em; width:${clipped ? 640 : 560}px">${text}</div>
      </section>`;
  }
  if (template === 'table') {
    const clipped = variant === 'clipped-label';
    return `<h1>${sceneHeading(template)}</h1>
      <section class="panel" data-region="${regionId}" style="padding:18px; overflow:${clipped ? 'hidden' : 'auto'}">
        ${['Queue', 'Owner', 'Latency'].map((label, index) => `
          <div class="row" style="height:54px; border-bottom:1px solid #c4c1b8; min-width:${clipped ? 520 : 820}px">
            <strong style="width:${clipped && index === 1 ? 132 : 360}px; ${clipped && index === 1 ? 'white-space:nowrap;overflow:hidden' : ''}">${index === 1 ? text : label}</strong>
            <span class="muted">Measured evidence ${index + 1}</span>
          </div>`).join('')}
      </section>`;
  }
  if (template === 'slide' || template === 'dashboard') {
    const equal = variant === 'competing-foci' || variant === 'uniform-loud';
    return `<h1 style="${equal ? 'font-size:52px;color:#9f3a27' : ''}">${sceneHeading(template)}</h1>
      <section data-region="${regionId}" class="grid" style="grid-template-columns:repeat(3,1fr); align-items:stretch">
        ${['93%', 'ROUTER', '2.4s'].map((label, index) => `
          <div class="panel" style="padding:${equal ? 28 : index === 1 ? 42 : 20}px; min-height:${equal ? 190 : index === 1 ? 230 : 130}px; ${!equal && index !== 1 ? 'opacity:.62' : ''}">
            <div class="${index === 1 ? '' : 'metric'}" style="${index === 1 ? 'font-size:34px;font-weight:850' : ''}">${label}</div>
            <p class="muted" style="margin-top:12px">${text}</p>
          </div>`).join('')}
      </section>`;
  }
  if (template === 'diagram-space') {
    const collapsed = variant === 'collapsed-column';
    const tiny = variant === 'tiny-unbalanced' || collapsed;
    const labels = evalCase.visible_text.split(/\s*(?:→|·)\s*/).slice(0, 3);
    return `<h1>${sceneHeading(template)}</h1>
      <section class="panel" data-region="${regionId}" style="height:360px; padding:28px; display:flex; align-items:${tiny ? 'flex-start' : 'center'}; justify-content:${tiny ? 'flex-start' : 'center'}">
        <div class="row" style="transform:scale(${tiny ? '.55' : '1'}); transform-origin:top left">
          ${labels.map((label, index) => `${index ? '<div class="arrow">→</div>' : ''}<div class="node" style="${collapsed && index === labels.length - 1 ? 'width:42px;min-width:42px;overflow:hidden' : ''}">${escapeHtml(label)}</div>`).join('')}
        </div>
      </section>`;
  }
  if (template === 'tracks') {
    const uneven = ['unequal-peers', 'baseline-drift', 'missing-weight'].includes(variant);
    const editorial = variant === 'editorial-60-40';
    const columns = uneven ? '1.2fr .55fr 1.35fr' : (editorial ? '1.5fr 1fr' : '1fr 1fr 1fr');
    const labels = editorial ? ['Narrative', 'Evidence'] : ['Input', 'Router', 'Output'];
    return `<h1>${sceneHeading(template)}</h1>
      <section class="grid" data-region="${regionId}" style="grid-template-columns:${columns}">
        ${labels.map((label, index) => `<div class="panel" style="padding:22px; min-height:${uneven && index === 1 ? 170 : 250}px; margin-top:${uneven && index === 2 ? 24 : 0}px">
          <h2>${label}</h2><div class="rule" style="margin:18px 0 ${uneven && index === 1 ? 36 : 18}px"></div><p class="muted">${text}</p>
        </div>`).join('')}
      </section>`;
  }
  if (template === 'mobile') {
    const crowded = variant === 'crowded-controls';
    return `<h1>${sceneHeading(template)}</h1>
      <section class="panel" data-region="${regionId}" style="width:390px;height:390px;padding:${crowded ? 10 : 22}px">
        <div class="row" style="flex-wrap:${crowded ? 'wrap' : 'nowrap'}; align-items:flex-start">
          <h2 style="font-size:${crowded ? 24 : 34}px; flex:1">${text}</h2>
          ${['Theme', 'Filter', 'Export'].map((label) => `<span class="chip" style="${crowded ? 'font-size:15px;padding:14px' : ''}">${label}</span>`).join('')}
        </div>
        <div class="panel ink" style="margin-top:26px;padding:24px;height:190px"><div class="metric">Policy 02</div></div>
      </section>`;
  }
  if (template === 'diagram') return renderDiagram(variant, evalCase);
  if (template === 'preset') return renderPreset(variant, evalCase);
  if (template === 'operating') return renderOperating(variant, evalCase);
  if (template === 'slop') return renderSlop(variant, evalCase);
  throw new Error(`unsupported render template ${template}`);
}

function renderDiagram(variant, evalCase) {
  const regionId = evalCase.regions[0].id;
  const timeline = ['dishonest-timeline', 'timeline-break'].includes(variant);
  const bars = ['dishonest-bars', 'labeled-comparison', 'invalid-probability', 'valid-probability'].includes(variant);
  if (timeline) {
    return `<h1>${sceneHeading('diagram')}</h1><section data-region="${regionId}" class="panel" style="padding:44px;height:320px">
      <div class="rule" style="margin-top:80px"></div>
      <div class="row" style="justify-content:space-between;margin-top:-9px">
        ${['Day 1', 'Day 2', variant === 'timeline-break' ? '// Month 6' : 'Month 6'].map((label) => `<div><b style="display:block;width:16px;height:16px;border-radius:50%;background:#24241f"></b><span class="caption">${label}</span></div>`).join('')}
      </div>
    </section>`;
  }
  if (bars) {
    const dishonestScale = variant === 'dishonest-bars' || variant === 'invalid-probability';
    const widths = dishonestScale ? [48, 58, 70] : [30, 62, 86];
    const labels = variant.includes('probability')
      ? ['A 55%', variant === 'invalid-probability' ? 'B 35%' : 'B 25%', 'Other 20%']
      : ['A $10', 'B $40', 'Other $20'];
    return `<h1>${sceneHeading('diagram')}</h1><section data-region="${regionId}" class="panel" style="padding:30px;height:340px">
      ${widths.map((width, index) => `<div class="row" style="margin:22px 0"><span class="caption" style="width:90px">${labels[index]}</span><div class="ink" style="height:42px;width:${width}%"></div></div>`).join('')}
    </section>`;
  }
  const nodes = ['Capture', 'Policy', 'Decision'];
  const connectors = ['→', '→'];
  const mixedRelations = variant === 'mixed-grammar' || variant === 'ambiguous-relations';
  const distortedMiddle = [
    'mixed-grammar',
    'orphan-legend',
    'missing-legend-entry',
    'decorated-list',
    'table-as-graph',
    'ambiguous-relations',
  ].includes(variant);
  const dualFocal = variant === 'dual-focal';
  const singleFocal = variant === 'single-focal';
  const wrongLegend = variant === 'orphan-legend' || variant === 'missing-legend-entry';
  return `<h1>${sceneHeading('diagram')}</h1><section data-region="${regionId}" class="panel" style="padding:36px;height:340px">
    <div class="row" style="justify-content:center;align-items:${mixedRelations ? 'flex-start' : 'center'}">
      ${nodes.map((node, index) => {
        const focal = (dualFocal && index < 2) || (singleFocal && index === 1);
        const style = [
          distortedMiddle && index === 1 ? 'border-radius:50%;transform:translateY(50px)' : '',
          focal ? 'background:#22231f;color:#f6f3eb;transform:scale(1.08)' : '',
        ].filter(Boolean).join(';');
        return `${index ? `<span class="arrow">${connectors[index - 1]}</span>` : ''}<div class="node" style="${style}"><strong>${node}</strong><span class="${focal ? '' : 'muted'}">${escapeHtml(evalCase.visible_text)}</span></div>`;
      }).join('')}
    </div>
    <div class="row" style="margin-top:40px;justify-content:center"><span class="chip">API</span><span class="chip">${wrongLegend ? 'CACHE' : 'POLICY'}</span><span class="chip">STORE</span></div>
  </section>`;
}

function renderPreset(variant, evalCase) {
  const regionId = evalCase.regions[0].id;
  const wrongMode = ['wrong-mode-panel', 'wrong-mode-background', 'invisible-dark-icons'].includes(variant);
  const mismatchedDemo = variant === 'mismatched-demo';
  const mobileHeroCard = variant === 'mobile-hero-card';
  const multipleSurprises = variant === 'many-surprises' || variant === 'many-grid-breaks';
  const tooManyLayers = variant === 'too-many-layers';
  const statusAccent = [
    'semantic-status-color',
    'destructive-red',
  ].includes(variant);
  const decorativeStatus = variant === 'decorative-status-color';
  const decorativeRed = variant === 'decorative-red';
  return `<h1>${sceneHeading('preset')}</h1><section data-region="${regionId}" class="grid" style="grid-template-columns:1fr 1fr">
    ${['LIGHT', 'DARK'].map((mode, index) => `<div class="panel" style="height:330px;padding:24px;background:${index ? '#22231f' : '#fffdf8'};color:${index ? '#f6f3eb' : '#22231f'}">
      <div class="caption" style="color:inherit">${mode}</div>
      <div style="margin-top:28px;padding:22px;border:1px solid currentColor;background:${wrongMode && index === 0 ? '#22231f' : decorativeStatus ? '#c93628' : 'transparent'};color:${wrongMode && index === 0 ? '#22231f' : decorativeStatus ? 'white' : 'inherit'};${mismatchedDemo ? 'border-radius:28px;box-shadow:0 18px 40px rgba(78,50,140,.42);transform:scale(.92)' : ''};${mobileHeroCard ? 'width:58%;margin-left:auto;margin-right:auto' : ''}">
        <div class="metric" style="${multipleSurprises ? 'transform:rotate(-5deg);font-size:46px' : ''};${tooManyLayers ? 'font-size:46px;text-shadow:3px 3px #aaa79e' : ''};${decorativeRed ? 'color:#c93628;border-bottom:6px solid #c93628' : ''}">${escapeHtml(evalCase.visible_text.split(' · ')[0])}</div>
        <p style="margin-top:18px;${tooManyLayers ? 'font-size:24px;font-weight:850;text-decoration:underline' : ''}">Measured route and supporting evidence.</p>
      </div>
      <div class="row" style="margin-top:22px"><span class="chip" style="${statusAccent ? 'background:#c93628;color:white' : ''}">STATUS</span><span class="chip">EVIDENCE</span></div>
    </div>`).join('')}
  </section>`;
}

function renderOperating(variant, evalCase) {
  const regionId = evalCase.regions[0].id;
  const labels = evalCase.visible_text.split(' · ').slice(0, 4);
  const independentCards = [
    'routing-cards',
    'one-way-loop',
    'missing-residual',
    'provenance-cards',
    'resource-metrics',
    'state-badges',
    'overbuilt-comparison',
    'cover-graph',
    'workspace-cards',
    'dependency-list',
  ].includes(variant);
  const cards = independentCards || variant === 'relational-equation' || variant === 'cover-none';
  return `<h1>${sceneHeading('operating')}</h1><section data-region="${regionId}" class="panel" style="height:350px;padding:28px">
    <div class="${cards ? 'grid' : 'row'}" style="${cards ? `grid-template-columns:repeat(${Math.min(labels.length, 4)},1fr)` : 'justify-content:center'}">
      ${labels.map((label, index) => `${!cards && index ? `<span class="arrow">${variant === 'closed-loop' && index === labels.length - 1 ? '↩' : '→'}</span>` : ''}<div class="node" style="${!cards && index === 1 ? 'background:#22231f;color:#fff' : ''}"><strong>${escapeHtml(label)}</strong><span class="muted">${independentCards ? 'Independent item' : `Rule ${index + 1}`}</span></div>`).join('')}
    </div>
    ${!cards ? `<div class="caption" style="margin:46px auto 0;text-align:center">guards, dependencies, and provenance remain explicit</div>` : ''}
  </section>`;
}

function renderSlop(variant, evalCase) {
  const regionId = evalCase.regions[0].id;
  const parts = evalCase.visible_text.split(' · ');
  const arrows = variant.includes('sequence') || variant.includes('flow');
  const support = {
    'real-section-number': 'Agenda · 01 Context · 02 Evidence · 03 Method · 04 Architecture',
    'real-citation': '[4] Evaluation Systems Review · 2026 · https://example.org/source',
  }[variant] || '';
  return `<h1>${sceneHeading('slop')}</h1><section data-region="${regionId}" class="panel" style="height:330px;padding:36px;display:flex;flex-direction:column;justify-content:center">
    <div class="row" style="justify-content:center;flex-wrap:wrap">
      ${parts.map((part, index) => `${index && arrows ? '<span class="arrow">→</span>' : ''}<div class="${parts.length > 1 ? 'node' : 'metric'}">${escapeHtml(part)}</div>`).join('')}
    </div>
    <div class="rule" style="margin:38px 0 18px"></div>
    <div class="caption" style="text-align:center">${escapeHtml(evalCase.visible_text)}</div>
    ${support ? `<div class="caption" style="margin-top:18px;text-align:center">${escapeHtml(support)}</div>` : ''}
  </section>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function sceneHeading(template) {
  return escapeHtml({
    text: 'Mobile report',
    table: 'Review inventory',
    slide: 'Model policy',
    dashboard: 'Evaluation dashboard',
    'diagram-space': 'Routing overview',
    tracks: 'System map',
    mobile: 'Model policy',
    diagram: 'Evidence architecture',
    preset: 'Preset specimen',
    operating: 'Review operating model',
    slop: 'Artifact excerpt',
  }[template] || 'Artifact state');
}

function parseArgs(argv) {
  const args = {
    corpus: path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'corpus.json'),
    output: null,
    cases: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--corpus') args.corpus = argv[++index];
    else if (arg === '--out') args.output = argv[++index];
    else if (arg === '--cases') args.cases = argv[++index].split(',').map((value) => value.trim()).filter(Boolean);
    else throw new Error(`unknown argument ${arg}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = await renderCorpus({
    corpusPath: args.corpus,
    outputRoot: args.output,
    caseIds: args.cases,
  });
  process.stdout.write(`Rendered ${manifest.images.length} corpus images\n`);
  process.stdout.write(`${path.dirname(manifest.images[0]?.path || args.output)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exit(1);
  });
}
