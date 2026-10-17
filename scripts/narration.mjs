#!/usr/bin/env node
// Assemble narration from recorded takes: verify each take against its script, join takes at an
// even loudness, then cut the joined recording into beats inside its pauses and add reading holds.
// Voice generation and speech recognition stay outside: pass recognized words as JSON
// ([{ "text", "start", "end" }], seconds), for example from `npx hyperframes transcribe`.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { alignScript, compareTranscript } from '../visual-explainer-mdx/narration-align.mjs';

const RATE = 48000, CHANNELS = 2;
const usage = `Usage:
  artifacture narration check-take --script <take.txt> --words <recognized.json> [--ignore <word,...>]
  artifacture narration join --out <joined.wav> [--lufs -18] [--gap 0.5] [--max-spread 1.5] <take.wav...>
  artifacture narration cut --audio <joined.wav> --words <recognized.json> --script <beats.json|paragraphs.txt>
      --out <narration.wav> --timing <timing.json> [--hold 0.25] [--dense <id,...>] [--dense-hold 0.45]
      [--lufs -16] [--max-cut-db -40] [--audio-start 0.3] [--end-hold 1.2] [--ignore <word,...>]

check-take exits 1 when a take adds, drops or changes a word. join exits 2 when normalized takes
differ by more than --max-spread LU. cut exits 2 when any beat cut is louder than --max-cut-db.
Reports are JSON on stdout.`;

function parse(argv) {
  const [command, ...rest] = argv, flags = {}, positional = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) { flags[rest[i].slice(2)] = rest[i + 1]; i++; }
    else positional.push(rest[i]);
  }
  return { command, flags, positional };
}

const number = (flags, name, fallback) => {
  if (flags[name] === undefined) return fallback;
  const value = Number(flags[name]);
  if (!Number.isFinite(value)) throw new Error(`--${name} must be a number.`);
  return value;
};
const required = (flags, name) => { if (!flags[name]) throw new Error(`--${name} is required.\n\n${usage}`); return flags[name]; };
const options = flags => ({ ignore: flags.ignore ? flags.ignore.split(',').map(word => word.trim()).filter(Boolean) : [] });
const readWords = file => { const words = JSON.parse(readFileSync(file, 'utf8')); if (!Array.isArray(words)) throw new Error(`${file} must hold an array of recognized words.`); return words; };

function ffmpeg(args, input) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args], { input, maxBuffer: 1 << 30 });
  if (result.error) throw new Error(`ffmpeg is required: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`ffmpeg failed: ${result.stderr.toString().trim().split('\n').slice(-3).join(' ')}`);
  return result;
}

const loudness = file => Number(/I:\s+(-?[\d.]+) LUFS/.exec(ffmpeg(['-i', file, '-af', 'ebur128=framelog=quiet', '-f', 'null', '-']).stderr.toString().split('Summary:').at(-1))?.[1]);
const decode = file => { const out = ffmpeg(['-v', 'error', '-i', file, '-f', 'f32le', '-ac', String(CHANNELS), '-ar', String(RATE), '-']).stdout; return new Float32Array(out.buffer, out.byteOffset, out.byteLength / 4); };
const encode = (samples, file, lufs) => ffmpeg(['-v', 'error', '-y', '-f', 'f32le', '-ac', String(CHANNELS), '-ar', String(RATE), '-i', '-', '-af', `loudnorm=I=${lufs}:TP=-1.5:LRA=11`, '-ar', String(RATE), '-c:a', 'pcm_s16le', file], Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength));

function checkTake({ flags }) {
  const differences = compareTranscript(readFileSync(required(flags, 'script'), 'utf8'), readWords(required(flags, 'words')), options(flags));
  console.log(JSON.stringify({ exact: differences.length === 0, differences }, null, 2));
  if (differences.length) process.exitCode = 1;
}

function join({ flags, positional }) {
  const out = required(flags, 'out'), lufs = number(flags, 'lufs', -18), gap = number(flags, 'gap', .5), maxSpread = number(flags, 'max-spread', 1.5);
  if (!positional.length) throw new Error(`join needs at least one take.\n\n${usage}`);
  const work = mkdtempSync(path.join(tmpdir(), 'artifacture-narration-'));
  try {
    const takes = positional.map((take, i) => {
      const normalized = path.join(work, `take-${i}.wav`);
      // Trim silence only below -60 dB so soft consonants at the edges survive, then normalize.
      ffmpeg(['-v', 'error', '-y', '-i', take, '-af', `silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.15,areverse,silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.2,areverse,loudnorm=I=${lufs}:TP=-2:LRA=9`, '-ac', String(CHANNELS), '-ar', String(RATE), normalized]);
      return { take: path.resolve(take), lufs: loudness(normalized), samples: decode(normalized) };
    });
    const silence = new Float32Array(Math.round(gap * RATE) * CHANNELS);
    const parts = takes.flatMap((take, i) => i ? [silence, take.samples] : [take.samples]);
    const joined = new Float32Array(parts.reduce((sum, part) => sum + part.length, 0));
    parts.reduce((offset, part) => { joined.set(part, offset); return offset + part.length; }, 0);
    ffmpeg(['-v', 'error', '-y', '-f', 'f32le', '-ac', String(CHANNELS), '-ar', String(RATE), '-i', '-', '-c:a', 'pcm_s16le', out], Buffer.from(joined.buffer));
    const levels = takes.map(take => take.lufs), spread = Math.max(...levels) - Math.min(...levels);
    console.log(JSON.stringify({ out: path.resolve(out), duration: joined.length / CHANNELS / RATE, takes: takes.map(({ take, lufs: level }) => ({ take, lufs: level })), spread: Number(spread.toFixed(2)), ok: spread <= maxSpread }, null, 2));
    if (spread > maxSpread) process.exitCode = 2;
  } finally { rmSync(work, { recursive: true, force: true }); }
}

function readScript(file) {
  const text = readFileSync(file, 'utf8');
  if (file.endsWith('.json')) return JSON.parse(text);
  return text.trim().split(/\n\s*\n/).map((paragraph, i) => ({ id: String(i + 1).padStart(2, '0'), text: paragraph.replace(/\s+/g, ' ').trim() }));
}

function cut({ flags }) {
  const out = required(flags, 'out'), timingFile = required(flags, 'timing');
  const hold = number(flags, 'hold', .25), denseHold = number(flags, 'dense-hold', .45), lufs = number(flags, 'lufs', -16), maxCutDb = number(flags, 'max-cut-db', -40);
  const audioStart = number(flags, 'audio-start', .3), endHold = number(flags, 'end-hold', 1.2);
  const dense = new Set((flags.dense ?? '').split(',').map(id => id.trim()).filter(Boolean));
  const lines = readScript(required(flags, 'script'));
  const aligned = alignScript(lines, readWords(required(flags, 'words')), options(flags));
  const samples = decode(required(flags, 'audio')), frames = samples.length / CHANNELS;
  const window = Math.round(.02 * RATE), stride = Math.round(.004 * RATE);
  const level = frame => {
    let sum = 0, count = 0;
    for (let f = Math.max(0, frame - window / 2); f < Math.min(frames, frame + window / 2); f++, count++) { const m = (samples[f * 2] + samples[f * 2 + 1]) / 2; sum += m * m; }
    return 20 * Math.log10(Math.sqrt(sum / Math.max(1, count)) + 1e-9);
  };
  // Cut each boundary at the quietest 20 ms inside the pause between two lines.
  const cuts = aligned.slice(0, -1).map((line, i) => {
    const next = aligned[i + 1], lo = Math.max(0, Math.round((Math.min(line.end, next.start) - .3) * RATE)), hi = Math.min(frames, Math.round((Math.max(line.end, next.start) + .25) * RATE));
    let best = lo, bestDb = Infinity;
    for (let f = lo; f <= hi; f += stride) { const db = level(f); if (db < bestDb) { bestDb = db; best = f; } }
    return { between: [line.id, next.id], at: best / RATE, levelDb: Number(Math.max(-120, bestDb).toFixed(1)) };
  });
  const bounds = [0, ...cuts.map(c => Math.round(c.at * RATE)), frames], fade = Math.round(.015 * RATE);
  const pieces = [], offsets = [];
  let total = 0;
  aligned.forEach((line, i) => {
    const segment = samples.slice(bounds[i] * CHANNELS, bounds[i + 1] * CHANNELS), length = segment.length / CHANNELS;
    for (let f = 0; f < Math.min(fade, length); f++) for (let c = 0; c < CHANNELS; c++) { segment[f * CHANNELS + c] *= f / fade; segment[(length - 1 - f) * CHANNELS + c] *= f / fade; }
    offsets.push(total - bounds[i]);
    const pad = i === aligned.length - 1 ? 0 : Math.round((dense.has(line.id) ? denseHold : hold) * RATE);
    pieces.push(segment, new Float32Array(pad * CHANNELS));
    total += length + pad;
  });
  const assembled = new Float32Array(total * CHANNELS);
  pieces.reduce((offset, piece) => { assembled.set(piece, offset); return offset + piece.length; }, 0);
  encode(assembled, out, lufs);
  // Shift aligned words by their segment's offset; beats start at the cut and run to the next start.
  // The first beat also owns the pre-roll before the voice starts.
  const starts = aligned.map((_, i) => i ? audioStart + (bounds[i] + offsets[i]) / RATE : 0);
  const duration = audioStart + total / RATE + endHold;
  const beats = aligned.map((line, i) => ({
    id: line.id, start: Number(starts[i].toFixed(3)), duration: Number(((starts[i + 1] ?? duration) - starts[i]).toFixed(3)),
    words: line.words.map(word => ({ text: word.text, start: Number((audioStart + word.start + offsets[i] / RATE - starts[i]).toFixed(3)), end: Number((audioStart + word.end + offsets[i] / RATE - starts[i]).toFixed(3)), alignment: word.alignment })),
  }));
  writeFileSync(timingFile, JSON.stringify({ source: 'measured', audioStart, duration: Number(duration.toFixed(3)), narration: Object.fromEntries(lines.map(line => [line.id, line.text])), beats }, null, 2) + '\n');
  const worst = Math.max(...cuts.map(c => c.levelDb), -120), interpolated = beats.flatMap(beat => beat.words.filter(word => word.alignment === 'interpolated').map(word => `${beat.id}: ${word.text}`));
  console.log(JSON.stringify({ out: path.resolve(out), timing: path.resolve(timingFile), duration: Number(duration.toFixed(3)), cuts, worstCutDb: worst, interpolated, ok: worst <= maxCutDb }, null, 2));
  if (worst > maxCutDb) process.exitCode = 2;
}

const { command, flags, positional } = parse(process.argv.slice(2));
try {
  if (command === 'check-take') checkTake({ flags });
  else if (command === 'join') join({ flags, positional });
  else if (command === 'cut') cut({ flags });
  else { console.log(usage); if (command && !['help', '--help', '-h'].includes(command)) process.exitCode = 1; }
} catch (error) {
  console.error(`artifacture narration: ${error.message}`);
  process.exitCode = 1;
}
