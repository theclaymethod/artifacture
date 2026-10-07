import React from 'react';
import themes from '../../visual-explainer-mdx/themes.css?raw';
import theme from '../../plugins/visual-explainer/templates/iso-motion-theme.css?raw';

const css = `${themes}
${theme}
html, body { margin: 0; width: 100%; height: 100%; }
.clip { position: absolute; inset: 0; }
.statement { position: absolute; left: 128px; top: 92px; }
.statement h1 { font-size: 88px; }
.statement p { margin: 24px 0 0; font-size: 30px; color: var(--ve-muted); }
.drawing { position: absolute; inset: 0; width: 100%; height: 100%; }
.relationship { position: absolute; left: 128px; bottom: 84px; font-size: 34px; }
.relationship p { margin: 0; }
.relationship .equation { font-family: var(--motion-display); font-size: 50px; margin-top: 12px; }
.figure-label { fill: var(--ve-muted); stroke: none; font-size: 28px; font-family: var(--motion-body); }
`;

const animation = `
const model = { phase: 0, projection: 0.52 };
const center = { x: 490, y: 595 };
const radius = 180;
const trace = { start: 940, end: 1650 };
const tau = Math.PI * 2;
const nodes = Object.fromEntries([
  'rim', 'crease', 'radius', 'rotating-point', 'projection', 'wave', 'trace-point'
].map(id => [id, document.getElementById(id)]));

function draw() {
  const x = center.x + radius * Math.cos(model.phase);
  const y = center.y - radius * model.projection * Math.sin(model.phase);
  const head = trace.start + (trace.end - trace.start) * model.phase / (2 * tau);
  nodes.rim.setAttribute('ry', radius * model.projection);
  nodes.crease.setAttribute('ry', (radius - 10) * model.projection);
  nodes.radius.setAttribute('x2', x);
  nodes.radius.setAttribute('y2', y);
  nodes['rotating-point'].setAttribute('cx', x);
  nodes['rotating-point'].setAttribute('cy', y);
  nodes.projection.setAttribute('x1', x);
  nodes.projection.setAttribute('y1', y);
  nodes.projection.setAttribute('x2', head);
  nodes.projection.setAttribute('y2', y);
  nodes['trace-point'].setAttribute('cx', head);
  nodes['trace-point'].setAttribute('cy', y);
  const count = Math.max(1, Math.ceil(model.phase / (2 * tau) * 240));
  const points = Array.from({ length: count + 1 }, (_, i) => {
    const phase = model.phase * i / count;
    const px = trace.start + (trace.end - trace.start) * phase / (2 * tau);
    const py = center.y - radius * Math.sin(phase);
    return (i === 0 ? 'M' : 'L') + px.toFixed(3) + ',' + py.toFixed(3);
  });
  nodes.wave.setAttribute('d', points.join(' '));
}

draw();
const tl = gsap.timeline({ paused: true, onUpdate: draw });
tl.fromTo('#statement', { opacity: 0, y: 18 },
  { opacity: 1, y: 0, duration: 0.65, ease: 'power2.out' }, 0);
tl.to(model, { projection: 1, duration: 1.1, ease: 'power2.inOut' }, 2.2);
tl.to('#pedestal', { opacity: 0, duration: 0.7, ease: 'power1.out' }, 2.2);
tl.fromTo('#trace-system', { opacity: 0 },
  { opacity: 1, duration: 0.55, ease: 'power1.out' }, 3.2);
tl.to(model, { phase: 2 * tau, duration: 9.5, ease: 'none' }, 4);
tl.fromTo('#relationship', { opacity: 0, y: 14 },
  { opacity: 1, y: 0, duration: 0.65, ease: 'power2.out' }, 14.1);
window.__timelines = window.__timelines || {};
window.__timelines['hairline-motion'] = tl;
window.matchMedia('(prefers-reduced-motion: reduce)').matches && tl.seek(16, false);
`;

export default function HairlineMotionBaseline() {
  const themeName = process.env.ARTIFACTURE_MOTION_THEME === 'dark' ? 'dark' : 'light';
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>How a wave takes shape</title>
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js" />
      </head>
      <body>
        <main id="root" className="motion-stage" data-ve-preset="iso" data-ve-appearance={themeName} data-motion-theme={themeName}
          data-composition-id="hairline-motion" data-width="1920" data-height="1080"
          data-start="0" data-duration="16">
            <header className="statement" id="statement">
              <h1>How a wave takes shape</h1>
              <p>Follow the height of a point on a unit circle.</p>
            </header>
            <svg className="drawing motion-figure" viewBox="0 0 1920 1080"
              role="img" aria-labelledby="drawing-title drawing-description">
              <title id="drawing-title">Rotation becomes a sine wave</title>
              <desc id="drawing-description">A point travels around a unit circle. A horizontal construction line connects it to a trace of its height over time.</desc>
              <g id="instrument">
                <g id="pedestal">
                  <path className="motion-solid" d="M 310 595 A 180 93.6 0 0 1 670 595 L 670 630 A 180 93.6 0 0 1 310 630 Z" />
                  <path className="motion-crease" d="M 324 630 A 166 84 0 0 0 656 630" />
                  <path className="motion-guide" d="M 378 711 L 344 752 M 602 711 L 636 752" />
                </g>
                <ellipse id="rim" className="motion-solid" cx="490" cy="595" rx="180" ry="93.6" />
                <ellipse id="crease" className="motion-crease" cx="490" cy="595" rx="170" ry="88.4" />
                <line id="radius" className="motion-crease" x1="490" y1="595" x2="670" y2="595" />
                <circle className="motion-solid motion-crease" cx="490" cy="595" r="5" />
                <circle id="rotating-point" className="motion-dot" cx="670" cy="595" r="9" />
              </g>
              <g id="trace-system">
                <line className="motion-guide" x1="905" y1="595" x2="1680" y2="595" />
                <line className="motion-guide" x1="940" y1="386" x2="940" y2="810" />
                <line id="projection" className="motion-guide" x1="670" y1="595" x2="940" y2="595" strokeDasharray="5 9" />
                <path id="wave" className="motion-active" d="M 940 595" />
                <circle id="trace-point" className="motion-dot" cx="940" cy="595" r="7" />
                <text className="figure-label" x="490" y="843" textAnchor="middle">Rotation</text>
                <text className="figure-label" x="1280" y="843" textAnchor="middle">Height over time</text>
              </g>
            </svg>
            <div className="relationship" id="relationship">
              <p>A wave records one part of a circular motion.</p>
              <p className="equation">y = sin θ</p>
            </div>
        </main>
        <script dangerouslySetInnerHTML={{ __html: animation }} />
      </body>
    </html>
  );
}
