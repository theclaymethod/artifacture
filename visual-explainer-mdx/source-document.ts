export type SourceTiming = 'static' | 'native' | 'smil' | 'diagram-design' | 'chalkboarding' | 'render';
export type SourceDocument = Readonly<{ title: string; html: string; timing: SourceTiming; source: string; revision: string }>;

/** Keep upstream source intact; only the generated host document gains a clock bridge. */
export function prepareSourceDocument(asset: SourceDocument, managed: boolean) {
  if (!managed) return asset.html;
  if (asset.timing === 'native') throw new Error(`${asset.title} has a native clock. Capture it with its original renderer before using it as seekable media.`);
  let html = asset.html;
  if (asset.timing === 'diagram-design') {
    const anchor = 'function play(fromStart = false, userInitiated = false) {';
    if (!html.includes(anchor)) throw new Error('The pinned Diagram Design controller does not expose the expected native play hook.');
    html = html.replace(anchor, `window.__artifactureSeek = (seconds) => {
      pause(false);
      const ms = Math.max(0, seconds * 1000);
      const current = Math.min(count, Math.floor(ms / hold));
      const before = Math.max(0, current - 1);
      document.documentElement.dataset.artifactureReset = 'true';
      render(before, false);
      root.getBoundingClientRect();
      document.documentElement.removeAttribute('data-artifacture-reset');
      root.getBoundingClientRect();
      render(current, false);
      document.getAnimations().forEach(animation => { animation.pause(); animation.currentTime = ms - current * hold; });
    };
    ${anchor} if (window.__artifactureManaged) return;`);
  } else if (asset.timing === 'chalkboarding') {
    const anchor = 'function play(){';
    if (!html.includes('function paint(t)') || !html.includes(anchor)) throw new Error('This Chalkboarding document has no native absolute-time painter.');
    html = html.replace(anchor, `window.__artifactureSeek = (seconds) => { if (raf) cancelAnimationFrame(raf); raf = null; document.documentElement.dataset.artifactureReset = 'true'; paint(0); document.body.getBoundingClientRect(); document.documentElement.removeAttribute('data-artifacture-reset'); document.body.getBoundingClientRect(); paint(Math.max(0, seconds)); document.getAnimations().forEach(animation => { animation.pause(); const start = Number(animation.effect?.target?.closest('[data-t]')?.dataset.t ?? 0); animation.currentTime = Math.max(0, seconds - start) * 1000; }); };\n${anchor} if (window.__artifactureManaged) return;`);
  }
  const bridge = `<script>
    window.__artifactureManaged = true;
    document.documentElement.dataset.artifactureManaged = "true";
    window.addEventListener("keydown", event => { if (["ArrowLeft", "ArrowRight", " ", "r", "R", "Home", "End"].includes(event.key)) event.stopImmediatePropagation(); }, true);
    let pending;
    const apply = seconds => {
      if (window.__artifactureSeek) window.__artifactureSeek(seconds);
      else if (${JSON.stringify(asset.timing)} === 'render') window.render(seconds);
      else document.querySelectorAll('svg').forEach(svg => { svg.pauseAnimations(); svg.setCurrentTime(seconds); });
      document.documentElement.dataset.artifactureTime = String(seconds);
      document.body.getBoundingClientRect();
      parent.postMessage({ type: 'artifacture:frame', seconds }, '*');
    };
    window.__artifactureSample = apply;
    window.addEventListener('message', event => {
      if (event.source !== parent || event.data?.type !== 'artifacture:seek' || !Number.isFinite(event.data.seconds) || event.data.seconds < 0) return;
      pending = event.data.seconds;
      if (window.__artifactureReady) apply(pending);
    });
    window.addEventListener('load', () => document.fonts.ready.then(() => { const ready = () => { if (${JSON.stringify(asset.timing)} === 'render' && window.READY !== true) { requestAnimationFrame(ready); return; } window.__artifactureReady = true; parent.postMessage({ type: 'artifacture:ready' }, '*'); if (pending !== undefined) apply(pending); }; ready(); }));
  </script><style>html[data-artifacture-managed] [data-motion-controls], html[data-artifacture-managed] .replay { display:none !important; } html[data-artifacture-reset] * { transition: none !important; animation: none !important; }</style>`;
  if (!html.includes('<html')) html = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}svg{display:block;max-width:100%;height:auto}</style></head><body>${html}</body></html>`;
  return html.replace(/<head[^>]*>/i, match => match + bridge);
}
