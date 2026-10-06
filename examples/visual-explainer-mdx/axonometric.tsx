import React, { useState } from 'react';
import { GraphicCanvas } from '../../visual-explainer-mdx/graphics';
import { sampleScene } from '../../visual-explainer-mdx/graphic-motion';
import themes from '../../visual-explainer-mdx/themes.css?raw';
import { planScenes, explodedScenes } from './axonometric-source';

export default function AxonometricGallery() {
  const [time, setTime] = useState(4), [theme, setTheme] = useState('hairline');
  return <><style>{themes + `
    body { margin: 0; } main { max-width: 900px; margin: auto; padding: 32px 20px; font-family: var(--ve-font-body, system-ui); background: var(--ve-bg); color: var(--ve-text); }
    h1 { font-size: 36px; } h2 { font-size: 26px; margin: 48px 0 12px; } p { font-size: 18px; line-height: 1.6; } label { font-size: 16px; } select, input { margin: 8px; } svg { display: block; height: auto; }
    .print-frame { display: none; } @media print { .controls, .sample-frame { display: none; } .print-frame { display: block; } }
  `}</style><main data-ve-preset={theme} data-ve-appearance={theme === '3b1b' ? 'dark' : 'light'}>
    <h1>Axonometric plans and exploded views</h1>
    <p>Model coordinates produce editable, shaded SVG. Scrub from the assembled state to the completed diagram; the same scene can travel into a poster, slide or video.</p>
    <div className="controls"><label>Theme <select value={theme} onChange={e => setTheme(e.target.value)}>{['hairline', '3b1b', 'mono-color', 'algebrica'].map(value => <option key={value}>{value}</option>)}</select></label><label>Time <input type="range" min="0" max="4" step="0.01" value={time} onChange={e => setTime(Number(e.target.value))} /></label><output>{time.toFixed(2)} / 4.00 s</output></div>
    {[...planScenes, ...explodedScenes].map(({ input, scene, motion }) => <section key={input.id}>
      <h2>{input.title}</h2><p>{input.description}</p>
      <div className="sample-frame"><GraphicCanvas scene={sampleScene(scene, motion, time)} style={{ maxWidth: 600, margin: 'auto' }} /></div>
      <div className="print-frame"><GraphicCanvas scene={scene} /></div>
    </section>)}
    <p>Adapted from <a href="https://github.com/cathrynlavery/diagram-design">Cathryn Lavery’s diagram-design</a> (MIT). All examples are illustrative.</p>
  </main></>;
}
