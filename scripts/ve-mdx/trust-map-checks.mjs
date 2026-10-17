// Export checks for a trust-map explainer (plugins/visual-explainer/cards/trust-map.md). They run
// on the static pre-render, so they see the narrative MDX and the data components as a reader
// does, and on the MDX sources for the no-hand-copy guard.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { isPlainWord, MAX_TERMS_PER_CHAPTER } from '../../visual-explainer-mdx/glossary-policy.mjs';
import { EXPLAIN_MIN_WORDS, GLUE_MAX_COLONS, GLUE_REPEAT_WORDS, MAX_BARE_ITEMS, REPEAT_MIN_WORDS, RUN_IN_LABELS, SLOGAN_PHRASES, SLOGAN_SENTENCES, TITLE_MIN_WORDS } from './copy-rules.mjs';

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
 *  - The verify block opens with its result line; each weak check and the weakest check of each claim has an action.
 *  - Each #fragment link has a target, and no id shows twice.
 *  - The copy has no slogan, no label run-in and no sentence twice (copy-rules.mjs), and the
 *    asd-ste100 lint finds no hard violation in it (`steLint`: the path of ste-lint.py, or false).
 *  - Every block answers a reader question: no two titles joined by a bare word ("<Title> imports
 *    <Title>"), no opener whose body is only a long list with no explanation, and no sentence of
 *    glued fields (a name that shows twice in one block, or a colon-joined list of fields).
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
  // Term marks: few per chapter, and never on an everyday word (visual-explainer-mdx/glossary-policy.mjs).
  for (const section of body.querySelectorAll('section.ve-section[id]')) {
    const marks = [...section.querySelectorAll('.ve-term')].map((term) => textNodes(term, '[role="tooltip"]').map((n) => n.textContent).join('').trim());
    if (marks.length > MAX_TERMS_PER_CHAPTER) errors.push(`${section.id}: ${marks.length} glossary terms are marked (${marks.join(', ')}); a chapter marks at most ${MAX_TERMS_PER_CHAPTER}. Mark only the jargon and the abbreviations, once per chapter.`);
    const plain = [...new Set(marks.filter((word) => isPlainWord(word)))];
    const twice = [...new Set(marks.map(norm).filter((word, i, all) => all.indexOf(word) !== i))];
    if (twice.length) errors.push(`${section.id}: the glossary terms ${twice.join(', ')} are marked more than once; mark a term at its first use in the chapter only.`);
    if (plain.length) errors.push(`${section.id}: the everyday words ${plain.join(', ')} are marked as glossary terms. Leave everyday words plain.`);
  }
  if (missing.size) errors.push(`the page uses terms that the glossary does not define: ${[...missing].sort().join(', ')}. Add each to the glossary of the trust map.`);
  const verify = body.querySelector('[data-ve-trust="verifiers"]');
  if (verify && !(verify.firstElementChild?.hasAttribute('data-ve-result') && /\d+ of \d+ checks caught their planted bug/.test(verify.firstElementChild.textContent))) {
    errors.push('the verify block must open with its result line from derived.verify.result, for example "41 of 44 checks caught their planted bug."');
  }
  for (const card of body.querySelectorAll('[data-ve-weak-check]')) {
    if (!card.querySelector('[data-ve-action]')?.textContent.trim()) errors.push(`the weak check "${card.querySelector('h4')?.textContent ?? card.id}" has no action`);
  }
  for (const weak of body.querySelectorAll('[data-ve-weakest]')) {
    if (!weak.querySelector('[data-ve-action]')?.textContent.trim()) errors.push(`the weakest check of the claim ${weak.closest('details[id]')?.id ?? '?'} has no action`);
  }
  const ids = new Map();
  for (const el of body.querySelectorAll('[id]')) ids.set(el.id, (ids.get(el.id) ?? 0) + 1);
  for (const [id, n] of ids) if (n > 1) errors.push(`the id #${id} shows ${n} times; each anchor must be unique (render each ClaimDetail once)`);
  for (const a of body.querySelectorAll('a[href^="#"]')) {
    const target = decodeURIComponent(a.getAttribute('href').slice(1));
    if (target && !ids.has(target)) errors.push(`the link #${target} has no target`);
  }
  errors.push(...checkWorkedExamples(body));
  errors.push(...checkCopy(body));
  errors.push(...checkEnumerations(body));
  errors.push(...checkGlue(body));
  if (steLint) errors.push(...lintSte(body, steLint));
  return errors;
}

// ---- The worked examples --------------------------------------------------------------------

/**
 * A how-it-works chapter (one that steps through a run, or that shows a worked example) leads with
 * a worked example of real data (WorkedExample): the example comes before the first diagram of the
 * chapter. Each example step names the source pointers of its values, and its reason holds no
 * claim, check or control ID.
 */
function checkWorkedExamples(body) {
  const errors = [];
  const sections = new Set();
  for (const el of body.querySelectorAll('section.ve-section [data-ve-stepper], section.ve-section [data-ve-example]')) sections.add(el.closest('section.ve-section'));
  for (const section of sections) {
    const example = section.querySelector('[data-ve-example]');
    const label = section.id || 'a chapter';
    if (!example) {
      errors.push(`${label}: a how-it-works level has no worked example. Lead with <WorkedExample refs={refs} id="..." />: one run of real values from a fixture, a trace or a vector (understando scripts/example.py). The abstract diagram comes after it.`);
      continue;
    }
    // In document order: the first example or diagram of the chapter must be the example.
    const first = section.querySelector('[data-ve-example], [data-ve-diagram-modes], [data-ve-stations], figure[data-ve-typed]');
    if (first !== example) {
      errors.push(`${label}: the worked example "${example.getAttribute('data-ve-example')}" comes after a diagram. Lead with the example; the abstract diagram is the overview after it.`);
    }
  }
  for (const step of body.querySelectorAll('[data-ve-example-step]')) {
    const ex = step.closest('[data-ve-example]')?.getAttribute('data-ve-example') ?? '?';
    const items = [...step.querySelectorAll('[data-ve-provenance] li')].filter((li) => li.textContent.trim());
    if (!items.length) errors.push(`the example "${ex}", step ${step.getAttribute('data-ve-example-step')}: no provenance. Each step names the source pointers of its values.`);
    for (const reason of step.querySelectorAll('.ve-example-reason')) {
      const hit = reason.textContent.match(ID);
      if (hit) errors.push(`the example "${ex}", step ${step.getAttribute('data-ve-example-step')}: the ID ${hit[0]} is in its reason. Name the thing in plain words.`);
    }
  }
  return errors;
}

// ---- The copy -------------------------------------------------------------------------------

// Not copy: code, diagrams, the user's own words and the tooltip of a Term (the glossary holds its words).
const NOT_COPY = 'script, style, pre, code, svg, blockquote[data-quote], [role="tooltip"], [data-ve-code-block], [data-ve-code-ref], [data-ve-diff-block], [data-ve-lint="skip"]';
// Text that shows more than once by its role: controls, links, navigation, state pills,
// screen-reader text, tables and the glossary.
const NOT_REPEAT = `${NOT_COPY}, nav, button, summary, label, legend, option, a, table, .ve-visually-hidden, .ve-status-pill, [data-ve-glossary], .ve-chapter-rail`;
// One record of a data component: a claim, a check, an invariant or a glossary word. Its values
// are data that understando derives from the map.
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
  // same value in several records (claims, checks, invariants) is data, not copy.
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

// ---- Raw enumerations ------------------------------------------------------------------------

const TITLES = 'h2, h3, h4, .ve-typed-title, .ve-path-name';
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const letterWords = (text) => text.split(/\s+/).filter((w) => /[A-Za-z]/.test(w)).length;

/**
 * Mechanical text that answers no reader question (copy-rules.mjs):
 *  - a title join: two titles of the page (chapter titles, headings, promise labels) joined by one
 *    or two bare words, as in "Run it all from one command imports Trim the old pipelines: 27 imports.";
 *  - a raw enumeration: an opener (a Disclosure) whose body is only a list of more than
 *    MAX_BARE_ITEMS items, with fewer than EXPLAIN_MIN_WORDS words that say why to read it.
 */
function checkEnumerations(body) {
  const errors = [];
  const titles = [...new Set([...body.querySelectorAll(TITLES)].map((el) => textNodes(el, '[role="tooltip"], .ve-visually-hidden').map((n) => n.textContent).join('').replace(/\s+/g, ' ').trim().replace(/[.:]$/, '')))]
    .filter((t) => letterWords(t) >= TITLE_MIN_WORDS).sort((a, b) => b.length - a.length);
  if (titles.length > 1) {
    const any = titles.map(escape).join('|');
    // The titles match in any case; the joining words are lower case, as a template writes them.
    const join = new RegExp(`(?<![\\w-])(${any})\\s+([a-z]+(?:\\s+[a-z]+)?)\\s+(${any})(?![\\w-])`, 'gi');
    const joins = new Map();
    for (const { text, where: at } of textBlocks(body, NOT_COPY)) {
      const m = [...text.matchAll(join)].find((x) => /^[a-z]+(?:\s+[a-z]+)?$/.test(x[2]));
      if (m) joins.set(at, [...(joins.get(at) ?? []), m]);
    }
    for (const [at, all] of joins) {
      const m = all[0];
      errors.push(`${at}: ${all.length === 1 ? 'a block joins' : `${all.length} blocks join`} two titles with a bare word, for example "${m[1]}" ${m[2]} "${m[3]}". A title join answers no reader question: say in one sentence what the reader learns, or cut it.`);
    }
  }
  for (const details of body.querySelectorAll('details')) {
    const inner = details.querySelector(':scope > .ve-disclosure-body');
    if (!inner || details.closest('[data-ve-lint="skip"]')) continue;
    const lists = [...inner.querySelectorAll('ul, ol, dl')].filter((l) => l.closest('details') === details && !l.parentElement.closest('ul, ol, dl'));
    const items = Math.max(0, ...lists.map((l) => [...l.children].filter((c) => c.matches(l.matches('dl') ? 'dt' : 'li')).length));
    if (items <= MAX_BARE_ITEMS) continue;
    const words = letterWords(textNodes(inner, 'ul, ol, dl, details, pre, code, svg, table, script, style').map((n) => n.textContent).join(' '));
    if (words >= EXPLAIN_MIN_WORDS) continue;
    const summary = details.querySelector(':scope > summary .ve-disclosure-label')?.textContent.trim() ?? details.querySelector(':scope > summary')?.textContent.trim() ?? '?';
    errors.push(`${where(details)}: the opener "${summary}" holds only a list of ${items} items, with no explanation. A raw enumeration answers no reader question: say what the reader learns from it in one sentence, or cut it.`);
  }
  return errors;
}

// ---- Glued fields ----------------------------------------------------------------------------

/**
 * Fields of a record joined into one "sentence" (copy-rules.mjs): the name of a thing pasted
 * twice into one block ("the overdraft refusal test. contract check ... (V2): the overdraft
 * refusal test: a contract check"), or a list of "label: value" fields in one sentence. Say what
 * the thing does in one plain sentence ("Runs the overdraft refusal test (a contract check) from
 * tests/test_core.py.").
 */
function checkGlue(body) {
  const errors = [];
  for (const { text, where: at } of textBlocks(body, NOT_REPEAT)) {
    for (const sentence of sentencesOf(text)) {
      const tokens = sentence.toLowerCase().split(/[^\p{L}\p{N}']+/u).filter(Boolean);
      const seen = new Map();
      let repeat = null;
      for (let i = 0; i + GLUE_REPEAT_WORDS <= tokens.length && !repeat; i++) {
        const key = tokens.slice(i, i + GLUE_REPEAT_WORDS).join(' ');
        if (seen.has(key) && i - seen.get(key) >= GLUE_REPEAT_WORDS) repeat = key;
        else if (!seen.has(key)) seen.set(key, i);
      }
      if (repeat) errors.push(`${at}: a sentence says "${repeat}" twice, as if fields were glued together: "${around(sentence, 0)}". Say it once, in one plain sentence.`);
      // A numbered tag ("Station 1: <title>") is one field; the colons after it count.
      if ((sentence.replace(/^\p{L}+ \d+: /u, '').match(/:\s/g) ?? []).length > GLUE_MAX_COLONS) errors.push(`${at}: a sentence joins fields with colons: "${around(sentence, 0)}". A list of "label: value" fields is not a sentence: say in one plain sentence what the reader learns.`);
    }
  }
  return errors;
}

// ---- The STE lint (asd-ste100) --------------------------------------------------------------

// A copy of ste-lint.py (MIT, see vendor/asd-ste100/LICENSE) for a machine without the skill, such
// as CI or a run with its own HOME.
const VENDORED_STE_LINT = fileURLToPath(new URL('./vendor/asd-ste100/ste-lint.py', import.meta.url));

/** ste-lint.py of the asd-ste100 skill: VE_STE_LINT (a path, or "off"), else the installed skill, else the vendored copy. */
export function defaultSteLint() {
  const env = process.env.VE_STE_LINT;
  if (env) return env === 'off' ? false : path.resolve(env);
  const installed = ['.agents', '.claude'].map((dir) => path.join(os.homedir(), dir, 'skills/asd-ste100/scripts/ste-lint.py'));
  return installed.find((file) => existsSync(file)) ?? VENDORED_STE_LINT;
}

/**
 * One run of the STE lint over the copy, one paragraph per block; each hard violation is an error. The
 * copy is the narrative and the text of the components outside their records. A record (a claim,
 * a check, an invariant) holds the values that understando derives from the map.
 */
function lintSte(body, script) {
  const off = 'Install the asd-ste100 skill, point --ste-lint (or VE_STE_LINT) at ste-lint.py, or turn the check off with --ste-lint off.';
  if (!existsSync(script)) throw new Error(`the STE lint is not at ${script}. ${off}`);
  const blocks = textBlocks(body, NOT_COPY).filter((b) => b.role !== 'record');
  // One line for each block. A line that opens with a fence mark would hide the lines after it.
  const input = blocks.map((b) => b.text.replace(/^(```|~~~)+/, '')).join('\n\n') + '\n';
  const lint = spawnSync('python3', ['-I', script, '--json'], { input, encoding: 'utf8', maxBuffer: 1 << 26 });
  if (lint.error) throw new Error(`the STE lint cannot run python3: ${lint.error.message}. ${off}`);
  let report;
  try {
    report = JSON.parse(lint.stdout);
  } catch {
    throw new Error(`the STE lint gave no report (exit ${lint.status}): ${lint.stderr.trim()}`);
  }
  return report.violations.filter((v) => v.level === 'advisory-free').map((v) => {
    const block = blocks[Math.floor((v.line - 1) / 2)];
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
