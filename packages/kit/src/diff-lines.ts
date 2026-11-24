export type DiffRow = {
  kind: 'hunk' | 'context' | 'add' | 'remove';
  oldNo?: number;
  newNo?: number;
  code: string;
  html?: string;
};

export type AlignedDiffRow =
  | { kind: 'hunk'; code: string }
  | { kind: 'context'; before: DiffRow; after: DiffRow }
  | { kind: 'change'; before?: DiffRow; after?: DiffRow };

/**
 * Computes a line-level LCS diff between two strings and emits unified diff rows.
 */
export function diffLines(before: string, after: string): DiffRow[] {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  const table = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] =
        a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const rows: DiffRow[] = [{ kind: 'hunk', code: `@@ -1,${a.length} +1,${b.length} @@` }];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      rows.push({ kind: 'context', oldNo: i + 1, newNo: j + 1, code: a[i] });
      i += 1;
      j += 1;
    } else if (j < b.length && (i === a.length || table[i][j + 1] >= table[i + 1][j])) {
      rows.push({ kind: 'add', newNo: j + 1, code: b[j] });
      j += 1;
    } else if (i < a.length) {
      rows.push({ kind: 'remove', oldNo: i + 1, code: a[i] });
      i += 1;
    }
  }
  return rows;
}

/**
 * Aligns unified diff rows into before/after pairs for side-by-side split view.
 */
export function alignDiffRows(rows: readonly DiffRow[]): AlignedDiffRow[] {
  const aligned: AlignedDiffRow[] = [];
  for (let index = 0; index < rows.length; ) {
    const row = rows[index];
    if (row.kind === 'hunk') {
      aligned.push({ kind: 'hunk', code: row.code });
      index += 1;
      continue;
    }
    if (row.kind === 'context') {
      aligned.push({ kind: 'context', before: row, after: row });
      index += 1;
      continue;
    }
    const removed: DiffRow[] = [];
    const added: DiffRow[] = [];
    while (index < rows.length && (rows[index].kind === 'add' || rows[index].kind === 'remove')) {
      const change = rows[index++];
      (change.kind === 'remove' ? removed : added).push(change);
    }
    let left = 0;
    let right = 0;
    const pairUntil = (leftEnd: number, rightEnd: number) => {
      while (left < leftEnd || right < rightEnd) {
        aligned.push({
          kind: 'change',
          before: left < leftEnd ? removed[left++] : undefined,
          after: right < rightEnd ? added[right++] : undefined,
        });
      }
    };
    const anchors = diffLines(
      removed.map((item) => item.code.trim()).join('\n'),
      added.map((item) => item.code.trim()).join('\n'),
    );
    for (const anchor of anchors) {
      if (
        anchor.kind === 'context' &&
        anchor.oldNo !== undefined &&
        anchor.newNo !== undefined &&
        anchor.oldNo <= removed.length &&
        anchor.newNo <= added.length
      ) {
        pairUntil(anchor.oldNo - 1, anchor.newNo - 1);
        aligned.push({ kind: 'change', before: removed[left++], after: added[right++] });
      }
    }
    pairUntil(removed.length, added.length);
  }
  return aligned;
}
