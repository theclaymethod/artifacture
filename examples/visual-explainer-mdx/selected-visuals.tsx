import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { gsap } from 'gsap';
import { ModelView } from '../../visual-explainer-mdx/model-view';
import type { ModelSource, ModelTreatment } from '../../visual-explainer-mdx/model-types';
import { createLivingForm } from '../../visual-explainer-mdx/living-forms';
import { createProceduralProp } from '../../visual-explainer-mdx/procedural-models';
import { OrbitalText } from '../../visual-explainer-mdx/orbital-text';
import { TracePath } from '../../visual-explainer-mdx/trace-path';
import { createLofiPump } from './lofi-pump-model';
import '../../visual-explainer-mdx/themes.css';
import './component-catalog.css';
import './media-effects.css';
import './selected-visuals.css';

type SourceChoice = 'pump' | 'strata' | 'arbor' | 'resonance' | 'boundary-found' | 'fair-comparison' | 'ready-to-review' | 'dna';
const choices: readonly SourceChoice[] = ['pump', 'strata', 'arbor', 'resonance', 'boundary-found', 'fair-comparison', 'ready-to-review', 'dna'];
const names = { pump: 'Lo-fi pump', strata: 'Strata', arbor: 'Arbor', resonance: 'Resonance', 'boundary-found': 'Rounded star', 'fair-comparison': 'Equal balance', 'ready-to-review': 'Open trophy', dna: 'DNA GLB' };
const phrases = ['editable geometry', 'one source, many views', 'diagrams become motion', 'motion becomes a story'];
const dnaUrl = '../component-candidates/assets/dna.glb';
const pipelineRoute = 'M120 115 C190 15 250 15 320 115 S450 215 520 115 S650 15 720 115';
function sourceFor(choice: SourceChoice): ModelSource {
  if (choice === 'pump') return createLofiPump;
  if (choice === 'strata' || choice === 'arbor' || choice === 'resonance') return createLivingForm(choice);
  if (choice === 'dna') return { kind: 'gltf', src: dnaUrl };
  return createProceduralProp(choice);
}
function pointImage() {
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 400;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image point preview needs Canvas 2D.');
  context.strokeStyle = '#079fba'; context.lineWidth = 10; context.lineCap = 'round';
  context.beginPath(); context.moveTo(75, 255); context.bezierCurveTo(185, 80, 455, 80, 565, 255); context.stroke();
  context.fillStyle = '#65717b';
  for (let index = 0; index < 7; index++) {
    const height = 40 + index * 14;
    context.fillRect(112 + index * 61, 305 - height, 34, height);
  }
  return canvas;
}

export default function SelectedVisuals() {
  const [theme, setTheme] = useState('iso'), [choice, setChoice] = useState<SourceChoice>('pump');
  const [seconds, setSeconds] = useState(1.35), [playing, setPlaying] = useState(false), [mode, setMode] = useState<'shaded' | 'shape-ascii' | 'particles'>('shape-ascii');
  const [palette, setPalette] = useState({ background: '#fff', ink: '#202127', accent: '#079fba' });
  const [cellSize, setCellSize] = useState(9), [spread, setSpread] = useState(0), [url, setUrl] = useState('');
  const [compare, setCompare] = useState(false);
  const [count, setCount] = useState(14_000), [pointSize, setPointSize] = useState(1.8);
  const [external, setExternal] = useState<string>(), [image, setImage] = useState<HTMLCanvasElement>();
  const root = useRef<HTMLElement>(null), clock = useRef<gsap.core.Timeline | null>(null);
  const source = useMemo(() => external ? { kind: 'gltf' as const, src: external } : sourceFor(choice), [choice, external]);
  const imageSource = useMemo<ModelSource | undefined>(() => image ? { kind: 'image', image } : undefined, [image]);
  const modelPalette = mode === 'shaded' ? { ...palette, ink: theme === '3b1b' ? '#b9c0c6' : '#a4acb3' } : palette;
  const treatment: ModelTreatment = mode === 'shape-ascii' ? { treatment: mode, ascii: { cellSize, invert: theme !== '3b1b' && choice !== 'dna' && !external } } : mode === 'particles' ? { treatment: mode, particles: { count, seed: 41, pointSize, spread } } : { treatment: mode };
  useLayoutEffect(() => {
    if (!root.current) return;
    const paint = getComputedStyle(root.current);
    setPalette({ background: paint.getPropertyValue('--ve-bg').trim(), ink: paint.getPropertyValue('--ve-text').trim(), accent: paint.getPropertyValue('--ve-accent').trim() });
  }, [theme]);
  useEffect(() => {
    setImage(pointImage());
    const position = { seconds: 0 };
    const timeline = gsap.timeline({ paused: true, repeat: -1, onUpdate: () => flushSync(() => setSeconds(position.seconds)) });
    timeline.to(position, { seconds: 6, duration: 6, ease: 'none' }); timeline.seek(1.35); clock.current = timeline;
    return () => { timeline.kill(); clock.current = null; };
  }, []);
  function downloadFrame() {
    const canvas = root.current?.querySelector<HTMLCanvasElement>('canvas[aria-label="Selected model preview"]');
    if (!canvas || canvas.dataset.veRenderedSeconds !== String(seconds)) return;
    const link = document.createElement('a'); link.href = canvas.toDataURL('image/png'); link.download = `selected-${choice}-${mode}-${seconds.toFixed(2)}s.png`; link.click();
  }
  return <main ref={root} className="component-catalog effects-gallery selected-gallery" data-ve-preset={theme} data-ve-appearance={theme === '3b1b' ? 'dark' : 'light'}>
    <header><h1>One model. Many visual languages.</h1><p>Your selected components, rebuilt as reusable blocks. Change the model, treatment and theme; every view follows the same authored time.</p></header>
    <div className="catalog-controls effect-controls">
      <label>Theme <select value={theme} onChange={event => setTheme(event.target.value)}><option value="iso">ISO</option><option value="3b1b">3b1b</option><option value="mono-color">Mono Color</option><option value="algebrica">Algebrica</option></select></label>
      <button type="button" onClick={() => { if (playing) clock.current?.pause(); else clock.current?.play(); setPlaying(!playing); }}>{playing ? 'Pause' : 'Play'}</button>
      <label>Time <input aria-label="Visual time" type="range" min="0" max="6" step="0.01" value={seconds} onChange={event => { clock.current?.pause().seek(Number(event.target.value), false); setPlaying(false); }} /><output>{seconds.toFixed(2)}s</output></label>
    </div>
    <section><h2>Geometry, glyphs, points.</h2><p>A factory preserves named parts and their motion. Strata, Arbor and Resonance are visual metaphors; the soft props settle into a stable pose. The GLB option loads actual geometry.</p>
      <div className="catalog-controls"><label>Model <select value={choice} onChange={event => { const value = event.target.value; const selected = choices.find(item => item === value); if (selected) { setChoice(selected); setExternal(undefined); } }}>{choices.map(item => <option key={item} value={item}>{names[item]}</option>)}</select></label><label>Treatment <select value={mode} onChange={event => { const value = event.target.value; if (value === 'shaded' || value === 'shape-ascii' || value === 'particles') setMode(value); }}><option value="shaded">Shaded</option><option value="shape-ascii">Shape-aware ASCII</option><option value="particles">Point cloud</option></select></label>
        {mode === 'shape-ascii' ? <label>Cell height <input aria-label="Glyph cell height" type="range" min="6" max="18" value={cellSize} onChange={event => setCellSize(Number(event.target.value))} /><output>{cellSize}px</output></label> : null}
        {mode === 'particles' ? <><label>Point count <input aria-label="Point count" type="range" min="1000" max="24000" step="1000" value={count} onChange={event => setCount(Number(event.target.value))} /><output>{count.toLocaleString()}</output></label><label>Point size <input aria-label="Point size" type="range" min=".5" max="6" step=".1" value={pointSize} onChange={event => setPointSize(Number(event.target.value))} /><output>{pointSize.toFixed(1)}px</output></label><label>Spread <input aria-label="Particle spread" type="range" min="0" max="2" step="0.01" value={spread} onChange={event => setSpread(Number(event.target.value))} /><output>{spread.toFixed(2)}</output></label></> : null}
      </div>
      <ModelView {...treatment} source={source} seconds={seconds} palette={modelPalette} label="Selected model preview" className="effect-stage" />
      <button type="button" onClick={downloadFrame}>Download model frame</button>
      <label className="frozen-control"><input type="checkbox" checked={compare} onChange={event => setCompare(event.target.checked)} />Compare with the same source at 0s</label>
      {compare ? <ModelView {...treatment} source={source} seconds={0} palette={modelPalette} label="Frozen model preview" className="effect-stage" /> : null}
      <form className="model-form" onSubmit={event => { event.preventDefault(); if (url.trim()) setExternal(url.trim()); }}><label>GLB URL <input type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://your-host/model.glb" /></label><button type="submit">Load model</button></form>
      <details><summary>Copy and compose</summary><pre><code>{`artifacture add shape-ascii particle-object living-forms procedural-props\n\nconst source = createLivingForm('arbor');\n<ModelView source={source} seconds={seconds}\n  treatment="shape-ascii" palette={palette} label="Branching process" />\n\n// A generated img2threejs factory uses the same boundary:\nconst source = () => modelAsset(createPumpModel(spec));`}</code></pre></details>
    </section>
    <section><h2>Images become a surface.</h2><p>Points follow visible alpha coverage, including dark pixels. This is an original sampler with deterministic placement and direct-time spread.</p>
      {imageSource ? <ModelView source={imageSource} treatment="particles" particles={{ count: 10_000, seed: 19, pointSize: 2.1, spread: 0.45 * Math.sin(seconds / 6 * Math.PI) }} seconds={seconds} rotationSpeed={0} palette={palette} label="Image sampled into circular points" className="effect-stage" /> : null}
    </section>
    <section><h2>Type moves through a field.</h2><p>Orbital phrases stay as SVG text. One ring receives the accent; alternating rings move from absolute seconds.</p><OrbitalText phrases={phrases} seconds={seconds} palette={palette} label="Orbital typography for the reusable pipeline" className="effect-stage" /><details><summary>Copy and compose</summary><pre><code>{`artifacture add orbital-text\n\n<OrbitalText phrases={phrases} seconds={seconds}\n  palette={palette} label="Review cycle" />`}</code></pre></details></section>
    <section><h2>Connect the stages.</h2><p>TracePath reveals an ordinary SVG curve from progress. Use the existing reveal track when the path belongs to a GraphicScene.</p>
      <svg className="effect-stage trace-preview" viewBox="0 0 960 270" role="img" aria-label="Graphics connect to diagrams, slides and video"><rect width="960" height="270" fill={palette.background} /><g fill="none" stroke={palette.ink} strokeOpacity=".25" strokeWidth="1"><path d={pipelineRoute} /></g><TracePath d={pipelineRoute} progress={seconds / 6} stroke={palette.accent} strokeWidth="1.5" fill="none" strokeLinecap="round" />{['Graphics', 'Diagrams', 'Slides', 'Video'].map((text, index) => <g key={text}><circle cx={120 + index * 200} cy="115" r="7" fill={palette.background} stroke={palette.ink} strokeWidth="1" /><text x={120 + index * 200} y="176" textAnchor="middle" fill={palette.ink} fontFamily="var(--ve-font-body)" fontSize="19">{text}</text></g>)}</svg>
      <details><summary>Copy and compose</summary><pre><code>{`artifacture add trace-path\n\n<svg viewBox="0 0 960 270">\n  <TracePath d={route} progress={progress}\n    stroke={palette.accent} fill="none" />\n</svg>`}</code></pre></details>
    </section>
    <section><h2>Author a model once.</h2><p>img2threejs is available globally for reference-based low-detail modeling. Keep its sculpt spec, semantic parts and review evidence; connect the resulting factory here. The pump above is a hand-authored example of that factory boundary.</p><a href="../media-effects/">ASCII sweep, media sampling and VHS effects</a><p><a href="../component-candidates/">Original component selection gallery</a></p></section>
  </main>;
}
