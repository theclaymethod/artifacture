#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import mdx from '@mdx-js/rollup';
import tailwindcss from '@tailwindcss/vite';
import { preflightSource } from './integrity.mjs';

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
      '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Visual Explainer</title></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>',
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
      server: {
        fs: {
          allow: [repoRoot, tmp],
        },
      },
      build: {
        outDir: dist,
        emptyOutDir: true,
        assetsInlineLimit: Number.MAX_SAFE_INTEGER,
        cssCodeSplit: false,
        rollupOptions: {
          output: {
            inlineDynamicImports: true,
          },
        },
      },
    });

    const html = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
    const generated = await inlineAssets(html, dist);
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
      const cleanId = id.split('?')[0];
      if (path.resolve(cleanId) !== source) return null;
      const result = await preflightSource(code, { id: path.relative(repoRoot, source), draft });
      return { code: result.code, map: null };
    },
  };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
