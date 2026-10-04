#!/usr/bin/env node
import fs from 'node:fs/promises';
import os from 'node:os';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build, createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { resolvePresetCssForExport } from './design-systems.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const source = args.shift();
if (!source || args.length !== 2 || args[0] !== '--out' || !args[1]) {
  console.error('Usage: node scripts/ve-mdx/graphic-video.mjs <source.tsx> --out <video.html>');
  process.exit(1);
}
const sourcePath = path.resolve(source);
const out = path.resolve(args[1]);
const fsImport = (file) => `/@fs/${file.split(path.sep).join('/')}`;
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'artifacture-graphic-video-'));
let server;
try {
  server = await createServer({ root, appType: 'custom', logLevel: 'warn', optimizeDeps: { noDiscovery: true, include: [] }, plugins: [react()], resolve: { dedupe: ['react', 'react-dom'] }, server: { middlewareMode: true, hmr: false, ws: false, fs: { allow: [root, path.dirname(sourcePath)] } } });
  const mod = await server.ssrLoadModule(fsImport(sourcePath));
  const { sequenceSlides } = await server.ssrLoadModule(fsImport(path.join(root, 'visual-explainer-mdx/graphic-slides.tsx')));
  const { GraphicVideo } = await server.ssrLoadModule(fsImport(path.join(root, 'visual-explainer-mdx/graphic-video.tsx')));
  if (!mod.sequence || !Array.isArray(mod.sequence.slides)) throw new Error('Video source must export a sequence created by sequenceSlides.');
  const sequence = sequenceSlides(mod.sequence.id, mod.sequence.slides);
  const markup = renderToStaticMarkup(React.createElement(GraphicVideo, { sequence }));
  const entry = path.join(temp, 'entry.ts');
  await fs.writeFile(entry, `export { registerGraphicVideo } from ${JSON.stringify(fsImport(path.join(root, 'visual-explainer-mdx/graphic-video-runtime.tsx')))};\n`);
  const bundle = await build({ root, oxc: { jsx: { development: false } }, logLevel: 'warn', define: { 'process.env.NODE_ENV': JSON.stringify('production') }, plugins: [react()], resolve: { dedupe: ['react', 'react-dom'] }, build: { write: false, minify: true, lib: { entry, name: 'ArtifactureGraphicVideo', formats: ['iife'] }, codeSplitting: false } });
  const chunks = (Array.isArray(bundle) ? bundle.flatMap((result) => result.output) : bundle.output).filter((item) => item.type === 'chunk');
  if (chunks.length !== 1) throw new Error('Graphic video must compile to one self-contained browser bundle.');
  const script = chunks[0].code;
  const runtimeName = `graphic-runtime-${createHash('sha256').update(script).digest('hex').slice(0, 12)}.js`;
  const payload = JSON.stringify(sequence).replaceAll('<', '\\u003c');
  const compositionId = JSON.stringify(sequence.id).replaceAll('<', '\\u003c');
  const canonicalTheme = await fs.readFile(path.join(root, 'visual-explainer-mdx/themes.css'), 'utf8');
  const motionTheme = await fs.readFile(path.join(root, 'plugins/visual-explainer/templates/hairline-motion-theme.css'), 'utf8');
  const presetNames = [...new Set(sequence.slides.map(({ slide }) => slide.preset))];
  const brandStyle = presetNames.map((preset) => {
    const brand = resolvePresetCssForExport(`<div data-ve-preset="${preset}"></div>`, { repoRoot: root, globalCssPath: path.join(root, 'visual-explainer-mdx/themes.css') });
    brand.warnings.forEach((warning) => console.warn(`WARN: ${warning}`));
    return brand.css ? `<style>${brand.css}</style>` : '';
  }).join('');
  const theme = canonicalTheme + motionTheme;
  const title = sequence.slides[0].slide.title.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const html = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${theme}\nhtml,body{width:100%;height:100%;margin:0}svg{display:block}</style>${brandStyle}</head><body>${markup}<script src="./${runtimeName}"></script><script>window.__timelines = window.__timelines || {}; window.__timelines[${compositionId}] = ArtifactureGraphicVideo.registerGraphicVideo(${payload});</script></body></html>\n`;
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(path.join(path.dirname(out), runtimeName), script);
  await fs.writeFile(out, html);
  console.log(`Generated finite ${sequence.duration}s graphic video ${out}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await server?.close();
  await fs.rm(temp, { recursive: true, force: true });
}
