import React, { useState } from 'react';
import { DagCanvas } from '../../visual-explainer-mdx/dag-canvas';
import { GraphicCanvas } from '../../visual-explainer-mdx/graphics';
import { sampleScene } from '../../visual-explainer-mdx/graphic-motion';
import { createDagDiagram } from '../../visual-explainer-mdx/dag-scene';
import { dagInput, dag, motion } from './dag-source';
import '../../visual-explainer-mdx/themes.css';
import './component-catalog.css';

const diagram = createDagDiagram(dagInput, 'vertical');
export default function DagExample() {
  const [preset, setPreset] = useState('hairline');
  const [scope, setScope] = useState<'neighbors' | 'lineage'>('neighbors');
  const [time, setTime] = useState(motion.duration);
  return <main className="component-catalog" data-ve-preset={preset} data-ve-theme={preset === '3b1b' ? 'dark' : 'light'}>
    <header><h1>Trace the dependencies.</h1><p>A compact DAG with multi-parent merges. Hover, focus, or select an item to see what it needs and what uses it.</p></header>
    <div className="catalog-controls"><label>Theme <select value={preset} onChange={event => setPreset(event.target.value)}><option value="hairline">Hairline</option><option value="3b1b">3b1b</option><option value="mono-color">Mono Color</option><option value="algebrica">Algebrica</option></select></label><label>Trace <select value={scope} onChange={event => setScope(event.target.value === 'lineage' ? 'lineage' : 'neighbors')}><option value="neighbors">Immediate dependencies</option><option value="lineage">Full lineage</option></select></label></div>
    <section><DagCanvas {...dagInput} scope={scope} initialSelection="composition" /></section>
    <section><h2>Reuse it in motion.</h2><p>Move through the authored sequence. Parents appear before their dependents; reverse seeking samples the same geometry.</p><div className="catalog-controls"><label>Authored time <input aria-label="DAG authored time" type="range" min="0" max={motion.duration} step=".05" value={time} onChange={event => setTime(Number(event.target.value))} /><output>{time.toFixed(2)} s</output></label></div><GraphicCanvas scene={sampleScene(dag.scene, motion, time)} style={{ width: '100%', height: 'auto', maxHeight: 560, marginTop: 24 }} /></section>
    <section><h2>Use a larger diagram.</h2><p>The same dependency data can feed the existing card-and-arrow layout for a poster or slide.</p><GraphicCanvas scene={diagram} style={{ width: '100%', height: 'auto', maxHeight: 850 }} /></section>
    <section><h2>Copy the block.</h2><pre><code>{"artifacture add dag --cwd ./my-explainer\nimport { DagCanvas } from './artifacture/dag-canvas';\nimport { prepareDag, createDagReveal } from './artifacture/dag-scene';"}</code></pre><p>Reference: <a href="https://svelte.dev/playground/83b44d5d50be4b8bb65d55cea1a5d1f1?version=5.57.1">the supplied Svelte dependency minimap</a>. This implementation uses d3-dag grid with the shared Artifacture renderer.</p></section>
  </main>;
}
