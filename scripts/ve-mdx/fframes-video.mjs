#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { nativeSvgTheme, createNativeSvgFrame } from '../fframes/svg.mjs';
import { renderNativeProject } from '../fframes/render.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const revision = '30b48f3da60040e0fd7c811fdcd5b159e70a5b02';
const args = process.argv.slice(2), source = args.shift(), options = new Map();
const help = 'Usage: artifacture fframes <source.tsx> --out <new-project-directory> [--fps <1–120>] [--render]\nExperimental silent SVG → FFrames project; macOS Metal. --render uses a cached native build and inspects before encoding.';
const hash = value => createHash('sha256').update(value).digest('hex');
let server, temp;
try {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--render' && !options.has('--render')) { options.set('--render', true); continue; }
    if (!['--out', '--fps'].includes(args[i]) || options.has(args[i]) || !args[i + 1] || args[i + 1].startsWith('-')) throw new Error(help);
    options.set(args[i], args[++i]);
  }
  const fps = Number(options.get('--fps') ?? 30);
  if (!source || source.startsWith('-') || !options.has('--out') || !Number.isSafeInteger(fps) || fps < 1 || fps > 120) throw new Error(help);
  if (process.platform !== 'darwin') throw new Error('The experimental FFrames bridge currently targets macOS Metal. Other native backends have not been validated.');
  const sourcePath = path.resolve(source), out = path.resolve(options.get('--out'));
  if (await fs.lstat(out).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; })) throw new Error('FFrames output must be a new directory. Existing projects are never overwritten.');
  const started = performance.now();
  const fsImport = file => `/@fs/${file.split(path.sep).join('/')}`;
  server = await createServer({ root, appType: 'custom', logLevel: 'warn', optimizeDeps: { noDiscovery: true, include: [] }, plugins: [react()], resolve: { dedupe: ['react', 'react-dom'] }, server: { middlewareMode: true, hmr: false, ws: false, fs: { allow: [root, path.dirname(sourcePath)] } } });
  const mod = await server.ssrLoadModule(fsImport(sourcePath));
  const { sequenceSlides, sampleSlideSequence } = await server.ssrLoadModule(fsImport(path.join(root, 'visual-explainer-mdx/graphic-slides.tsx')));
  const { GraphicCanvas } = await server.ssrLoadModule(fsImport(path.join(root, 'visual-explainer-mdx/graphics.tsx')));
  if (!mod.sequence || !Array.isArray(mod.sequence.slides)) throw new Error('FFrames source must export a shared slide sequence. Arbitrary HTML and browser media need the HTML renderer.');
  const sequence = sequenceSlides(mod.sequence.id, mod.sequence.slides);
  if ([sequence.width, sequence.height].some(n => !Number.isSafeInteger(n) || n < 32 || n > 7680 || n % 2)) throw new Error('FFrames H.264 frames require even integer dimensions from 32 to 7680.');
  const frameCount = Math.ceil(sequence.duration * fps);
  if (frameCount > 10000) throw new Error('The experimental in-memory SVG pack accepts at most 10,000 frames. Select a shorter sequence.');
  const css = await fs.readFile(path.join(root, 'visual-explainer-mdx/themes.css'), 'utf8');
  const themes = new Map(sequence.slides.map(({ slide }) => [`${slide.preset}:${slide.appearance}`, nativeSvgTheme(css, slide.preset, slide.appearance)]));
  await fs.mkdir(path.dirname(out), { recursive: true });
  temp = await fs.mkdtemp(path.join(path.dirname(out), '.fframes-'));
  await fs.mkdir(path.join(temp, 'src')); await fs.mkdir(path.join(temp, 'media'));
  const digest = createHash('sha256'), lengths = new Map(), bank = new Map(), svgs = [], order = [];
  let bytes = 0;
  for (let frame = 0; frame < frameCount; frame++) {
    const slide = sampleSlideSequence(sequence, frame / fps), key = hash(JSON.stringify(slide));
    if (!bank.has(key)) {
      const markup = renderToStaticMarkup(React.createElement(GraphicCanvas, { scene: slide.graphic, instancePrefix: 'native' }));
      const svg = createNativeSvgFrame(slide, markup, themes.get(`${slide.preset}:${slide.appearance}`), lengths);
      bytes += Buffer.byteLength(svg);
      if (bytes > 512 * 1024 * 1024) throw new Error('The SVG bank exceeds 512 MiB. Select a shorter or simpler sequence.');
      bank.set(key, svgs.length); svgs.push(svg);
    }
    order.push(bank.get(key));
  }
  const pack = JSON.stringify({ width: sequence.width, height: sequence.height, fps, order, svgs });
  digest.update(pack);
  await fs.writeFile(path.join(temp, 'frames.json'), pack);
  const manifest = { renderer: 'fframes-svg-experiment', revision, source: sourcePath, sourceSha256: hash(await fs.readFile(sourcePath)), sequenceSha256: hash(JSON.stringify(sequence)), themesSha256: hash(css), width: sequence.width, height: sequence.height, fps, frames: frameCount, uniqueFrames: svgs.length, authoredDuration: sequence.duration, encodedDuration: frameCount / fps, framesSha256: digest.digest('hex'), bytes: Buffer.byteLength(pack), audio: 'none' };
  const template = await fs.readFile(path.join(root, 'scripts/fframes/main.rs.tmpl'), 'utf8');
  await fs.writeFile(path.join(temp, 'src/main.rs'), template.replace(/\{\{(WIDTH|HEIGHT|FPS|FRAMES)\}\}/g, (_, key) => String({ WIDTH: sequence.width, HEIGHT: sequence.height, FPS: fps, FRAMES: frameCount }[key])));
  await fs.writeFile(path.join(temp, 'Cargo.toml'), `[package]\nname = "artifacture-fframes"\nversion = "0.1.0"\nedition = "2024"\npublish = false\n[dependencies]\nfframes = { git = "https://github.com/dmtrKovalenko/fframes", rev = "${revision}", features = ["cli", "h264", "libav-agree-gpl", "build-portable"] }\nfframes_skia_renderer = { git = "https://github.com/dmtrKovalenko/fframes", rev = "${revision}", features = ["metal"] }\nserde = { version = "1", features = ["derive"] }\nserde_json = "1"\n[workspace]\n`);
  await fs.copyFile(path.join(root, 'scripts/fframes/Cargo.lock'), path.join(temp, 'Cargo.lock'));
  manifest.fonts = [];
  for (const name of (await fs.readdir(path.join(root, 'scripts/video-engines/fonts'))).sort()) {
    const file = path.join(root, 'scripts/video-engines/fonts', name);
    await fs.copyFile(file, path.join(temp, 'media', name));
    manifest.fonts.push({ name, sha256: hash(await fs.readFile(file)) });
  }
  manifest.cargoLockSha256 = hash(await fs.readFile(path.join(temp, 'Cargo.lock')));
  manifest.exportSeconds = (performance.now() - started) / 1000;
  await fs.writeFile(path.join(temp, 'artifacture-fframes.json'), JSON.stringify(manifest, null, 2) + '\n');
  await fs.writeFile(path.join(temp, 'README.md'), '# FFrames SVG experiment\n\nRegenerate frames from the original TypeScript sequence after an edit. SVG geometry and timing come from Artifacture; native header text requires explicit line breaks. This is a silent vector route, not an HTML/CSS or media renderer.\n\n```sh\ncargo build --release --locked\ncargo run --release --locked -- inspect --all-frames --json\ncargo run --release --locked -- strip -n 12\ncargo run --release --locked -- render -o out.mp4 --json\n```\n\nRun inspect and examine the strip before accepting the encoded film. Cargo.lock pins transitive dependencies. The manifest records source, sequence, theme and frame-pack hashes.\n');
  // Rename only after a complete export. A second existence check preserves a
  // project created during sampling; rename of a nonempty directory also fails.
  if (await fs.lstat(out).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; })) throw new Error('FFrames output appeared during export; preserving it.');
  await fs.rename(temp, out); temp = undefined;
  if (options.has('--render')) manifest.native = await renderNativeProject(out);
  console.log(JSON.stringify({ project: out, ...manifest }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error); process.exitCode = 1;
} finally {
  await server?.close(); if (temp) await fs.rm(temp, { recursive: true, force: true });
}
