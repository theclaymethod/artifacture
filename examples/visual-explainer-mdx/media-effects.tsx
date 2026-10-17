import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { flushSync } from 'react-dom';
import { AsciiImage, AsciiSweep } from '../../visual-explainer-mdx/ascii-effects';
import { AsciiObject, type AsciiModel } from '../../visual-explainer-mdx/ascii-object';
import { VhsEffect } from '../../visual-explainer-mdx/vhs-effect';
import type { AsciiPalette } from '../../visual-explainer-mdx/ascii-frame';
import '../../visual-explainer-mdx/themes.css';
import './component-catalog.css';
import './media-effects.css';

function illustration(palette: AsciiPalette, assembled: boolean) {
  const nodes = assembled ? [[315, 228], [480, 142], [645, 228], [480, 315]] : [[230, 270], [395, 230], [560, 190], [725, 150]];
  const blocks = nodes.map(([x, y], i) => {
    const z = 34 + i * 16, active = i === 2, stroke = active ? palette.accent : palette.ink;
    return `<g transform="translate(${x},${y})" stroke="${stroke}" stroke-width="1.15" stroke-linejoin="round"><path fill="${palette.background}" d="M-56,0 0,-30 56,0 56,${z} 0,${z + 30} -56,${z}Z"/><path fill="${active ? palette.accent : palette.background}" fill-opacity="${active ? '.14' : '1'}" d="M-56,0 0,-30 56,0 0,30Z"/><path fill="none" d="M-56,0 0,30 56,0 M0,30V${z + 30}"/></g>`;
  }).join('');
  const links = assembled ? '<path d="M315,270 480,357 645,270 M480,185 645,270 M315,270 480,185"/>' : '<path d="M160,340 790,180 M160,356 790,196"/>';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><rect width="960" height="540" fill="${palette.background}"/><g fill="none" stroke="${palette.ink}" stroke-width=".85" opacity=".45">${links}<ellipse cx="480" cy="300" rx="335" ry="152"/></g>${blocks}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export default function MediaEffectsGallery() {
  const [preset, setPreset] = useState('iso'), [seconds, setSeconds] = useState(1.35), [playing, setPlaying] = useState(false);
  const [palette, setPalette] = useState<AsciiPalette>({ background: '#ffffff', ink: '#202127', accent: '#079fba' });
  const [geometry, setGeometry] = useState<'torus-knot' | 'icosahedron' | 'blocks'>('torus-knot'), [ascii, setAscii] = useState(true);
  const [modelUrl, setModelUrl] = useState(''), [model, setModel] = useState<AsciiModel>({ kind: 'geometry', geometry: 'torus-knot' });
  const [cells, setCells] = useState(10), [strength, setStrength] = useState(0.55);
  const root = useRef<HTMLElement>(null), timeline = useRef<gsap.core.Timeline | null>(null);
  function downloadFrame(label: string, name: string) {
    const canvas = root.current?.querySelector<HTMLCanvasElement>(`canvas[aria-label="${label}"]`);
    if (!canvas) return;
    const link = document.createElement('a'); link.href = canvas.toDataURL('image/png'); link.download = `${name}-${seconds.toFixed(2)}s.png`; link.click();
  }
  useLayoutEffect(() => {
    if (!root.current) return;
    const paint = getComputedStyle(root.current);
    setPalette({ background: paint.getPropertyValue('--ve-bg').trim(), ink: paint.getPropertyValue('--ve-text').trim(), accent: paint.getPropertyValue('--ve-accent').trim() });
  }, [preset]);
  useEffect(() => {
    const clock = { seconds: 0 };
    const controller = gsap.timeline({ paused: true, repeat: -1, onUpdate: () => flushSync(() => setSeconds(clock.seconds)) });
    controller.to(clock, { seconds: 6, duration: 6, ease: 'none' }); controller.seek(1.35); timeline.current = controller;
    return () => { controller.kill(); timeline.current = null; };
  }, []);
  const from = illustration(palette, false), to = illustration(palette, true), progress = seconds / 6;
  return <main ref={root} className="component-catalog effects-gallery" data-ve-preset={preset} data-ve-appearance={preset === '3b1b' ? 'dark' : 'light'}>
    <header><h1>Shape, texture, motion.</h1><p>Reusable media effects with a shared palette and a caller-controlled clock. Scrub forward or backward to compare the same pose.</p></header>
    <div className="catalog-controls effect-controls">
      <label>Theme <select value={preset} onChange={event => setPreset(event.target.value)}><option value="iso">ISO</option><option value="3b1b">3b1b</option><option value="mono-color">Mono Color</option><option value="algebrica">Algebrica</option></select></label>
      <button type="button" onClick={() => { if (playing) timeline.current?.pause(); else timeline.current?.play(); setPlaying(!playing); }}>{playing ? 'Pause' : 'Play'}</button>
      <label>Time <input aria-label="Effect time" type="range" min="0" max="6" step="0.01" value={seconds} onChange={event => { timeline.current?.pause().seek(Number(event.target.value), false); setPlaying(false); }} /><output>{seconds.toFixed(2)}s</output></label>
    </div>
    <section><h2>Models as glyphs.</h2><p>A shaded 3D source becomes a two-ink illustration. Import an uncompressed GLB, or compare the prepared geometries.</p>
      <div className="catalog-controls"><label>Geometry <select value={geometry} onChange={event => { const value = event.target.value; if (value === 'torus-knot' || value === 'icosahedron' || value === 'blocks') { setGeometry(value); setModel({ kind: 'geometry', geometry: value }); } }}><option value="torus-knot">Torus knot</option><option value="icosahedron">Icosahedron</option><option value="blocks">Blocks</option></select></label><label><input type="checkbox" checked={ascii} onChange={event => setAscii(event.target.checked)} />ASCII output</label><label>Cell height <input aria-label="ASCII cell height" type="range" min="6" max="24" value={cells} onChange={event => setCells(Number(event.target.value))} /><output>{cells}px</output></label></div>
      <AsciiObject model={model} seconds={seconds} ascii={ascii} label="Rotating model rendered as ASCII glyphs" palette={palette} cellSize={cells} className="effect-stage" />
      <button type="button" onClick={() => downloadFrame('Rotating model rendered as ASCII glyphs', 'model')}>Download model frame</button>
      <form className="model-form" onSubmit={event => { event.preventDefault(); if (modelUrl.trim()) setModel({ kind: 'gltf', src: modelUrl.trim() }); }}><label>GLB URL <input type="url" value={modelUrl} placeholder="https://your-host/model.glb" onChange={event => setModelUrl(event.target.value)} /></label><button type="submit">Load model</button></form>
      <details><summary>Copy and compose</summary><pre><code>{`artifacture add ascii-object\n\n<AsciiObject model={{ kind: 'gltf', src: '/model.glb' }}\n  seconds={seconds} label="Assembly turntable"\n  palette={palette} cellSize={10} />`}</code></pre></details>
    </section>
    <section><h2>Assemble through a glyph band.</h2><p>A seeded boundary reveals a second illustration. Both endpoints retain the original pixels.</p><AsciiSweep from={from} to={to} progress={progress} label="Illustration sweep between a line and an assembly" palette={palette} invert={preset !== '3b1b'} cellSize={cells} className="effect-stage" /><button type="button" onClick={() => downloadFrame('Illustration sweep between a line and an assembly', 'sweep')}>Download sweep frame</button><details><summary>Copy and compose</summary><pre><code>{`artifacture add ascii-sweep\n\n<AsciiSweep from={firstImage} to={secondImage}\n  progress={progress} label="Assembly reveal"\n  palette={palette} invert />`}</code></pre></details></section>
    <section><h2>One image, a glyph vocabulary.</h2><p>The shared luminance sampler also works without motion. Diagram geometry stays editable in its source; this is a sampled presentation layer.</p><AsciiImage source={to} seconds={seconds} label="Assembly illustration rendered as ASCII" palette={palette} invert={preset !== '3b1b'} cellSize={cells} className="effect-stage" /></section>
    <section><h2>A touch of analogue texture.</h2><p>Use row drift, scanlines, grain and channel separation on footage. Keep teaching labels and captions outside the filtered image.</p><div className="catalog-controls"><label>Strength <input aria-label="VHS strength" type="range" min="0" max="1" step="0.01" value={strength} onChange={event => setStrength(Number(event.target.value))} /><output>{strength.toFixed(2)}</output></label></div><VhsEffect source={to} seconds={seconds} strength={strength} label="Illustration with an analogue texture filter" background={palette.background} className="effect-stage" /><button type="button" onClick={() => downloadFrame('Illustration with an analogue texture filter', 'vhs')}>Download VHS frame</button><details><summary>Copy and compose</summary><pre><code>{`artifacture add vhs\n\n<VhsEffect source={decodedVideoCanvas} seconds={seconds}\n  label="Archive footage" strength={0.35} />\n<p>Unfiltered teaching caption.</p>`}</code></pre></details></section>
    <section><h2>Choose the next components.</h2><p>The separate research gallery contains the shape-aware renderer, procedural forms and other visuals found in f-explainer.</p><a href="../component-candidates/">Open the candidate gallery</a></section>
  </main>;
}
