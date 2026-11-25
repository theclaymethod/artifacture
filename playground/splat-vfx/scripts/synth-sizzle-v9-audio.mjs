import { writeFileSync } from 'node:fs';

const OUT_WAV = process.argv[2] ?? '/tmp/v2-video-rec/sizzle-v9-audio.wav';
const SAMPLE_RATE = 48000;
const DURATION = 20.5;
const NUM_FRAMES = Math.round(SAMPLE_RATE * DURATION);

let rngState = 0x71b3c905;
function randSigned() {
  rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
  return (rngState / 0xffffffff) * 2 - 1;
}

const left = new Float32Array(NUM_FRAMES);
const right = new Float32Array(NUM_FRAMES);

// V9 Shot Timeline:
// 0.0-3.65s: Forest Gravity Rift + Slingshot Launch Ramp
// 3.65-6.0s: Alien Dimension Emergence (IMAX lift)
// 6.0-10.5s: Neon Tokyo Counter-Parallax
// 10.5-15.5s: Stone Buddha Smoke & Ash Dissolve
// 15.5-20.5s: Grace Cathedral Stark B&W Particly LiDAR Shockwave (out & back)
const SECTIONS = [
  { start: 0.0, end: 3.65, root: 65.41, chord: [130.81, 196.0, 246.94, 311.13] },
  { start: 3.65, end: 6.0, root: 73.42, chord: [146.83, 220.0, 293.66, 369.99] },
  { start: 6.0, end: 10.5, root: 82.41, chord: [164.81, 220.0, 261.63, 329.63] },
  { start: 10.5, end: 15.5, root: 58.27, chord: [116.54, 174.61, 220.0, 293.66] },
  { start: 15.5, end: 20.5, root: 73.42, chord: [146.83, 220.0, 261.63, 349.23] },
];

const PORTAL_LAUNCH_TIME = 3.65;
const CUT_TIMES = [6.0, 10.5, 15.5];
const FX_CUES = [0.55, 3.65, 7.65, 11.0, 15.9, 18.0];

const noiseBuf = new Float32Array(NUM_FRAMES);
const lpState = [0, 0];

for (let i = 0; i < NUM_FRAMES; i += 1) {
  const t = i / SAMPLE_RATE;
  let sec = SECTIONS[SECTIONS.length - 1];
  for (const s of SECTIONS) {
    if (t >= s.start && t < s.end) {
      sec = s;
      break;
    }
  }
  const swell = 0.56 + 0.34 * Math.sin((t / DURATION) * Math.PI);
  let extraSub = 0;
  if (t < 6.0) {
    const p = Math.min(1, t / PORTAL_LAUNCH_TIME);
    const freqShift = t < PORTAL_LAUNCH_TIME ? 56 - 20 * p * p : 42 + 12 * Math.min(1, (t - PORTAL_LAUNCH_TIME) / 1.5);
    extraSub = Math.sin(2 * Math.PI * freqShift * t) * (0.14 + 0.26 * p * p);
  }
  const sub =
    Math.sin(2 * Math.PI * sec.root * t) * 0.24 +
    Math.sin(2 * Math.PI * sec.root * 2 * t) * 0.07 +
    extraSub;

  let padL = sub * swell;
  let padR = sub * swell;
  const alienLift = t >= PORTAL_LAUNCH_TIME && t < 6.0 ? 1.30 : 1.0;
  for (let c = 0; c < sec.chord.length; c += 1) {
    const f = sec.chord[c];
    const detune = (c % 2 === 0 ? 1 : -1) * (0.0028 + 0.0007 * c);
    const vL = Math.sin(2 * Math.PI * f * (1 + detune) * t + c * 0.7);
    const vR = Math.sin(2 * Math.PI * f * (1 - detune) * t + c * 1.4);
    const voiceAmp = 0.072 * alienLift * (0.75 + 0.25 * Math.sin(t * (0.9 + c * 0.35)));
    padL += vL * voiceAmp * swell;
    padR += vR * voiceAmp * swell;
  }

  const cutoffHz =
    t >= PORTAL_LAUNCH_TIME && t < 6.0
      ? 1500 + 550 * Math.min(1, (t - PORTAL_LAUNCH_TIME) / 0.9)
      : 540 + 660 * (0.5 - 0.5 * Math.cos(2 * Math.PI * (t / 10)));
  const alpha = (2 * Math.PI * cutoffHz) / (2 * Math.PI * cutoffHz + SAMPLE_RATE);
  lpState[0] += alpha * (padL - lpState[0]);
  lpState[1] += alpha * (padR - lpState[1]);
  left[i] = lpState[0];
  right[i] = lpState[1];
  noiseBuf[i] = randSigned();
}

for (let beat = 0; beat < Math.floor(DURATION / 0.5); beat += 1) {
  const tBeat = beat * 0.5;
  if (tBeat >= 19.7) break;
  if (tBeat >= 2.8 && tBeat < 3.6) continue; // suspense drop right before gravitational launch!
  const startIdx = Math.floor(tBeat * SAMPLE_RATE);
  const kickDur = Math.floor(0.24 * SAMPLE_RATE);
  const inBuddha = tBeat >= 10.6 && tBeat < 15.4;
  const kickGain = inBuddha ? 0.14 : beat % 2 === 0 ? 0.42 : 0.22;

  for (let j = 0; j < kickDur && startIdx + j < NUM_FRAMES; j += 1) {
    const u = j / SAMPLE_RATE;
    const freq = 38 + 86 * Math.exp(-u * 26);
    const env = Math.exp(-u * 13.5) * Math.min(1, u / 0.004);
    const sample = Math.sin(2 * Math.PI * freq * u) * env * kickGain;
    left[startIdx + j] += sample;
    right[startIdx + j] += sample;
  }

  const hatIdx = Math.floor((tBeat + 0.25) * SAMPLE_RATE);
  const hatDur = Math.floor(0.032 * SAMPLE_RATE);
  let hp = 0;
  let prev = 0;
  for (let j = 0; j < hatDur && hatIdx + j < NUM_FRAMES; j += 1) {
    const u = j / SAMPLE_RATE;
    const n = noiseBuf[hatIdx + j];
    hp = 0.86 * (hp + n - prev);
    prev = n;
    const env = Math.exp(-u * 95);
    const pan = beat % 2 === 0 ? 0.65 : 0.35;
    left[hatIdx + j] += hp * env * 0.08 * (1.2 - pan);
    right[hatIdx + j] += hp * env * 0.08 * (0.2 + pan);
  }
}

// Gravitational slingshot ramp riser + deep sub launch boom at 3.65s
{
  const launchIdx = Math.floor(PORTAL_LAUNCH_TIME * SAMPLE_RATE);
  const riseLen = Math.floor(1.55 * SAMPLE_RATE);
  let lp = 0;
  for (let j = 0; j < riseLen; j += 1) {
    const idx = launchIdx - riseLen + j;
    if (idx < 0 || idx >= NUM_FRAMES) continue;
    const p = j / riseLen;
    const alpha = 0.015 + 0.50 * Math.pow(p, 3.0);
    lp += alpha * (noiseBuf[idx] - lp);
    const env = Math.pow(p, 2.5) * 0.40;
    const gravSweep = Math.sin(2 * Math.PI * (95 + 520 * p * p * p) * (j / SAMPLE_RATE)) * env * 0.26;
    left[idx] += lp * env + gravSweep;
    right[idx] += lp * env * 0.94 - gravSweep * 0.85;
  }
  const dropDur = Math.floor(1.15 * SAMPLE_RATE);
  for (let j = 0; j < dropDur && launchIdx + j < NUM_FRAMES; j += 1) {
    const u = j / SAMPLE_RATE;
    const freq = 26 + 82 * Math.exp(-u * 6.2);
    const env = Math.exp(-u * 3.2) * Math.min(1, u / 0.006);
    const boom = Math.sin(2 * Math.PI * freq * u) * env * 0.66;
    left[launchIdx + j] += boom;
    right[launchIdx + j] += boom;
  }
}

for (const cut of CUT_TIMES) {
  const riseLen = Math.floor(0.5 * SAMPLE_RATE);
  const cutIdx = Math.floor(cut * SAMPLE_RATE);
  let lp = 0;
  for (let j = 0; j < riseLen; j += 1) {
    const idx = cutIdx - riseLen + j;
    if (idx < 0 || idx >= NUM_FRAMES) continue;
    const p = j / riseLen;
    const alpha = 0.02 + 0.32 * p * p;
    lp += alpha * (noiseBuf[idx] - lp);
    const env = Math.pow(p, 2.2) * 0.24;
    left[idx] += lp * env;
    right[idx] += lp * env * 0.96;
  }

  const dropDur = Math.floor(0.52 * SAMPLE_RATE);
  for (let j = 0; j < dropDur && cutIdx + j < NUM_FRAMES; j += 1) {
    const u = j / SAMPLE_RATE;
    const freq = 30 + 62 * Math.exp(-u * 9.5);
    const env = Math.exp(-u * 6.0) * Math.min(1, u / 0.005);
    const boom = Math.sin(2 * Math.PI * freq * u) * env * 0.45;
    left[cutIdx + j] += boom;
    right[cutIdx + j] += boom;
  }
}

for (let idxCue = 0; idxCue < FX_CUES.length; idxCue += 1) {
  const cueIdx = Math.floor(FX_CUES[idxCue] * SAMPLE_RATE);
  const cueDur = Math.floor(0.85 * SAMPLE_RATE);
  const baseHz = [440.0, 880.0, 659.25, 466.16, 587.33, 783.99][idxCue % 6];
  for (let j = 0; j < cueDur && cueIdx + j < NUM_FRAMES; j += 1) {
    const u = j / SAMPLE_RATE;
    const env = Math.sin(Math.min(1, u / 0.04) * (Math.PI / 2)) * Math.exp(-u * 4.2);
    const tone =
      Math.sin(2 * Math.PI * baseHz * u) * 0.055 +
      Math.sin(2 * Math.PI * baseHz * 1.5 * u) * 0.028;
    const pan = idxCue % 2 === 0 ? 0.62 : 0.38;
    left[cueIdx + j] += tone * env * (1 - pan * 0.4);
    right[cueIdx + j] += tone * env * (0.6 + pan * 0.4);
  }
}

let maxAbs = 1e-6;
for (let i = 0; i < NUM_FRAMES; i += 1) {
  const t = i / SAMPLE_RATE;
  const fadeIn = Math.min(1, t / 0.05);
  const fadeOut = t > 19.75 ? Math.max(0, 1 - (t - 19.75) / 0.75) : 1;
  const g = fadeIn * fadeOut;
  const l = Math.tanh(left[i] * g * 1.05);
  const r = Math.tanh(right[i] * g * 1.05);
  left[i] = l;
  right[i] = r;
  const m = Math.max(Math.abs(l), Math.abs(r));
  if (m > maxAbs) maxAbs = m;
}

const normScale = 0.85 / maxAbs;
const dataBytes = NUM_FRAMES * 4;
const wav = Buffer.alloc(44 + dataBytes);
wav.write('RIFF', 0);
wav.writeUInt32LE(36 + dataBytes, 4);
wav.write('WAVE', 8);
wav.write('fmt ', 12);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(SAMPLE_RATE, 24);
wav.writeUInt32LE(SAMPLE_RATE * 4, 28);
wav.writeUInt16LE(4, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(dataBytes, 40);

for (let i = 0; i < NUM_FRAMES; i += 1) {
  wav.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(left[i] * normScale * 32767))), 44 + i * 4);
  wav.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(right[i] * normScale * 32767))), 44 + i * 4 + 2);
}

writeFileSync(OUT_WAV, wav);
console.log(`Wrote ${OUT_WAV}: ${(wav.length / 1e6).toFixed(2)} MB`);
