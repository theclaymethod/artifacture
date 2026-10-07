import { useEffect, useRef, useState } from 'react';
import { GraphicCanvas } from '../../visual-explainer-mdx/graphics';
import { sampleScene } from '../../visual-explainer-mdx/graphic-motion';
import { scene, motion, duration } from './iso-source';
import '../../visual-explainer-mdx/themes.css';
import './iso.css';

export default function IsoGallery() {
  const [time, setTime] = useState(2.4), [dark, setDark] = useState(true), [playing, setPlaying] = useState(false);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const pause = () => { cancelAnimationFrame(raf.current); setPlaying(false); };
  const seek = (at: number) => { pause(); setTime(at); };
  const play = () => {
    pause();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setTime(2.4); return; }
    const start = performance.now(); setTime(0); setPlaying(true);
    const tick = (now: number) => { const at = Math.min(duration, (now - start) / 1000); setTime(at); if (at < duration) raf.current = requestAnimationFrame(tick); else setPlaying(false); };
    raf.current = requestAnimationFrame(tick);
  };
  return <main className="iso-gallery" data-ve-preset="iso" data-ve-appearance={dark ? 'dark' : 'light'}>
    <header><h1>Light follows the signal.</h1><p>ISO combines fine linework, projected face details and one active accent. The same scene supplies a diagram, a slide and an animated video.</p></header>
    <div className="iso-controls"><button onClick={playing ? pause : play}>{playing ? 'Pause' : 'Replay the circuit'}</button><button onClick={() => seek(time >= 2 && time < 4 ? 0 : 2.4)}>Switch power</button><button onClick={() => setDark(!dark)}>{dark ? 'Light appearance' : 'Dark appearance'}</button><label>Time <input aria-label="Authored seconds" type="range" min="0" max={duration} step="any" value={time} onChange={e => seek(Number(e.target.value))} /><output>{time.toFixed(2)} s</output></label></div>
    <figure><GraphicCanvas scene={sampleScene(scene, motion, time)} /></figure>
    <section><h2>Build it from reusable parts.</h2><p>Three face planes carry windows and vents. The receiver lights when the shared signal reaches it. Motionmaxxing curves shape the landing, press, travel and departure; explicit time reproduces every state when you rewind.</p><pre><code>artifacture add iso motion-eases motion</code></pre></section>
    <section><h2>Watch the encoded scene.</h2><video controls playsInline preload="metadata" src="./iso-native.mp4" aria-label="ISO circuit motion video" /><p><a href="./browser/">Open the same sequence in the browser renderer</a></p></section>
  </main>;
}
