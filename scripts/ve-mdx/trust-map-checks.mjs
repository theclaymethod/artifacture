// Export checks for a trust-map explainer (plugins/visual-explainer/cards/trust-map.md). They run
// on the static pre-render, so they see the narrative MDX and the data components as a reader
// does, and on the MDX sources for the no-hand-copy guard.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseHTML } from 'linkedom';

const ID = /(?<![\w-])[CVK]\d+[a-z]?(?![\w-])/;
const ACRONYM = /(?<![\w$#.-])([0-9]*[A-Z][A-Z0-9]*(?:-[0-9A-Z]+)*)(?![\w-])/g;
const STOP = new Set(['I', 'A', 'OK']);
// Collapsed detail, tables, code, tooltips, quotes, diagrams and the rail: a reader meets none of them in the prose.
const NOT_PROSE = [
  'script', 'style', 'nav', 'pre', 'table', '[data-ve-data-table]', '[data-ve-code-block]', '[data-ve-code-ref]', '[data-ve-diff-block]',
  '.ve-disclosure-body', '.ve-disclosure-meta', '[role="tooltip"]', 'blockquote[data-quote]', '[data-ve-diagram-modes]', '[data-ve-lint="skip"]',
  '.ve-chapter-rail', 'svg', '[data-ve-legend]',
].join(', ');

const norm = (word) => {
  const w = word.toLowerCase();
  return w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w;
};

function textNodes(root, skip) {
  const out = [];
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) out.push(child);
      else if (child.nodeType === 1 && !child.matches(skip)) walk(child);
    }
  };
  walk(root);
  return out;
}

const around = (text, index) => text.slice(Math.max(0, index - 50), index + 50).replace(/\s+/g, ' ').trim();
const where = (node) => node.parentElement?.closest('section[id]')?.id ?? 'page';

/**
 * The trust-map rules on the rendered page. Returns a list of errors; empty when the page has no
 * trust-map component.
 *  - Narrative prose shows no claim, verifier or control ID and no code (a backticked name)
 *    outside a Disclosure body, a table and a CodeRef. The data components keep their own rules.
 *  - Each Term and each abbreviation in the prose has a glossary entry.
 *  - Each #fragment link has a target, and no id shows twice.
 */
export function checkTrustMapPage(markup) {
  const { document } = parseHTML(`<!doctype html><html><body>${markup}</body></html>`);
  if (!document.querySelector('[data-ve-trust]')) return [];
  const errors = [];
  const body = document.body;
  const narrative = `${NOT_PROSE}, [data-ve-trust]`;
  for (const node of textNodes(body, narrative)) {
    const hit = node.textContent.match(ID);
    if (hit) errors.push(`${where(node)}: the ID ${hit[0]} is in the narrative prose: "${around(node.textContent, hit.index)}". Move it into a Disclosure or a table, or name the thing in plain words.`);
  }
  for (const code of body.querySelectorAll('code')) {
    if (code.parentElement?.closest(narrative) || code.closest(narrative)) continue;
    errors.push(`${where(code)}: the code name "${code.textContent}" is in the narrative prose. Name it in plain words, or put it in a Disclosure, a table or a CodeRef.`);
  }
  const glossary = body.querySelector('[data-ve-glossary]');
  if (!glossary) errors.push('the page has trust-map components but no <Glossary data={trust} />');
  const defined = new Set();
  for (const dt of glossary?.querySelectorAll('dt') ?? []) {
    defined.add(norm(dt.textContent.trim()));
    for (const alias of (dt.getAttribute('data-ve-aliases') ?? '').split('|').filter(Boolean)) defined.add(norm(alias));
  }
  const missing = new Set();
  for (const term of body.querySelectorAll('.ve-term')) {
    const word = textNodes(term, '[role="tooltip"]').map((n) => n.textContent).join('').trim();
    if (word && !defined.has(norm(word))) missing.add(word);
  }
  for (const node of textNodes(body, NOT_PROSE)) {
    for (const m of node.textContent.matchAll(ACRONYM)) {
      const token = m[1];
      if (token.length < 2 || STOP.has(token) || /^[CVKG]\d+[a-z]?$/.test(token) || !/[A-Z]/.test(token)) continue;
      if (!defined.has(norm(token))) missing.add(token);
    }
  }
  if (missing.size) errors.push(`the page uses terms that the glossary does not define: ${[...missing].sort().join(', ')}. Add each to the glossary of the trust map.`);
  const verify = body.querySelector('[data-ve-trust="verifiers"]');
  if (verify && !(verify.firstElementChild?.hasAttribute('data-ve-result') && /\d+ of \d+ checks/.test(verify.firstElementChild.textContent))) {
    errors.push('the verify level must open with its result count, for example "41 of 44 checks caught the bug we planted"');
  }
  for (const card of body.querySelectorAll('[data-ve-weak-check]')) {
    if (!card.querySelector('[data-ve-action]')?.textContent.trim()) errors.push(`the weak check "${card.querySelector('h4')?.textContent ?? card.id}" has no reviewer action`);
  }
  for (const card of body.querySelectorAll('[data-ve-unclaimed-file]')) {
    if (!card.querySelector('[data-ve-action]')?.textContent.trim()) errors.push(`the unclaimed file "${card.querySelector('code')?.textContent ?? card.id}" has no action`);
  }
  for (const row of body.querySelectorAll('[data-ve-trust="unclaimed"] tr[id^="unclaimed-"]')) {
    const cells = row.querySelectorAll('td');
    if (!cells.length || !cells[cells.length - 1].textContent.trim()) errors.push(`the unclaimed file in row ${row.id.slice(10)} has no action`);
  }
  const ids = new Map();
  for (const el of body.querySelectorAll('[id]')) ids.set(el.id, (ids.get(el.id) ?? 0) + 1);
  for (const [id, n] of ids) if (n > 1) errors.push(`the id #${id} shows ${n} times; each anchor must be unique (render each ClaimDetail once)`);
  for (const a of body.querySelectorAll('a[href^="#"]')) {
    const target = decodeURIComponent(a.getAttribute('href').slice(1));
    if (target && !ids.has(target)) errors.push(`the link #${target} has no target`);
  }
  return errors;
}

const squash = (line) => line.split(/\s+/).filter(Boolean).join(' ');

/**
 * The no-hand-copy guard: each pair of consecutive non-blank lines of an MDX source (whitespace
 * normalised, 12 or more word characters) that is also a pair of consecutive lines of a tracked
 * file of `repo` at `head`. Code comes in through a CodeRef, never typed.
 */
export function handCopied(files, repo, head) {
  const windows = [];
  for (const { file, text } of files) {
    const rows = text.split('\n').map(squash).filter(Boolean);
    for (let i = 0; i + 1 < rows.length; i += 1) if ((rows[i] + rows[i + 1]).replace(/\W/g, '').length >= 12) windows.push({ file, a: rows[i], b: rows[i + 1] });
  }
  if (!windows.length) return [];
  const dir = mkdtempSync(path.join(os.tmpdir(), 've-guard-'));
  try {
    const patterns = path.join(dir, 'patterns');
    writeFileSync(patterns, [...new Set(windows.map((w) => w.a))].join('\n') + '\n');
    const grep = spawnSync('git', ['-C', repo, 'grep', '-I', '-F', '-n', '--full-name', '-f', patterns, head], { encoding: 'utf8', maxBuffer: 1 << 28 });
    if (grep.status !== 0 && grep.status !== 1) throw new Error(`the no-hand-copy guard cannot read ${repo} at ${head}: ${grep.stderr.trim()}`);
    const shown = new Map();
    const fileLines = (p) => {
      if (!shown.has(p)) shown.set(p, spawnSync('git', ['-C', repo, 'show', `${head}:${p}`], { encoding: 'utf8', maxBuffer: 1 << 28 }).stdout.split('\n').map(squash));
      return shown.get(p);
    };
    const byFirst = new Map();
    for (const w of windows) byFirst.set(w.a, [...(byFirst.get(w.a) ?? []), w]);
    const found = new Map();
    for (const row of grep.stdout.split('\n')) {
      const m = row.slice(head.length + 1).match(/^(.*?):(\d+):(.*)$/);
      if (!m) continue;
      const [, p, n, line] = m;
      for (const w of byFirst.get(squash(line)) ?? []) {
        if (found.has(w.file)) continue;
        const all = fileLines(p);
        let j = Number(n);
        while (j < all.length && !all[j]) j += 1;
        if (all[j] === w.b) found.set(w.file, `${w.file}: pasted code from ${p}:${n}: "${w.a.slice(0, 60)}" ... Use a <CodeRef refs={refs} path=... symbol=... /> instead.`);
      }
    }
    return [...found.values()];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
