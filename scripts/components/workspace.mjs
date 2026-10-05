export const defaultBlocks = Object.freeze(['diagram', 'motion', 'composition']);
export const defaultConfig = Object.freeze({ schemaVersion: 1, sourceDirectory: 'src/artifacture' });
export const workspaceDependencies = Object.freeze(['react', 'react-dom']);
export const workspaceDevDependencies = Object.freeze(['@vitejs/plugin-react', '@types/react', '@types/react-dom', 'typescript', 'vite']);

const visual = `import { createDiagramScene } from './artifacture/diagram-scene';
import { defineGraphicMotion } from './artifacture/graphic-motion';
import { composeGraphics } from './artifacture/graphics-composition';
import { createGraphicScene } from './artifacture/graphics-types';

export const duration = 4;

// The illustration is an independent scene, reusable in a poster, slide, or video.
const delivery = createGraphicScene({
  id: 'scene-delivery',
  title: 'A scene moves into its output frame',
  description: 'An editable scene card travels along a guide into a larger output frame.',
  bounds: { x: 0, y: 0, width: 320, height: 112 },
  objects: [
    { id: 'guide', kind: 'illustration', primitives: [
      { kind: 'path', d: 'M 30 50 L 270 50', fill: 'none', stroke: 'illustration-muted', strokeRole: 'guide', dash: '3 5' },
    ] },
    { id: 'frame', kind: 'illustration', primitives: [
      { kind: 'rect', x: 240, y: 16, width: 60, height: 68, radius: 2, fill: 'node-background', stroke: 'illustration-ink' },
    ] },
    { id: 'scene-card', kind: 'illustration', primitives: [
      { kind: 'rect', x: 14, y: 28, width: 32, height: 44, radius: 2, fill: 'node-background', stroke: 'illustration-ink' },
      { kind: 'path', d: 'M 22 40 L 38 40 M 22 49 L 34 49 M 22 58 L 38 58', fill: 'none', stroke: 'illustration-ink', strokeRole: 'detail' },
    ] },
  ],
});

const deliveryMotion = defineGraphicMotion(delivery, {
  duration,
  tracks: [
    { target: 'scene-card', property: 'opacity', start: 2, duration: 0.4, from: 0, to: 1 },
    { target: 'scene-card', property: 'translation', start: 2.4, duration: 0.9, from: { x: 0, y: 0 }, to: { x: 240, y: 0 }, ease: 'smooth' },
  ],
});

function composeDirection(direction: 'horizontal' | 'vertical') {
  const diagram = createDiagramScene({
    id: 'source-to-output-' + direction,
    title: 'Source becomes an editable visual',
    description: 'An editable source scene is composed on a shared timeline, then delivered in an output frame.',
    direction,
    nodes: [
      { id: 'source', label: 'Source', detail: 'Editable geometry' },
      { id: 'compose', label: 'Compose', detail: 'Shared time' },
      { id: 'output', label: 'Output', detail: 'Any format' },
    ],
    edges: [
      { id: 'source-compose', from: 'source', to: 'compose' },
      { id: 'compose-output', from: 'compose', to: 'output' },
    ],
  });
  const motion = defineGraphicMotion(diagram, {
    duration,
    tracks: [
      { target: 'node:compose', property: 'opacity', start: 0.5, duration: 0.4, from: 0, to: 1 },
      { target: 'node:output', property: 'opacity', start: 1.3, duration: 0.4, from: 0, to: 1 },
      { target: 'edge:source-compose', property: 'reveal', start: 0.4, duration: 0.6, from: 0, to: 1 },
      { target: 'edge:compose-output', property: 'reveal', start: 1.3, duration: 0.6, from: 0, to: 1 },
      { target: 'node:compose', property: 'highlight', start: 1, duration: 0.2, from: 0, to: 1 },
      { target: 'node:compose', property: 'highlight', start: 2.1, duration: 0.2, from: 1, to: 0 },
      { target: 'node:output', property: 'highlight', start: 2.5, duration: 0.2, from: 0, to: 1 },
    ],
  });
  const width = Math.max(320, diagram.bounds.width);
  return composeGraphics({
    id: 'source-to-output-composition-' + direction,
    title: diagram.title,
    description: diagram.description + ' Below the diagram, the scene card moves into its output frame.',
    duration,
    bounds: { x: 0, y: 0, width, height: diagram.bounds.height + 120 },
    instances: [
      { id: 'diagram', scene: diagram, motion, frame: { x: (width - diagram.bounds.width) / 2, y: 0, width: diagram.bounds.width, height: diagram.bounds.height }, clip: 'frame' },
      { id: 'delivery', scene: delivery, motion: deliveryMotion, frame: { x: (width - 320) / 2, y: diagram.bounds.height, width: 320, height: 112 }, clip: 'frame' },
    ],
  });
}

// Layout variants are authored once. The sampler only receives scene data and time.
export const horizontalComposition = composeDirection('horizontal');
export const verticalComposition = composeDirection('vertical');
`;

const app = `import { useEffect, useState } from 'react';
import { GraphicCanvas } from './artifacture/graphics';
import { sampleScene } from './artifacture/graphic-motion';
import { duration, horizontalComposition, verticalComposition } from './visual';

export default function App() {
  const [time, setTime] = useState(0);
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 640px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 640px)');
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const composition = compact ? verticalComposition : horizontalComposition;
  const frame = sampleScene(composition.scene, composition.motion, time);

  return (
    <main className="workspace" data-ve-preset="hairline">
      <header>
        <h1>Build the explanation from source.</h1>
        <p>Reveal the connections, focus the composition, and move a reusable scene into its output frame.</p>
      </header>
      <GraphicCanvas scene={frame} className="scene-canvas" />
      <div className="time-control">
        <div className="time-heading">
          <label htmlFor="authored-time">Authored time</label>
          <output htmlFor="authored-time">{time.toFixed(2)} s / {duration.toFixed(2)} s</output>
        </div>
        <input id="authored-time" type="range" min="0" max={duration} step="0.01" value={time} onChange={(event) => setTime(Number(event.target.value))} />
      </div>
    </main>
  );
}
`;

const styles = `* { box-sizing: border-box; }
body { margin: 0; background: var(--ve-bg); color: var(--ve-text); font-family: var(--ve-font-body); }
.workspace { min-height: 100svh; max-width: 1080px; margin: 0 auto; padding: clamp(24px, 6vw, 72px); background: var(--ve-bg); color: var(--ve-text); }
header { max-width: 700px; margin-bottom: 32px; }
h1 { margin: 0 0 20px; font-family: var(--ve-font-display); font-size: clamp(2.2rem, 5.5vw, 4rem); font-weight: var(--ve-display-weight); line-height: 1.08; letter-spacing: -0.04em; }
p { margin: 0; max-width: 600px; color: var(--ve-muted); font-size: 1.125rem; line-height: 1.6; }
.scene-canvas { display: block; width: 100%; height: auto; }
.time-control { margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--ve-rule); }
.time-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
label { font-weight: 500; }
output { color: var(--ve-muted); font-variant-numeric: tabular-nums; }
input[type="range"] { display: block; width: 100%; min-height: 32px; margin: 0; accent-color: var(--ve-accent); cursor: pointer; }
input[type="range"]:focus-visible { outline: 2px solid var(--ve-accent); outline-offset: 4px; }
@media (max-width: 640px) { header { margin-bottom: 20px; } p { font-size: 1rem; } .time-control { margin-top: 16px; } }
`;

export function workspaceFiles(directoryName, versions) {
  const name = directoryName.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[._-]+|[._-]+$/g, '') || 'artifacture-workspace';
  const json = (value) => JSON.stringify(value, null, 2) + '\n';
  const requirements = (names) => Object.fromEntries(names.map((dependency) => [dependency, versions[dependency]]));
  return new Map([
    ['.gitignore', 'node_modules/\ndist/\n'],
    ['artifacture.json', json(defaultConfig)],
    ['package.json', json({ name, version: '0.0.0', private: true, type: 'module', engines: { node: '>=22.12.0' }, scripts: { dev: 'vite', build: 'tsc --noEmit && vite build', preview: 'vite preview' }, dependencies: requirements(workspaceDependencies), devDependencies: requirements(workspaceDevDependencies) })],
    ['index.html', '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Editable visual workspace</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>\n'],
    ['tsconfig.json', json({ compilerOptions: { target: 'ES2022', lib: ['ES2022', 'DOM', 'DOM.Iterable'], module: 'preserve', moduleResolution: 'bundler', jsx: 'react-jsx', strict: true, noEmit: true, skipLibCheck: true, esModuleInterop: true, forceConsistentCasingInFileNames: true }, include: ['src', 'vite.config.ts'] })],
    ['vite.config.ts', "import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({ plugins: [react()] });\n"],
    ['src/vite-env.d.ts', '/// <reference types="vite/client" />\n'],
    ['src/main.tsx', "import { StrictMode } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport './artifacture/themes.css';\nimport './styles.css';\nimport App from './App';\n\nconst root = document.getElementById('root');\nif (!root) throw new Error('Application root is missing.');\ncreateRoot(root).render(<StrictMode><App /></StrictMode>);\n"],
    ['src/App.tsx', app],
    ['src/visual.ts', visual],
    ['src/styles.css', styles],
    ['AGENTS.md', '# Working in this Artifacture workspace\n\n- `src/artifacture/` is editable local source owned by this workspace. Import the leaf file you use; keep the license beside the source.\n- `themes.css` owns the visual tokens. Hairline is the default; 3b1b, Mono Color, and Algebrica are the other retained themes.\n- Author reusable scenes, combine them with `composeGraphics`, then wrap the same composition for slides and video. Keep geometry below delivery wrappers.\n- Motion is a finite function of explicit authored time. Keep layout variants outside the sampler and reuse one shared timeline.\n- Discover existing components with `npx artifacture list --query JsonTree --json`, `npx artifacture list --query scatter --json`, or a capability such as focus. The registry indexes individual components and scene builders as well as the original bundles. Read supported variants, constraints, examples, leaf exports, package advice, and the add command before choosing.\n- For reusable 3D discover `model-view`, `shape-ascii`, `particle-object`, `living-forms` and `procedural-props`. Use img2threejs for reference-based low-detail models; retain its spec and review evidence. Fresh factories preserve named meshes and accept absolute-time sampling. Read copied `MODEL-AUTHORING.md`, await controller.draw(frame) before capture, and keep source/video decoding ownership explicit. OrbitalText and TracePath are standalone SVG leaves.\n- For finite scalar/vector parameters discover `authored-values`; for provenance-aware subtitle timing discover `narration-cues`. These plain TypeScript leaves retain `LEMO-LICENSE` beside their source and add no npm dependencies.\n- For explicit frame-count rounding and loop endpoint inspection discover `video-frames`. It returns sample timing and separate endpoint/last-frame comparisons; the caller owns rendering and encoding.\n- Pull source with the returned `npx artifacture add <block> --cwd .` command; use `--dry-run` to inspect it. Module names identify local leaves; defaultImport is relative to `src`, while `artifacture.json` configures the source destination. The command stops on conflicts; reconcile local edits yourself.\n- Do not add ornamental metadata: eyebrow labels, badges, metric tiles, decorative numbering, redundant captions, or tiny uppercase labels that communicate no necessary meaning. Use composition, spacing, typography, and direct language for hierarchy.\n- New test files are opt-in. Prefer existing checks and direct browser/runtime verification unless creation is explicitly approved.\n'],
    ['README.md', '# Editable visual workspace\n\nThe public `artifacture init` command installs required npm packages by default. Run `npm run dev` to start the workspace, or `npm run build` for strict TypeScript checking and a production build. If you initialized with `--no-install`, run `npm install` first.\n\nEdit `src/visual.ts` to author the diagram, reusable illustration, and finite motion. The native range control in `src/App.tsx` sets time directly; there is no hidden clock. Horizontal and vertical scene layouts are chosen before sampling.\n\nCopied files in `src/artifacture/` belong to this workspace and remain editable. Import local leaf modules. The shared architecture is scene → composition → slide → video.\n\nDiscover individual components and reusable scene builders with `npx artifacture list --query JsonTree --json`, `npx artifacture list --query scatter --json`, or `npx artifacture list --query threads --json`. Search accepts implemented capabilities, primitive names, supported variants, and public API names. The original graphics, diagram, hairline, motion, composition, slides, video, and charts bundle IDs remain available. Each result reports actual capabilities, supported variants and their API parameters, constraints, example paths, leaf exports, transitive copied files, package advice, and an exact add command. `module` is a leaf name; `defaultImport` is relative to a caller in `src`. `artifacture.json` configures the source destination, so adjust imports when using another directory.\n\nUse `npx artifacture add data-chart quiz plot-scene --cwd . --dry-run` to inspect a copy plan and `npx artifacture add data-chart quiz plot-scene --cwd .` to create missing files. Use the returned named export from its local leaf, such as `DataChart` from `./artifacture/charts` or `createPlotScene` from `./artifacture/teaching-scenes`. Public `artifacture init` and `artifacture add` install required npm packages and wire host stylesheet imports automatically. Use `--no-install` to manage npm packages yourself; stylesheet imports are still wired. Use `--entry <file>` when your app has a custom entry point. The package’s `scripts/components.mjs` is the copy-only backend; direct backend use requires manual package installation and host CSS imports. It refuses changed files; reconcile your edits before adding a block again.\n\nFor dependency-free authored value sampling and subtitle preparation, use `npx artifacture add authored-values narration-cues --cwd .`. Keep their complete `LEMO-LICENSE` notice beside the copied leaves. The samplers return values for the caller; narration cues validate timing and provenance and serialize SRT/VTT. Neither leaf starts a playback clock. For encoded-frame timing and separate loop endpoint inspection, use `npx artifacture add video-frames --cwd .`; this original helper carries the root `LICENSE` and requires no packages or CSS.\n\nThe starter imports `themes.css` normally. Public `artifacture add slides video --cwd .` also wires `hairline-motion-theme.css` into your app entry. If you use the copy-only backend, import `./artifacture/hairline-motion-theme.css` from `src/main.tsx` yourself. Chart leaves import their own chart CSS. The copied theme requests web fonts; fallback fonts are available. Source license notices remain in `src/artifacture/LICENSE`.\n'],
  ]);
}
