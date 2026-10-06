#!/usr/bin/env node
import { readFile, writeFile, mkdir, readdir, copyFile, access } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import ffmpeg from 'ffmpeg-static';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const [jobFile, flag, destination, ...extra] = process.argv.slice(2);
if (!jobFile || flag !== '--out' || !destination || extra.length) throw new Error('Usage: artifacture source-video <job.json> --out <directory>');
const job = JSON.parse(await readFile(path.resolve(jobFile), 'utf8'));
if (!['diagram-design', 'pr-lens', 'chalkboarding'].includes(job.library) || String(job.example) !== job.example || !job.example) throw new Error('Source video needs a supported library and example.');
for (const [key, min, max] of [['fps', 1, 60], ['width', 64, 3840], ['height', 64, 3840]]) {
  if (!Number.isSafeInteger(job[key]) || job[key] < min || job[key] > max) throw new Error(`Invalid source-video ${key}.`);
}
if (job.width % 2 || job.height % 2 || !Number.isFinite(job.duration) || job.duration <= 0 || job.duration > 120 || Math.abs(job.duration * job.fps - Math.round(job.duration * job.fps)) > 1e-8) throw new Error('Source duration must lie on its frame grid; dimensions must be even.');
const out = path.resolve(destination);
if ((await readdir(out).catch(error => { if (error.code === 'ENOENT') return []; throw error; })).length) throw new Error('Source video output must be new or empty; existing renders are not overwritten.');

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', env: { ...process.env, PATH: `${path.dirname(ffmpeg)}${path.delimiter}${process.env.PATH ?? ''}` } });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${command} failed (${code}).`)));
  });
}
if (!ffmpeg) throw new Error('The packaged FFmpeg encoder does not support this platform.');
const encoder = path.dirname(fileURLToPath(import.meta.resolve('ffmpeg-static/package.json')));
if (!await access(ffmpeg).then(() => true, () => false)) {
  console.error('Installing the pinned FFmpeg encoder…');
  await run(process.execPath, [path.join(encoder, 'install.js')], encoder);
}
const server = await createServer({ root, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true }, server: { middlewareMode: true, hmr: false, ws: false } });
let asset; let html;
try {
  const { prepareSourceDocument } = await server.ssrLoadModule('/visual-explainer-mdx/source-document.ts');
  if (job.library === 'diagram-design') {
    const { diagramDesignSource } = await server.ssrLoadModule('/visual-explainer-mdx/diagram-design-figure.tsx');
    asset = diagramDesignSource(job.example);
  } else {
    const file = job.library === 'pr-lens' ? 'pr-lens-examples' : 'chalkboard-examples';
    const module = await server.ssrLoadModule(`/visual-explainer-mdx/${file}.ts`);
    const examples = job.library === 'pr-lens' ? module.prLensExamples : module.chalkboardExamples;
    const figure = examples[job.example];
    if (!figure) throw new Error('Unknown native source example.');
    const record = JSON.parse(await readFile(path.join(root, 'tools/visual-sources.json'), 'utf8'))[job.library];
    asset = { title: figure.title, html: figure.svg ?? figure.html, timing: job.library === 'pr-lens' ? 'smil' : figure.html.includes('function paint(t)') && figure.html.includes('function play(){') ? 'chalkboarding' : 'native', source: record.repository, revision: record.revision };
  }
  html = prepareSourceDocument(asset, true).replace('</body>', `<script>window.DUR=${job.duration};window.READY=false;window.render=seconds=>window.__artifactureSample(seconds);window.addEventListener('message',event=>{if(event.source===window&&event.data?.type==='artifacture:ready')window.READY=true;});</script></body>`);
} finally { await server.close(); }
await mkdir(out, { recursive: true });
await writeFile(path.join(out, 'original.html'), asset.html);
await writeFile(path.join(out, 'index.html'), html);
await writeFile(path.join(out, 'job.json'), JSON.stringify(job, null, 2) + '\n');
const video = path.join(out, 'clip.mp4');
const lemo = path.join(root, 'plugins/visual-explainer/vendor/lemo-opuscar');
await run(process.execPath, [path.join(lemo, 'core/render/video.mjs'), out, '--fps', String(job.fps), '--size', `${job.width}x${job.height}`, '--workers', '1', '--out', video], lemo);
const frames = Math.round(job.duration * job.fps);
const selected = [...new Set([0, Math.floor(frames / 2), frames - 1])];
const stills = [];
for (const frameIndex of selected) {
  const image = `frame-${String(frameIndex).padStart(6, '0')}.png`;
  await run(ffmpeg, ['-y', '-loglevel', 'error', '-i', video, '-vf', `select=eq(n\\,${frameIndex})`, '-frames:v', '1', path.join(out, image)], root);
  stills.push({ seconds: frameIndex / job.fps, sampledSeconds: frameIndex / job.fps, frameIndex, image });
}
const manifest = {
  schemaVersion: 1,
  asset: { id: `source-${job.library}`, title: asset.title, engine: 'source', theme: 'original', video: 'clip.mp4', poster: stills[0].image, width: job.width, height: job.height, duration: job.duration, fps: job.fps, frames, hasAudio: false, stills },
  source: { library: job.library, repository: asset.source, revision: asset.revision, original: 'original.html', originalSha256: createHash('sha256').update(asset.html).digest('hex'), adapter: 'index.html', adapterSha256: createHash('sha256').update(html).digest('hex') },
  renderer: { source: 'https://github.com/lemomo-ai/lemo-opuscar', revision: 'b65efe6ea393fdc71212898ea4c57c754cfefa46', fps: job.fps, duration: job.duration }
};
await writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const notice = job.library === 'diagram-design' ? 'DIAGRAM-DESIGN-LICENSE' : job.library === 'pr-lens' ? 'PR-LENS-LICENSE' : 'CHALKBOARDING-LICENSE';
await copyFile(path.join(root, 'visual-explainer-mdx', notice), path.join(out, notice));
await copyFile(path.join(lemo, 'LICENSE'), path.join(out, 'LEMO-RENDERER-LICENSE'));
await copyFile(path.join(encoder, 'LICENSE'), path.join(out, 'FFMPEG-STATIC-LICENSE'));
await copyFile(path.join(encoder, 'ffmpeg.LICENSE'), path.join(out, 'FFMPEG-LICENSE'));
await copyFile(path.join(encoder, 'ffmpeg.README'), path.join(out, 'FFMPEG-SOURCE.md'));
if (job.library === 'chalkboarding') await copyFile(path.join(root, 'visual-explainer-mdx/CHALKBOARDING-FONT-NOTICE.md'), path.join(out, 'CHALKBOARDING-FONT-NOTICE.md'));
if (job.library === 'diagram-design') await copyFile(path.join(root, 'plugins/visual-explainer/vendor/diagram-design/THIRD_PARTY_LICENSES.md'), path.join(out, 'THIRD_PARTY_LICENSES.md'));
console.log(`Rendered ${frames} original-source frames, clip, ${stills.length} decoded stills and source provenance: ${out}`);
