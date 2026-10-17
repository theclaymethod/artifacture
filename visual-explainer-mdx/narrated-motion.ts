import { defineGraphicMotion, type GraphicMotion, type GraphicMotionTrack } from './graphic-motion';
import { normalizeNarrationCues, type NarrationCue } from './narration-cues';
import type { GraphicScene } from './graphics-types';
import type { PreparedSourceScene } from './source-scenes';

export type SourceEdit = Readonly<{ from: string; to: string; start: number; duration: number }>;
export type SourceCueBinding = Readonly<{ cueId: string; rangeId: string; target: string }>;
export type SourceCueFocusInput = Readonly<{ duration: number; cues: readonly NarrationCue[]; bindings: readonly SourceCueBinding[]; edits?: readonly SourceEdit[] }>;
export type SourceCueFocus = Readonly<{ sourceMotion: GraphicMotion; diagramMotion: GraphicMotion; cues: readonly NarrationCue[]; bindings: readonly SourceCueBinding[] }>;

function editChain(source: PreparedSourceScene, duration: number, edits: readonly SourceEdit[]): readonly SourceEdit[] {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Source motion duration must be finite and positive.');
  let current = source.initialVersion, available = 0;
  for (const edit of edits) {
    if (edit.from !== current || edit.from === edit.to || !Object.hasOwn(source.layouts, edit.to) || !Number.isFinite(edit.start) || edit.start < available || !Number.isFinite(edit.duration) || edit.duration <= 0 || edit.start + edit.duration > duration) throw new Error('Source edits must form an ordered nonoverlapping chain from the initial version.');
    current = edit.to; available = edit.start + edit.duration;
  }
  return edits;
}

/** Move unchanged exact character identities; fade only entering/retiring parts. */
export function editWithIdentity(source: PreparedSourceScene, input: Readonly<{ duration: number; edits: readonly SourceEdit[] }>): GraphicMotion {
  const edits = editChain(source, input.duration, input.edits);
  const initialOrigins = new Map(Object.values(source.cells).map(cell => {
    const version = source.versions.find(item => Object.hasOwn(source.layouts[item.id], cell.id))!;
    return [cell.id, source.layouts[version.id][cell.id]] as const;
  }));
  const tracks: GraphicMotionTrack[] = [];
  for (const edit of edits) for (const cell of Object.values(source.cells)) {
    const a = source.layouts[edit.from][cell.id], b = source.layouts[edit.to][cell.id], origin = initialOrigins.get(cell.id)!;
    const from = a ?? b ?? origin, to = b ?? a ?? origin;
    tracks.push({ target: cell.id, property: 'translation', start: edit.start, duration: edit.duration, from: { x: from.x - origin.x, y: from.y - origin.y }, to: { x: to.x - origin.x, y: to.y - origin.y }, ease: 'smooth' });
    tracks.push({ target: cell.id, property: 'opacity', start: edit.start, duration: edit.duration, from: a ? 1 : 0, to: b ? 1 : 0, ease: 'smooth' });
  }
  return defineGraphicMotion(source.scene, { duration: input.duration, tracks });
}

function intervalTracks(target: string, property: 'opacity' | 'highlight', intervals: readonly Readonly<{ start: number; end: number }>[], duration: number): GraphicMotionTrack[] {
  const times = [...new Set([0, duration, ...intervals.flatMap(interval => [interval.start, interval.end])])].sort((a, b) => a - b);
  const active = (time: number) => intervals.some(interval => time >= interval.start && time < interval.end) ? 1 : 0;
  return times.slice(1).map((end, index) => ({ target, property, interpolation: 'step-end', start: times[index], duration: end - times[index], from: active(times[index]), to: active(end) }));
}

/** Bind exact literal ranges and consequences to measured half-open cue intervals. */
export function focusSourceRange(source: PreparedSourceScene, diagram: GraphicScene, input: SourceCueFocusInput): SourceCueFocus {
  const cues = normalizeNarrationCues(input.cues, { duration: input.duration });
  const edits = editChain(source, input.duration, input.edits ?? []);
  const bindings = structuredClone(input.bindings);
  const seen = new Set<string>(), targets = new Set(diagram.objects.map(object => object.id));
  const markerIntervals = new Map<string, { start: number; end: number }[]>(), diagramIntervals = new Map<string, { start: number; end: number }[]>();
  for (const binding of bindings) {
    const cue = cues.find(item => item.id === binding.cueId), range = source.ranges[binding.rangeId];
    if (!cue || !range || !targets.has(binding.target) || seen.has(binding.cueId)) throw new Error('Source bindings need one existing cue, exact range, and diagram target.');
    seen.add(binding.cueId);
    let version = source.initialVersion, available = 0, valid = false;
    for (const edit of edits) {
      if (range.version === version && cue.start >= available && cue.end <= edit.start) valid = true;
      version = edit.to; available = edit.start + edit.duration;
    }
    if (range.version === version && cue.start >= available && cue.end <= input.duration) valid = true;
    if (!valid) throw new Error(`Source focus must stay inside its version's stable interval: ${binding.rangeId}`);
    const interval = { start: cue.start, end: cue.end };
    for (const target of range.targets) markerIntervals.set(target, [...(markerIntervals.get(target) ?? []), interval]);
    diagramIntervals.set(binding.target, [...(diagramIntervals.get(binding.target) ?? []), interval]);
  }
  const sourceTracks = [...editWithIdentity(source, { duration: input.duration, edits }).tracks, ...[...markerIntervals].flatMap(([target, intervals]) => intervalTracks(target, 'opacity', intervals, input.duration))];
  return Object.freeze({
    sourceMotion: defineGraphicMotion(source.scene, { duration: input.duration, tracks: sourceTracks }),
    diagramMotion: defineGraphicMotion(diagram, { duration: input.duration, tracks: [...diagramIntervals].flatMap(([target, intervals]) => intervalTracks(target, 'highlight', intervals, input.duration)) }),
    cues, bindings: Object.freeze(bindings.map(binding => Object.freeze(binding))),
  });
}
