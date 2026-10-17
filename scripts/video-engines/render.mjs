/* oxlint-disable anti-slop/no-runtime-typeof -- This module decodes external render-job JSON at the CLI boundary. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { engineById } from './engines.mjs';
import { nativeTheme } from './themes.mjs';
import { root, engineHome, run, readyEngine, rustEnvironment, hash, exists } from './runtime.mjs';

function relativeFile(value) {
  if (typeof value !== 'string' || !value || value.startsWith('/') || value.includes('\\') || value.split('/').some(part => !part || part === '..' || part === '.') || /^[a-z]+:/i.test(value)) throw new Error('Source must be a relative path inside the job directory.');
  return value;
}

export function validateJob(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected a native render job object.');
  const allowed = ['schemaVersion', 'id', 'title', 'engine', 'source', 'scene', 'theme', 'width', 'height', 'fps', 'stills'];
  for (const key of Object.keys(input)) if (!allowed.includes(key)) throw new Error(`Unknown native render option: ${key}.`);
  if (input.schemaVersion !== 1 || typeof input.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(input.id) || typeof input.title !== 'string' || !input.title.trim()) throw new Error('A render job needs schemaVersion 1, a stable slug ID, and a meaningful title.');
  engineById(input.engine);
  const extension = path.extname(relativeFile(input.source));
  if (input.engine === 'manim' && (extension !== '.py' || typeof input.scene !== 'string' || !/^[A-Za-z_]\w*$/.test(input.scene))) throw new Error('Manim requires a .py source and a Scene class name.');
  if (input.engine === 'psychopomp' && (!['.rs', '.json'].includes(extension) || input.scene !== undefined)) throw new Error('Psychopomp requires a .rs Scene Program or .json Scene Plan, without a scene option.');
  const job = { ...input, theme: input.theme ?? 'iso', width: input.width ?? 1920, height: input.height ?? 1080, fps: input.fps ?? 30, stills: input.stills ?? [0] };
  if (!engineById(job.engine).themes.includes(job.theme)) throw new Error(`Unsupported native theme ${job.theme}.`);
  if (![job.width, job.height].every(value => Number.isSafeInteger(value) && value >= 64 && value <= 3840 && value % 2 === 0) || !Number.isSafeInteger(job.fps) || job.fps < 1 || job.fps > 60) throw new Error('Native output needs even integer dimensions from 64 to 3840 and an integer FPS from 1 to 60.');
  if (!Array.isArray(job.stills) || !job.stills.length || job.stills.length > 24 || job.stills.some(value => !Number.isFinite(value) || value < 0) || new Set(job.stills).size !== job.stills.length) throw new Error('Choose 1–24 distinct, finite, nonnegative still times.');
  return Object.freeze(job);
}

async function probe(file) {
  const data = JSON.parse(await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { capture: true }));
  const video = data.streams.find(stream => stream.codec_type === 'video');
  if (!video) throw new Error('Native render did not produce a video stream.');
  const [numerator, denominator] = video.r_frame_rate.split('/').map(Number);
  const result = { width: video.width, height: video.height, fps: numerator / denominator, duration: Number(video.duration), frames: Number(video.nb_frames), codec: video.codec_name, pixelFormat: video.pix_fmt, hasAudio: data.streams.some(stream => stream.codec_type === 'audio') };
  if (!Number.isFinite(result.duration) || result.duration <= 0 || !Number.isSafeInteger(result.frames) || result.frames < 1) throw new Error('Native render did not produce a finite encoded clip.');
  return result;
}

async function manimRender(job, source, work, runtime, theme) {
  const media = path.join(work, 'manim-media');
  const config = path.join(work, 'manim.cfg');
  const font = path.join(import.meta.dirname, 'fonts', theme.displayFont === 'Inter' ? 'Inter[opsz,wght].ttf' : 'EBGaramond[wght].ttf');
  await fs.writeFile(config, `[CLI]\nbackground_color = ${theme.background}\n`);
  await run(runtime.python, ['-I', '-m', 'manim', '--config_file', config, '--renderer', 'cairo', '--disable_caching', '--format', 'mp4', '--media_dir', media, '--resolution', `${job.width},${job.height}`, '--fps', String(job.fps), '--seed', '133', '--progress_bar', 'none', '-o', 'native', source, job.scene], { cwd: path.dirname(source), env: { ARTIFACTURE_NATIVE_THEME: JSON.stringify(theme), ARTIFACTURE_NATIVE_FONT: font } });
  const found = [];
  async function visit(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory() && entry.name !== 'partial_movie_files') await visit(file);
      else if (entry.isFile() && entry.name === 'native.mp4') found.push(file);
    }
  }
  await visit(media);
  if (found.length !== 1) throw new Error('Expected exactly one Manim native.mp4.');
  return found[0];
}

async function psychopompRender(job, source, work, runtime, theme) {
  let plan = source;
  if (path.extname(source) === '.rs') {
    const program = path.join(work, 'program');
    await fs.mkdir(path.join(program, 'src'), { recursive: true });
    await fs.copyFile(source, path.join(program, 'src/main.rs'));
    const cargo = `[package]\nname = "artifacture-native-scene"\nversion = "0.1.0"\nedition = "2024"\n[dependencies]\nanyhow = "1.0"\nserde_json = "1.0"\npsychopomp = { path = ${JSON.stringify(path.join(runtime.source, 'crates/psychopomp'))} }\n`;
    await fs.writeFile(path.join(program, 'Cargo.toml'), cargo);
    plan = path.join(work, 'scene.plan.json');
    await run('cargo', [`+${engineById(job.engine).rust}`, 'run', '--offline', '--manifest-path', path.join(program, 'Cargo.toml'), '--', plan], { cwd: path.dirname(source), env: { ...rustEnvironment(), CARGO_TARGET_DIR: path.join(engineHome, 'scene-program-target'), ARTIFACTURE_NATIVE_THEME: JSON.stringify(theme) } });
    await fs.copyFile(path.join(program, 'Cargo.lock'), path.join(work, 'scene-program.Cargo.lock'));
  }
  await run(runtime.executable, ['plan', 'validate', plan], { cwd: path.dirname(source) });
  const inspection = await run(runtime.executable, ['plan', 'inspect', plan], { capture: true, cwd: path.dirname(source) });
  await fs.writeFile(path.join(work, 'plan-inspection.txt'), inspection);
  if (plan !== source) await fs.copyFile(plan, path.join(work, 'source/scene.plan.json'));
  const output = path.join(work, 'native.mp4');
  await run(runtime.executable, ['plan', 'render', plan, output, '--theme', job.theme], { cwd: path.dirname(source) });
  return output;
}

export async function renderNativeJob(jobFile, output) {
  const job = validateJob(JSON.parse(await fs.readFile(jobFile, 'utf8')));
  const source = await fs.realpath(path.resolve(path.dirname(jobFile), job.source));
  const jobRoot = await fs.realpath(path.dirname(jobFile));
  if (!source.startsWith(jobRoot + path.sep) || !(await fs.stat(source)).isFile()) throw new Error('Native source must be a regular file inside the job directory.');
  if (await exists(output)) throw new Error('Native output already exists. Choose a new output directory to preserve its source and receipts.');
  const runtime = await readyEngine(job.engine), theme = await nativeTheme(root, job.theme);
  await fs.mkdir(path.dirname(output), { recursive: true });
  const work = await fs.mkdtemp(path.join(path.dirname(output), '.artifacture-native-'));
  try {
    await fs.mkdir(path.join(work, 'source'), { recursive: true });
    const sourceBytes = await fs.readFile(source);
    await fs.writeFile(path.join(work, 'source', path.basename(source)), sourceBytes);
    await fs.writeFile(path.join(work, 'source/job.json'), JSON.stringify({ ...job, source: path.basename(source) }, null, 2) + '\n');
    await fs.writeFile(path.join(work, 'theme.json'), JSON.stringify(theme, null, 2) + '\n');
    const native = await (job.engine === 'manim' ? manimRender : psychopompRender)(job, source, work, runtime, theme);
    if (hash(await fs.readFile(source)) !== hash(sourceBytes)) throw new Error('Native source changed during rendering. Render again to preserve accurate provenance.');
    const nativeProbe = await probe(native);
    const clip = path.join(work, 'clip.mp4');
    await run('ffmpeg', ['-v', 'error', '-y', '-i', native, '-map', '0:v:0', '-map', '0:a?', '-vf', `scale=${job.width}:${job.height}:flags=lanczos,fps=${job.fps}`, '-c:v', 'libx264', '-crf', '17', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', clip]);
    const delivered = await probe(clip);
    if (delivered.width !== job.width || delivered.height !== job.height || delivered.fps !== job.fps) throw new Error('Encoded native output does not match the requested delivery settings.');
    const stills = [];
    for (const [index, seconds] of job.stills.entries()) {
      const frameIndex = Math.round(seconds * job.fps);
      if (frameIndex >= delivered.frames) throw new Error(`Still ${seconds}s lies outside the encoded clip (${delivered.duration}s).`);
      const image = `still-${index}.png`;
      await run('ffmpeg', ['-v', 'error', '-y', '-i', clip, '-vf', `select=eq(n\\,${frameIndex})`, '-frames:v', '1', path.join(work, image)]);
      stills.push({ seconds, frameIndex, sampledSeconds: frameIndex / job.fps, image });
    }
    await fs.copyFile(path.join(work, stills[0].image), path.join(work, 'poster.png'));
    const manifest = { schemaVersion: 1, asset: { id: job.id, title: job.title, engine: job.engine, theme: job.theme, video: 'clip.mp4', poster: 'poster.png', ...delivered, stills }, provenance: { engine: runtime.receipt, source: { file: `source/${path.basename(source)}`, sha256: hash(sourceBytes) }, theme, nativeRender: nativeProbe, delivery: 'Opaque H.264 clip; selected stills are decoded delivery frames. Native geometry remains editable in source, not in the browser SVG scene.' }, files: [] };
    for (const file of ['clip.mp4', 'poster.png', ...stills.map(still => still.image)]) { const bytes = await fs.readFile(path.join(work, file)); manifest.files.push({ file, bytes: bytes.length, sha256: hash(bytes) }); }
    await fs.writeFile(path.join(work, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    await fs.rm(path.join(work, 'manim-media'), { recursive: true, force: true });
    await fs.rm(path.join(work, 'program'), { recursive: true, force: true });
    await fs.rm(path.join(work, 'native.mp4'), { force: true });
    await fs.rm(path.join(work, 'scene.plan.json'), { force: true });
    await fs.rename(work, output);
    return manifest;
  } catch (error) { await fs.rm(work, { recursive: true, force: true }); throw error; }
}
