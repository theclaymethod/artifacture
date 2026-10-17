// Cue interval and millisecond-carry ideas adapted from LemoLab's core/render/srt.py.
// Copyright (c) 2026 LemoLab. MIT notice: LEMO-LICENSE.
export type NarrationCue = Readonly<{ id: string; start: number; end: number; text: string; alignment: 'measured' | 'estimated' | 'authored'; source?: string; sourceInterval?: Readonly<{ start: number; end: number }> }>;
export type CueOptions = Readonly<{ duration: number; overlap?: 'error' | 'truncate' }>;
export type AlignedWord = readonly [word: string, relativeStart: number, relativeEnd: number];
export function normalizeNarrationCues(input: readonly NarrationCue[], options: CueOptions): readonly NarrationCue[] {
  if (!Number.isFinite(options.duration) || options.duration <= 0 || (options.overlap !== undefined && !['error', 'truncate'].includes(options.overlap))) throw new Error('Cues need a positive finite audio duration and a known overlap policy.');
  const ids = new Set<string>();
  const cues = input.map(cue => {
    if (!cue.id?.trim() || ids.has(cue.id) || !cue.text?.trim() || !['measured', 'estimated', 'authored'].includes(cue.alignment) || !Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < 0 || cue.end <= cue.start || cue.end > options.duration) throw new Error('Cues need unique IDs, text, alignment provenance, and positive intervals inside the audio.');
    if (cue.sourceInterval && (!Number.isFinite(cue.sourceInterval.start) || !Number.isFinite(cue.sourceInterval.end) || cue.sourceInterval.end <= cue.sourceInterval.start)) throw new Error('Original cue intervals must be finite and positive in length.');
    ids.add(cue.id);
    return { ...cue, text: cue.text.trim().replace(/\s+/g, ' ') };
  }).sort((a, b) => a.start - b.start);
  for (let i = 0; i < cues.length - 1; i++) {
    if (cues[i].end <= cues[i + 1].start) continue;
    if (options.overlap !== 'truncate' || cues[i + 1].start <= cues[i].start) throw new Error('Narration cues overlap; choose explicit truncation or repair the alignment.');
    cues[i].end = cues[i + 1].start;
  }
  return Object.freeze(cues.map(cue => {
    const result = { ...cue };
    if (cue.sourceInterval) result.sourceInterval = Object.freeze({ ...cue.sourceInterval });
    return Object.freeze(result);
  }));
}
export function alignedWordsToCues(input: Readonly<{ lineId: string; offset: number; words: readonly AlignedWord[]; alignment: 'measured' | 'estimated'; source?: string }>, options: CueOptions & Readonly<{ bounds?: 'error' | 'clip' }>): readonly NarrationCue[] {
  if (options.bounds !== undefined && !['error', 'clip'].includes(options.bounds)) throw new Error('Unknown aligned-word bounds policy.');
  if (!input.lineId.trim() || !Number.isFinite(input.offset) || input.offset < 0) throw new Error('A narration line needs identity and a finite nonnegative offset.');
  return normalizeNarrationCues(input.words.map((word, index) => {
    const start = input.offset + word[1], end = input.offset + word[2];
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error('Aligned words need finite positive source intervals.');
    return { id: `${input.lineId}:${index}`, text: word[0], start: options.bounds === 'clip' ? Math.max(0, start) : start, end: options.bounds === 'clip' ? Math.min(options.duration, end) : end, sourceInterval: { start, end }, alignment: input.alignment, source: input.source };
  }), options);
}
export function formatSubtitleTime(seconds: number, format: 'srt' | 'vtt' = 'vtt'): string {
  if (!Number.isFinite(seconds) || seconds < 0 || !['srt', 'vtt'].includes(format)) throw new Error('Subtitle time must be finite and nonnegative.');
  const ms = Math.round(seconds * 1000);
  if (!Number.isSafeInteger(ms)) throw new Error('Subtitle time exceeds safe millisecond precision.');
  const pad = (n: number, size = 2) => String(n).padStart(size, '0');
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}${format === 'srt' ? ',' : '.'}${pad(ms % 1000, 3)}`;
}
export function serializeNarrationCues(input: readonly NarrationCue[], options: CueOptions & Readonly<{ format?: 'srt' | 'vtt' }>): string {
  const format = options.format ?? 'vtt';
  if (!['srt', 'vtt'].includes(format)) throw new Error('Unknown subtitle format.');
  const cues = normalizeNarrationCues(input, options);
  if (cues.some(cue => Math.round(cue.start * 1000) >= Math.round(cue.end * 1000))) throw new Error('A subtitle cue must occupy at least one millisecond.');
  const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return (format === 'vtt' ? 'WEBVTT\n\n' : '') + cues.map((cue, i) => `${i + 1}\n${formatSubtitleTime(cue.start, format)} --> ${formatSubtitleTime(cue.end, format)}\n${escape(cue.text)}\n`).join('\n');
}
