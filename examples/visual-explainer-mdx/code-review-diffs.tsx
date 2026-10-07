import { useEffect, useRef, useState } from 'react';
import { GraphicCanvas } from '../../visual-explainer-mdx/graphics';
import { sampleScene } from '../../visual-explainer-mdx/graphic-motion';
import { split, splitMotion, unified, unifiedMotion, edit, reverse, duration } from './code-review-diffs-source';
import '../../visual-explainer-mdx/themes.css';
import './code-review-diffs.css';

export default function CodeReviewDiffGallery() {
  const [time, setTime] = useState(0), [playing, setPlaying] = useState(false), [theme, setTheme] = useState('iso');
  const raf = useRef(0), anchor = useRef({ time: 0, now: 0 });
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) setTime(duration);
    return () => cancelAnimationFrame(raf.current);
  }, []);
  const pause = () => { cancelAnimationFrame(raf.current); setPlaying(false); };
  const seek = (at: number) => { pause(); setTime(at); };
  const play = () => {
    cancelAnimationFrame(raf.current);
    anchor.current = { time: time >= duration ? 0 : time, now: performance.now() };
    setPlaying(true);
    const tick = (now: number) => {
      const at = Math.min(duration, anchor.current.time + (now - anchor.current.now) / 1000);
      setTime(at);
      if (at < duration) raf.current = requestAnimationFrame(tick); else setPlaying(false);
    };
    raf.current = requestAnimationFrame(tick);
  };
  return <main className="review-diff-gallery" data-ve-preset={theme} data-ve-appearance={theme === '3b1b' ? 'dark' : 'light'}>
    <header><h1>Show exactly what changed.</h1><p>Keep the context. Focus the condition. Let unchanged code carry the viewer through the edit.</p></header>
    <div className="review-diff-controls"><button onClick={playing ? pause : play}>{playing ? 'Pause' : 'Play'}</button><button onClick={() => seek(0)}>Before</button><button onClick={() => seek(4.2)}>After</button><label>Time <input aria-label="Authored seconds" type="range" min="0" max={duration} step="any" value={time} onChange={event => seek(Number(event.target.value))} /><output>{time.toFixed(2)} s</output></label><label>Theme <select value={theme} onChange={event => setTheme(event.target.value)}><option value="iso">ISO</option><option value="3b1b">3b1b</option><option value="mono-color">Mono Color</option><option value="algebrica">Algebrica</option></select></label></div>
    <section><h2>Keep the versions aligned.</h2><p>Insertions leave a real gap. The two versions share a row, and inline marks isolate the changed words. Focus follows the selected change.</p><div className="review-diff-figure review-diff-wide"><GraphicCanvas scene={sampleScene(split.scene, splitMotion, time)} /></div></section>
    <div className="review-diff-pair"><section><h2>Watch the code become the fix.</h2><p>Retiring tokens clear first. Retained characters move into place. New tokens arrive after that space is clear.</p><div className="review-diff-figure"><GraphicCanvas scene={sampleScene(edit.scene, edit.motion, time)} /></div></section><section><h2>Read the change in context.</h2><p>Unified rows keep source line numbers. Folds report the exact number of unchanged lines they omit.</p><div className="review-diff-figure"><GraphicCanvas scene={sampleScene(unified.scene, unifiedMotion, time)} /></div></section></div>
    <section className="review-diff-reverse"><div><h2>Rewind the argument.</h2><p>A reverse edit uses the same identities. All views sample absolute time; seeking backward reproduces the earlier state.</p><code>artifacture add code-diff</code></div><div className="review-diff-figure"><GraphicCanvas scene={sampleScene(reverse.scene, reverse.motion, time)} /></div></section>
    <section><h2>Put the edit beside its consequence.</h2><p>The same scene becomes a review clip: a cached zero, the changed condition, and the resulting decision.</p><video controls playsInline preload="metadata" poster="./diff-review.jpg" src="./diff-review.mp4" aria-label="Code review motion specimen" /></section>
    <footer><p>This is an illustrative cache reader. The line origins and filename belong to the authored example. Its predicate is the mechanism; no application performance claim is implied.</p><a href="./diff-review.mp4">Download the motion specimen</a></footer>
  </main>;
}
