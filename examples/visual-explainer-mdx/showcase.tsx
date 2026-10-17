import React, { useEffect, useState } from 'react';
import { GraphicCanvas } from '../../visual-explainer-mdx/graphics';
import { DiffBlock } from '../../visual-explainer-mdx/code-blocks';
import { agentBeats, sampleAgent, sampleAttention, sampleReview, sampleWave, attentionWords, quantityBefore, quantityAfter } from './showcase-scenes';
import '../../visual-explainer-mdx/themes.css';
import './showcase.css';

type Mode = 'iso' | '3b1b' | 'mono-color' | 'algebrica';
const modes: { id: Mode; label: string }[] = [{ id: 'iso', label: 'ISO' }, { id: '3b1b', label: '3b1b' }, { id: 'mono-color', label: 'Mono Color' }, { id: 'algebrica', label: 'Algebrica' }];
const info = {
  iso: { title: 'How an agent uses a tool.', description: 'Follow a request through context, reasoning, execution, and review. The cyan mark follows the work; the workspace stays put.', command: 'artifacture add hairline motion authored-values --cwd ./explainer' },
  '3b1b': { title: 'Attention follows the query.', description: 'Seven words, seven key vectors, one changing query. The strongest connection emerges from the calculated weights.', command: 'artifacture add graphics grid-scene composition authored-values --cwd ./explainer' },
  'mono-color': { title: 'Zero isn’t missing.', description: 'A tiny defaulting operator can silently change a valid zero into one. Watch the value reach storage, then apply the fix.', command: 'artifacture add sequence-scene diff-block motion --cwd ./explainer' },
  algebrica: { title: 'A circle becomes a wave.', description: 'One angle drives both drawings. The vertical projection becomes the curve; there is no separate animation to synchronize.', command: 'artifacture add graphics plot-scene composition --cwd ./explainer' },
} satisfies Record<Mode, { title: string; description: string; command: string }>;

type Clip = { id: string; title: string; description: string; file: string; poster: string; captions?: string; duration: number };

export default function Showcase() {
  const [mode, setMode] = useState<Mode>('iso');
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [quantity, setQuantity] = useState('0');
  const [fixed, setFixed] = useState(false);
  const [clips, setClips] = useState<Clip[]>([]);
  const duration = mode === 'mono-color' ? 6 : 9;
  useEffect(() => {
    const media = window.matchMedia('(max-width: 680px)');
    const update = () => setNarrow(media.matches);
    update(); media.addEventListener('change', update);
    setPlaying(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    fetch('./clips/clips.json').then(response => response.ok ? response.json() : []).then(setClips).catch(() => setClips([]));
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const started = performance.now(), from = time;
    const tick = (now: number) => {
      const next = Math.min(duration, from + (now - started) / 1000);
      setTime(next);
      if (next < duration) frame = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    frame = requestAnimationFrame(tick);
    const hide = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', hide);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', hide); };
    // Authored time is captured once when playback starts; seeking pauses first.
  }, [playing, duration, mode]);
  const selectMode = (next: Mode) => {
    setPlaying(false); setMode(next); setTime(0);
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) setPlaying(true);
  };
  const agent = mode === 'iso' ? sampleAgent(time) : null;
  const attention = mode === '3b1b' ? sampleAttention(time, narrow) : null;
  const review = mode === 'mono-color' ? sampleReview(time, quantity, fixed) : null;
  const wave = mode === 'algebrica' ? sampleWave(time, narrow) : null;
  const scene = agent?.scene ?? attention?.scene ?? review?.scene ?? wave!.scene;
  return <main className="showcase-page">
    <nav className="showcase-navigation" aria-label="Artifacture previews"><a href="/showcase/" aria-current="page">Showcase</a><a href="/">Component catalog</a><a href="/iso/">ISO motion</a><a href="/reel/">Full reel</a><a href="/tutorial/">Worked tutorial</a></nav>
    <header className="showcase-intro"><h1>Watch the ideas work.</h1><p>Real compositions built from the shared library. Explore the mechanism, inspect the code, and watch excerpts from the videos.</p></header>
    <div className="showcase-modes" role="tablist" aria-label="Visual examples">{modes.map(item => <button type="button" role="tab" id={`tab-${item.id}`} aria-selected={mode === item.id} aria-controls="showcase-example" key={item.id} onClick={() => selectMode(item.id)}>{item.label}</button>)}</div>
    <section id="showcase-example" role="tabpanel" aria-labelledby={`tab-${mode}`} className={`showcase-example showcase-${mode}`} data-ve-preset={mode}>
      <div className="showcase-story"><h2>{info[mode].title}</h2><p>{info[mode].description}</p>
        {agent ? <ol className="agent-beats" aria-label="Agent workflow">{agentBeats.map((beat, i) => <li key={`${beat.time}`}><button type="button" aria-current={agent.beat === i ? 'step' : undefined} onClick={() => { setPlaying(false); setTime(beat.time); }}>{beat.label}</button></li>)}</ol> : null}
        {attention ? <div className="attention-explanation"><p className="showcase-equation">a = softmax(qKᵀ / √d)</p><p>The strongest weight is on <strong>“{attentionWords[attention.winner]}”</strong>: {attention.weights[attention.winner].toFixed(3)}.</p><p className="showcase-scope">This is a toy two-dimensional calculation, not an attention capture from a trained model.</p></div> : null}
        {review ? <div className="review-controls"><label>Request quantity <input aria-label="Request quantity" type="number" min="0" step="1" value={quantity} onChange={event => { setQuantity(event.target.value); setTime(0); setPlaying(false); }} /></label><button type="button" className="apply-fix" onClick={() => { setFixed(!fixed); setTime(0); setPlaying(true); }}>{fixed ? 'Restore the bug' : 'Apply the fix'}</button><p aria-live="polite">{review.evaluation.valid ? `Storage receives ${review.evaluation.result}.` : 'Invalid quantity: storage receives nothing.'}</p><DiffBlock before={quantityBefore} after={quantityAfter} language="ts" filename="save.ts" /></div> : null}
        {wave ? <div className="wave-explanation"><p className="showcase-equation">θ = {wave.theta.toFixed(2)} rad<br />y = sin θ = {wave.value.toFixed(2)}</p><p>The moving point and the growing trace use the same sine value.</p></div> : null}
        <details className="showcase-source"><summary>Use these blocks</summary><pre><code>{info[mode].command}</code></pre><p>Editable scene geometry and explicit authored time are shared with slide and video output.</p></details>
      </div>
      <div className="showcase-visual"><GraphicCanvas scene={scene} instancePrefix={`showcase-${mode}`} className="showcase-canvas" /><p className="showcase-caption" aria-live={playing ? 'off' : 'polite'}>{agent ? agentBeats[agent.beat].explanation : attention ? 'Change the query; every weight is recalculated and still sums to one.' : review ? fixed ? 'Nullish coalescing preserves a valid zero.' : 'Logical OR replaces zero because zero is falsy.' : 'The vertical component of the rotating vector draws the curve.'}</p>
        <div className="showcase-playback"><button type="button" onClick={() => { if (playing) setPlaying(false); else { if (time >= duration) setTime(0); setPlaying(true); } }}>{playing ? 'Pause' : time >= duration ? 'Replay' : 'Play'}</button><label>Explore time<input aria-label="Example time" type="range" min="0" max={duration} step="0.01" value={time} onChange={event => { setPlaying(false); setTime(Number(event.target.value)); }} /></label><output>{time.toFixed(1)} s</output></div>
      </div>
    </section>
    <section className="showcase-clips" id="clips"><h2>From the rendered videos.</h2><p>Short excerpts with the original Ainthony narration. These are encoded video, with captions and native playback controls.</p><div className="showcase-clip-grid">{clips.map(clip => <figure key={clip.id}><video controls playsInline preload="metadata" poster={`./clips/${clip.poster}`} src={`./clips/${clip.file}`}>{clip.captions ? <track kind="captions" src={`./clips/${clip.captions}`} label="English" srcLang="en" /> : null}</video><figcaption><h3>{clip.title}</h3><p>{clip.description}</p><a href={`./clips/${clip.file}`} download>Download clip</a></figcaption></figure>)}</div></section>
  </main>;
}
