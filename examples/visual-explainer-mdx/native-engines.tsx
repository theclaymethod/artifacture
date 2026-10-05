import React, { useEffect, useState } from 'react';
import { NativeClip, NativeStill, validateNativeClipAsset, type NativeClipAsset } from '../../visual-explainer-mdx/native-clip';
import '../../visual-explainer-mdx/themes.css';
import './component-catalog.css';

// Pass manifest.asset from a real native render; do not invent its duration or frame records.
export function NativeEngineExample({ asset, baseUrl }: { asset: NativeClipAsset; baseUrl: string }) {
  return <section>
    <h2>{asset.title}</h2>
    <NativeClip asset={asset} baseUrl={baseUrl} />
    <p>{asset.engine === 'manim' ? 'Manim Community' : 'Psychopomp'} · {asset.width} × {asset.height} · {asset.fps} fps · {asset.duration} seconds</p>
    <p><a href={`${baseUrl}/manifest.json`}>Inspect render provenance</a>{' · '}<a href={`${baseUrl}/source/${asset.engine === 'manim' ? 'secant-to-tangent.py' : 'psychopomp.rs'}`}>Editable source</a></p>
    <details><summary>Use a selected frame in a poster or slide</summary>
      <NativeStill asset={asset} baseUrl={baseUrl} at={asset.stills.at(-1)?.seconds} />
    </details>
  </section>;
}

export function NativeEngineTimeline({ asset, baseUrl }: { asset: NativeClipAsset; baseUrl: string }) {
  return <NativeClip asset={asset} baseUrl={baseUrl} placement={{ start: 0, duration: asset.duration, mediaStart: 0, track: 0 }} />;
}

type NativeExample = Readonly<{ asset: NativeClipAsset; baseUrl: string }>;
export default function NativeEngineGallery() {
  const [preset, setPreset] = useState<'hairline' | '3b1b'>('hairline');
  const [examples, setExamples] = useState<NativeExample[]>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let mounted = true;
    const names = ['manim-hairline', 'manim-3b1b', 'psychopomp-hairline', 'psychopomp-3b1b'];
    Promise.all(names.map(async name => {
      const baseUrl = `./media/${name}`, response = await fetch(`${baseUrl}/manifest.json`);
      if (!response.ok) throw new Error(`Missing native example ${name}. Generate and copy its render directory into media/.`);
      const manifest = await response.json();
      return { asset: validateNativeClipAsset(manifest?.asset), baseUrl };
    })).then(items => { if (mounted) setExamples(items); }, cause => { if (mounted) setError(String(cause.message)); });
    return () => { mounted = false; };
  }, []);
  return <main className="component-catalog" data-ve-preset={preset} data-ve-theme={preset === '3b1b' ? 'dark' : 'light'}>
    <header><h1>Native motion, shared language.</h1><p>Mathematical scenes and physical diagrams rendered from editable source, then reused as clips and selected stills.</p></header>
    <div className="catalog-controls"><label>Theme <select value={preset} onChange={event => setPreset(event.target.value === '3b1b' ? '3b1b' : 'hairline')}><option value="hairline">Hairline</option><option value="3b1b">3b1b</option></select></label></div>
    {examples ? examples.filter(item => item.asset.theme === preset).map(item => <NativeEngineExample key={`${item.asset.engine}-${item.asset.theme}`} {...item} />) : <p role={error ? 'alert' : 'status'}>{error ?? 'Loading rendered examples…'}</p>}
    <section><h2>Create a scene.</h2><pre><code>{`artifacture engine setup manim\nartifacture engine scaffold manim ./math --theme ${preset}\nartifacture engine render ./math/manim.job.json --out ./math/render\n\nartifacture engine setup psychopomp\nartifacture engine scaffold psychopomp ./diagram --theme ${preset}\nartifacture engine render ./diagram/psychopomp.job.json --out ./diagram/render`}</code></pre><p><a href="../dag/">Explore the reusable dependency graph</a></p></section>
  </main>;
}
