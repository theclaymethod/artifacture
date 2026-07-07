import { codeToHtml } from 'shiki';

const diagramComponents = new Set(['DiagramCanvas', 'FlowDiagram']);
const sharedComponents = new Set([
  'ExplainerShell',
  'Section',
  'Callout',
  'Pipeline',
  'DecisionMatrix',
  'RiskLedger',
  'FlowDiagram',
  'DiagramCanvas',
  'CodeBlock',
  'DiffBlock',
  'TerminalBlock',
  'JsonTree',
  'Quiz',
  'MermaidBlock',
  'SlideDeck',
  'Slide',
  'PosterCanvas',
]);
const globalComponents = new Set([]);

export async function preflightSource(code, { id, draft = false } = {}) {
  const diagnostics = collectIntegrityDiagnostics(code, id);
  let transformed = await injectCodeBlockHtml(code);
  transformed = await injectDiffBlockRows(transformed);
  if (diagnostics.length) {
    const formatted = formatDiagnostics(diagnostics);
    if (draft) {
      console.warn(`visual-explainer draft warnings:\n${formatted}`);
    } else {
      throw new Error(`visual-explainer integrity failed:\n${formatted}`);
    }
  }
  return { code: transformed, diagnostics };
}

export function collectIntegrityDiagnostics(code, id = 'source') {
  const diagnostics = [];
  diagnostics.push(...checkUndefinedComponents(code, id));
  for (const tag of findComponentTags(code, diagramComponents)) {
    const nodesExpr = getPropExpression(tag.source, 'nodes');
    const edgesExpr = getPropExpression(tag.source, 'edges');
    if (!nodesExpr || !edgesExpr) continue;
    if (!isLiteralExpression(nodesExpr) || !isLiteralExpression(edgesExpr)) continue;
    const nodes = evaluateLiteral(nodesExpr, id, `${tag.name}.nodes`, diagnostics);
    const edges = evaluateLiteral(edgesExpr, id, `${tag.name}.edges`, diagnostics);
    if (!Array.isArray(nodes) || !Array.isArray(edges)) continue;
    const nodeIds = new Set();
    for (const node of nodes) {
      if (!node?.id) diagnostics.push(error(id, tag.name, `node is missing id: ${JSON.stringify(node)}`));
      else if (nodeIds.has(node.id)) diagnostics.push(error(id, tag.name, `duplicate node id "${node.id}"`));
      else nodeIds.add(node.id);
    }
    edges.forEach((edge, index) => {
      if (!nodeIds.has(edge?.from)) diagnostics.push(error(id, tag.name, `edge[${index}] from="${edge?.from}" does not match a declared node id`));
      if (!nodeIds.has(edge?.to)) diagnostics.push(error(id, tag.name, `edge[${index}] to="${edge?.to}" does not match a declared node id`));
    });
    const forcedViewBoxExpr = getPropExpression(tag.source, 'integrityViewBox') ?? getPropExpression(tag.source, 'viewBox');
    const forcedViewBox = forcedViewBoxExpr ? evaluateLiteral(forcedViewBoxExpr, id, `${tag.name}.integrityViewBox`, diagnostics) : null;
    const clipDiagnostics = checkDiagramClip(nodes, forcedViewBox);
    for (const item of clipDiagnostics) diagnostics.push(error(id, tag.name, item));
  }
  for (const tag of findComponentTags(code, new Set(['DecisionMatrix']))) {
    const rowsExpr = getPropExpression(tag.source, 'rows');
    if (!rowsExpr) continue;
    if (!isLiteralExpression(rowsExpr)) continue;
    const rows = evaluateLiteral(rowsExpr, id, 'DecisionMatrix.rows', diagnostics);
    if (!Array.isArray(rows) || rows.length < 2) continue;
    const expected = Object.keys(rows[0]).sort();
    rows.forEach((row, index) => {
      const actual = Object.keys(row ?? {}).sort();
      if (actual.join('\0') !== expected.join('\0')) {
        diagnostics.push(error(id, 'DecisionMatrix', `row[${index}] keys [${actual.join(', ')}] do not match row[0] keys [${expected.join(', ')}]`));
      }
    });
  }
  for (const tag of findComponentTags(code, new Set(['DiffBlock']))) {
    const patchExpr = getPropExpression(tag.source, 'patch');
    const beforeExpr = getPropExpression(tag.source, 'before');
    const afterExpr = getPropExpression(tag.source, 'after');
    if (patchExpr && (beforeExpr || afterExpr)) {
      diagnostics.push(error(id, 'DiffBlock', 'use either patch or before/after, not both'));
      continue;
    }
    if (patchExpr) {
      if (!isLiteralExpression(patchExpr)) continue;
      const patch = evaluateLiteral(patchExpr, id, 'DiffBlock.patch', diagnostics);
      if (typeof patch !== 'string') {
        diagnostics.push(error(id, 'DiffBlock', 'patch must be a string'));
        continue;
      }
      const parsed = parseUnifiedDiff(patch);
      if (parsed.errors.length) {
        for (const message of parsed.errors) diagnostics.push(error(id, 'DiffBlock', message));
      }
    } else if (beforeExpr && afterExpr) {
      if (!isLiteralExpression(beforeExpr) || !isLiteralExpression(afterExpr)) continue;
      const before = evaluateLiteral(beforeExpr, id, 'DiffBlock.before', diagnostics);
      const after = evaluateLiteral(afterExpr, id, 'DiffBlock.after', diagnostics);
      if (typeof before !== 'string' || typeof after !== 'string') {
        diagnostics.push(error(id, 'DiffBlock', 'before and after must be strings'));
      } else if (before === after) {
        diagnostics.push(error(id, 'DiffBlock', 'before and after must differ'));
      }
    } else {
      diagnostics.push(error(id, 'DiffBlock', 'provide patch or before/after'));
    }
  }
  for (const tag of findComponentTags(code, new Set(['JsonTree']))) {
    const dataExpr = getPropExpression(tag.source, 'data');
    if (!dataExpr) {
      diagnostics.push(error(id, 'JsonTree', 'data prop is required'));
      continue;
    }
    if (!isLiteralExpression(dataExpr)) continue;
    const data = evaluateLiteral(dataExpr, id, 'JsonTree.data', diagnostics);
    const serializable = assertJsonSerializable(data);
    if (serializable) diagnostics.push(error(id, 'JsonTree', serializable));
  }
  for (const tag of findComponentTags(code, new Set(['Quiz']))) {
    const questionsExpr = getPropExpression(tag.source, 'questions');
    if (!questionsExpr) {
      diagnostics.push(error(id, 'Quiz', 'questions prop is required'));
      continue;
    }
    if (!isLiteralExpression(questionsExpr)) continue;
    const questions = evaluateLiteral(questionsExpr, id, 'Quiz.questions', diagnostics);
    if (!Array.isArray(questions) || questions.length === 0) {
      diagnostics.push(error(id, 'Quiz', 'questions must be a non-empty array'));
      continue;
    }
    questions.forEach((question, questionIndex) => {
      if (!question?.q) diagnostics.push(error(id, 'Quiz', `questions[${questionIndex}] is missing q`));
      if (!Array.isArray(question?.options) || question.options.length < 2) {
        diagnostics.push(error(id, 'Quiz', `questions[${questionIndex}] must have at least two options`));
        return;
      }
      const correct = question.options.filter((option) => option?.correct === true);
      if (correct.length !== 1) diagnostics.push(error(id, 'Quiz', `questions[${questionIndex}] must have exactly one correct option`));
      question.options.forEach((option, optionIndex) => {
        if (!option?.text) diagnostics.push(error(id, 'Quiz', `questions[${questionIndex}].options[${optionIndex}] is missing text`));
        if (!option?.why) diagnostics.push(error(id, 'Quiz', `questions[${questionIndex}].options[${optionIndex}] is missing why`));
      });
    });
  }
  return diagnostics;
}

export function formatDiagnostics(diagnostics) {
  return diagnostics.map((diagnostic) => `- ${diagnostic.file}: ${diagnostic.component}: ${diagnostic.message}`).join('\n');
}

function findComponentTags(code, names) {
  const tags = [];
  const pattern = /<([A-Z][A-Za-z0-9]*)\b/g;
  let match;
  while ((match = pattern.exec(code))) {
    const name = match[1];
    if (!names.has(name)) continue;
    const start = match.index;
    const end = findOpeningTagEnd(code, pattern.lastIndex);
    if (end === -1) continue;
    tags.push({ name, source: code.slice(start, end + 1) });
    pattern.lastIndex = end + 1;
  }
  return tags;
}

function checkUndefinedComponents(code, id) {
  const available = new Set([...globalComponents, ...collectImportedIdentifiers(code), ...collectLocalComponentIdentifiers(code)]);
  const diagnostics = [];
  for (const name of collectJsxComponentIdentifiers(code)) {
    if (available.has(name)) continue;
    diagnostics.push(error(id, name, undefinedComponentMessage(name, code)));
  }
  return diagnostics;
}

function collectJsxComponentIdentifiers(code) {
  const names = new Set();
  const pattern = /(?<![\w$])<\s*([A-Z][A-Za-z0-9_]*)(?:\.[A-Z][A-Za-z0-9_]*)?\b/g;
  let match;
  while ((match = pattern.exec(code))) names.add(match[1]);
  return names;
}

function collectImportedIdentifiers(code) {
  const names = new Set();
  const importPattern = /^\s*import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"];?/gm;
  let match;
  while ((match = importPattern.exec(code))) {
    const clause = match[1].trim();
    const named = clause.match(/\{([\s\S]*?)\}/);
    if (named) {
      for (const specifier of named[1].split(',')) {
        const clean = specifier.trim();
        if (!clean) continue;
        names.add(clean.split(/\s+as\s+/).pop().trim());
      }
    }
    const defaultImport = clause.match(/^([A-Za-z_$][\w$]*)\s*(?:,|$)/);
    if (defaultImport) names.add(defaultImport[1]);
    const namespaceImport = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
    if (namespaceImport) names.add(namespaceImport[1]);
  }
  return names;
}

function collectLocalComponentIdentifiers(code) {
  const names = new Set();
  const patterns = [
    /^\s*(?:export\s+)?function\s+([A-Z][A-Za-z0-9_]*)\b/gm,
    /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Z][A-Za-z0-9_]*)\s*=/gm,
    /^\s*(?:export\s+)?class\s+([A-Z][A-Za-z0-9_]*)\b/gm,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(code))) names.add(match[1]);
  }
  return names;
}

function undefinedComponentMessage(name, code) {
  if (!sharedComponents.has(name)) return `component "${name}" is referenced but is not imported, locally defined, or globally provided`;
  return `component "${name}" is referenced but is not imported, locally defined, or globally provided. Add: ${suggestImportLine(name, code)}`;
}

function suggestImportLine(name, code) {
  const existing = findSharedComponentImport(code);
  if (!existing) return `import { ${name} } from 'visual-explainer-mdx/components';`;
  const names = Array.from(new Set([...existing.names, name])).sort((a, b) => a.localeCompare(b));
  return `import { ${names.join(', ')} } from '${existing.source}';`;
}

function findSharedComponentImport(code) {
  const pattern = /^\s*import\s+\{([\s\S]*?)\}\s+from\s+['"]([^'"]*visual-explainer-mdx\/components(?:\.tsx)?)['"];?/gm;
  let match;
  while ((match = pattern.exec(code))) {
    const names = match[1].split(',').map((specifier) => specifier.trim().split(/\s+as\s+/).pop().trim()).filter(Boolean);
    return { names, source: match[2] };
  }
  return null;
}

function findOpeningTagEnd(code, start) {
  let quote = null;
  let braceDepth = 0;
  for (let i = start; i < code.length; i += 1) {
    const char = code[i];
    const prev = code[i - 1];
    if (quote) {
      if (char === quote && prev !== '\\') quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') braceDepth += 1;
    else if (char === '}') braceDepth -= 1;
    else if (char === '>' && braceDepth === 0) return i;
  }
  return -1;
}

function getPropExpression(tagSource, propName) {
  const propIndex = tagSource.search(new RegExp(`\\b${propName}\\s*=`));
  if (propIndex === -1) return null;
  let i = tagSource.indexOf('=', propIndex) + 1;
  while (/\s/.test(tagSource[i])) i += 1;
  if (tagSource[i] === '{') {
    const end = findBalanced(tagSource, i, '{', '}');
    return end === -1 ? null : tagSource.slice(i + 1, end);
  }
  if (tagSource[i] === '"' || tagSource[i] === "'") {
    const quote = tagSource[i];
    let end = i + 1;
    while (end < tagSource.length && !(tagSource[end] === quote && tagSource[end - 1] !== '\\')) end += 1;
    return JSON.stringify(tagSource.slice(i + 1, end));
  }
  return null;
}

function findBalanced(input, start, open, close) {
  let depth = 0;
  let quote = null;
  for (let i = start; i < input.length; i += 1) {
    const char = input[i];
    const prev = input[i - 1];
    if (quote) {
      if (char === quote && prev !== '\\') quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === open) depth += 1;
    if (char === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// evaluateLiteral parses a JSX prop expression as a bounded literal — it never
// executes source. Only object/array literals, strings (single/double/
// backtick without `${` interpolation), numbers, booleans, and null are
// accepted; anything else (identifiers, calls, spreads, arrow functions,
// template interpolation) is rejected with the same diagnostic shape the
// previous eval-based evaluator produced.
function evaluateLiteral(expr, file, label, diagnostics) {
  try {
    const state = { input: expr, pos: 0 };
    const value = parseLiteralValue(state);
    skipLiteralWhitespace(state);
    if (state.pos !== state.input.length) {
      throw new Error(`non-literal expression: unexpected trailing content at position ${state.pos}`);
    }
    return value;
  } catch (cause) {
    diagnostics.push(error(file, label, `could not evaluate literal props: ${cause instanceof Error ? cause.message : cause}`));
    return null;
  }
}

function isLiteralExpression(expr) {
  const trimmed = expr.trim();
  return trimmed.startsWith('[') || trimmed.startsWith('{') || trimmed.startsWith('`') || trimmed.startsWith('"') || trimmed.startsWith("'");
}

function skipLiteralWhitespace(state) {
  while (state.pos < state.input.length && /\s/.test(state.input[state.pos])) state.pos += 1;
}

function literalPeek(state) {
  return state.input[state.pos];
}

function literalExpect(state, char) {
  if (state.input[state.pos] !== char) {
    throw new Error(`non-literal expression: expected "${char}" at position ${state.pos}, got "${state.input[state.pos] ?? 'EOF'}"`);
  }
  state.pos += 1;
}

function parseLiteralValue(state) {
  skipLiteralWhitespace(state);
  const char = literalPeek(state);
  if (char === '{') return parseLiteralObject(state);
  if (char === '[') return parseLiteralArray(state);
  if (char === '"' || char === "'") return parseLiteralString(state, char);
  if (char === '`') return parseLiteralTemplate(state);
  if (char === '-' || (char >= '0' && char <= '9')) return parseLiteralNumber(state);
  if (state.input.startsWith('true', state.pos) && !/[A-Za-z0-9_$]/.test(state.input[state.pos + 4] ?? '')) {
    state.pos += 4;
    return true;
  }
  if (state.input.startsWith('false', state.pos) && !/[A-Za-z0-9_$]/.test(state.input[state.pos + 5] ?? '')) {
    state.pos += 5;
    return false;
  }
  if (state.input.startsWith('null', state.pos) && !/[A-Za-z0-9_$]/.test(state.input[state.pos + 4] ?? '')) {
    state.pos += 4;
    return null;
  }
  if (state.input.startsWith('undefined', state.pos) && !/[A-Za-z0-9_$]/.test(state.input[state.pos + 9] ?? '')) {
    state.pos += 9;
    return undefined;
  }
  throw new Error(`non-literal expression at position ${state.pos}`);
}

function parseLiteralObject(state) {
  literalExpect(state, '{');
  const obj = {};
  skipLiteralWhitespace(state);
  if (literalPeek(state) === '}') {
    state.pos += 1;
    return obj;
  }
  for (;;) {
    skipLiteralWhitespace(state);
    if (state.input.startsWith('...', state.pos)) {
      throw new Error(`non-literal expression: spread syntax is not allowed at position ${state.pos}`);
    }
    const key = parseLiteralObjectKey(state);
    skipLiteralWhitespace(state);
    literalExpect(state, ':');
    obj[key] = parseLiteralValue(state);
    skipLiteralWhitespace(state);
    if (literalPeek(state) === ',') {
      state.pos += 1;
      skipLiteralWhitespace(state);
      if (literalPeek(state) === '}') {
        state.pos += 1;
        break;
      }
      continue;
    }
    literalExpect(state, '}');
    break;
  }
  return obj;
}

function parseLiteralObjectKey(state) {
  const char = literalPeek(state);
  if (char === '"' || char === "'") return parseLiteralString(state, char);
  if (char === '[') {
    throw new Error(`non-literal expression: computed object keys are not allowed at position ${state.pos}`);
  }
  const match = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(state.input.slice(state.pos));
  if (!match) throw new Error(`non-literal expression: expected object key at position ${state.pos}`);
  state.pos += match[0].length;
  return match[0];
}

function parseLiteralArray(state) {
  literalExpect(state, '[');
  const arr = [];
  skipLiteralWhitespace(state);
  if (literalPeek(state) === ']') {
    state.pos += 1;
    return arr;
  }
  for (;;) {
    skipLiteralWhitespace(state);
    if (state.input.startsWith('...', state.pos)) {
      throw new Error(`non-literal expression: spread syntax is not allowed at position ${state.pos}`);
    }
    arr.push(parseLiteralValue(state));
    skipLiteralWhitespace(state);
    if (literalPeek(state) === ',') {
      state.pos += 1;
      skipLiteralWhitespace(state);
      if (literalPeek(state) === ']') {
        state.pos += 1;
        break;
      }
      continue;
    }
    literalExpect(state, ']');
    break;
  }
  return arr;
}

function parseLiteralString(state, quote) {
  literalExpect(state, quote);
  let result = '';
  for (;;) {
    if (state.pos >= state.input.length) throw new Error('non-literal expression: unterminated string literal');
    const char = state.input[state.pos];
    if (char === quote) {
      state.pos += 1;
      break;
    }
    if (char === '\\') {
      state.pos += 1;
      result += unescapeLiteralChar(state);
      continue;
    }
    result += char;
    state.pos += 1;
  }
  return result;
}

function parseLiteralTemplate(state) {
  literalExpect(state, '`');
  let result = '';
  for (;;) {
    if (state.pos >= state.input.length) throw new Error('non-literal expression: unterminated template literal');
    const char = state.input[state.pos];
    if (char === '`') {
      state.pos += 1;
      break;
    }
    if (char === '$' && state.input[state.pos + 1] === '{') {
      throw new Error(`non-literal expression: template literal interpolation is not allowed at position ${state.pos}`);
    }
    if (char === '\\') {
      state.pos += 1;
      result += unescapeLiteralChar(state);
      continue;
    }
    result += char;
    state.pos += 1;
  }
  return result;
}

function unescapeLiteralChar(state) {
  const esc = state.input[state.pos];
  state.pos += 1;
  switch (esc) {
    case 'n': return '\n';
    case 't': return '\t';
    case 'r': return '\r';
    case 'b': return '\b';
    case 'f': return '\f';
    case '0': return '\0';
    case "'": return "'";
    case '"': return '"';
    case '`': return '`';
    case '\\': return '\\';
    case '\n': return '';
    default: return esc;
  }
}

function parseLiteralNumber(state) {
  const match = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(state.input.slice(state.pos));
  if (!match) throw new Error(`non-literal expression: invalid number at position ${state.pos}`);
  state.pos += match[0].length;
  return Number(match[0]);
}

function checkDiagramClip(nodes, forcedViewBox) {
  if (!Array.isArray(forcedViewBox)) return [];
  const [x, y, width, height] = forcedViewBox.map(Number);
  if (![x, y, width, height].every(Number.isFinite)) return ['integrityViewBox must be [x, y, width, height]'];
  const laidOut = computeSimpleLayout(nodes);
  const messages = [];
  for (const node of laidOut) {
    if (node.x < x || node.y < y || node.x + node.width > x + width || node.y + node.height > y + height) {
      messages.push(`node "${node.id}" clips forced viewBox [${forcedViewBox.join(', ')}] at bbox [${node.x}, ${node.y}, ${node.width}, ${node.height}]`);
    }
  }
  return messages;
}

function computeSimpleLayout(nodes) {
  const padding = { left: 72, top: 64 };
  return nodes.map((node, index) => ({
    id: node.id,
    x: padding.left + index * 270,
    y: padding.top,
    width: node.shape === 'dot' ? 42 : Math.max(150, Math.min(270, String(node.label ?? '').length * 12 + 70, String(node.detail ?? '').length * 7 + 56)),
    height: node.shape === 'dot' ? 42 : 94,
  }));
}

async function injectCodeBlockHtml(code) {
  const pattern = /<CodeBlock\b[\s\S]*?\/>/g;
  const matches = [...code.matchAll(pattern)];
  let output = code;
  for (const match of matches) {
    const tag = match[0];
    if (/\bhtml\s*=/.test(tag)) continue;
    const codeExpr = getPropExpression(tag, 'code');
    const languageExpr = getPropExpression(tag, 'language');
    if (!codeExpr || !languageExpr) continue;
    const diagnostics = [];
    const rawCode = evaluateLiteral(codeExpr, 'CodeBlock', 'code', diagnostics);
    const language = evaluateLiteral(languageExpr, 'CodeBlock', 'language', diagnostics);
    if (diagnostics.length || typeof rawCode !== 'string' || typeof language !== 'string') continue;
    const html = await highlightCode(rawCode, language);
    const injected = tag.replace(/\s*\/>$/, ` html={${JSON.stringify(html)}} />`);
    output = output.replace(tag, injected);
  }
  return output;
}

async function injectDiffBlockRows(code) {
  const pattern = /<DiffBlock\b[\s\S]*?\/>/g;
  const matches = [...code.matchAll(pattern)];
  let output = code;
  for (const match of matches) {
    const tag = match[0];
    if (/\brows\s*=/.test(tag)) continue;
    const rows = buildRowsFromDiffTag(tag);
    if (!rows) continue;
    const languageExpr = getPropExpression(tag, 'language');
    const diagnostics = [];
    const language = languageExpr ? evaluateLiteral(languageExpr, 'DiffBlock', 'language', diagnostics) : 'text';
    const highlightedRows = [];
    for (const row of rows) {
      highlightedRows.push({
        ...row,
        html: row.kind === 'hunk' ? escapeHtml(row.code) : await highlightSnippet(row.code, typeof language === 'string' ? language : 'text'),
      });
    }
    const injected = tag.replace(/\s*\/>$/, ` rows={${JSON.stringify(highlightedRows)}} />`);
    output = output.replace(tag, injected);
  }
  return output;
}

function buildRowsFromDiffTag(tag) {
  const patchExpr = getPropExpression(tag, 'patch');
  const beforeExpr = getPropExpression(tag, 'before');
  const afterExpr = getPropExpression(tag, 'after');
  const diagnostics = [];
  if (patchExpr) {
    const patch = evaluateLiteral(patchExpr, 'DiffBlock', 'patch', diagnostics);
    if (diagnostics.length || typeof patch !== 'string') return null;
    const parsed = parseUnifiedDiff(patch);
    return parsed.errors.length ? null : parsed.rows;
  }
  if (beforeExpr && afterExpr) {
    const before = evaluateLiteral(beforeExpr, 'DiffBlock', 'before', diagnostics);
    const after = evaluateLiteral(afterExpr, 'DiffBlock', 'after', diagnostics);
    if (diagnostics.length || typeof before !== 'string' || typeof after !== 'string') return null;
    return diffLines(before, after);
  }
  return null;
}

async function highlightCode(code, language) {
  const lang = normalizeLanguage(language);
  try {
    return await codeToHtml(code, {
      lang,
      theme: veCodeTheme,
      defaultColor: false,
    });
  } catch {
    return `<pre class="shiki"><code>${escapeHtml(code)}</code></pre>`;
  }
}

async function highlightSnippet(code, language) {
  const html = await highlightCode(code || ' ', language);
  const match = html.match(/<code[^>]*>([\s\S]*?)<\/code>/);
  return match ? match[1].replace(/\n$/, '') : escapeHtml(code);
}

const veCodeTheme = {
  name: 'visual-explainer-mono',
  type: 'dark',
  settings: [
    { settings: { background: '#0a0a0a', foreground: '#f4f4f5' } },
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: '#a1a1aa', fontStyle: 'italic' } },
    { scope: ['keyword', 'storage', 'entity.name.function', 'entity.name.tag'], settings: { foreground: '#fafafa' } },
    { scope: ['string', 'constant.numeric', 'constant.language', 'support.type'], settings: { foreground: '#d4d4d8' } },
  ],
};

function normalizeLanguage(language) {
  if (language === 'mdx') return 'jsx';
  if (language === 'tsx') return 'tsx';
  if (language === 'shell') return 'bash';
  return language;
}

function parseUnifiedDiff(patch) {
  const rows = [];
  const errors = [];
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;
  for (const [index, line] of patch.split(/\r?\n/).entries()) {
    if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) continue;
    if (line.startsWith('@@')) {
      const match = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
      if (!match) errors.push(`patch hunk header is invalid on line ${index + 1}`);
      oldLine = match ? Number(match[1]) : oldLine;
      newLine = match ? Number(match[2]) : newLine;
      inHunk = true;
      rows.push({ kind: 'hunk', code: line });
    } else if (line.startsWith('+')) {
      if (!inHunk) errors.push(`added line appears before a hunk header on line ${index + 1}`);
      rows.push({ kind: 'add', newNo: newLine, code: line.slice(1) });
      newLine += 1;
    } else if (line.startsWith('-')) {
      if (!inHunk) errors.push(`removed line appears before a hunk header on line ${index + 1}`);
      rows.push({ kind: 'remove', oldNo: oldLine, code: line.slice(1) });
      oldLine += 1;
    } else if (line.startsWith(' ')) {
      if (!inHunk) errors.push(`context line appears before a hunk header on line ${index + 1}`);
      rows.push({ kind: 'context', oldNo: oldLine, newNo: newLine, code: line.slice(1) });
      oldLine += 1;
      newLine += 1;
    } else if (line.startsWith('\\ No newline')) {
      continue;
    } else if (line.trim() !== '') {
      errors.push(`unsupported unified diff line ${index + 1}: ${line.slice(0, 40)}`);
    }
  }
  if (!rows.some((row) => row.kind === 'hunk')) errors.push('patch must include at least one unified diff hunk');
  if (!rows.some((row) => row.kind === 'add' || row.kind === 'remove')) errors.push('patch must include at least one added or removed line');
  return { rows, errors };
}

function diffLines(before, after) {
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

function assertJsonSerializable(value) {
  const seen = new Set();
  function visit(item, path) {
    if (item === undefined || typeof item === 'function' || typeof item === 'symbol' || typeof item === 'bigint') {
      return `${path} is not JSON-serializable`;
    }
    if (item && typeof item === 'object') {
      if (seen.has(item)) return `${path} contains a cycle`;
      seen.add(item);
      for (const [key, child] of Object.entries(item)) {
        const failure = visit(child, `${path}.${key}`);
        if (failure) return failure;
      }
      seen.delete(item);
    }
    return null;
  }
  const failure = visit(value, 'data');
  if (failure) return failure;
  try {
    JSON.stringify(value);
  } catch (cause) {
    return `data could not be JSON.stringify()'d: ${cause instanceof Error ? cause.message : cause}`;
  }
  return null;
}

function error(file, component, message) {
  return { severity: 'error', file, component, message };
}

function escapeHtml(input) {
  return input.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
