#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { build, createServer } from 'vite';
import react from '@vitejs/plugin-react';
import mdx from '@mdx-js/rollup';
import tailwindcss from '@tailwindcss/vite';
import { highlightRefs, preflightSource } from './integrity.mjs';
import { checkTrustMapPage, defaultSteLint, handCopied } from './trust-map-checks.mjs';
import { injectDesignSystemCss, presetNamesInSource, resolvePresetCssForExport } from './design-systems.mjs';
import { DEFAULT_PRESET } from '../../visual-explainer-mdx/preset-policy.mjs';
import { explainerTypeCss, explainerTypeName } from '../../visual-explainer-mdx/explainer-type.mjs';

// The web fonts that each built-in preset sets. themes.css imports every family for every preset;
// an MDX export keeps only the families its presets use, as variable weight ranges, so the page
// declares a few faces instead of about a hundred. Code stays the only mono text.
const PRESET_FONTS = {
  iso: ['Inter:wght@400..700', 'Geist+Mono:wght@400..500'],
  '3b1b': ['Inter:wght@400..700', 'Geist+Mono:wght@400..500', 'EB+Garamond:wght@400..600', 'STIX+Two+Math'],
  'mono-color': ['Inter:wght@400..700', 'Geist+Mono:wght@400..500'],
  algebrica: ['Inter:wght@400..700', 'Geist+Mono:wght@400..500', 'EB+Garamond:wght@400..600', 'STIX+Two+Math'],
  'mono-industrial': ['Space+Grotesk:wght@400..700', 'Space+Mono:wght@400;700'],
};
const FONT_IMPORT = /@import\s*(?:url\()?\s*["']?(https:\/\/fonts\.googleapis\.com\/css2\?[^"')]+)["']?\s*\)?\s*;?/;

/** Replace the all-presets font import with the families of the presets that the source uses. */
export function subsetFontImport(html, presets) {
  const names = presets.length ? presets : [DEFAULT_PRESET];
  if (!names.every((name) => PRESET_FONTS[name])) return html;
  const families = [...new Set(names.flatMap((name) => PRESET_FONTS[name]))];
  const url = `https://fonts.googleapis.com/css2?${families.map((family) => `family=${family}`).join('&')}&display=swap`;
  return html.replace(FONT_IMPORT, `@import url("${url}");`);
}

const repoRoot = process.cwd();

function parseArgs(argv) {
  const args = [...argv];
  const source = args.shift();
  let out = null;
  let draft = false;
  let prerender = false;
  let guardRepo = process.env.VE_GUARD_REPO || null;
  let guardHead = process.env.VE_GUARD_HEAD || null;
  let steLint = defaultSteLint();
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--out') out = args[++i];
    else if (args[i] === '--draft') draft = true;
    else if (args[i] === '--prerender') prerender = true;
    else if (args[i] === '--guard-repo') guardRepo = args[++i];
    else if (args[i] === '--guard-head') guardHead = args[++i];
    else if (args[i] === '--ste-lint') steLint = args[++i] === 'off' ? false : path.resolve(args[i]);
    else throw new Error(`Unknown argument: ${args[i]}`);
  }
  if (!source) throw new Error('Usage: npm run ve:export -- <source.mdx|source.tsx> --out <output.html> [--draft] [--prerender] [--guard-repo <repo> --guard-head <sha>] [--ste-lint <ste-lint.py|off>]');
  if (!out) throw new Error('Missing --out <output.html>');
  if (Boolean(guardRepo) !== Boolean(guardHead)) throw new Error('The no-hand-copy guard needs both --guard-repo and --guard-head (or VE_GUARD_REPO and VE_GUARD_HEAD).');
  return { source: path.resolve(repoRoot, source), out: path.resolve(repoRoot, out), draft, prerender, guard: guardRepo ? { repo: path.resolve(guardRepo), head: guardHead } : null, steLint };
}

function viteFsPath(filePath) {
  return `/@fs/${filePath.split(path.sep).join('/')}`;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function inlineAssets(html, distDir) {
  let output = html;
  const scriptPattern = /<script type="module" crossorigin src="([^"]+)"><\/script>/g;
  output = await replaceAsync(output, scriptPattern, async (_match, src) => {
    const js = (await fs.readFile(path.join(distDir, src.replace(/^\//, '')), 'utf8')).replaceAll(
      '</script',
      '<\\\\/script',
    );
    return `<script type="module">\n${js}\n</script>`;
  });

  const cssPattern = /<link rel="stylesheet" crossorigin href="([^"]+)">/g;
  output = await replaceAsync(output, cssPattern, async (_match, href) => {
    const css = await fs.readFile(path.join(distDir, href.replace(/^\//, '')), 'utf8');
    return `<style>\n${css}\n</style>`;
  });

  return output.replace('</head>', '<meta name="generator" content="visual-explainer-mdx">\n</head>');
}

async function replaceAsync(input, pattern, replacer) {
  const matches = [...input.matchAll(pattern)];
  let output = input;
  for (const match of matches) {
    const replacement = await replacer(...match);
    output = output.replace(match[0], () => replacement);
  }
  return output;
}

// The verification components (visual-explainer-mdx/trust-map.tsx and verification.tsx) need the
// static pre-render: it validates their data and runs the trust-map checks.
const TRUST_MAP_COMPONENTS = /<(VerifierView|PromiseList|PromiseChips|ClaimDetail|VerifyTheVerifiers|Invariants|Glossary|CodeRef|EvidenceGuide)\b/;
const REACT_DEDUPE = ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'];

/** The plugins that the static pre-render and the browser bundle share. `seen` collects the MDX files, `stamps` the trust maps that the source imports. */
function sharedPlugins(source, draft, seen, stamps) {
  return [veMdxPreflightPlugin(source, draft, seen), veDataPlugin(stamps), mdx(), react()];
}

// A bare 'visual-explainer-mdx/...' import resolves to this package, so an MDX source outside the
// package needs no absolute path to it.
const packageAlias = [{ find: /^visual-explainer-mdx\//, replacement: `${path.join(repoRoot, 'visual-explainer-mdx')}/` }];

/**
 * Render the source to HTML in Node (React server rendering), so the exported page shows its
 * text, tables and data without JavaScript; the browser bundle then hydrates it. A component that
 * throws, for example on bad trust-map data, fails the export here.
 */
async function prerender(source, draft, seen, stamps) {
  const cacheRoot = path.join(repoRoot, '.ve-mdx-tmp');
  await fs.mkdir(cacheRoot, { recursive: true });
  const cacheDir = await fs.mkdtemp(path.join(cacheRoot, 'prerender-'));
  const server = await createServer({
    root: repoRoot,
    cacheDir,
    configFile: false,
    appType: 'custom',
    logLevel: 'warn',
    plugins: sharedPlugins(source, draft, seen, stamps),
    resolve: { alias: packageAlias, dedupe: REACT_DEDUPE },
    css: { postcss: { plugins: [] } },
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false, fs: { strict: false } },
  });
  try {
    const mod = await server.ssrLoadModule(source);
    return renderToString(React.createElement(mod.default));
  } catch (error) {
    throw new Error(`the static pre-render failed: ${error instanceof Error ? error.message : error}`);
  } finally {
    await server.close();
    await fs.rm(cacheDir, { recursive: true, force: true });
  }
}

async function main() {
  const { source, out, draft, prerender: wantPrerender, guard, steLint } = parseArgs(process.argv.slice(2));
  if (!(await exists(source))) throw new Error(`Source not found: ${source}`);
  if (!/\.(mdx|tsx|jsx)$/.test(source)) throw new Error('Source must end in .mdx, .tsx, or .jsx');
  const sourceCode = await fs.readFile(source, 'utf8');
  const seen = new Set();
  const stamps = new Map();
  const trustMap = TRUST_MAP_COMPONENTS.test(sourceCode);
  let markup = null;
  if (wantPrerender || trustMap) {
    markup = await prerender(source, draft, seen, stamps);
    const errors = checkTrustMapPage(markup, { steLint });
    if (errors.length) throw new Error(`visual-explainer trust-map checks failed:\n  ${errors.join('\n  ')}`);
  }
  if (guard) {
    const files = await Promise.all([...new Set([source, ...seen])].map(async (file) => ({ file: path.relative(process.cwd(), file), text: await fs.readFile(file, 'utf8') })));
    const pasted = handCopied(files, guard.repo, guard.head);
    if (pasted.length) throw new Error(`visual-explainer no-hand-copy guard failed:\n  ${pasted.join('\n  ')}`);
  }

  const tmpRoot = path.join(repoRoot, '.ve-mdx-tmp');
  await fs.mkdir(tmpRoot, { recursive: true });
  const tmp = await fs.mkdtemp(path.join(tmpRoot, 'export-'));
  try {
    const dist = path.join(tmp, 'dist');
    await fs.mkdir(path.join(tmp, 'src'), { recursive: true });

    await fs.writeFile(
      path.join(tmp, 'index.html'),
      `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Visual Explainer</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>`,
    );

    // A pre-rendered page hydrates: React keeps the server markup and adds the behaviour.
    const mount = markup === null
      ? `createRoot(document.getElementById('root')).render(<Source />);`
      : `document.documentElement.dataset.veJs = '';\nhydrateRoot(document.getElementById('root'), <Source />);`;
    await fs.writeFile(
      path.join(tmp, 'src/main.jsx'),
      `import React from 'react';\nimport { createRoot, hydrateRoot } from 'react-dom/client';\nimport ${JSON.stringify(viteFsPath(path.join(repoRoot, 'visual-explainer-mdx/global.css')))};\nimport Source from ${JSON.stringify(viteFsPath(source))};\n\n${mount}\n`,
    );

    await build({
      root: tmp,
      base: './',
      logLevel: 'warn',
      plugins: [...sharedPlugins(source, draft, seen, stamps), tailwindcss()],
      // A source outside the Artifacture package can have its own physical
      // React install. Without dedupe, the generated bundle renders with
      // Artifacture's ReactDOM while hooks import the source package's React,
      // leaving that second copy's dispatcher null at runtime.
      resolve: {
        alias: packageAlias,
        dedupe: REACT_DEDUPE,
      },
      server: {
        fs: {
          allow: [repoRoot, tmp],
        },
      },
      build: {
        outDir: dist,
        emptyOutDir: true,
        assetsInlineLimit: Number.MAX_SAFE_INTEGER,
        codeSplitting: false,
        cssCodeSplit: false,
      },
    });

    const html = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
    let generated = await inlineAssets(html, dist);

    // Resolve data-ve-preset names against the external design-system
    // registry ($ARTIFACTURE_DESIGN_DIR → ~/.artifacture/design-systems →
    // <repo>/design-systems) and inline the matching tokens.css. Unknown
    // names fall back to built-in tokens with a warning.
    const { css: designSystemCss, warnings } = resolvePresetCssForExport(sourceCode, {
      repoRoot,
      globalCssPath: path.join(repoRoot, 'visual-explainer-mdx/global.css'),
    });
    for (const warning of warnings) console.warn(`WARN: ${warning}`);
    if (designSystemCss) {
      generated = injectDesignSystemCss(generated, designSystemCss);
    }

    if (trustMap) {
      // A trust-map explainer embeds its own fonts (visual-explainer-mdx/explainer-type.mjs) and
      // loads nothing from a font service, so it reads the same offline.
      const type = explainerTypeName();
      generated = generated.replace(FONT_IMPORT, '').replace(/<link rel="preconnect" href="https:\/\/fonts\.(?:googleapis|gstatic)\.com"(?: crossorigin)?>/g, '');
      generated = generated.replace('</head>', () => `<style data-ve-explainer-type="${type}">\n${explainerTypeCss(type)}\n</style>\n</head>`);
    } else if (source.endsWith('.mdx')) generated = subsetFontImport(generated, presetNamesInSource(sourceCode));
    if (markup !== null) generated = generated.replace('<div id="root"></div>', () => `<div id="root">${markup}</div>`);
    // The trust map that the page was built from: its head and the SHA-256 of the file, so a
    // reader (or understando review) can tell when the explainer is stale.
    const meta = [...stamps.values()].map((s) => `<meta name="ve-trust-map-head" content="${s.head}">\n<meta name="ve-trust-map-sha256" content="${s.sha256}">\n`).join('');
    if (meta) generated = generated.replace('</head>', () => `${meta}</head>`);

    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, generated);
    console.log(`Generated ${out}${markup === null ? '' : ' (pre-rendered)'}`);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

/**
 * Data files that the source imports. A trust map (a JSON with schema_version, head, claims and
 * promises) is stamped into the page; a resolved-refs file (refs.resolved.json) gets its code
 * highlighted, the same in the pre-render and in the bundle.
 */
function veDataPlugin(stamps) {
  return {
    name: 'visual-explainer-mdx-data',
    enforce: 'pre',
    async transform(code, id) {
      const file = id.split('?')[0];
      if (!file.endsWith('.json') || file.includes(`${path.sep}node_modules${path.sep}`)) return null;
      let value;
      try {
        value = JSON.parse(code);
      } catch {
        return null;
      }
      if (value && typeof value === 'object' && Array.isArray(value.claims) && Array.isArray(value.promises) && value.head && 'schema_version' in value) {
        stamps.set(file, { head: value.head, sha256: createHash('sha256').update(await fs.readFile(file)).digest('hex') });
        return null;
      }
      // Any schema of refs.resolved.json: the components check the schema and fail an unknown one.
      if (value && typeof value === 'object' && Number.isInteger(value.schema) && Array.isArray(value.refs) && value.diff) {
        return { code: JSON.stringify(await highlightRefs(value)), map: null };
      }
      return null;
    },
  };
}

function veMdxPreflightPlugin(source, draft, seen = new Set()) {
  return {
    name: 'visual-explainer-mdx-preflight',
    enforce: 'pre',
    async transform(code, id) {
      const file = path.resolve(id.split('?')[0]);
      // The entry, and each MDX module it imports from its own directory tree (for example one
      // chapter per file), gets the same integrity checks and code highlighting.
      const chapter = file.endsWith('.mdx') && file.startsWith(path.dirname(source) + path.sep) && !file.split(path.sep).includes('node_modules');
      if (file !== source && !chapter) return null;
      seen.add(file);
      const result = await preflightSource(code, { id: path.relative(repoRoot, file), draft });
      return { code: result.code, map: null };
    },
  };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
