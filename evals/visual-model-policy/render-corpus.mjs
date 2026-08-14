#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import {
  DEFAULT_VIEWPORT,
  expandCorpus,
  loadCorpus,
  validateCorpus,
} from './corpus.mjs';

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
    background: #d9dde2;
    color: #171714;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .frame {
    width: 100vw;
    height: 100vh;
    padding: clamp(24px, 4vw, 48px);
    background:
      linear-gradient(90deg, rgba(23,23,20,.035) 1px, transparent 1px) 0 0 / 32px 32px,
      #f7f5ef;
    position: relative;
  }
  .family-diagram { background-color:#edf2f4; background-image:linear-gradient(rgba(41,72,84,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(41,72,84,.055) 1px,transparent 1px); background-size:24px 24px; }
  .family-aesthetic { background:#f3f0e9; }
  .family-operating-model { background:#f0f3ee; }
  .family-artifact-slop-gap { background:#fbf7ed; }
  .eyebrow { font: 700 12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .12em; text-transform: uppercase; color: #626159; }
  h1 { margin: 0 0 28px; font-size: clamp(30px, 4vw, 42px); line-height: 1.04; letter-spacing: -.04em; max-width: 720px; }
  h2, h3, p { margin: 0; }
  .muted { color: #6c6a61; }
  .panel { border: 1px solid #aaa79e; background: rgba(255,255,255,.62); }
  .ink { background: #22231f; color: #f6f3eb; }
  .accent { color: #9f3a27; }
  .grid { display: grid; gap: 14px; }
  .row { display: flex; align-items: center; gap: 14px; }
  .node { min-width: 132px; padding: 18px; border: 1px solid #7e7b73; background: #fffdf8; }
  .node.ink { background: #22231f; color: #f6f3eb; }
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
<main class="frame family-${escapeHtml(evalCase.family)}" data-state-id="${escapeHtml(evalCase.state_id)}">
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
      viewport: DEFAULT_VIEWPORT,
      deviceScaleFactor: 1,
      colorScheme: 'light',
    });
    for (const evalCase of cases) {
      await page.setViewportSize(evalCase.viewport || DEFAULT_VIEWPORT);
      await page.setContent(renderCaseHtml(evalCase), { waitUntil: 'load' });
      const file = path.join(root, `${evalCase.image.id}.png`);
      const bytes = await page.screenshot({ path: file, type: 'png' });
      const hash = crypto.createHash('sha256').update(bytes).digest('hex');
      const duplicate = caseByHash.get(hash);
      if (duplicate && !(duplicate.source_conditioned && evalCase.source_conditioned)) {
        throw new Error(
          `duplicate rendered pixels for ${duplicate.case_id} and ${evalCase.case_id}`,
        );
      }
      caseByHash.set(hash, evalCase);
      const pairKey = `${evalCase.family}\u0000${evalCase.pair_id}`;
      const prior = renderHashes.get(pairKey);
      if (
        prior?.hash === hash
        && prior.human_label !== evalCase.human_label
        && !(prior.source_conditioned && evalCase.source_conditioned)
      ) {
        throw new Error(
          `opposite labels rendered identical pixels for ${evalCase.family}:${evalCase.pair_id}`,
        );
      }
      renderHashes.set(pairKey, {
        hash,
        human_label: evalCase.human_label,
        source_conditioned: evalCase.source_conditioned,
      });
      renderedImages.push({
        case_id: evalCase.case_id,
        image_id: evalCase.image.id,
        path: file,
        sha256: hash,
        viewport: evalCase.viewport,
      });
    }
  } finally {
    await browser.close();
  }
  const manifest = {
    schema_version: 1,
    corpus_id: corpus.corpus_id,
    rendered_at: new Date().toISOString(),
    default_viewport: DEFAULT_VIEWPORT,
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
    const wrap = clipped ? 'white-space:nowrap; overflow:hidden;' : 'white-space:normal;';
    return `<h1>${sceneHeading(template)}</h1>
      <section class="panel" data-region="${regionId}" style="width:100%; max-width:640px; padding:clamp(18px,4vw,26px); ${wrap}">
        <div style="font-size:clamp(38px,9vw,48px); line-height:1.02; font-weight:800; letter-spacing:-.055em; width:${clipped ? '640px' : '100%'}">${text}</div>
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
    const uneven = ['unequal-peers', 'missing-weight'].includes(variant);
    const baselineDrift = variant === 'baseline-drift';
    const editorial = variant === 'editorial-60-40';
    const columns = uneven ? '1.2fr .55fr 1.35fr' : (editorial ? '1.5fr 1fr' : '1fr 1fr 1fr');
    const labels = editorial ? ['Narrative', 'Evidence'] : ['Input', 'Router', 'Output'];
    return `<h1>${sceneHeading(template)}</h1>
      <section class="grid" data-region="${regionId}" style="grid-template-columns:${columns}">
        ${labels.map((label, index) => `<div class="panel" style="padding:22px; min-height:${uneven && index === 1 ? 170 : 250}px; margin-top:${baselineDrift ? index * 22 : uneven && index === 2 ? 24 : 0}px">
          <h2>${label}</h2><div class="rule" style="margin:${baselineDrift ? 14 + index * 12 : 18}px 0 ${uneven && index === 1 ? 36 : 18}px"></div><p class="muted">${text}</p>
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
  if (template === 'deck') return renderDeck(variant, evalCase);
  if (template === 'diagram') return renderDiagram(variant, evalCase);
  if (template === 'preset') return renderPreset(variant, evalCase);
  if (template === 'operating') return renderOperating(variant, evalCase);
  if (template === 'slop') return renderSlop(variant, evalCase);
  throw new Error(`unsupported render template ${template}`);
}

function renderDeck(variant, evalCase) {
  const regionId = evalCase.regions[0].id;
  const title = `<div class="eyebrow">Deck review · rendered truth</div><h1 style="margin-top:12px">${escapeHtml(evalCase.visible_text)}</h1>`;
  if (['warning-only-example', 'honest-example'].includes(variant)) {
    const honest = variant === 'honest-example';
    return `${title}<section data-region="${regionId}" class="grid" style="grid-template-columns:1fr 1fr">
      <div><div class="panel" style="padding:24px;height:250px"><div class="eyebrow">GOOD</div><div class="grid" style="grid-template-columns:repeat(3,1fr);margin-top:28px">${['Plan','Visits','Goals'].map((label) => `<div class="node" style="min-width:0">${label}</div>`).join('')}</div></div><div class="caption" style="margin-top:10px;color:#356846">PASS · equal tracks</div></div>
      <div><div class="panel" style="padding:24px;height:250px;border-color:#9f3a27"><div class="eyebrow accent">BAD</div><div class="grid" style="grid-template-columns:${honest ? '.55fr 1.35fr .8fr' : 'repeat(3,1fr)'};margin-top:28px">${['Plan','Visits','Goals'].map((label, index) => `<div class="node" style="min-width:0;${honest && index === 1 ? 'transform:translateY(24px)' : ''}">${label}</div>`).join('')}</div>${honest ? '' : '<div style="height:3px;background:#9f3a27;margin-top:18px"></div>'}</div><div class="caption accent" style="margin-top:10px">FAIL · broken symmetry</div></div>
    </section>`;
  }
  if (['detached-annotation', 'aligned-annotation'].includes(variant)) {
    const aligned = variant === 'aligned-annotation';
    return `${title}<section data-region="${regionId}" class="panel" style="height:390px;padding:30px;position:relative">
      <div class="node" style="position:absolute;left:70px;top:120px;width:260px">Example A<br><span class="muted">Evidence region</span></div>
      <div class="node" style="position:absolute;right:70px;top:120px;width:260px">Example B<br><span class="muted">Evidence region</span></div>
      <aside style="position:absolute;${aligned ? 'right:70px;top:245px;width:260px' : 'left:70px;bottom:26px;width:260px'};padding:14px;border-top:3px solid #9f3a27" class="caption">Annotation for Example B</aside>
    </section>`;
  }
  if (['overexplained-reading-path', 'distilled-reading-path'].includes(variant)) {
    const distilled = variant === 'distilled-reading-path';
    return `${title}<section data-region="${regionId}" class="grid" style="grid-template-columns:${distilled ? '1.35fr .65fr' : 'repeat(3,1fr)'}">
      <div class="panel" style="padding:28px;min-height:300px"><h2>${distilled ? 'One visible decision' : 'Explanation'}</h2><p class="muted" style="margin-top:20px">${distilled ? 'The examples and one bounded check carry the claim.' : 'The same conclusion is repeated here in full.'}</p></div>
      <div class="panel" style="padding:28px;min-height:300px"><h2>${distilled ? 'Evidence' : 'Checklist'}</h2><p class="muted" style="margin-top:20px">${distilled ? 'Two aligned examples.' : 'The same conclusion is repeated here again.'}</p></div>
      ${distilled ? '' : '<div class="panel" style="padding:28px;min-height:300px"><h2>Return contract</h2><p class="muted" style="margin-top:20px">The same conclusion is repeated a third time.</p></div>'}
    </section>`;
  }
  if (['ornamental-metadata-strip', 'functional-source-footer'].includes(variant)) {
    const functional = variant === 'functional-source-footer';
    return `${title}<section data-region="${regionId}" class="panel" style="height:390px;padding:30px;position:relative">
      <div class="node" style="position:absolute;left:90px;top:120px;width:320px"><strong>Patient evidence</strong><p class="muted">A visible finding supports the slide claim.</p></div>
      <div class="node" style="position:absolute;right:90px;top:120px;width:320px"><strong>Clinical output</strong><p class="muted">The output follows from that evidence.</p></div>
      <div class="caption" style="position:absolute;left:30px;bottom:24px">${functional ? 'Source: clinical pathway, section 4.2' : 'CRP · MAYA · SYNTHETIC CASE &nbsp;&nbsp; illustrative · probabilistic · attributable'}</div>
    </section>`;
  }
  if (['repeated-layouts', 'varied-layouts'].includes(variant)) {
    const varied = variant === 'varied-layouts';
    const frames = varied
      ? [
        '<div style="height:100%;display:grid;grid-template-columns:1fr 1fr;gap:8px"><b class="node">Before</b><b class="node">After</b></div>',
        '<div style="height:100%;display:grid;grid-template-rows:1fr 1fr 1fr;gap:8px"><b class="node">01</b><b class="node">02</b><b class="node">03</b></div>',
        '<div style="height:100%;display:grid;grid-template-columns:1.5fr .5fr;gap:8px"><b class="node">Primary</b><b class="node">Rail</b></div>',
      ]
      : Array.from({ length: 3 }, () => '<div style="height:100%;display:grid;grid-template-columns:1fr 1fr;gap:8px"><b class="node">Good</b><b class="node">Bad</b></div>');
    return `${title}<section data-region="${regionId}" class="grid" style="grid-template-columns:repeat(3,1fr)">${frames.map((frame, index) => `<div class="panel" style="padding:18px;height:300px"><div class="caption">SLIDE ${index + 1}</div><div style="height:230px;margin-top:16px">${frame}</div></div>`).join('')}</section>`;
  }
  if (['overlay-collision', 'clear-click-in'].includes(variant)) {
    const clear = variant === 'clear-click-in';
    return `${title}<section data-region="${regionId}" class="panel" style="height:400px;padding:30px;position:relative;overflow:hidden">
      <div class="node" style="position:absolute;left:36px;top:90px;width:360px;height:220px"><strong>Base evidence</strong><p class="muted">The visual anchor remains available.</p></div>
      <button class="chip" style="position:absolute;right:30px;bottom:24px">Open evidence</button>
      <aside class="ink" style="position:absolute;${clear ? 'right:36px;top:76px;width:420px;height:250px' : 'left:180px;top:58px;width:700px;height:370px'};padding:30px;box-shadow:0 18px 50px rgba(0,0,0,.3)">
        <div class="row" style="justify-content:space-between"><strong>Click-in evidence</strong><span class="chip">Close</span></div>
        <p style="margin-top:28px">Additional detail should not erase its context or controls.</p>
        ${clear ? '' : '<p style="position:absolute;bottom:-12px">This final line is clipped.</p>'}
      </aside>
    </section>`;
  }
  throw new Error(`unsupported deck render variant ${variant}`);
}

function renderDiagram(variant, evalCase) {
  const regionId = evalCase.regions[0].id;
  const timeline = ['dishonest-timeline', 'timeline-break'].includes(variant);
  const bars = ['dishonest-bars', 'labeled-comparison', 'proportional-bars', 'invalid-probability', 'valid-probability'].includes(variant);
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
    const widths = variant.includes('probability')
      ? (dishonestScale ? [48, 58, 70] : [72, 33, 26])
      : (dishonestScale ? [62, 69, 66] : [24, 82, 43]);
    const labels = variant.includes('probability')
      ? ['A 55%', variant === 'invalid-probability' ? 'B 35%' : 'B 25%', 'Other 20%']
      : ['A $10', 'B $40', 'Other $20'];
    return `<h1>${sceneHeading('diagram')}</h1><section data-region="${regionId}" class="panel" style="padding:30px;height:340px">
      ${widths.map((width, index) => `<div class="row" style="margin:22px 0"><span class="caption" style="width:90px">${labels[index]}</span><div class="ink" style="height:42px;width:${width}%"></div></div>`).join('')}
    </section>`;
  }
  if (['orphan-legend', 'complete-legend', 'missing-legend-entry', 'annotation-no-legend'].includes(variant)) {
    const orphan = variant === 'orphan-legend';
    const missing = variant === 'missing-legend-entry';
    const annotation = variant === 'annotation-no-legend';
    const figureKinds = missing ? ['SERVICE', 'DECISION', 'DATA'] : ['SERVICE', 'DATA'];
    if (variant === 'complete-legend') figureKinds.push('CACHE');
    const legendKinds = orphan || variant === 'complete-legend'
      ? ['SERVICE', 'DATA', 'CACHE']
      : ['SERVICE', 'DATA'];
    return `<h1>${sceneHeading('diagram')}</h1><section data-region="${regionId}" class="panel" style="padding:34px;height:420px">
      <div class="row" style="justify-content:center;min-height:190px">
        ${figureKinds.map((kind, index) => `${index ? '<span class="arrow">→</span>' : ''}<div class="node"><strong>${kind}</strong><span class="muted">${index + 1}</span></div>`).join('')}
        ${annotation ? '<aside style="border:1px dashed #7e7b73;padding:16px;align-self:flex-start">Annotation: retry boundary</aside>' : ''}
      </div>
      <div class="rule" style="margin:18px 0"></div>
      <div class="row" style="justify-content:center">${legendKinds.map((kind) => `<span class="chip"><i style="display:inline-block;width:10px;height:10px;background:#22231f;margin-right:7px"></i>${kind}</span>`).join('')}</div>
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
  if (variant === 'invisible-dark-icons' || variant === 'quiet-watermark') {
    const broken = variant === 'invisible-dark-icons';
    return `<h1>${sceneHeading('preset')}</h1><section data-region="${regionId}" class="grid" style="grid-template-columns:1fr 1fr">
      ${['LIGHT', 'DARK'].map((mode, index) => {
        const dark = index === 1;
        const foreground = dark ? '#f6f3eb' : '#22231f';
        const iconColor = broken && dark ? '#22231f' : foreground;
        return `<div class="panel" style="height:330px;padding:24px;background:${dark ? '#22231f' : '#fffdf8'};color:${foreground}">
          <div class="caption" style="color:inherit">${mode}</div>
          <div class="row" style="margin-top:54px;justify-content:center">
            <span aria-label="load-bearing input icon" style="font-size:54px;line-height:1;color:${iconColor}">◆</span>
            <div><strong style="font-size:24px">Inputs</strong><p style="margin-top:6px;color:inherit">Route evidence</p></div>
          </div>
          <div class="row" style="margin-top:34px;justify-content:center">
            <span aria-hidden="true" style="font-size:42px;line-height:1;opacity:${broken ? 0.55 : 0.12}">◎</span>
            <div><strong style="font-size:24px">Results</strong><p style="margin-top:6px;color:inherit">Grounded finding</p></div>
          </div>
        </div>`;
      }).join('')}
    </section>`;
  }
  if (['many-surprises', 'one-surprise', 'many-grid-breaks', 'one-grid-break'].includes(variant)) {
    const many = variant.startsWith('many-');
    const gridBreak = variant.endsWith('grid-breaks') || variant === 'one-grid-break';
    return `<h1>${sceneHeading('preset')}</h1><section data-region="${regionId}" class="panel" style="height:470px;padding:30px;overflow:hidden">
      <div class="grid" style="grid-template-columns:repeat(3,1fr);align-items:start">
        ${['Capture', 'Review', 'Decision'].map((label, index) => `<article class="node" style="
          ${many ? `transform:translate(${index === 0 ? '-18' : index === 1 ? '14' : '28'}px,${index * 18}px) rotate(${index - 1}deg);` : index === 1 ? 'grid-column:span 2;transform:translateY(18px);' : ''}
          ${gridBreak ? 'border-width:2px;' : ''}
        "><strong>${label}</strong><span class="muted">${escapeHtml(evalCase.visible_text)}</span></article>`).join('')}
      </div>
      <div class="caption" style="margin-top:70px">${many ? 'Three unrelated elements leave the established grid.' : 'One decision deliberately breaks the established pattern.'}</div>
    </section>`;
  }
  const wrongMode = ['wrong-mode-panel', 'wrong-mode-background'].includes(variant);
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
  if (variant === 'relational-equation') {
    return `<h1>${sceneHeading('operating')}</h1><section data-region="${regionId}" class="panel" style="height:430px;padding:42px;display:grid;place-items:center">
      <div class="ink" style="padding:34px 46px;font:800 clamp(24px,3vw,42px)/1.1 ui-monospace,monospace">${escapeHtml(evalCase.visible_text)}</div>
    </section>`;
  }
  if (variant === 'routing-model') {
    return `<h1>${sceneHeading('operating')}</h1><section data-region="${regionId}" class="panel" style="height:430px;padding:34px">
      <div class="row" style="justify-content:center"><div class="node"><strong>Incoming review</strong><span class="muted">all eligible items</span></div><span class="arrow">→</span><div class="node ink"><strong>Policy router</strong><span>priority + deduplication</span></div></div>
      <div class="grid" style="grid-template-columns:repeat(4,1fr);margin:46px auto 0;max-width:1040px">${['Mandatory', 'Representative', 'Calibration', 'Frontier'].map((label) => `<div class="node"><strong>${label}</strong><span class="muted">explicit entry rule</span></div>`).join('')}</div>
    </section>`;
  }
  if (variant === 'closed-loop' || variant === 'one-way-loop') {
    const closed = variant === 'closed-loop';
    return `<h1>${sceneHeading('operating')}</h1><section data-region="${regionId}" class="panel" style="height:430px;padding:40px">
      <div class="row" style="justify-content:center">${labels.map((label, index) => `${index ? '<span class="arrow">→</span>' : ''}<div class="node"><strong>${escapeHtml(label)}</strong><span class="muted">stage ${index + 1}</span></div>`).join('')}</div>
      ${closed ? '<div style="margin:70px auto 0;max-width:700px;border:2px solid #22231f;border-top:0;height:70px;text-align:center;padding-top:42px" class="caption">outcomes ↩ calibration</div>' : '<div class="caption" style="margin-top:86px;text-align:center">No outcome path returns to calibration.</div>'}
    </section>`;
  }
  if (variant === 'provenance-trace' || variant === 'provenance-cards') {
    const trace = variant === 'provenance-trace';
    return `<h1>${sceneHeading('operating')}</h1><section data-region="${regionId}" class="panel" style="height:430px;padding:42px">
      <div class="${trace ? 'row' : 'grid'}" style="${trace ? 'justify-content:center' : 'grid-template-columns:repeat(3,1fr)'}">${['Source', 'Finding', 'Decision'].map((label, index) => `${trace && index ? '<span class="arrow">→</span>' : ''}<div class="node"><strong>${label}</strong><span class="muted">${trace ? 'trace R-184' : 'unlinked evidence'}</span></div>`).join('')}</div>
      <div class="caption" style="margin-top:72px;text-align:center">${trace ? 'R-184 binds every transformation.' : 'No identifier connects the cards.'}</div>
    </section>`;
  }
  if (variant === 'state-machine' || variant === 'state-badges') {
    const machine = variant === 'state-machine';
    if (machine) {
      return `<h1>${sceneHeading('operating')}</h1><section data-region="${regionId}" class="panel" style="height:430px;padding:42px">
        <div class="row" style="justify-content:center">
          <div class="node"><strong>Pending</strong><span class="muted">state 1</span></div>
          <span><span class="arrow">→</span><small class="caption">review complete</small></span>
          <div class="node"><strong>Reviewed</strong><span class="muted">state 2</span></div>
          <span><span class="arrow">→</span><small class="caption">reviewed only</small></span>
          <div class="node"><strong>Closed</strong><span class="muted">terminal</span></div>
        </div>
        <div class="row" style="justify-content:center;margin-top:70px">
          <span class="caption">Pending ↘</span>
          <div class="node ink"><strong>Escalated</strong><span>from pending or reviewed</span></div>
          <span class="caption">↙ Reviewed</span>
        </div>
      </section>`;
    }
    return `<h1>${sceneHeading('operating')}</h1><section data-region="${regionId}" class="panel" style="height:430px;padding:42px">
      <div class="grid" style="grid-template-columns:repeat(3,1fr)">${['Pending', 'Reviewed', 'Escalated'].map((label) => `<div class="node"><strong>${label}</strong><span class="muted">status only</span></div>`).join('')}</div>
    </section>`;
  }
  if (variant === 'workspace-surface' || variant === 'workspace-cards') {
    const surface = variant === 'workspace-surface';
    return `<h1>${sceneHeading('operating')}</h1><section data-region="${regionId}" class="panel" style="height:430px;padding:24px">
      <div class="grid" style="grid-template-columns:${surface ? '180px 1fr 220px' : 'repeat(3,1fr)'};height:100%">
        ${['Evidence', 'Hypotheses', 'Next actions'].map((label, index) => `<div class="${surface && index === 1 ? 'ink' : 'node'}" style="${surface ? 'padding:24px' : ''}"><strong>${label}</strong><p class="muted" style="margin-top:12px">${surface ? ['filterable queue', 'active investigation canvas', 'decision inspector'][index] : 'independent summary card'}</p></div>`).join('')}
      </div>
    </section>`;
  }
  return `<h1>${sceneHeading('operating')}</h1><section data-region="${regionId}" class="panel" style="height:430px;padding:36px">
    <div class="grid" style="grid-template-columns:repeat(${Math.min(labels.length, 4)},1fr)">${labels.map((label) => `<div class="node"><strong>${escapeHtml(label)}</strong><span class="muted">Independent item</span></div>`).join('')}</div>
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
