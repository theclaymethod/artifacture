import React, { useEffect, useMemo, useRef, useState } from 'react';

type StageId = 'author' | 'build' | 'feedback' | 'verify';
type PayloadKind = 'source' | 'artifact' | 'evidence' | 'control';

const payloadKinds = ['source', 'artifact', 'evidence', 'control'] as const satisfies readonly PayloadKind[];

function getElementTarget(target: EventTarget | null): Element | null {
  return target instanceof Element ? target : null;
}

type AtlasNode = {
  id: string;
  code: string;
  title: string;
  stage: StageId;
  x: number;
  y: number;
  width: number;
  height: number;
  depth?: number;
  file: string;
  summary: string;
  built: string;
  inputs: string;
  outputs: string;
  focal?: boolean;
  stack?: number;
};

type AtlasRoute = {
  from: string;
  to: string;
  d: string;
  label: string;
  labelX: number;
  labelY: number;
  labelWidth: number;
  kind: PayloadKind;
};

const stages: Array<{ id: StageId; code: string; title: string; subtitle: string }> = [
  { id: 'author', code: 'A', title: 'Authoring', subtitle: 'route · brief · source' },
  { id: 'build', code: 'B', title: 'Build + export', subtitle: 'runtime · bundle · artifact' },
  { id: 'feedback', code: 'C', title: 'Preview loop', subtitle: 'session · patch · rebuild' },
  { id: 'verify', code: 'D', title: 'Evidence gate', subtitle: 'capture · review · finalize' },
];

const nodes: AtlasNode[] = [
  { id: 'skill', code: 'A1', title: 'Agent Skill', stage: 'author', x: 84, y: 132, width: 92, height: 76, file: 'plugins/visual-explainer/SKILL.md:25-32', summary: 'Routes the request, narrows the reference set, and keeps editable visual source as the revision owner.', built: 'A progressive-disclosure entry point selects the delivery card and requires export plus evidence before completion.', inputs: 'user brief', outputs: 'selected route', stack: 2 },
  { id: 'cards', code: 'A2', title: 'Route Cards', stage: 'author', x: 252, y: 80, width: 88, height: 64, file: 'plugins/visual-explainer/cards/', summary: 'Holds the focused execution contracts for pages, diagrams, decks, posters, and video.', built: 'The root skill delegates format-specific rules to small cards instead of loading every instruction at once.', inputs: 'selected route', outputs: 'authoring contract' },
  { id: 'brief', code: 'A3', title: 'Truth Brief', stage: 'author', x: 382, y: 176, width: 112, height: 56, file: 'examples/visual-explainer-mdx/artifacture-system-map-brief.md', summary: 'Records the source-backed claims that the map is allowed to make.', built: 'Verification hashes this file and binds its claims to the exported artifact and review evidence.', inputs: 'repository facts', outputs: 'brief + citations' },
  { id: 'source', code: 'A4', title: 'Source Forge', stage: 'author', x: 530, y: 96, width: 124, height: 88, file: 'examples/visual-explainer-mdx/artifacture-system-map.tsx', summary: 'Owns the editable React and SVG source for the atlas.', built: 'React state controls selection, tracing, pan, and zoom while the static SVG remains complete without interaction.', inputs: 'brief + route', outputs: 'MDX / TSX', focal: true, stack: 3 },
  { id: 'components', code: 'A5', title: 'Component Runtime', stage: 'author', x: 730, y: 164, width: 116, height: 72, file: 'visual-explainer-mdx/components.tsx:28-85,202-250', summary: 'Exports the shared visual primitives and presentation runtime through one entry point.', built: 'The component module keeps visual primitives, deck primitives, and host shell contracts behind a stable import surface.', inputs: 'component imports', outputs: 'React primitives' },
  { id: 'layout', code: 'A6', title: 'Diagram Layout', stage: 'author', x: 926, y: 92, width: 100, height: 72, file: 'visual-explainer-mdx/diagram-layout.ts', summary: 'Owns reusable graph geometry and label-placement helpers.', built: 'Layout functions calculate node positions, edge paths, mobile connectors, and label leader endpoints.', inputs: 'nodes + edges', outputs: 'SVG geometry', stack: 2 },

  { id: 'export', code: 'B1', title: 'Export Plant', stage: 'build', x: 448, y: 324, width: 164, height: 104, file: 'scripts/ve-mdx/export.mjs:15-27,43-60,73-140', summary: 'Builds the editable source and emits a single portable HTML artifact.', built: 'Vite, MDX, React, and Tailwind compile the entry. Generated JavaScript and CSS are then inlined into the HTML.', inputs: 'entry + runtime + geometry', outputs: 'compiled bundle', focal: true, stack: 4 },
  { id: 'bundle', code: 'B2', title: 'Bundle Staging', stage: 'build', x: 250, y: 304, width: 108, height: 64, file: 'scripts/ve-mdx/export.mjs:73-119', summary: 'Stages Vite output before the generated assets are folded back into the document.', built: 'The exporter discovers generated assets, resolves preset CSS, and prepares the final standalone document.', inputs: 'Vite build', outputs: 'CSS + JavaScript' },
  { id: 'artifact', code: 'B3', title: 'HTML Artifact', stage: 'build', x: 690, y: 332, width: 150, height: 88, file: 'scripts/ve-mdx/export.mjs:121-140', summary: 'The self-contained HTML file is the payload passed to preview and verification.', built: 'The generated document carries its own runtime and styles. Editable source remains authoritative for revisions.', inputs: 'inlined assets', outputs: 'one HTML file', stack: 3 },
  { id: 'preview', code: 'B4', title: 'Preview Server', stage: 'build', x: 920, y: 292, width: 116, height: 76, file: 'plugins/visual-explainer/scripts/preview.mjs:207-238', summary: 'Serves the artifact in a session-aware review shell.', built: 'The preview creates a session, exposes guarded mutation endpoints, and records the publisher used to rebuild the source.', inputs: 'artifact + session', outputs: 'review surface' },

  { id: 'mutation', code: 'C1', title: 'Mutation Queue', stage: 'feedback', x: 116, y: 492, width: 104, height: 68, file: 'plugins/visual-explainer/scripts/preview.mjs:207-238', summary: 'Serializes requested edits so concurrent feedback cannot race the source patch.', built: 'A promise chain orders mutations and keeps a failed edit from corrupting later requests.', inputs: 'preview POST', outputs: 'serialized edit' },
  { id: 'publisher', code: 'C2', title: 'Publisher', stage: 'feedback', x: 306, y: 538, width: 112, height: 68, file: 'plugins/visual-explainer/scripts/preview.mjs:291-365', summary: 'Patches selected source files and invokes the owning build command.', built: 'The publisher validates paths, applies the requested source update, rebuilds the artifact, and restores selected files when rebuild fails.', inputs: 'guarded patch', outputs: 'rebuild request' },
  { id: 'rollback', code: 'C3', title: 'Rollback Store', stage: 'feedback', x: 522, y: 514, width: 100, height: 64, file: 'plugins/visual-explainer/scripts/preview.mjs:333-365', summary: 'Preserves source snapshots long enough to undo a failed rebuild.', built: 'Selected files are read before mutation and written back if the publisher cannot produce a valid replacement artifact.', inputs: 'source snapshots', outputs: 'restored files' },
  { id: 'session', code: 'C4', title: 'Session Ledger', stage: 'feedback', x: 746, y: 486, width: 104, height: 64, file: 'plugins/visual-explainer/scripts/preview.mjs:207-238', summary: 'Binds review actions to the artifact and publisher that created the current preview.', built: 'Session identity prevents feedback from being applied to an unrelated file or stale publishing context.', inputs: 'artifact identity', outputs: 'bound mutation' },

  { id: 'mechanics', code: 'D1', title: 'Mechanics Engine', stage: 'verify', x: 938, y: 476, width: 126, height: 80, file: 'plugins/visual-explainer/scripts/verify/lib/engine.mjs:12-35', summary: 'Runs static and browser-backed checks against the exported artifact.', built: 'The engine builds verification context, runs the check catalog, captures browser evidence when requested, and builds a mechanics report.', inputs: 'file + profile', outputs: 'check results', stack: 2 },
  { id: 'browser', code: 'D2', title: 'Browser Matrix', stage: 'verify', x: 836, y: 632, width: 112, height: 68, file: 'plugins/visual-explainer/scripts/verify/lib/browser.mjs:13-45,110-143', summary: 'Renders the page across the required viewport and presentation matrix.', built: 'Chromium captures screenshots, browser metrics, and the rendered content inventory for the report contract.', inputs: 'artifact + profile', outputs: 'screens + inventory' },
  { id: 'report', code: 'D3', title: 'Report Builder', stage: 'verify', x: 632, y: 652, width: 116, height: 72, file: 'plugins/visual-explainer/scripts/verify/lib/report.mjs:7-46,87-125', summary: 'Packages mechanics, evidence, required passes, and content identity into one report.', built: 'The review contract hashes the artifact, truth brief, browser inventory, and every evidence file.', inputs: 'checks + evidence', outputs: 'bound review contract' },
  { id: 'policy', code: 'D4', title: 'Review Dispatch', stage: 'verify', x: 426, y: 650, width: 112, height: 68, file: 'plugins/visual-explainer/scripts/verify/lib/model-policy.mjs:21-91', summary: 'Selects the qualified review route or records the best available fallback.', built: 'Generated model policy wins when present. Otherwise dispatch remains explicit about its fallback qualification.', inputs: 'report + policy', outputs: 'review assignment' },
  { id: 'finalizer', code: 'D5', title: 'Finalization Gate', stage: 'verify', x: 210, y: 642, width: 140, height: 92, file: 'plugins/visual-explainer/scripts/verify/ve-finalize.mjs:9-35,39-104', summary: 'Accepts a verdict only when the current artifact and all captured evidence still match the review contract.', built: 'The terminal state is failed, incomplete, or verified. Identity mismatches stop finalization before a stale verdict can pass.', inputs: 'verdict + contract hash', outputs: 'terminal status', focal: true, stack: 3 },
];

const routes: AtlasRoute[] = [
  { from: 'skill', to: 'cards', d: 'M 190 172 H 236 V 120 H 254', label: 'selected card', labelX: 218, labelY: 148, labelWidth: 84, kind: 'control' },
  { from: 'cards', to: 'brief', d: 'M 350 122 H 378 V 190', label: 'authoring contract', labelX: 412, labelY: 140, labelWidth: 104, kind: 'control' },
  { from: 'brief', to: 'source', d: 'M 504 204 H 524 V 150', label: 'brief + citations', labelX: 520, labelY: 192, labelWidth: 102, kind: 'source' },
  { from: 'source', to: 'components', d: 'M 674 148 H 722 V 194', label: 'component imports', labelX: 706, labelY: 136, labelWidth: 110, kind: 'source' },
  { from: 'components', to: 'layout', d: 'M 860 204 H 918 V 132', label: 'nodes + edges', labelX: 894, labelY: 190, labelWidth: 82, kind: 'source' },
  { from: 'source', to: 'export', d: 'M 594 208 V 314', label: '.mdx / .tsx', labelX: 624, labelY: 264, labelWidth: 72, kind: 'source' },
  { from: 'components', to: 'export', d: 'M 780 250 V 286 H 604 V 316', label: 'runtime + tokens', labelX: 698, labelY: 286, labelWidth: 104, kind: 'source' },
  { from: 'layout', to: 'export', d: 'M 982 178 V 260 H 640 V 320', label: 'SVG geometry', labelX: 846, labelY: 260, labelWidth: 84, kind: 'source' },
  { from: 'export', to: 'bundle', d: 'M 440 380 H 370', label: 'Vite build', labelX: 404, labelY: 368, labelWidth: 64, kind: 'artifact' },
  { from: 'bundle', to: 'artifact', d: 'M 370 344 H 414 V 454 H 680 V 388', label: 'inline CSS + JS', labelX: 548, labelY: 454, labelWidth: 92, kind: 'artifact' },
  { from: 'artifact', to: 'preview', d: 'M 854 382 H 910', label: 'one HTML file', labelX: 884, labelY: 370, labelWidth: 82, kind: 'artifact' },
  { from: 'preview', to: 'session', d: 'M 980 384 V 450 H 812 V 480', label: 'artifact + session', labelX: 896, labelY: 450, labelWidth: 102, kind: 'control' },
  { from: 'preview', to: 'mutation', d: 'M 944 382 V 424 H 170 V 484', label: 'preview POST', labelX: 556, labelY: 424, labelWidth: 78, kind: 'control' },
  { from: 'mutation', to: 'publisher', d: 'M 230 530 H 296', label: 'guarded patch', labelX: 266, labelY: 518, labelWidth: 82, kind: 'control' },
  { from: 'publisher', to: 'rollback', d: 'M 430 572 H 512', label: 'snapshots', labelX: 472, labelY: 560, labelWidth: 66, kind: 'control' },
  { from: 'publisher', to: 'export', d: 'M 362 528 V 472 H 486 V 438', label: 'publisher rebuild', labelX: 424, labelY: 472, labelWidth: 104, kind: 'control' },
  { from: 'artifact', to: 'mechanics', d: 'M 814 436 V 458 H 930 V 510', label: 'file + profile', labelX: 870, labelY: 458, labelWidth: 80, kind: 'evidence' },
  { from: 'mechanics', to: 'browser', d: 'M 976 572 V 620 H 900', label: 'browser matrix', labelX: 944, labelY: 608, labelWidth: 90, kind: 'evidence' },
  { from: 'browser', to: 'report', d: 'M 826 674 H 760', label: 'screens + inventory', labelX: 794, labelY: 662, labelWidth: 112, kind: 'evidence' },
  { from: 'report', to: 'policy', d: 'M 620 690 H 550', label: 'dispatch plan', labelX: 584, labelY: 678, labelWidth: 84, kind: 'evidence' },
  { from: 'policy', to: 'finalizer', d: 'M 416 684 H 360', label: 'verdict bundle', labelX: 388, labelY: 672, labelWidth: 88, kind: 'evidence' },
  { from: 'report', to: 'finalizer', d: 'M 648 738 V 756 H 286 V 744', label: 'contract hash', labelX: 470, labelY: 756, labelWidth: 82, kind: 'evidence' },
];

type StageNote = { purpose: string; source: string };

type StageNoteMap = {
  author: StageNote;
  build: StageNote;
  feedback: StageNote;
  verify: StageNote;
};

const stageNotes = {
  author: { purpose: 'Turn a cited repository brief into editable visual source and reusable geometry.', source: 'SKILL.md · components.tsx · diagram-layout.ts' },
  build: { purpose: 'Compile the source, inline its assets, and make one portable HTML payload.', source: 'scripts/ve-mdx/export.mjs' },
  feedback: { purpose: 'Bind review actions to the source, serialize edits, rebuild, and roll back on failure.', source: 'plugins/visual-explainer/scripts/preview.mjs' },
  verify: { purpose: 'Capture mechanics and visual evidence, bind their identities, dispatch review, and finalize.', source: 'verify/lib/* · verify/ve-finalize.mjs' },
} satisfies StageNoteMap;

function IsoBuilding({ node, selected, dimmed, onSelect }: { node: AtlasNode; selected: boolean; dimmed: boolean; onSelect: () => void }) {
  const depth = node.depth ?? 28;
  const { x, y, width, height } = node;
  const top = `${x},${y} ${x + width},${y - depth} ${x + width + depth},${y} ${x + depth},${y + depth}`;
  const front = `${x + depth},${y + depth} ${x + width + depth},${y} ${x + width + depth},${y + height} ${x + depth},${y + height + depth}`;
  const side = `${x + width},${y - depth} ${x + width + depth},${y} ${x + width + depth},${y + height} ${x + width},${y + height - depth}`;
  const stacks = Array.from({ length: node.stack ?? 1 });

  return (
    <g
      className={`atlas-building${selected ? ' is-selected' : ''}${dimmed ? ' is-dimmed' : ''}`}
      data-node-id={node.id}
      data-stage={node.stage}
      role="button"
      tabIndex={0}
      aria-label={`${node.code} ${node.title}`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <title>{node.title} — {node.file}</title>
      {stacks.map((_, index) => index === 0 ? null : (
        <polygon
          key={index}
          points={`${x + depth},${y + height + depth + index * 5} ${x + width + depth},${y + height + index * 5} ${x + width + depth},${y + height + 3 + index * 5} ${x + depth},${y + height + depth + 3 + index * 5}`}
          className="building-stack"
        />
      ))}
      <polygon points={top} className="building-top" />
      <polygon points={front} className="building-front" />
      <polygon points={side} className="building-side" />
      <text x={x + depth + width / 2} y={y + height / 2 + 16} textAnchor="middle" className="building-code">{node.code}</text>
      <text x={x + depth + width / 2} y={y + height + depth + 18} textAnchor="middle" className="building-name">{node.title}</text>
    </g>
  );
}

function AtlasRoutePath({ route, index, traceStep }: { route: AtlasRoute; index: number; traceStep: number }) {
  const active = index === traceStep;
  const visited = traceStep >= 0 && index < traceStep;
  return (
    <g className={`atlas-route route-${route.kind}${active ? ' is-active' : ''}${visited ? ' is-visited' : ''}`} data-from={route.from} data-to={route.to}>
      <path d={route.d} className="route-halo" />
      <path d={route.d} className="route-line" markerEnd={`url(#artifacture-atlas-arrow-${route.kind})`} />
      <circle cx={route.labelX} cy={route.labelY} r="2.4" className="route-junction" />
      <rect x={route.labelX - route.labelWidth / 2} y={route.labelY - 10} width={route.labelWidth} height="18" className="route-mask" />
      <text x={route.labelX} y={route.labelY + 3} textAnchor="middle" className="route-label">{route.label}</text>
    </g>
  );
}

export default function ArtifactureSystemMap() {
  const [selectedId, setSelectedId] = useState('export');
  const [activeStage, setActiveStage] = useState<StageId | 'all'>('all');
  const [activeTab, setActiveTab] = useState<'does' | 'built'>('does');
  const [traceStep, setTraceStep] = useState(-1);
  const [running, setRunning] = useState(false);
  const [view, setView] = useState({ scale: 0.86, x: 14, y: -8 });
  const dragRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);

  const selected = useMemo(() => nodes.find((node) => node.id === selectedId) ?? nodes[0], [selectedId]);
  const tracedRoute = traceStep >= 0 ? routes[traceStep] : null;

  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => {
      setTraceStep((step) => {
        const next = step + 1;
        if (next >= routes.length) {
          setRunning(false);
          return routes.length - 1;
        }
        setSelectedId(routes[next].to);
        return next;
      });
    }, 860);
    return () => window.clearInterval(timer);
  }, [running]);

  const reset = () => {
    setRunning(false);
    setTraceStep(-1);
    setSelectedId('export');
    setActiveStage('all');
    setView({ scale: 0.86, x: 14, y: -8 });
  };

  const traceOne = () => {
    setRunning(false);
    setTraceStep((step) => {
      const next = (step + 1) % routes.length;
      setSelectedId(routes[next].to);
      return next;
    });
  };

  return (
    <main className="atlas-app">
      <style>{`
        :root {
          --paper: #d7cfa5;
          --paper-2: #cec59a;
          --paper-3: #e0d8b2;
          --ink: #17170f;
          --muted: rgba(23, 23, 15, 0.66);
          --soft: rgba(23, 23, 15, 0.38);
          --rule: rgba(23, 23, 15, 0.42);
          --rule-soft: rgba(23, 23, 15, 0.16);
          --font-mono: "Courier New", Courier, monospace;
        }
        *, *::before, *::after { box-sizing: border-box; }
        html, body, #root { margin: 0; width: 100%; min-height: 100%; max-width: 100%; overflow-x: hidden; overflow-x: clip; }
        body { background: var(--paper); color: var(--ink); overflow-wrap: anywhere; }
        button { color: inherit; }
        .atlas-app {
          width: 100vw;
          height: 100dvh;
          min-height: 620px;
          display: grid;
          grid-template-columns: 142px minmax(0, 1fr) 312px;
          grid-template-rows: 52px minmax(0, 1fr);
          background: var(--paper);
          color: var(--ink);
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.015em;
        }
        .atlas-topbar {
          grid-column: 1 / -1;
          display: grid;
          grid-template-columns: minmax(210px, 1.7fr) repeat(5, minmax(108px, 0.8fr)) auto;
          min-width: 0;
          border-bottom: 1px solid var(--ink);
          overflow-x: auto;
          overflow-y: hidden;
          scrollbar-width: thin;
        }
        .atlas-metric {
          min-width: 0;
          padding: 7px 10px 6px;
          border-right: 1px solid var(--rule);
          white-space: nowrap;
          overflow: hidden;
        }
        .metric-label { display: block; color: var(--muted); font-size: 7px; letter-spacing: 0.14em; text-transform: uppercase; }
        .metric-value { display: block; margin-top: 3px; font-size: 11px; overflow: hidden; text-overflow: ellipsis; }
        .atlas-controls { display: flex; align-items: center; gap: 5px; width: max-content; min-width: 0; padding: 6px; white-space: nowrap; overflow: hidden; }
        .atlas-button {
          min-width: 0;
          flex: 0 0 auto;
          height: 28px;
          padding: 0 9px;
          border: 1px solid var(--ink);
          border-radius: 0;
          background: transparent;
          font: inherit;
          font-size: 8px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
        }
        .atlas-button:hover, .atlas-button:focus-visible, .atlas-button[aria-pressed="true"] { background: var(--ink); color: var(--paper); outline: none; }

        .atlas-sidebar {
          min-width: 0;
          border-right: 1px solid var(--ink);
          overflow-y: auto;
          scrollbar-width: thin;
        }
        .sidebar-heading { padding: 10px 8px 6px; color: var(--muted); font-size: 7px; letter-spacing: 0.16em; text-transform: uppercase; }
        .stage-group { border-top: 1px solid var(--rule); }
        .stage-button {
          width: 100%;
          display: grid;
          grid-template-columns: 18px minmax(0, 1fr) 14px;
          gap: 5px;
          padding: 7px 7px 6px;
          border: 0;
          border-bottom: 1px solid var(--rule-soft);
          background: transparent;
          text-align: left;
          font: inherit;
          cursor: pointer;
        }
        .stage-button:hover, .stage-button.is-active { background: var(--ink); color: var(--paper); }
        .stage-code { font-size: 8px; }
        .stage-title { display: block; font-size: 9px; text-transform: uppercase; line-height: 1.15; }
        .stage-count { text-align: right; font-size: 8px; }
        .stage-node {
          width: 100%;
          display: grid;
          grid-template-columns: 24px minmax(0, 1fr);
          gap: 4px;
          padding: 5px 7px;
          border: 0;
          border-bottom: 1px solid var(--rule-soft);
          background: transparent;
          color: var(--muted);
          text-align: left;
          font: inherit;
          font-size: 7px;
          line-height: 1.25;
          cursor: pointer;
        }
        .stage-node:hover, .stage-node.is-selected { color: var(--ink); background: rgba(255,255,255,0.13); }
        .stage-node-code { color: var(--ink); }

        .atlas-canvas {
          position: relative;
          min-width: 0;
          min-height: 0;
          overflow: hidden;
          cursor: grab;
          touch-action: none;
          background: var(--paper);
        }
        .atlas-canvas.is-panning { cursor: grabbing; }
        .canvas-kicker { position: absolute; z-index: 3; top: 9px; left: 10px; color: var(--muted); font-size: 7px; letter-spacing: 0.14em; text-transform: uppercase; pointer-events: none; }
        .zoom-controls { position: absolute; z-index: 4; top: 8px; right: 8px; display: grid; gap: 3px; }
        .zoom-controls button { width: 25px; height: 25px; border: 1px solid var(--ink); background: var(--paper); font: inherit; cursor: pointer; }
        .zoom-controls button:hover, .zoom-controls button:focus-visible { background: var(--ink); color: var(--paper); outline: none; }
        .trace-readout {
          position: absolute;
          z-index: 4;
          left: 10px;
          bottom: 22px;
          max-width: calc(100% - 20px);
          padding: 4px 7px;
          border: 1px solid var(--ink);
          background: var(--paper);
          font-size: 8px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .canvas-hint { position: absolute; z-index: 3; right: 8px; bottom: 6px; color: var(--muted); font-size: 7px; pointer-events: none; }
        .atlas-svg { width: 100%; height: 100%; display: block; }
        .atlas-world { transform-origin: 0 0; transition: transform 160ms linear; }
        .atlas-canvas.is-panning .atlas-world { transition: none; }
        .zone-outline { fill: none; stroke: var(--rule); stroke-width: 1; stroke-dasharray: 5 5; }
        .zone-label { fill: var(--muted); font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.12em; }
        .atlas-route { opacity: 0.74; transition: opacity 160ms linear; }
        .route-halo { fill: none; stroke: var(--paper); stroke-width: 6; stroke-linejoin: round; stroke-linecap: square; }
        .route-line { fill: none; stroke: var(--ink); stroke-width: 1.15; stroke-linejoin: round; stroke-linecap: square; }
        .route-evidence .route-line { stroke-dasharray: 6 4; }
        .route-control .route-line { stroke-dasharray: 9 3 2 3; }
        .route-mask { fill: var(--paper); stroke: none; }
        .route-label { fill: var(--ink); font-family: var(--font-mono); font-size: 7px; }
        .route-junction { fill: var(--ink); }
        .atlas-route.is-active { opacity: 1; }
        .atlas-route.is-active .route-line { stroke-width: 3; stroke-dasharray: 16 6; animation: atlas-dash 650ms linear; }
        .atlas-route.is-visited .route-line { stroke-width: 1.8; }
        @keyframes atlas-dash { from { stroke-dashoffset: 44; } to { stroke-dashoffset: 0; } }

        .atlas-building { cursor: pointer; opacity: 1; transition: opacity 160ms linear; outline: none; }
        .atlas-building.is-dimmed { opacity: 0.16; }
        .building-top, .building-front, .building-side, .building-stack { stroke: var(--ink); stroke-width: 1.1; vector-effect: non-scaling-stroke; }
        .building-top { fill: var(--paper-3); }
        .building-front { fill: url(#artifacture-atlas-hatch-front); }
        .building-side { fill: url(#artifacture-atlas-hatch-side); }
        .building-stack { fill: var(--paper); }
        .building-code { fill: var(--ink); font-family: var(--font-mono); font-size: 9px; }
        .building-name { fill: var(--ink); font-family: var(--font-mono); font-size: 7px; }
        .atlas-building:hover .building-top, .atlas-building:focus-visible .building-top, .atlas-building.is-selected .building-top { fill: var(--ink); }
        .atlas-building:hover .building-code, .atlas-building:focus-visible .building-code, .atlas-building.is-selected .building-code { fill: var(--paper); }
        .atlas-building.is-selected .building-top, .atlas-building.is-selected .building-front, .atlas-building.is-selected .building-side { stroke-width: 2; }

        .atlas-inspector {
          min-width: 0;
          border-left: 1px solid var(--ink);
          overflow-y: auto;
          scrollbar-width: thin;
          background: var(--paper);
        }
        .inspector-tabs { position: sticky; top: 0; z-index: 2; display: grid; grid-template-columns: 1fr 1fr; background: var(--paper); border-bottom: 1px solid var(--ink); }
        .inspector-tab { min-height: 34px; border: 0; border-right: 1px solid var(--ink); background: transparent; font: inherit; font-size: 8px; letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer; }
        .inspector-tab:last-child { border-right: 0; }
        .inspector-tab.is-active { background: var(--ink); color: var(--paper); }
        .inspector-body { padding: 18px 14px 24px; }
        .inspector-eyebrow { margin: 0; color: var(--muted); font-size: 8px; letter-spacing: 0.14em; text-transform: uppercase; }
        .inspector-title { margin: 8px 0 4px; font-size: 20px; line-height: 1.05; font-weight: 400; }
        .inspector-file { margin: 0 0 18px; color: var(--muted); font-size: 8px; line-height: 1.45; overflow-wrap: anywhere; }
        .inspector-section { margin-top: 16px; padding-top: 10px; border-top: 1px solid var(--ink); }
        .inspector-label { margin: 0 0 8px; color: var(--muted); font-size: 8px; letter-spacing: 0.14em; text-transform: uppercase; }
        .inspector-copy { margin: 0; font-size: 11px; line-height: 1.45; }
        .payload-grid { display: grid; grid-template-columns: 58px minmax(0, 1fr); gap: 5px 8px; font-size: 9px; line-height: 1.35; }
        .payload-grid dt { color: var(--muted); }
        .payload-grid dd { margin: 0; }
        .legend-row { display: grid; grid-template-columns: 44px minmax(0, 1fr); gap: 8px; align-items: center; margin-top: 7px; font-size: 8px; }
        .legend-line { display: block; height: 1px; background: var(--ink); }
        .legend-line.evidence { background: repeating-linear-gradient(90deg, var(--ink) 0 6px, transparent 6px 10px); }
        .legend-line.control { background: repeating-linear-gradient(90deg, var(--ink) 0 9px, transparent 9px 12px, var(--ink) 12px 14px, transparent 14px 18px); }
        .file-ledger { margin: 8px 0 0; padding: 0; list-style: none; }
        .file-ledger li { margin-top: 6px; padding-left: 28px; position: relative; font-size: 8px; line-height: 1.35; }
        .file-ledger b { position: absolute; left: 0; font-weight: 400; }

        @media (max-width: 980px) {
          .atlas-app { height: auto; min-height: 100dvh; grid-template-columns: 1fr; grid-template-rows: 52px auto 560px auto; }
          .atlas-topbar { grid-column: 1; grid-row: 1; }
          .atlas-sidebar { grid-row: 2; border-right: 0; border-bottom: 1px solid var(--ink); overflow-x: auto; overflow-y: hidden; }
          .sidebar-heading { display: none; }
          .stage-list { display: flex; min-width: 630px; }
          .stage-group { flex: 1 0 150px; border-top: 0; border-right: 1px solid var(--rule); }
          .stage-nodes { display: none; }
          .atlas-canvas { grid-row: 3; min-height: 560px; }
          .atlas-inspector { grid-row: 4; border-left: 0; border-top: 1px solid var(--ink); max-height: none; }
          .inspector-body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0 24px; }
          .inspector-head { grid-column: 1 / -1; }
        }
        @media (max-width: 620px) {
          .atlas-app { grid-template-rows: 52px auto 470px auto; }
          .atlas-canvas { min-height: 470px; }
          .inspector-body { display: block; }
          .payload-grid { grid-template-columns: 1fr; }
          .payload-grid dt { margin-top: 5px; }
          .canvas-hint { display: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; }
        }
        @media print {
          .atlas-app { width: 1400px; height: 900px; }
          .atlas-controls, .zoom-controls { display: none; }
        }
      `}</style>

      <header className="atlas-topbar" aria-label="System metrics">
        <div className="atlas-metric"><span className="metric-label">Repository</span><span className="metric-value">artifacture · visual-explainer</span></div>
        <div className="atlas-metric"><span className="metric-label">Subsystems</span><span className="metric-value">{nodes.length}</span></div>
        <div className="atlas-metric"><span className="metric-label">Control paths</span><span className="metric-value">{routes.length}</span></div>
        <div className="atlas-metric"><span className="metric-label">Stages</span><span className="metric-value">4 indexed</span></div>
        <div className="atlas-metric"><span className="metric-label">Primary payload</span><span className="metric-value">HTML artifact</span></div>
        <div className="atlas-metric"><span className="metric-label">Terminal states</span><span className="metric-value">3 bound</span></div>
        <div className="atlas-controls">
          <button className="atlas-button" type="button" aria-pressed={running} onClick={() => setRunning((value) => !value)}>{running ? 'Pause the flow' : 'Resume the flow'}</button>
          <button className="atlas-button" type="button" onClick={traceOne}>Trace one step</button>
          <button className="atlas-button" type="button" onClick={reset}>Reset view</button>
        </div>
      </header>

      <nav className="atlas-sidebar" aria-label="System stages">
        <div className="sidebar-heading">The system</div>
        <div className="stage-list">
          {stages.map((stage) => {
            const stageNodes = nodes.filter((node) => node.stage === stage.id);
            return (
              <section className="stage-group" key={stage.id}>
                <button
                  type="button"
                  className={`stage-button${activeStage === stage.id ? ' is-active' : ''}`}
                  onClick={() => setActiveStage((current) => current === stage.id ? 'all' : stage.id)}
                >
                  <span className="stage-code">{stage.code}</span>
                  <span><span className="stage-title">{stage.title}</span><span style={{ fontSize: 7, opacity: 0.68 }}>{stage.subtitle}</span></span>
                  <span className="stage-count">{stageNodes.length}</span>
                </button>
                <div className="stage-nodes">
                  {stageNodes.map((node) => (
                    <button key={node.id} type="button" className={`stage-node${selectedId === node.id ? ' is-selected' : ''}`} onClick={() => { setSelectedId(node.id); setActiveStage(node.stage); }}>
                      <span className="stage-node-code">{node.code}</span><span>{node.title}</span>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </nav>

      <section
        className={`atlas-canvas${dragRef.current ? ' is-panning' : ''}`}
        aria-label="Interactive isometric system map"
        onWheel={(event) => {
          event.preventDefault();
          const direction = event.deltaY > 0 ? -0.08 : 0.08;
          setView((current) => ({ ...current, scale: Math.min(1.45, Math.max(0.54, current.scale + direction)) }));
        }}
        onPointerDown={(event) => {
          if (getElementTarget(event.target)?.closest('button, .atlas-building')) return;
          dragRef.current = { x: event.clientX, y: event.clientY, originX: view.x, originY: view.y };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!dragRef.current) return;
          setView((current) => ({ ...current, x: dragRef.current!.originX + event.clientX - dragRef.current!.x, y: dragRef.current!.originY + event.clientY - dragRef.current!.y }));
        }}
        onPointerUp={(event) => { dragRef.current = null; event.currentTarget.releasePointerCapture(event.pointerId); }}
        onPointerCancel={() => { dragRef.current = null; }}
      >
        <div className="canvas-kicker">The system / artifacture control plane</div>
        <div className="zoom-controls" aria-label="Map zoom controls">
          <button type="button" aria-label="Zoom in" onClick={() => setView((current) => ({ ...current, scale: Math.min(1.45, current.scale + 0.12) }))}>+</button>
          <button type="button" aria-label="Zoom out" onClick={() => setView((current) => ({ ...current, scale: Math.max(0.54, current.scale - 0.12) }))}>−</button>
        </div>
        {tracedRoute ? <div className="trace-readout">{String(traceStep + 1).padStart(2, '0')} / {String(routes.length).padStart(2, '0')} · {tracedRoute.from} → {tracedRoute.to} · payload: {tracedRoute.label}</div> : null}
        <div className="canvas-hint">drag to pan · scroll to zoom · select a building to read</div>
        <svg className="atlas-svg" viewBox="0 0 1160 800" role="img" aria-labelledby="artifacture-atlas-title artifacture-atlas-desc" preserveAspectRatio="xMidYMid meet">
          <title id="artifacture-atlas-title">Artifacture control plane system atlas</title>
          <desc id="artifacture-atlas-desc">An interactive isometric map of nineteen code-owned subsystems and twenty-two control, artifact, source, and evidence paths from authoring through evidence-bound finalization.</desc>
          <defs>
            <pattern id="artifacture-atlas-hatch-front" width="5" height="5" patternUnits="userSpaceOnUse">
              <rect width="5" height="5" fill="var(--paper-2)" />
              <path d="M 0 1 H 5" stroke="var(--rule-soft)" strokeWidth="0.7" />
            </pattern>
            <pattern id="artifacture-atlas-hatch-side" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(60)">
              <rect width="5" height="5" fill="var(--paper)" />
              <path d="M 0 1 H 5" stroke="var(--rule-soft)" strokeWidth="0.7" />
            </pattern>
            {payloadKinds.map((kind) => (
              <marker key={kind} id={`artifacture-atlas-arrow-${kind}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 Z" fill="var(--ink)" />
              </marker>
            ))}
          </defs>
          <rect width="1160" height="800" fill="var(--paper)" />
          <g className="atlas-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
            <path className="zone-outline" d="M 48 58 H 1080 V 270 H 48 Z" />
            <text x="60" y="76" className="zone-label">A / AUTHORING</text>
            <path className="zone-outline" d="M 48 284 H 1080 V 462 H 48 Z" />
            <text x="60" y="302" className="zone-label">B / BUILD + EXPORT</text>
            <path className="zone-outline" d="M 48 474 H 884 V 614 H 48 Z" />
            <text x="60" y="492" className="zone-label">C / PREVIEW FEEDBACK</text>
            <path className="zone-outline" d="M 48 624 H 1080 V 766 H 48 Z" />
            <text x="60" y="642" className="zone-label">D / EVIDENCE GATE</text>

            <g aria-label="Control data paths">
              {routes.map((route, index) => <AtlasRoutePath key={`${route.from}-${route.to}`} route={route} index={index} traceStep={traceStep} />)}
            </g>
            <g aria-label="Code-owned subsystem buildings">
              {nodes.map((node) => (
                <IsoBuilding
                  key={node.id}
                  node={node}
                  selected={node.id === selectedId}
                  dimmed={activeStage !== 'all' && node.stage !== activeStage}
                  onSelect={() => { setSelectedId(node.id); setActiveStage(node.stage); }}
                />
              ))}
            </g>
          </g>
        </svg>
      </section>

      <aside className="atlas-inspector" aria-live="polite">
        <div className="inspector-tabs" role="tablist" aria-label="Inspector mode">
          <button type="button" role="tab" aria-selected={activeTab === 'does'} className={`inspector-tab${activeTab === 'does' ? ' is-active' : ''}`} onClick={() => setActiveTab('does')}>What it does</button>
          <button type="button" role="tab" aria-selected={activeTab === 'built'} className={`inspector-tab${activeTab === 'built' ? ' is-active' : ''}`} onClick={() => setActiveTab('built')}>How it’s built</button>
        </div>
        <div className="inspector-body">
          <div className="inspector-head">
            <p className="inspector-eyebrow">Artifacture / {selected.code}</p>
            <h1 className="inspector-title">{selected.title}</h1>
            <p className="inspector-file">{selected.file}</p>
          </div>

          <section className="inspector-section">
            <p className="inspector-label">{activeTab === 'does' ? 'What this is' : 'Implementation'}</p>
            <p className="inspector-copy">{activeTab === 'does' ? selected.summary : selected.built}</p>
          </section>

          <section className="inspector-section">
            <p className="inspector-label">Control data</p>
            <dl className="payload-grid"><dt>Receives</dt><dd>{selected.inputs}</dd><dt>Emits</dt><dd>{selected.outputs}</dd><dt>Stage</dt><dd>{stages.find((stage) => stage.id === selected.stage)?.title}</dd></dl>
          </section>

          <section className="inspector-section">
            <p className="inspector-label">Stage purpose</p>
            <p className="inspector-copy">{stageNotes[selected.stage].purpose}</p>
            <p className="inspector-file" style={{ marginTop: 8 }}>{stageNotes[selected.stage].source}</p>
          </section>

          <section className="inspector-section">
            <p className="inspector-label">Legend</p>
            <div className="legend-row"><span className="legend-line" /><span>source or artifact payload</span></div>
            <div className="legend-row"><span className="legend-line evidence" /><span>evidence or verdict payload</span></div>
            <div className="legend-row"><span className="legend-line control" /><span>session, patch, or rebuild control</span></div>
            <div className="legend-row"><span style={{ display: 'block', width: 13, height: 10, border: '1px solid var(--ink)', background: 'var(--paper-3)' }} /><span>code-owned subsystem</span></div>
          </section>

          <section className="inspector-section">
            <p className="inspector-label">How to read it</p>
            <p className="inspector-copy">Start at A1. Solid paths carry source or the generated artifact. Dash-dot paths carry preview control. Dashed paths carry evidence. The system is terminal only when D5 validates the verdict against the current contract identities.</p>
          </section>

          <section className="inspector-section">
            <p className="inspector-label">File citations</p>
            <ol className="file-ledger">
              <li><b>[01]</b> plugins/visual-explainer/SKILL.md:25-32</li>
              <li><b>[02]</b> visual-explainer-mdx/components.tsx:28-85,202-250</li>
              <li><b>[03]</b> scripts/ve-mdx/export.mjs:15-27,43-60,73-140</li>
              <li><b>[04]</b> plugins/visual-explainer/scripts/preview.mjs:207-238,291-365</li>
              <li><b>[05]</b> verify/lib/engine.mjs:12-35 · browser.mjs:13-45</li>
              <li><b>[06]</b> verify/lib/report.mjs:7-46,87-125</li>
              <li><b>[07]</b> verify/lib/model-policy.mjs:21-91</li>
              <li><b>[08]</b> verify/ve-finalize.mjs:9-35,39-104</li>
            </ol>
          </section>
        </div>
      </aside>
    </main>
  );
}
