import type { DiffRow } from './diff-lines.ts';
import { alignDiffRows, diffLines } from './diff-lines.ts';

export type { DiffRow } from './diff-lines.ts';

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

/**
 * Renders an annotated source snippet with optional pre-rendered Shiki HTML.
 */
export function CodeBlock({
  code,
  language,
  filename,
  highlightLines = [],
  annotations = [],
  diff,
  html,
}: CodeBlockProps) {
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
        <div
          className="ve-code-shiki"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki static HTML or escaped source
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
        {highlightSet.size || annotationMap.size ? (
          <ol className="ve-code-annotations">
            {Array.from(new Set([...highlightSet, ...annotationMap.keys()]))
              .sort((a, b) => a - b)
              .map((line) => (
                <li className="ve-code-annotation" key={line}>
                  <span className="ve-code-line">L{line}</span>
                  {annotationMap.get(line) ? (
                    <span className="ve-code-note">{annotationMap.get(line)}</span>
                  ) : null}
                </li>
              ))}
          </ol>
        ) : null}
      </div>
    </figure>
  );
}

/**
 * Renders unified or side-by-side code diffs from a patch or before/after strings.
 */
export function DiffBlock({
  patch,
  before,
  after,
  language = 'text',
  filename,
  mode = 'unified',
  rows,
}: DiffBlockProps) {
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
  const keyedRows = rows.map((row, n) => ({
    row,
    key: `${row.kind}-${row.oldNo ?? 'x'}-${row.newNo ?? 'x'}-${n}`,
  }));
  return (
    <div className="ve-scroll-x">
      <table className="ve-diff-table">
        <tbody>
          {keyedRows.map(({ row, key }) => (
            <tr data-ve-diff-kind={row.kind} key={key}>
              <td className="ve-diff-gutter">{row.oldNo ?? ''}</td>
              <td className="ve-diff-gutter">{row.newNo ?? ''}</td>
              <td className="ve-diff-mark">{diffGlyph(row.kind)}</td>
              <td
                className="ve-diff-code"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki static HTML or escaped source
                dangerouslySetInnerHTML={{ __html: row.html ?? escapeHtml(row.code) }}
              />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SplitDiffTable({ rows }: { rows: DiffRow[] }) {
  const aligned = alignDiffRows(rows);
  const left = aligned.map((row) =>
    row.kind === 'hunk' ? { kind: 'hunk' as const, code: row.code } : row.before,
  );
  const right = aligned.map((row) =>
    row.kind === 'hunk' ? { kind: 'hunk' as const, code: row.code } : row.after,
  );
  return (
    <div className="ve-diff-split ve-scroll-x">
      <DiffSide title="Before" rows={left} side="old" />
      <DiffSide title="After" rows={right} side="new" />
    </div>
  );
}

function DiffSide({
  title,
  rows,
  side,
}: {
  title: string;
  rows: Array<DiffRow | undefined>;
  side: 'old' | 'new';
}) {
  const keyedRows = rows.map((row, n) => ({ row, key: `${side}-${n}` }));
  return (
    <div className="ve-diff-side">
      <div className="ve-diff-side-title">{title}</div>
      <table className="ve-diff-table">
        <tbody>
          {keyedRows.map(({ row, key }) => (
            <tr data-ve-diff-kind={row?.kind ?? 'gap'} key={key}>
              <td className="ve-diff-gutter">
                {side === 'old' ? (row?.oldNo ?? '') : (row?.newNo ?? '')}
              </td>
              <td className="ve-diff-mark">{row ? diffGlyph(row.kind) : ''}</td>
              <td
                className="ve-diff-code"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki static HTML or escaped source
                dangerouslySetInnerHTML={{
                  __html: row ? (row.html ?? escapeHtml(row.code)) : '&nbsp;',
                }}
              />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function escapeHtml(input: string) {
  return input.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
}

function diffGlyph(kind: DiffRow['kind']) {
  if (kind === 'add') return '+';
  if (kind === 'remove') return '-';
  if (kind === 'hunk') return '@';
  return ' ';
}

function buildDiffRows({
  patch,
  before,
  after,
}: Pick<DiffBlockProps, 'patch' | 'before' | 'after'>): DiffRow[] {
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
    }
  }
  return rows;
}
