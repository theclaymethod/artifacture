// Export checks for a trust-map explainer (plugins/visual-explainer/cards/trust-map.md). They run
// on the static pre-render, so they see the narrative MDX and the data components as a reader
// does, and on the MDX sources for the no-hand-copy guard.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseHTML } from 'linkedom';
import { REPEAT_MIN_WORDS, RUN_IN_LABELS, SLOGAN_PHRASES, SLOGAN_SENTENCES } from './copy-rules.mjs';

const ID = /(?<![\w-])[CVK]\d+[a-z]?(?![\w-])/;
const ACRONYM = /(?<![\w$#.-])([0-9]*[A-Z][A-Z0-9]*(?:-[0-9A-Z]+)*)(?![\w-])/g;
const STOP = new Set(['I', 'A', 'OK']);
// Collapsed detail, tables, code, tooltips, quotes, diagrams and the rail: a reader meets none of them in the prose.
const NOT_PROSE = [
  'script', 'style', 'nav', 'pre', 'table', '[data-ve-data-table]', '[data-ve-code-block]', '[data-ve-code-ref]', '[data-ve-diff-block]',
  '.ve-disclosure-body', '.ve-disclosure-meta', '[role="tooltip"]', 'blockquote[data-quote]', '[data-ve-diagram-modes]', '[data-ve-lint="skip"]',
  '.ve-chapter-rail', 'svg', '[data-ve-legend]',
  // A path or a code name is not a word of the glossary.
  'code',
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
 *  - The verify level opens with its result line; each weak check and the weakest check of each claim has an action.
 *  - Each #fragment link has a target, and no id shows twice.
 *  - The copy has no slogan, no label run-in and no sentence twice (copy-rules.mjs), and the
 *    asd-ste100 lint finds no hard violation in it (`steLint`: the path of ste-lint.py, or false).
 */
export function checkTrustMapPage(markup, { steLint = defaultSteLint() } = {}) {
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
  if (verify && !(verify.firstElementChild?.hasAttribute('data-ve-result') && /\d+ of \d+ checks caught their planted bug/.test(verify.firstElementChild.textContent))) {
    errors.push('the verify level must open with its result line from derived.verify.result, for example "41 of 44 checks caught their planted bug."');
  }
  for (const card of body.querySelectorAll('[data-ve-weak-check]')) {
    if (!card.querySelector('[data-ve-action]')?.textContent.trim()) errors.push(`the weak check "${card.querySelector('h4')?.textContent ?? card.id}" has no reviewer action`);
  }
  for (const weak of body.querySelectorAll('[data-ve-weakest]')) {
    if (!weak.querySelector('[data-ve-action]')?.textContent.trim()) errors.push(`the weakest check of the claim ${weak.closest('details[id]')?.id ?? '?'} has no action`);
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
  errors.push(...checkCopy(body));
  if (steLint) errors.push(...lintSte(body, steLint));
  return errors;
}

// ---- The copy -------------------------------------------------------------------------------

// Not copy: code, diagrams, the user's own words and the tooltip of a Term (the glossary holds its words).
const NOT_COPY = 'script, style, pre, code, svg, blockquote[data-quote], [role="tooltip"], [data-ve-code-block], [data-ve-code-ref], [data-ve-diff-block], [data-ve-lint="skip"]';
// Text that shows more than once by its role: controls, links, navigation, state pills and the
// merge state, screen-reader text, the no-JS twin of a control, tables and the glossary.
const NOT_REPEAT = `${NOT_COPY}, nav, button, summary, label, legend, option, a, table, .ve-visually-hidden, .ve-status-pill, .ve-verdict, [data-ve-review-progress], [data-ve-nojs-only], [data-ve-glossary], .ve-chapter-rail`;
// One record of a data component: a claim, a check, a file, a review item or a glossary word. Its
// values are data that understando derives from the map.
const RECORD = 'li, details, article, tr, [data-ve-glossary] > dd, [data-ve-record]';
// Inline elements join the text of their block; any other element starts a block of its own.
const INLINE = 'span, strong, em, b, i, a, abbr, sup, sub, small, mark, kbd, q, cite, time, data, s, u, br, wbr';

/**
 * The text of each block of the page in document order, without the subtrees that match `skip`.
 * Two inline elements with no space between them (a label and its value, a pill and a count) are
 * two pieces of text, not one sentence.
 */
function textBlocks(body, skip) {
  const out = [];
  let open = null;
  for (const node of textNodes(body, skip)) {
    let block = node.parentElement;
    while (block && block !== body && block.matches(INLINE)) block = block.parentElement;
    const text = node.textContent;
    const joined = open && open.block === block && (open.parent === node.parentElement || /\s$/.test(open.text) || /^[\s.,:;!?)]/.test(text) || !/[\w)]$/.test(open.text));
    if (!joined) {
      const data = block?.closest?.('[data-ve-trust]');
      open = { block, parent: node.parentElement, text: '', where: block?.closest?.('section[id]')?.id ?? 'page', role: !data ? 'narrative' : block.closest(RECORD)?.closest('[data-ve-trust]') ? 'record' : 'component' };
      out.push(open);
    }
    open.text += joined && open.parent !== node.parentElement && /[.!?]$/.test(open.text) && /^\S/.test(text) ? ` ${text}` : text;
    open.parent = node.parentElement;
  }
  return out.map(({ text, where: at, role }) => ({ text: text.replace(/\s+/g, ' ').trim(), where: at, role })).filter((b) => b.text);
}

const sentencesOf = (text) => text.split(/(?<=[.!?])\s+(?=["“([]?[A-Z0-9])/).map((s) => s.trim()).filter(Boolean);
const words = (sentence) => sentence.split(' ').filter((w) => /\w/.test(w)).length;

/** Slogans, label run-ins and repeated sentences (the rules and their lists: copy-rules.mjs). */
function checkCopy(body) {
  const errors = [];
  for (const { text, where: at } of textBlocks(body, NOT_COPY)) {
    for (const sentence of sentencesOf(text)) {
      const phrase = SLOGAN_PHRASES.find((p) => sentence.toLowerCase().includes(p));
      if (phrase || SLOGAN_SENTENCES.some((re) => re.test(sentence))) {
        errors.push(`${at}: the slogan "${sentence}" reassures or labels instead of informing${phrase ? ` ("${phrase}")` : ''}. Delete it. A control's label says what it does, and a fact that matters goes once in the chapter's Lead.`);
      }
    }
  }
  for (const el of body.querySelectorAll('p, li, dd')) {
    if (el.closest(NOT_COPY)) continue;
    const first = [...el.childNodes].find((n) => n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim()));
    if (!first?.matches?.('strong, b')) continue;
    const run = first.textContent.trim();
    const label = run.replace(/[.:]$/, '');
    // A Lead takes no run-in label at all; elsewhere the labels of RUN_IN_LABELS fail.
    if (RUN_IN_LABELS.some((re) => re.test(label)) || (el.closest('[data-ve-lead]') && /[.:]$/.test(run))) {
      errors.push(`${where(first)}: the run-in label "${run}" labels the text instead of saying something. Delete it and start with the plain sentence.`);
    }
  }
  // A sentence twice: the narrative says it again, or a component outside its records does. The
  // same value in several records (claims, checks, files, review items) is data, not copy.
  const seen = new Map();
  for (const { text, where: at, role } of textBlocks(body, NOT_REPEAT)) {
    for (const sentence of sentencesOf(text)) {
      // A label or a heading has no full stop: only a sentence counts.
      if (words(sentence) < REPEAT_MIN_WORDS || !/[.!?]$/.test(sentence)) continue;
      const key = sentence.toLowerCase().replace(/[.!?:]+$/, '');
      const hit = seen.get(key) ?? { sentence, at: [], roles: [] };
      hit.at.push(at);
      hit.roles.push(role);
      seen.set(key, hit);
    }
  }
  for (const { sentence, at, roles } of seen.values()) {
    if (at.length > 1 && (roles.includes('narrative') || roles.filter((r) => r === 'component').length > 1)) {
      errors.push(`the sentence "${sentence}" shows ${at.length} times (${[...new Set(at)].join(', ')}). Say it once, where it matters most.`);
    }
  }
  return errors;
}

// ---- The STE lint (asd-ste100) --------------------------------------------------------------

/** ste-lint.py of the asd-ste100 skill: VE_STE_LINT (a path, or "off"), else the installed skill. */
export function defaultSteLint() {
  const env = process.env.VE_STE_LINT;
  if (env) return env === 'off' ? false : path.resolve(env);
  const installed = ['.agents', '.claude'].map((dir) => path.join(os.homedir(), dir, 'skills/asd-ste100/scripts/ste-lint.py'));
  return installed.find((file) => existsSync(file)) ?? installed[0];
}

/**
 * One run of the STE lint over the copy, one block per line; each hard violation is an error. The
 * copy is the narrative and the text of the components outside their records. A record (a claim,
 * a check, a file, a review item) holds the values that understando derives from the map.
 */
function lintSte(body, script) {
  const off = 'Install the asd-ste100 skill, point --ste-lint (or VE_STE_LINT) at ste-lint.py, or turn the check off with --ste-lint off.';
  if (!existsSync(script)) throw new Error(`the STE lint is not at ${script}. ${off}`);
  const blocks = textBlocks(body, NOT_COPY).filter((b) => b.role !== 'record');
  // One line for each block. A line that opens with a fence mark would hide the lines after it.
  const input = blocks.map((b) => b.text.replace(/^(```|~~~)+/, '')).join('\n') + '\n';
  const lint = spawnSync('python3', ['-I', script, '--json'], { input, encoding: 'utf8', maxBuffer: 1 << 26 });
  if (lint.error) throw new Error(`the STE lint cannot run python3: ${lint.error.message}. ${off}`);
  let report;
  try {
    report = JSON.parse(lint.stdout);
  } catch {
    throw new Error(`the STE lint gave no report (exit ${lint.status}): ${lint.stderr.trim()}`);
  }
  return report.violations.filter((v) => v.level === 'advisory-free').map((v) => {
    const block = blocks[v.line - 1];
    return `${block.where}: STE ${v.rule}: ${v.message} [${v.match}] in "${around(block.text, v.col - 1)}"`;
  });
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
