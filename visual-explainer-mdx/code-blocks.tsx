import { useState } from 'react';
import { alignDiffRows, diffLines } from './diff-lines.mjs';
import type { DiffRow } from './diff-lines.mjs';
import './code-blocks.css';

export type { DiffRow } from './diff-lines.mjs';

export type CodeBlockProps = {
  code: string;
  language: string;
  filename?: string;
  highlightLines?: number[];
  annotations?: Array<{ line: number; note: string }>;
  diff?: 'unified';
  html?: string;
};

export type DiffBlockProps = {
  patch?: string;
  before?: string;
  after?: string;
  language?: string;
  filename?: string;
  mode?: 'unified' | 'split';
  rows?: DiffRow[];
};

export type TerminalBlockProps = {
  content: string;
  title?: string;
  showPrompt?: boolean;
};

export type JsonTreeProps = {
  data: JsonTreeData;
  collapsedDepth?: number;
};

export type JsonTreePrimitive = null | boolean | number | string;
export type JsonTreeRecord = { readonly [key: string]: JsonTreeData };
export type JsonTreeData = JsonTreePrimitive | readonly JsonTreeData[] | JsonTreeRecord;

export type QuizProps = {
  questions: Array<{
    q: string;
    options: Array<{ text: string; correct?: boolean; why: string }>;
  }>;
};

export function CodeBlock({ code, language, filename, highlightLines = [], annotations = [], diff, html }: CodeBlockProps) {
  const highlighted = html ?? `<pre><code>${escapeHtml(code)}</code></pre>`;
  const highlightSet = new Set(highlightLines);
  const annotationMap = new Map(annotations.map((item) => [item.line, item.note]));
  return (
    <figure className="ve-code-block" data-ve-code-block>
      <figcaption className="ve-code-caption">
        <span>{filename ?? language}</span>
        {diff === 'unified' ? <span>diff</span> : null}
      </figcaption>
      <div className="ve-code-body">
        <div className="ve-code-shiki" dangerouslySetInnerHTML={{ __html: highlighted }} />
        {highlightSet.size || annotationMap.size ? (
          <ol className="ve-code-annotations">
            {Array.from(new Set([...highlightSet, ...annotationMap.keys()])).sort((a, b) => a - b).map((line) => (
              <li className="ve-code-annotation" key={line}>
                <span className="ve-code-line">L{line}</span>
                {annotationMap.get(line) ? <span className="ve-code-note">{annotationMap.get(line)}</span> : null}
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </figure>
  );
}

export function DiffBlock({ patch, before, after, language = 'text', filename, mode = 'unified', rows }: DiffBlockProps) {
  const diffRows = rows ?? buildDiffRows({ patch, before, after });
  return (
    <figure className="ve-diff-block" data-ve-diff-block>
      <figcaption className="ve-code-caption">
        <span>{filename ?? 'diff'}</span>
        <span>{mode === 'split' ? 'split diff' : `${language} diff`}</span>
      </figcaption>
      {mode === 'split' ? <SplitDiffTable rows={diffRows} /> : <UnifiedDiffTable rows={diffRows} />}
    </figure>
  );
}

function UnifiedDiffTable({ rows }: { rows: DiffRow[] }) {
  return (
    <div className="ve-scroll-x">
      <table className="ve-diff-table">
        <tbody>
          {rows.map((row, index) => (
            <tr data-ve-diff-kind={row.kind} key={`${row.kind}-${row.oldNo ?? 'x'}-${row.newNo ?? 'x'}-${index}`}>
              <td className="ve-diff-gutter">{row.oldNo ?? ''}</td>
              <td className="ve-diff-gutter">{row.newNo ?? ''}</td>
              <td className="ve-diff-mark">{diffGlyph(row.kind)}</td>
              <td className="ve-diff-code" dangerouslySetInnerHTML={{ __html: row.html ?? escapeHtml(row.code) }} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SplitDiffTable({ rows }: { rows: DiffRow[] }) {
  const aligned = alignDiffRows(rows);
  const left = aligned.map(row => row.kind === 'hunk' ? { kind: 'hunk' as const, code: row.code } : row.before);
  const right = aligned.map(row => row.kind === 'hunk' ? { kind: 'hunk' as const, code: row.code } : row.after);
  return (
    <div className="ve-diff-split ve-scroll-x">
      <DiffSide title="Before" rows={left} side="old" />
      <DiffSide title="After" rows={right} side="new" />
    </div>
  );
}

function DiffSide({ title, rows, side }: { title: string; rows: (DiffRow | undefined)[]; side: 'old' | 'new' }) {
  return (
    <div className="ve-diff-side">
      <div className="ve-diff-side-title">{title}</div>
      <table className="ve-diff-table">
        <tbody>
          {rows.map((row, index) => (
            <tr data-ve-diff-kind={row?.kind ?? 'gap'} key={`${side}-${index}`}>
              <td className="ve-diff-gutter">{side === 'old' ? row?.oldNo ?? '' : row?.newNo ?? ''}</td>
              <td className="ve-diff-mark">{row ? diffGlyph(row.kind) : ''}</td>
              <td className="ve-diff-code" dangerouslySetInnerHTML={{ __html: row ? row.html ?? escapeHtml(row.code) : '&nbsp;' }} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TerminalBlock({ content, title = 'Terminal', showPrompt = false }: TerminalBlockProps) {
  const lines = showPrompt ? content.split('\n').map((line) => `$ ${line}`).join('\n') : content;
  return (
    <figure className="ve-terminal-block" data-ve-terminal-block>
      <figcaption className="ve-code-caption">
        <span>{title}</span>
      </figcaption>
      <pre className="ve-terminal-content">
        {parseAnsi(lines).map((segment, index) => (
          <span className={segment.className} key={`${segment.text}-${index}`}>{segment.text}</span>
        ))}
      </pre>
    </figure>
  );
}

export function JsonTree({ data, collapsedDepth = 2 }: JsonTreeProps) {
  const rootEntry = parseJsonTreeEntry(data);
  return (
    <div className="ve-json-tree" data-ve-json-tree>
      <JsonNode name="root" entry={rootEntry} depth={0} collapsedDepth={collapsedDepth} root />
    </div>
  );
}

type JsonTreeEntry = JsonLeafEntry | JsonBranchEntry;

type JsonLeafEntry = {
  kind: 'leaf';
  display: string;
  valueType: string;
};

type JsonBranchEntry = {
  kind: 'branch';
  branchType: 'Array' | 'Object';
  children: Array<[string, JsonTreeEntry]>;
};

function JsonNode({ name, entry, depth, collapsedDepth, root = false }: { name: string; entry: JsonTreeEntry; depth: number; collapsedDepth: number; root?: boolean }) {
  if (entry.kind === 'leaf') {
    return (
      <div className="ve-json-leaf">
        {!root ? <span className="ve-json-key">{JSON.stringify(name)}: </span> : null}
        <JsonPrimitive entry={entry} />
      </div>
    );
  }
  const label = `${entry.branchType}(${entry.children.length})`;
  return (
    <details className="ve-json-branch" open={depth < collapsedDepth}>
      <summary>
        {!root ? <span className="ve-json-key">{JSON.stringify(name)}: </span> : null}
        <span className="ve-json-type">{label}</span>
      </summary>
      <div className="ve-json-children">
        {entry.children.map(([key, child]) => (
          <JsonNode collapsedDepth={collapsedDepth} depth={depth + 1} key={key} name={key} entry={child} />
        ))}
      </div>
    </details>
  );
}

function JsonPrimitive({ entry }: { entry: JsonLeafEntry }) {
  return <span data-ve-json-type={entry.valueType}>{entry.display}</span>;
}

function parseJsonTreeEntry(value: JsonTreeData): JsonTreeEntry {
  if (value === null) return { kind: 'leaf', display: 'null', valueType: 'null' };
  if (isJsonTreeList(value)) {
    return {
      kind: 'branch',
      branchType: 'Array',
      children: value.map((item, index) => [String(index), parseJsonTreeEntry(item)]),
    };
  }
  if (isJsonTreeRecord(value)) {
    return {
      kind: 'branch',
      branchType: 'Object',
      children: Object.entries(value).map(([key, child]) => [key, parseJsonTreeEntry(child)]),
    };
  }
  const valueType = jsonValueType(value);
  return {
    kind: 'leaf',
    display: isJsonText(value) ? JSON.stringify(value) : String(value),
    valueType,
  };
}

function isJsonTreeRecord(value: JsonTreeData): value is JsonTreeRecord {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function isJsonTreeList(value: JsonTreeData): value is readonly JsonTreeData[] {
  return Array.isArray(value);
}

function isJsonText(value: JsonTreePrimitive): value is string {
  return Object.prototype.toString.call(value) === '[object String]';
}

function jsonValueType(value: JsonTreePrimitive): string {
  const tag = Object.prototype.toString.call(value);
  return tag.slice(8, -1).toLowerCase();
}

export function Quiz({ questions }: QuizProps) {
  const [answers, setAnswers] = useState<Array<number | null>>(() => questions.map(() => null));
  const answeredCount = answers.filter((answer) => answer !== null).length;
  const score = answers.reduce<number>((sum, answer, index) => {
    if (answer === null) return sum;
    return questions[index]?.options[answer]?.correct ? sum + 1 : sum;
  }, 0);
  return (
    <section className="ve-quiz" data-ve-quiz>
      {questions.map((question, questionIndex) => {
        const selected = answers[questionIndex];
        return (
          <article className="ve-quiz-question" key={question.q}>
            <h3>{question.q}</h3>
            <div className="ve-quiz-options" role="group" aria-label={question.q}>
              {question.options.map((option, optionIndex) => {
                const isSelected = selected === optionIndex;
                const state = selected === null ? 'idle' : option.correct ? 'correct' : isSelected ? 'incorrect' : 'idle';
                return (
                  <button
                    aria-pressed={isSelected}
                    className="ve-quiz-option"
                    data-ve-quiz-state={state}
                    key={option.text}
                    onClick={() => setAnswers((current) => current.map((answer, index) => index === questionIndex ? optionIndex : answer))}
                    type="button"
                  >
                    <span className="ve-quiz-choice">{String.fromCharCode(65 + optionIndex)}</span>
                    <span>{option.text}</span>
                    {isSelected ? <span className="ve-quiz-result">{option.correct ? 'Correct' : 'Incorrect'}</span> : null}
                  </button>
                );
              })}
            </div>
            {selected !== null ? (
              <p className="ve-quiz-feedback" data-ve-quiz-state={question.options[selected]?.correct ? 'correct' : 'incorrect'}>
                {question.options[selected]?.why}
              </p>
            ) : null}
          </article>
        );
      })}
      {answeredCount === questions.length ? (
        <p className="ve-quiz-score">Score: {score}/{questions.length}</p>
      ) : null}
    </section>
  );
}

function escapeHtml(input: string) {
  return input.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

function diffGlyph(kind: DiffRow['kind']) {
  if (kind === 'add') return '+';
  if (kind === 'remove') return '-';
  if (kind === 'hunk') return '@';
  return ' ';
}

function buildDiffRows({ patch, before, after }: Pick<DiffBlockProps, 'patch' | 'before' | 'after'>): DiffRow[] {
  if (patch) return parseUnifiedDiff(patch);
  if (before !== undefined && after !== undefined) return diffLines(before, after);
  return [];
}

function parseUnifiedDiff(patch: string): DiffRow[] {
  const rows: DiffRow[] = [];
  let oldLine = 0;
  let newLine = 0;
  for (const line of patch.split(/\r?\n/)) {
    if (line.startsWith('@@')) {
      const match = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
      oldLine = match ? Number(match[1]) : oldLine;
      newLine = match ? Number(match[2]) : newLine;
      rows.push({ kind: 'hunk', code: line });
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      rows.push({ kind: 'add', newNo: newLine, code: line.slice(1) });
      newLine += 1;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      rows.push({ kind: 'remove', oldNo: oldLine, code: line.slice(1) });
      oldLine += 1;
    } else if (line.startsWith(' ')) {
      rows.push({ kind: 'context', oldNo: oldLine, newNo: newLine, code: line.slice(1) });
      oldLine += 1;
      newLine += 1;
    } else if (line.startsWith('\\ No newline')) {
      continue;
    }
  }
  return rows;
}

function parseAnsi(input: string) {
  const output: Array<{ text: string; className?: string }> = [];
  let active = '';
  const ansiEscape = String.fromCharCode(27);
  const pattern = new RegExp(`${ansiEscape}\\[([0-9;]*)m`, 'g');
  let last = 0;
  for (const match of input.matchAll(pattern)) {
    if (match.index > last) output.push({ text: input.slice(last, match.index), className: active || undefined });
    active = sgrClass(match[1], active);
    last = match.index + match[0].length;
  }
  if (last < input.length) output.push({ text: input.slice(last), className: active || undefined });
  return output;
}

function sgrClass(code: string, active: string) {
  const parts = code.split(';').filter(Boolean).map(Number);
  if (!parts.length || parts.includes(0)) return '';
  let className = active;
  for (const part of parts) {
    if (part === 1) className = appendClass(className, 've-ansi-bold');
    else if (part === 22) className = removeClass(className, 've-ansi-bold');
    else if (part >= 30 && part <= 37) className = replaceAnsiClass(className, `ve-ansi-fg-${part - 30}`);
    else if (part >= 90 && part <= 97) className = replaceAnsiClass(className, `ve-ansi-fg-${part - 90}-bright`);
  }
  return className;
}

function appendClass(className: string, next: string) {
  return className.split(' ').includes(next) ? className : `${className} ${next}`.trim();
}

function removeClass(className: string, target: string) {
  return className.split(' ').filter((item) => item && item !== target).join(' ');
}

function replaceAnsiClass(className: string, next: string) {
  return appendClass(className.split(' ').filter((item) => !item.startsWith('ve-ansi-fg-')).join(' '), next);
}
