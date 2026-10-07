import { useEffect, useRef, useState } from 'react';
import { GraphicCanvas } from '../../visual-explainer-mdx/graphics';
import { sampleScene } from '../../visual-explainer-mdx/graphic-motion';
import { PunctumReadout, awaitPunctumFont } from '../../visual-explainer-mdx/punctum-readout';
import { synthesizeScanWav } from '../../visual-explainer-mdx/scan-audio';
import { descender, roll, scan, duration } from './punctum-source';
import fontLicense from '../../visual-explainer-mdx/punctum/OFL.txt?raw';
import '../../visual-explainer-mdx/themes.css';
import './punctum.css';

export default function PunctumGallery() {
  const [preset, setPreset] = useState('iso'), [time, setTime] = useState(0);
  const [weight, setWeight] = useState(400), [roundness, setRoundness] = useState(100);
  const [sound, setSound] = useState<string>(), [fontReady, setFontReady] = useState(false), [error, setError] = useState('');
  const audio = useRef<HTMLAudioElement>(null), raf = useRef<number>(0);
  const stop = () => { cancelAnimationFrame(raf.current); };
  useEffect(() => {
    const wav = synthesizeScanWav(scan.events, { duration });
    const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
    setSound(url);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) setTime(duration);
    let active = true;
    awaitPunctumFont('Build once.').then(() => { if (active) setFontReady(true); }).catch(reason => { if (active) setError(String(reason)); });
    return () => { active = false; cancelAnimationFrame(raf.current); URL.revokeObjectURL(url); };
  }, []);
  const followAudio = () => {
    stop();
    const follow = () => { if (!audio.current) return; setTime(audio.current.currentTime); if (!audio.current.paused) raf.current = requestAnimationFrame(follow); };
    follow();
  };
  const play = async (muted: boolean) => {
    if (!audio.current) return;
    audio.current.muted = muted;
    audio.current.currentTime = time >= duration - .01 ? 0 : time;
    try { await audio.current.play(); } catch (reason) { setError(String(reason)); }
  };
  const seek = (seconds: number) => { audio.current?.pause(); if (audio.current) audio.current.currentTime = seconds; setTime(seconds); };
  return <main className="punctum-gallery" data-ve-preset={preset} data-ve-appearance={preset === '3b1b' ? 'dark' : 'light'}>
    <header><h1>Messages, built from dots.</h1><p>One grid becomes a diagram, an animation, a slide, or a video. Change its state. Keep its identity.</p></header>
    <div className="punctum-controls"><label>Theme <select value={preset} onChange={event => setPreset(event.target.value)}><option value="iso">ISO</option><option value="3b1b">3b1b</option><option value="mono-color">Mono Color</option><option value="algebrica">Algebrica</option></select></label><button onClick={() => play(true)} disabled={!sound}>Play motion</button><button onClick={() => play(false)} disabled={!sound}>Play with scan sound</button><button onClick={() => audio.current?.pause()}>Pause</button><button onClick={() => seek(duration)}>Final state</button><label className="punctum-time">Time <input aria-label="Authored seconds" type="range" min="0" max={duration} step="any" value={time} onChange={event => seek(Number(event.target.value))} /><output>{time.toFixed(2)} s</output></label></div>
    <audio ref={audio} src={sound} preload="auto" onPlay={followAudio} onPause={stop} onEnded={() => { stop(); setTime(duration); }} />
    {error && <p role="alert">{error}</p>}
    <section className="punctum-message"><GraphicCanvas scene={sampleScene(roll.scene, roll.motion, time)} /><div><h2>Change the message.</h2><p>A finite character roll reuses every dot. It keeps unchanged characters still and lands on the exact final text.</p><code>artifacture add character-roll</code></div></section>
    <section className="punctum-signal"><h2>Read it one column at a time.</h2><p>The accented column lights the cells that produce each sound. Picture and audio use the same events; playback follows the audio clock.</p><GraphicCanvas scene={sampleScene(scan.scene, scan.motion, time)} /><code>artifacture add column-scan</code>{sound && <a href={sound} download="punctum-scan.wav">Download the generated sound</a>}</section>
    <div className="punctum-pair"><section><h2>Keep the whole glyph.</h2><GraphicCanvas scene={descender} /><p>Five columns, nine rows. The accent shows the lowercase descender that a seven-row grid would lose.</p><code>artifacture add dot-matrix-scene</code></section><section><h2>Use the actual typeface.</h2><div className="punctum-font" data-font-ready={fontReady}><PunctumReadout text="Build once." weight={weight} roundness={roundness} size={48} /></div><label>Dot size <input aria-label="Font weight" type="range" min="100" max="900" value={weight} onChange={event => setWeight(Number(event.target.value))} /><output>{weight}</output></label><label>Roundness <input aria-label="Font roundness" type="range" min="0" max="100" value={roundness} onChange={event => setRoundness(Number(event.target.value))} /><output>{roundness}</output></label><p>The bundled variable font is for short readouts. Prose, captions, code, and mathematics keep their existing fonts.</p><code>artifacture add punctum-readout</code></section></div>
    <footer><p>The <a href="https://github.com/sundyme/punctum">Punctum font and glyph data</a> are bundled under SIL OFL 1.1. The reusable scene, motion, and audio adapters are Artifacture source.</p><details><summary>Punctum font license</summary><pre>{fontLicense}</pre></details></footer>
  </main>;
}
