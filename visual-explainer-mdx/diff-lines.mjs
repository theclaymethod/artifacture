export function diffLines(before, after) {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  const table = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const rows = [{ kind: 'hunk', code: `@@ -1,${a.length} +1,${b.length} @@` }];
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
