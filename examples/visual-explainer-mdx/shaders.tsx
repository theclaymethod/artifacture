import { useState } from 'react';
import { NativeShader } from '../../visual-explainer-mdx/native-shader';
import { shaderEffects, type ShaderEffect } from '../../visual-explainer-mdx/shader-surface';

export default function ShadersExample() {
  const [effect, setEffect] = useState<ShaderEffect>('Plasma');
  const [seconds, setSeconds] = useState(0);
  return <main style={{ maxWidth: 1100, margin: '60px auto', padding: 24, fontFamily: 'system-ui' }}>
    <h1>Original shaders, presentation time</h1>
    <p>The original Shader Effects GPU engine and component definitions. Move forward or backward through the same animation.</p>
    <label>Effect <select value={effect} onChange={event => { const value = event.target.value; if (value === 'Plasma' || value === 'SimplexNoise' || value === 'Spiral') setEffect(value); }}>{shaderEffects.map(name => <option key={name}>{name}</option>)}</select></label>
    <NativeShader effect={effect} seconds={seconds} label={`${effect} shader`} />
    <label>Time <input aria-label="Shader time" type="range" min={0} max={6} step={0.01} value={seconds} onChange={event => setSeconds(Number(event.target.value))} /> {seconds.toFixed(2)} s</label>
    <p><a href="https://github.com/shader-effects-inc/shaders">Shaders · Shader Effects Inc.</a></p>
  </main>;
}
