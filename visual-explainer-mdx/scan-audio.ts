import type { DotScanEvent } from './column-scan';

export type ScanAudioOptions = Readonly<{ duration: number; sampleRate?: number; gain?: number; clickDuration?: number }>;

/** Deterministic mono PCM. The caller owns playback and seeks visuals from the audio clock. */
export function synthesizeScanWav(events: readonly DotScanEvent[], options: ScanAudioOptions): Uint8Array<ArrayBuffer> {
  const { duration } = options, sampleRate = options.sampleRate ?? 48000, gain = options.gain ?? .045, clickDuration = options.clickDuration ?? .045;
  if (!Number.isFinite(duration) || duration <= 0 || duration > 120 || !Number.isSafeInteger(sampleRate) || sampleRate < 8000 || sampleRate > 96000 || !Number.isFinite(gain) || gain < 0 || gain > .1 || !Number.isFinite(clickDuration) || clickDuration < .005 || clickDuration > .25 || events.length > 11520) throw new Error('Scan audio needs a 0–120s duration, 8–96kHz rate, 0–.1 gain and .005–.25s clicks.');
  const ids = new Set<string>();
  for (const event of events) {
    if (!event.id?.trim() || ids.has(event.id) || !Number.isFinite(event.time) || event.time < 0 || event.time + clickDuration > duration || !Number.isFinite(event.frequency) || event.frequency <= 0 || event.frequency >= sampleRate / 2) throw new Error('Sound events need unique IDs, finite in-range times and frequencies below Nyquist.');
    ids.add(event.id);
  }
  const frames = Math.ceil(duration * sampleRate), pcm = new Float32Array(frames);
  const clickFrames = Math.ceil(clickDuration * sampleRate);
  for (const event of [...events].sort((a, b) => a.time - b.time || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const onset = Math.ceil(event.time * sampleRate);
    for (let i = 0; i < clickFrames && onset + i < frames; i++) {
      const t = i / sampleRate, envelope = Math.min(1, t / .003) * (1 - i / clickFrames) ** 3;
      pcm[onset + i] += gain * envelope * Math.sin(2 * Math.PI * event.frequency * t);
    }
  }
  const peak = pcm.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0), scale = peak > .8 ? .8 / peak : 1;
  const bytes = new Uint8Array(44 + frames * 2), view = new DataView(bytes.buffer);
  const label = (at: number, value: string) => { for (let i = 0; i < value.length; i++) bytes[at + i] = value.charCodeAt(i); };
  label(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); label(8, 'WAVE'); label(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); label(36, 'data'); view.setUint32(40, frames * 2, true);
  for (let i = 0; i < frames; i++) view.setInt16(44 + i * 2, Math.round(pcm[i] * scale * 32767), true);
  return bytes;
}
