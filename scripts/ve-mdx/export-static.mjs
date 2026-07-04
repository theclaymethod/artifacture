#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import mdx from '@mdx-js/rollup';

const repoRoot = process.cwd();

function parseArgs(argv) {
  const args = [...argv];
  const source = args.shift();
  let out = null;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--out') out = args[++i];
    else throw new Error(`Unknown argument: ${args[i]}`);
  }
  if (!source) throw new Error('Usage: npm run ve:export-static -- <source.mdx|source.tsx> --out <output.html>');
  if (!out) throw new Error('Missing --out <output.html>');
  return { source: path.resolve(repoRoot, source), out: path.resolve(repoRoot, out) };
}

function viteFsPath(filePath) {
  return `/@fs/${filePath.split(path.sep).join('/')}`;
}

async function main() {
  const { source, out } = parseArgs(process.argv.slice(2));
  const server = await createServer({
    root: repoRoot,
    appType: 'custom',
    logLevel: 'warn',
    plugins: [mdx(), react()],
    server: {
      middlewareMode: true,
      hmr: false,
      ws: false,
      fs: {
        allow: [repoRoot],
      },
    },
  });

  try {
    const mod = await server.ssrLoadModule(viteFsPath(source));
    if (typeof mod.default !== 'function') throw new Error('Static source must export a default React component.');
    const markup = renderToStaticMarkup(React.createElement(mod.default));
    const html = `<!doctype html>\n${markup}\n`;
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, html);
    console.log(`Generated static ${out}`);
  } finally {
    await server.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
