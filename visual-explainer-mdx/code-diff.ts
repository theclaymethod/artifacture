import { alignDiffRows, diffLines } from './diff-lines.mjs';
import { createGraphicScene, validateGraphicBounds, type GraphicBounds, type GraphicObject, type GraphicPrimitive } from './graphics-types';
import { createSourceScene, type SourcePart, type SourceRange } from './source-scenes';
import { editWithIdentity } from './narrated-motion';
import { defineGraphicMotion, type GraphicMotionTrack } from './graphic-motion';

export type CodeDiffPart = SourcePart & Readonly<{ changed: boolean }>;
export type CodeDiffLine = Readonly<{ number: number; text: string; parts: readonly CodeDiffPart[] }>;
export type CodeDiffRow = Readonly<{ id: string; kind: 'context' | 'change'; changeId?: string; before?: CodeDiffLine; after?: CodeDiffLine }>;
export type CodeDiffFold = Readonly<{ id: string; kind: 'fold'; count: number }>;
export type CodeDiffInput = Readonly<{ before: string; after: string; beforeStart?: number; afterStart?: number; context?: number; tabSize?: number }>;
export type PreparedCodeDiff = Readonly<{ before: string; after: string; rows: readonly CodeDiffRow[]; visibleRows: readonly (CodeDiffRow | CodeDiffFold)[]; changeIds: readonly string[] }>;
export type CodeDiffLayout = Readonly<{ id: string; title: string; description: string; diff: PreparedCodeDiff; bounds: GraphicBounds; filename?: string; fontSize?: number; columnWidth?: number; lineHeight?: number; padding?: number }>;
export type CodeDiffSceneInput = CodeDiffLayout & Readonly<{ mode?: 'split' | 'unified' }>;
export type CodeDiffFocusBeat = Readonly<{ changeId: string; start: number; end: number }>;

function literalLines(text: string, tabSize: number): string[] {
  if (text !== String(text)) throw new Error('Code diffs require literal before and after strings.');
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines.length > 200) throw new Error('Video diffs accept at most 200 lines per version. Select an evidenced excerpt.');
  return lines.map(line => {
    if (/[^\x20-\x7e\t]/.test(line)) throw new Error('Video diff cells require printable ASCII and tabs. Use DiffBlock for other source text.');
    let expanded = '';
    for (const character of line) expanded += character === '\t' ? ' '.repeat(tabSize - expanded.length % tabSize) : character;
    if (expanded.length > 240) throw new Error('Video diff lines accept at most 240 expanded columns. Select a shorter excerpt.');
    return expanded;
  });
}

const tokens = (text: string) => text.match(/[a-zA-Z_$][\w$]*|\d+(?:\.\d+)?| +|[^\w\s]/g) ?? [];

function inlineParts(before: string, after: string, id: string): readonly [CodeDiffPart[], CodeDiffPart[]] {
  const left: CodeDiffPart[] = [], right: CodeDiffPart[] = [];
  if (!before || !after) {
    if (before) left.push({ id: `${id}:removed`, text: before, changed: true });
    if (after) right.push({ id: `${id}:added`, text: after, changed: true });
    return [left, right];
  }
  for (const [index, token] of diffLines(tokens(before).join('\n'), tokens(after).join('\n')).slice(1).entries()) {
    const part = { id: `${id}:part:${index}`, text: token.code, changed: token.kind !== 'context' };
    if (token.kind !== 'add') left.push(part);
    if (token.kind !== 'remove') right.push(part);
  }
  return [left, right];
}

export function prepareCodeDiff(input: CodeDiffInput): PreparedCodeDiff {
  const { beforeStart = 1, afterStart = 1, context = 3, tabSize = 2 } = input;
  if ([beforeStart, afterStart].some(n => !Number.isSafeInteger(n) || n < 1) || !Number.isSafeInteger(context) || context < 0 || context > 200 || !Number.isSafeInteger(tabSize) || tabSize < 1 || tabSize > 8) throw new Error('Diff line origins must be positive integers; context 0–200 and tab size 1–8.');
  const before = literalLines(input.before, tabSize), after = literalLines(input.after, tabSize);
  if (before.length - 1 > Number.MAX_SAFE_INTEGER - beforeStart || after.length - 1 > Number.MAX_SAFE_INTEGER - afterStart) throw new Error('Diff line origins and excerpt length must stay inside safe integer bounds.');
  const aligned = alignDiffRows(diffLines(before.join('\n'), after.join('\n')));
  const rows: CodeDiffRow[] = [], changeIds: string[] = [];
  for (const row of aligned) {
    if (row.kind === 'hunk') continue;
    const id = `diff:row:${rows.length}`;
    if (row.kind === 'change' && rows.at(-1)?.kind !== 'change') changeIds.push(`change:${changeIds.length + 1}`);
    const [left, right] = row.kind === 'context'
      ? [row.before?.code ? [{ id: `${id}:context`, text: row.before.code, changed: false }] : [], row.after?.code ? [{ id: `${id}:context`, text: row.after.code, changed: false }] : []]
      : inlineParts(row.before?.code ?? '', row.after?.code ?? '', id);
    const line = (number: number, text: string, parts: readonly CodeDiffPart[]): CodeDiffLine => Object.freeze({ number, text, parts: Object.freeze(parts.map(part => Object.freeze(part))) });
    rows.push(Object.freeze({ id, kind: row.kind, changeId: row.kind === 'change' ? changeIds.at(-1)! : undefined,
      before: row.before ? line(beforeStart + (row.before.oldNo! - 1), row.before.code, left) : undefined,
      after: row.after ? line(afterStart + (row.after.newNo! - 1), row.after.code, right) : undefined,
    }));
  }
  const selected = new Set<number>();
  rows.forEach((row, index) => { if (row.kind === 'change') for (let at = Math.max(0, index - context); at <= Math.min(rows.length - 1, index + context); at++) selected.add(at); });
  const visibleRows: (CodeDiffRow | CodeDiffFold)[] = [];
  for (let index = 0; index < rows.length;) {
    if (!changeIds.length || selected.has(index)) visibleRows.push(rows[index++]);
    else {
      const start = index;
      while (index < rows.length && !selected.has(index)) index++;
      visibleRows.push(Object.freeze({ id: `diff:fold:${start}`, kind: 'fold', count: index - start }));
    }
  }
  return Object.freeze({ before: input.before, after: input.after, rows: Object.freeze(rows), visibleRows: Object.freeze(visibleRows), changeIds: Object.freeze(changeIds) });
}

function metrics(input: CodeDiffLayout) {
  validateGraphicBounds(input.bounds);
  const fontSize = input.fontSize ?? 24, columnWidth = input.columnWidth ?? fontSize * .61;
  const lineHeight = input.lineHeight ?? fontSize * 1.6, padding = input.padding ?? 24;
  if ([fontSize, columnWidth, lineHeight, padding].some(n => !Number.isFinite(n)) || fontSize <= 0 || columnWidth <= 0 || lineHeight < fontSize * 1.2 || padding < 0) throw new Error('Diff metrics need positive finite text metrics, line height ≥ 1.2× font size, and nonnegative padding.');
  if (input.filename !== undefined && (input.filename !== String(input.filename) || !input.filename.trim())) throw new Error('A diff filename must identify the actual source.');
  const digits = String(Math.max(...input.diff.rows.flatMap(row => [row.before?.number ?? 0, row.after?.number ?? 0]))).length;
  const gutter = (digits + 3) * columnWidth;
  const y = input.bounds.y + padding + (input.filename ? lineHeight * 1.3 : 0);
  return { fontSize, columnWidth, lineHeight, padding, gutter, y };
}

function text(x: number, y: number, value: string, size: number, fill: 'ink' | 'muted' = 'ink', width?: number): GraphicPrimitive {
  return { kind: 'text', x, y, lines: [value], size, leading: size * 1.4, font: 'mono', fill, textLength: width && value ? width : undefined };
}

function header(input: CodeDiffLayout, m: ReturnType<typeof metrics>): GraphicObject[] {
  if (!input.filename) return [];
  if (input.filename.length * m.columnWidth > input.bounds.width - 2 * m.padding) throw new Error('The filename exceeds the diff frame. Use its meaningful relative path.');
  return [{ id: 'diff:filename', kind: 'illustration', primitives: [text(input.bounds.x + m.padding, input.bounds.y + m.padding + m.fontSize, input.filename, m.fontSize)] }];
}

function fit(input: CodeDiffLayout, bottom: number) {
  if (bottom > input.bounds.y + input.bounds.height - (input.padding ?? 24)) throw new Error('Diff exceeds its authored height. Reduce context, select an excerpt, or enlarge the frame.');
}

export function createCodeDiffScene(input: CodeDiffSceneInput) {
  const mode = input.mode ?? 'split', m = metrics(input), objects = header(input, m);
  if (!['split', 'unified'].includes(mode)) throw new Error('Diff scenes support split or unified layout.');
  const { bounds } = input;
  const panelWidth = mode === 'split' ? (bounds.width - 3 * m.padding) / 2 : bounds.width - 2 * m.padding;
  if (panelWidth < m.gutter + 6 * m.columnWidth) throw new Error('Diff panels need enough room for their source gutter and code.');
  const left = bounds.x + m.padding, right = left + panelWidth + m.padding;
  let y = m.y;
  if (mode === 'split') {
    objects.push({ id: 'diff:versions', kind: 'illustration', primitives: [text(left, y + m.fontSize, 'Before', m.fontSize), text(right, y + m.fontSize, 'After', m.fontSize)] });
    y += m.lineHeight * 1.4;
  }
  const groups = new Map<string, { id: string; targets: string[]; focusTargets: string[] }>(input.diff.changeIds.map(id => [id, { id, targets: [], focusTargets: [] }]));
  const rowTargets: string[] = [];
  const drawLine = (row: CodeDiffRow, side: 'before' | 'after', top: number, x: number) => {
    const line = row[side];
    if (!line) return;
    if (line.text.length * m.columnWidth + m.gutter > panelWidth) throw new Error(`Diff line ${line.number} exceeds its ${mode} panel. Select an excerpt or enlarge the frame; code is never silently clipped.`);
    const id = `${row.id}:${side}`, group = row.changeId ? groups.get(row.changeId)! : undefined;
    const primitives: GraphicPrimitive[] = [text(x, top + m.fontSize, String(line.number), m.fontSize * .8)];
    if (row.kind === 'change') primitives.push(text(x + m.gutter - 2 * m.columnWidth, top + m.fontSize, side === 'before' ? '−' : '+', m.fontSize));
    let column = 0;
    for (const part of line.parts) {
      const px = x + m.gutter + column * m.columnWidth, width = part.text.length * m.columnWidth;
      if (part.changed) {
        if (side === 'after') primitives.push({ kind: 'rect', x: px, y: top + 1, width, height: m.fontSize + 5, radius: 2, fill: 'accent-background' });
        primitives.push({ kind: 'line', x1: px, x2: px + width, y1: top + m.fontSize + 5, y2: top + m.fontSize + 5, stroke: side === 'after' ? 'accent' : 'muted', strokeRole: 'detail', dash: side === 'before' ? '2 2' : undefined });
      }
      primitives.push(text(px, top + m.fontSize, part.text, m.fontSize, 'ink', width));
      column += part.text.length;
    }
    if (group) {
      const focusId = `${id}:focus`;
      objects.push({ id: focusId, kind: 'illustration', meaning: `Focus ${row.changeId} at source line ${line.number}`, primitives: [{ kind: 'rect', x: x - 6, y: top - 2, width: panelWidth + 12, height: m.lineHeight, radius: 3, fill: 'accent-background' }, { kind: 'line', x1: x - 6, x2: x - 6, y1: top - 2, y2: top + m.lineHeight - 2, stroke: 'accent', strokeRole: 'active' }], state: { opacity: 0, reveal: 1, highlight: false, x: 0, y: 0 } });
      group.targets.push(id); group.focusTargets.push(focusId);
    }
    objects.push({ id, kind: 'illustration', meaning: `${side} line ${line.number}: ${line.text}`, primitives });
    rowTargets.push(id);
  };
  for (const row of input.diff.visibleRows) {
    if (row.kind === 'fold') {
      const label = `… ${row.count} unchanged ${row.count === 1 ? 'line' : 'lines'} …`;
      if (label.length * m.columnWidth * .8 + m.gutter > panelWidth) throw new Error('The context fold exceeds its panel. Enlarge the frame.');
      objects.push({ id: row.id, kind: 'illustration', primitives: [text(left + m.gutter, y + m.fontSize, label, m.fontSize * .8)] });
      rowTargets.push(row.id); y += m.lineHeight;
    } else if (mode === 'split') {
      drawLine(row, 'before', y, left); drawLine(row, 'after', y, right); y += m.lineHeight;
    } else {
      if (row.kind === 'context') { drawLine(row, 'after', y, left); y += m.lineHeight; }
      else {
        if (row.before) { drawLine(row, 'before', y, left); y += m.lineHeight; }
        if (row.after) { drawLine(row, 'after', y, left); y += m.lineHeight; }
      }
    }
  }
  fit(input, y);
  const scene = createGraphicScene({ id: input.id, title: input.title, description: input.description, bounds, objects });
  return Object.freeze({ scene, diff: input.diff, mode, rowTargets: Object.freeze(rowTargets), changes: Object.freeze([...groups.values()].map(group => Object.freeze({ ...group, targets: Object.freeze(group.targets), focusTargets: Object.freeze(group.focusTargets) }))) });
}

export type PreparedCodeDiffScene = ReturnType<typeof createCodeDiffScene>;

export function focusCodeDiff(view: PreparedCodeDiffScene, input: Readonly<{ duration: number; beats: readonly CodeDiffFocusBeat[]; dimOpacity?: number }>) {
  const dim = input.dimOpacity ?? .72;
  if (!Number.isFinite(input.duration) || input.duration <= 0 || !Number.isFinite(dim) || dim < 0 || dim > 1) throw new Error('Diff focus needs finite positive duration and dim opacity from zero to one.');
  let available = 0;
  for (const beat of input.beats) {
    if (!view.changes.some(change => change.id === beat.changeId) || !Number.isFinite(beat.start) || !Number.isFinite(beat.end) || beat.start < available || beat.end <= beat.start || beat.end > input.duration) throw new Error('Diff focus beats need existing changes and ordered, nonoverlapping finite intervals.');
    available = beat.end;
  }
  const times = [...new Set([0, input.duration, ...input.beats.flatMap(beat => [beat.start, beat.end])])].sort((a, b) => a - b);
  const tracks: GraphicMotionTrack[] = [];
  const active = (at: number) => input.beats.find(beat => at >= beat.start && at < beat.end)?.changeId;
  for (const target of [...view.rowTargets, ...view.changes.flatMap(change => change.focusTargets)]) {
    const change = view.changes.find(item => item.targets.includes(target) || item.focusTargets.includes(target));
    const marker = change?.focusTargets.includes(target);
    const value = (at: number) => marker ? Number(active(at) === change?.id) : !active(at) || active(at) === change?.id ? 1 : dim;
    for (let index = 0; index < times.length - 1; index++) tracks.push({ target, property: 'opacity', interpolation: 'step-end', start: times[index], duration: times[index + 1] - times[index], from: value(times[index]), to: value(times[index + 1]) });
  }
  return defineGraphicMotion(view.scene, { duration: input.duration, tracks });
}

export type CodeDiffTransitionInput = CodeDiffLayout & Readonly<{ duration: number; start: number; transition: number; direction?: 'forward' | 'reverse' }>;

export function createCodeDiffTransition(input: CodeDiffTransitionInput) {
  const m = metrics(input), direction = input.direction ?? 'forward';
  if (!['forward', 'reverse'].includes(direction) || !Number.isFinite(input.duration) || input.duration <= 0 || !Number.isFinite(input.start) || input.start < 0 || !Number.isFinite(input.transition) || input.transition <= 0 || input.start + input.transition > input.duration) throw new Error('Diff transitions need a finite edit interval inside their duration and a forward/reverse direction.');
  const from = direction === 'forward' ? 'before' : 'after', to = direction === 'forward' ? 'after' : 'before';
  const sourceY = m.y + m.lineHeight * 1.4, sourceX = input.bounds.x + m.padding + m.gutter;
  const versions = (['before', 'after'] as const).map(id => ({ id, lines: input.diff.rows.flatMap(row => row[id] ? [row[id]!.parts] : []) }));
  if (versions.some(version => !version.lines.some(line => line.length))) throw new Error('Identity transitions need source characters in both versions. Use split/unified scenes to introduce or delete an empty file.');
  if (versions.some(version => version.lines.flat().reduce((sum, part) => sum + part.text.length, 0) > 6000)) throw new Error('Identity transitions accept at most 6,000 characters per version. Select a review excerpt.');
  fit(input, sourceY + Math.max(...versions.map(version => version.lines.length)) * m.lineHeight);
  const ranges: SourceRange[] = [];
  for (const version of versions) version.lines.forEach((parts, line) => {
    let column = 1;
    for (const part of parts) {
      if (part.changed) ranges.push({ id: `${version.id}:${part.id}`, version: version.id, start: { line: line + 1, column }, end: { line: line + 1, column: column + part.text.length } });
      column += part.text.length;
    }
  });
  const source = createSourceScene({ id: input.id, title: input.title, description: input.description, bounds: input.bounds, layout: { x: sourceX, y: sourceY, fontSize: m.fontSize, columnWidth: m.columnWidth, lineHeight: m.lineHeight }, versions: from === 'before' ? versions : [...versions].reverse(), ranges });
  const initialMarkers = new Set(ranges.filter(range => range.version === from).flatMap(range => source.ranges[range.id].targets));
  const objects: GraphicObject[] = [...header(input, m), ...source.scene.objects.map(object => initialMarkers.has(object.id) ? { ...object, state: { opacity: 1, reveal: 1, highlight: false, x: 0, y: 0 } } : object)];
  const tracks = editWithIdentity(source, { duration: input.duration, edits: [{ from, to, start: input.start, duration: input.transition }] }).tracks.flatMap<GraphicMotionTrack>(track => {
    const retained = Object.hasOwn(source.layouts[from], track.target) && Object.hasOwn(source.layouts[to], track.target);
    if (retained) return track.property === 'translation' ? [{ ...track, start: input.start + input.transition * .25, duration: input.transition * .5 }] : [];
    if (track.property !== 'opacity') return [];
    const entering = Object.hasOwn(source.layouts[to], track.target);
    return [{ ...track, start: input.start + (entering ? input.transition * .75 : 0), duration: input.transition * .25 }];
  });
  for (const version of versions) {
    const entering = version.id === to;
    const start = input.start + (entering ? input.transition * .75 : 0), duration = input.transition * .25;
    for (const range of ranges.filter(range => range.version === version.id)) for (const target of source.ranges[range.id].targets) tracks.push({ target, property: 'opacity', start, duration, from: entering ? 0 : 1, to: entering ? 1 : 0, ease: 'smooth' });
    const labelId = `diff:version:${version.id}`;
    objects.push({ id: labelId, kind: 'illustration', primitives: [text(input.bounds.x + m.padding, m.y + m.fontSize, version.id === 'before' ? 'Before' : 'After', m.fontSize)], state: { opacity: entering ? 0 : 1, reveal: 1, highlight: false, x: 0, y: 0 } });
    tracks.push({ target: labelId, property: 'opacity', start, duration, from: entering ? 0 : 1, to: entering ? 1 : 0, ease: 'smooth' });
    let rowIndex = 0;
    for (const row of input.diff.rows) if (row[version.id]) {
      const line = row[version.id]!;
      const id = `diff:number:${version.id}:${rowIndex}`;
      objects.push({ id, kind: 'illustration', primitives: [text(input.bounds.x + m.padding, sourceY + rowIndex++ * m.lineHeight + m.fontSize, String(line.number), m.fontSize * .8, 'muted')], state: { opacity: entering ? 0 : 1, reveal: 1, highlight: false, x: 0, y: 0 } });
      tracks.push({ target: id, property: 'opacity', start, duration, from: entering ? 0 : 1, to: entering ? 1 : 0, ease: 'smooth' });
    }
  }
  const scene = createGraphicScene({ ...source.scene, objects });
  return Object.freeze({ scene, motion: defineGraphicMotion(scene, { duration: input.duration, tracks }), diff: input.diff, source });
}

export type PreparedCodeDiffTransition = ReturnType<typeof createCodeDiffTransition>;
