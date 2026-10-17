// Plain JavaScript so the narration CLI can run it directly; types live in narration-align.d.mts.
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const spell = n => n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ONES[n % 10] : '');

/** Lowercase letters and digits only; recognizers write small numbers as digits, scripts spell them. */
export function normalizeSpokenWord(word, options = {}) {
  const key = String(word).toLowerCase().replace(/\b\d{1,2}\b/g, digits => spell(Number(digits))).replace(/[^a-z0-9]/g, '');
  if (options.ignore?.some(ignored => normalizeSpokenWord(ignored) === key)) return '';
  return options.aliases?.[key] ?? key;
}

const tokens = text => text.split(/\s+/).filter(Boolean);
const similar = (script, heard) => script === heard || (script.length > 3 && heard.startsWith(script.slice(0, 4)));

/**
 * Edit-distance alignment of script words to heard words. One script word may also match two or
 * three consecutive heard words at no cost when they join into it ("skill" "md" → "skillmd").
 * Returns steps of kind match | changed | missing | added with script index i, heard index j and span.
 */
function alignWords(script, heard, equal) {
  const n = script.length, m = heard.length;
  const cost = Array.from({ length: n + 1 }, (_, i) => Float64Array.from({ length: m + 1 }, (_, j) => i + j));
  const joined = (j, k) => heard.slice(j - k, j).join('');
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    let best = Math.min(cost[i - 1][j - 1] + (equal(script[i - 1], heard[j - 1]) ? 0 : 1), cost[i - 1][j] + 1, cost[i][j - 1] + 1);
    for (let k = 2; k <= 3 && k <= j; k++) if (joined(j, k) === script[i - 1]) best = Math.min(best, cost[i - 1][j - k]);
    cost[i][j] = best;
  }
  const steps = [];
  for (let i = n, j = m; i > 0 || j > 0;) {
    const merge = i > 0 ? [2, 3].find(k => k <= j && joined(j, k) === script[i - 1] && cost[i][j] === cost[i - 1][j - k]) : undefined;
    if (merge) { steps.push({ kind: 'match', i: i - 1, j: j - merge, span: merge }); i--; j -= merge; }
    else if (i > 0 && j > 0 && equal(script[i - 1], heard[j - 1]) && cost[i][j] === cost[i - 1][j - 1]) { steps.push({ kind: 'match', i: i - 1, j: j - 1, span: 1 }); i--; j--; }
    else if (i > 0 && j > 0 && cost[i][j] === cost[i - 1][j - 1] + 1) { steps.push({ kind: 'changed', i: i - 1, j: j - 1, span: 1 }); i--; j--; }
    else if (i > 0 && cost[i][j] === cost[i - 1][j] + 1) { steps.push({ kind: 'missing', i: i - 1, j, span: 0 }); i--; }
    else { steps.push({ kind: 'added', i, j: j - 1, span: 1 }); j--; }
  }
  return steps.reverse();
}

function checkWords(words) {
  if (!Array.isArray(words)) throw new Error('Recognized words must be an array.');
  for (const word of words) if (word?.text !== String(word?.text) || !Number.isFinite(word.start) || !Number.isFinite(word.end) || word.end < word.start || word.start < 0) throw new Error('Recognized words need text and finite nonnegative intervals.');
}

/**
 * Time every script word from a recognized transcript of the whole recording. Dropped, merged or
 * misheard words cannot shift later lines: unmatched script words take times interpolated between
 * their matched neighbours and are marked `interpolated`.
 */
export function alignScript(lines, recognized, options = {}) {
  if (!Array.isArray(lines) || !lines.length || lines.some(line => !line?.id?.trim() || !line.text?.trim()) || new Set(lines.map(line => line.id)).size !== lines.length) throw new Error('Script lines need unique IDs and text.');
  checkWords(recognized);
  const script = lines.flatMap((line, lineIndex) => tokens(line.text).map(text => ({ text, lineIndex, key: normalizeSpokenWord(text, options) }))).filter(word => word.key);
  const heard = recognized.map(word => ({ ...word, key: normalizeSpokenWord(word.text, options) })).filter(word => word.key);
  if (!heard.length) throw new Error('The transcript contains no words to align.');
  const timed = script.map(() => null);
  for (const step of alignWords(script.map(word => word.key), heard.map(word => word.key), similar)) {
    if (step.kind === 'match') timed[step.i] = { text: script[step.i].text, start: heard[step.j].start, end: heard[step.j + step.span - 1].end, alignment: 'measured' };
  }
  for (let i = 0; i < timed.length; i++) {
    if (timed[i]) continue;
    const before = timed.slice(0, i).reverse().find(Boolean), after = timed.slice(i + 1).find(Boolean);
    const at = before && after ? (before.end + after.start) / 2 : before ? before.end : after ? after.start : 0;
    timed[i] = { text: script[i].text, start: at, end: at, alignment: 'interpolated' };
  }
  return Object.freeze(lines.map((line, lineIndex) => {
    const words = Object.freeze(timed.filter((_, i) => script[i].lineIndex === lineIndex).map(word => Object.freeze(word)));
    if (!words.length) throw new Error(`Script line ${line.id} has no speakable words.`);
    return Object.freeze({ id: line.id, start: words[0].start, end: Math.max(...words.map(word => word.end)), words });
  }));
}

/** Line-relative words for `alignedWordsToCues`; interpolated words get a minimum 0.05 s interval. */
export function toAlignedWords(line) {
  return Object.freeze(line.words.map(word => Object.freeze([word.text, word.start - line.start, Math.max(word.end, word.start + .05) - line.start])));
}

/** Word-level differences between what a take should say and what was recognized; empty means an exact read. */
export function compareTranscript(scriptText, recognized, options = {}) {
  checkWords(recognized);
  const script = tokens(String(scriptText)).map(text => normalizeSpokenWord(text, options)).filter(Boolean);
  const heard = recognized.map(word => normalizeSpokenWord(word.text, options)).filter(Boolean);
  const differences = [];
  for (const step of alignWords(script, heard, (a, b) => a === b)) {
    if (step.kind === 'changed') differences.push({ kind: 'changed', script: script[step.i], heard: heard[step.j] });
    else if (step.kind === 'missing') differences.push({ kind: 'missing', script: script[step.i], heard: '' });
    else if (step.kind === 'added') differences.push({ kind: 'added', script: '', heard: heard[step.j] });
  }
  return Object.freeze(differences.map(difference => Object.freeze(difference)));
}
