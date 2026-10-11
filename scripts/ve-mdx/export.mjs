#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import mdx from '@mdx-js/rollup';
import tailwindcss from '@tailwindcss/vite';
import { preflightSource } from './integrity.mjs';
import { injectDesignSystemCss, presetNamesInSource, resolvePresetCssForExport } from './design-systems.mjs';
import { DEFAULT_PRESET } from '../../visual-explainer-mdx/preset-policy.mjs';

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
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--out') out = args[++i];
    else if (args[i] === '--draft') draft = true;
    else throw new Error(`Unknown argument: ${args[i]}`);
  }
  if (!source) throw new Error('Usage: npm run ve:export -- <source.mdx|source.tsx> --out <output.html> [--draft]');
  if (!out) throw new Error('Missing --out <output.html>');
  return { source: path.resolve(repoRoot, source), out: path.resolve(repoRoot, out), draft };
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

async function main() {
  const { source, out, draft } = parseArgs(process.argv.slice(2));
  if (!(await exists(source))) throw new Error(`Source not found: ${source}`);
  if (!/\.(mdx|tsx|jsx)$/.test(source)) throw new Error('Source must end in .mdx, .tsx, or .jsx');

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

    await fs.writeFile(
      path.join(tmp, 'src/main.jsx'),
      `import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport ${JSON.stringify(viteFsPath(path.join(repoRoot, 'visual-explainer-mdx/global.css')))};\nimport Source from ${JSON.stringify(viteFsPath(source))};\n\ncreateRoot(document.getElementById('root')).render(<Source />);\n`,
    );

    await build({
      root: tmp,
      base: './',
      logLevel: 'warn',
      plugins: [veMdxPreflightPlugin(source, draft), mdx(), react(), tailwindcss()],
      // A source outside the Artifacture package can have its own physical
      // React install. Without dedupe, the generated bundle renders with
      // Artifacture's ReactDOM while hooks import the source package's React,
      // leaving that second copy's dispatcher null at runtime.
      resolve: {
        dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
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
    const sourceCode = await fs.readFile(source, 'utf8');
    const { css: designSystemCss, warnings } = resolvePresetCssForExport(sourceCode, {
      repoRoot,
      globalCssPath: path.join(repoRoot, 'visual-explainer-mdx/global.css'),
    });
    for (const warning of warnings) console.warn(`WARN: ${warning}`);
    if (designSystemCss) {
      generated = injectDesignSystemCss(generated, designSystemCss);
    }

    if (source.endsWith('.mdx')) generated = subsetFontImport(generated, presetNamesInSource(sourceCode));

    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, generated);
    console.log(`Generated ${out}`);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

function veMdxPreflightPlugin(source, draft) {
  return {
    name: 'visual-explainer-mdx-preflight',
    enforce: 'pre',
    async transform(code, id) {
      const file = path.resolve(id.split('?')[0]);
      // The entry, and each MDX module it imports from its own directory tree (for example one
      // chapter per file), gets the same integrity checks and code highlighting.
      const chapter = file.endsWith('.mdx') && file.startsWith(path.dirname(source) + path.sep) && !file.split(path.sep).includes('node_modules');
      if (file !== source && !chapter) return null;
      const result = await preflightSource(code, { id: path.relative(repoRoot, file), draft });
      return { code: result.code, map: null };
    },
  };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
