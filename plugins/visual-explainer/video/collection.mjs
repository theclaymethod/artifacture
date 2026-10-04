import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { videoModes } from './modes.mjs';
import { assertValidSlug, BUILTIN_PRESETS, resolveDesignSystem } from '../../../scripts/ve-mdx/design-systems.mjs';

const sha = (value) => createHash('sha256').update(value).digest('hex');
const checkedRoots = new WeakMap();
const text = { type: 'text' };
const id = { type: 'id' };
const list = (item, minimum = 0) => ({ type: 'array', item, minimum });
const record = (fields) => ({ type: 'record', fields });
const choice = (...values) => ({ type: 'choice', values });
const number = { type: 'positive' };
const oid = { type: 'oid' };
const digest = { type: 'digest' };
function freeze(value) {
  Object.values(value).forEach((child) => { if (child instanceof Object) freeze(child); });
  return Object.freeze(value);
}
const schemas = {
  'git-file': { id, kind: choice('git-file'), repository: { type: 'repository' }, commit: oid, path: { type: 'path' }, firstLine: { type: 'line' }, lastLine: { type: 'line' }, excerptSha256: digest },
  'git-diff': { id, kind: choice('git-diff'), repository: { type: 'repository' }, base: oid, head: oid, path: { type: 'path' }, side: choice('before', 'after'), firstLine: { type: 'line' }, lastLine: { type: 'line' }, excerptSha256: digest },
  document: { id, kind: choice('document'), source: { type: 'url' }, revision: oid, excerpt: text, excerptSha256: digest },
  observation: { id, kind: choice('observation'), record: { type: 'path' }, sha256: digest, observedAt: { type: 'date' }, scope: text },
};
const sceneSchema = record({ id, title: text, description: text, direction: choice('horizontal', 'vertical'), nodes: list(record({ subject: { type: 'subject' }, glyph: choice('rect', 'oval', 'diamond', 'dot') }), 1), edges: list(record({ id, from: { type: 'subject' }, to: { type: 'subject' }, label: text })) });

function fail(where, message) { throw new Error(`${where}: ${message}`); }
/* oxlint-disable anti-slop/no-runtime-typeof */
function safeRelative(value, where, dot = false) {
  if (dot && value === '.') return;
  if (typeof value !== 'string' || !value || path.posix.isAbsolute(value) || /[\\:]/u.test(value) || [...value].some((character) => character.codePointAt(0) < 32 || character.codePointAt(0) === 127) || value.split('/').some((part) => !part || part === '.' || part === '..')) fail(where, 'expected a relative path without traversal');
}
function validate(value, schema, where, refs = {}) {
  if (schema.type === 'record') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(where, 'expected an object');
    for (const key of Object.keys(value)) if (!Object.hasOwn(schema.fields, key)) fail(`${where}.${key}`, 'unknown field');
    for (const [key, field] of Object.entries(schema.fields)) validate(value[key], field, `${where}.${key}`, refs);
    return;
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length < schema.minimum) fail(where, `expected an array with at least ${schema.minimum} item(s)`);
    value.forEach((item, index) => validate(item, schema.item, `${where}[${index}]`, refs));
    return;
  }
  if (schema.type === 'positive' || schema.type === 'line') {
    if (!Number.isFinite(value) || value <= 0 || (schema.type === 'line' && !Number.isInteger(value))) fail(where, 'expected a finite positive number');
    return;
  }
  if (schema.type === 'choice') { if (!schema.values.includes(value)) fail(where, `expected ${schema.values.join(' or ')}`); return; }
  if (typeof value !== 'string' || !value.trim()) fail(where, 'expected nonempty text');
  if (schema.type === 'id' && !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(value)) fail(where, 'expected a lowercase semantic ID');
  if (schema.type === 'oid' && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value)) fail(where, 'expected a full immutable Git revision');
  if (schema.type === 'digest' && !/^[a-f0-9]{64}$/u.test(value)) fail(where, 'expected SHA-256');
  if (schema.type === 'path' || schema.type === 'repository') safeRelative(value, where, schema.type === 'repository');
  if (schema.type === 'date' && (!/^\d{4}-\d{2}-\d{2}T/u.test(value) || !Number.isFinite(Date.parse(value)))) fail(where, 'expected an ISO date');
  if (schema.type === 'url') { let url; try { url = new URL(value); } catch { fail(where, 'expected an HTTPS source URL'); } if (url.protocol !== 'https:') fail(where, 'expected an HTTPS source URL'); }
  if (schema.type === 'subject' || schema.type === 'evidence' || schema.type === 'term') {
    if (!refs[schema.type]?.has(value)) fail(where, `unknown ${schema.type} ${value}`);
  }
}
/* oxlint-enable anti-slop/no-runtime-typeof */
function unique(items, where) {
  const map = new Map();
  for (const item of items) { if (map.has(item.id)) fail(where, `duplicate ID ${item.id}`); map.set(item.id, item); }
  return map;
}
function uniqueRefs(items, where) { if (new Set(items).size !== items.length) fail(where, 'duplicate references'); }
async function boundedPath(root, relative, where) {
  const resolved = await realpath(path.resolve(root, relative));
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) fail(where, 'path resolves outside repository root');
  return resolved;
}
function git(repository, args) { return execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }); }
async function resolveEvidence(entry, root) {
  if (entry.kind === 'document') {
    if (sha(entry.excerpt) !== entry.excerptSha256) fail(`evidence.${entry.id}`, 'excerpt digest mismatch');
    return { ...entry, binding: 'supplied excerpt; remote source was not fetched' };
  }
  if (entry.kind === 'observation') {
    const filename = await boundedPath(root, entry.record, `evidence.${entry.id}.record`);
    const bytes = await readFile(filename);
    if (sha(bytes) !== entry.sha256) fail(`evidence.${entry.id}`, 'observation digest mismatch');
    return { ...entry, binding: 'local observation bytes match' };
  }
  const repository = await boundedPath(root, entry.repository, `evidence.${entry.id}.repository`);
  const commits = entry.kind === 'git-file' ? [entry.commit] : [entry.base, entry.head];
  for (const commit of commits) if (git(repository, ['cat-file', '-t', commit]).trim() !== 'commit') fail(`evidence.${entry.id}`, `${commit} is not a commit`);
  if (entry.kind === 'git-diff' && !git(repository, ['diff', '--no-ext-diff', '--no-textconv', entry.base, entry.head, '--', entry.path]).trim()) fail(`evidence.${entry.id}`, 'the pinned change does not modify this path');
  const commit = entry.kind === 'git-file' ? entry.commit : entry[entry.side === 'before' ? 'base' : 'head'];
  const contents = git(repository, ['show', `${commit}:${entry.path}`]);
  const lines = contents.replace(/\n$/u, '').split('\n');
  if (entry.lastLine < entry.firstLine || entry.lastLine > lines.length) fail(`evidence.${entry.id}`, 'line anchor is outside the pinned file');
  const excerpt = lines.slice(entry.firstLine - 1, entry.lastLine).join('\n');
  if (sha(excerpt) !== entry.excerptSha256) fail(`evidence.${entry.id}`, 'pinned excerpt digest mismatch');
  return { ...entry, excerpt, binding: 'pinned Git file and line anchor match' };
}

export async function readCollection(filename, { repositoryRoot }) {
  const manifest = JSON.parse(await readFile(filename, 'utf8'));
  return checkCollection(manifest, { repositoryRoot });
}

export async function checkCollection(input, { repositoryRoot }) {
  const root = await realpath(repositoryRoot);
  const manifest = structuredClone(input);
  const top = record({ version: choice(1), id, title: text, question: text, audience: record({ who: text, knows: list(text), goal: text }), theme: record({ preset: text, appearance: choice('light', 'dark') }), format: record({ width: number, height: number, fps: choice(24, 30, 60), narration: choice('none', 'authored-script') }), terms: list(record({ id, name: text, definition: text, aliases: list(text) })), subjects: list(record({ id, name: text, meaning: text, visualRole: text }), 1), evidence: list({ type: 'any' }, 1), scenes: list({ type: 'any' }, 1), episodes: list({ type: 'any' }, 1) });
  const loose = (schema) => {
    if (schema.type === 'any') return { type: 'record', fields: {} };
    return schema;
  };
  const entries = { evidence: manifest?.evidence, scenes: manifest?.scenes, episodes: manifest?.episodes };
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Establish the top-level JSON contract.
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) fail('collection', 'expected an object');
  for (const key of Object.keys(manifest)) if (!Object.hasOwn(top.fields, key)) fail(`collection.${key}`, 'unknown field');
  for (const [key, field] of Object.entries(top.fields)) {
    if (Object.hasOwn(entries, key)) { if (!Array.isArray(entries[key]) || entries[key].length < 1) fail(key, 'expected at least one entry'); }
    else validate(manifest[key], loose(field), key);
  }
  assertValidSlug(manifest.theme.preset);
  if (!BUILTIN_PRESETS.has(manifest.theme.preset) && !resolveDesignSystem(manifest.theme.preset, { repoRoot: root })) fail('theme.preset', 'unknown built-in preset or registered design system');
  if (!Number.isInteger(manifest.format.width) || !Number.isInteger(manifest.format.height) || manifest.format.width > 8192 || manifest.format.height > 8192) fail('format', 'canvas dimensions must be integers no larger than 8192');
  const subjects = unique(manifest.subjects, 'subjects');
  const terms = unique(manifest.terms, 'terms');
  const evidence = unique(manifest.evidence, 'evidence');
  const scenes = unique(manifest.scenes, 'scenes');
  const episodes = unique(manifest.episodes, 'episodes');
  const refs = { subject: subjects, term: terms, evidence };
  for (const entry of evidence.values()) { if (!Object.hasOwn(schemas, entry.kind)) fail(`evidence.${entry.id}`, 'unsupported evidence kind'); validate(entry, record(schemas[entry.kind]), `evidence.${entry.id}`, refs); }
  const vocabulary = new Map();
  for (const term of terms.values()) for (const word of [term.name, ...term.aliases]) {
    const normalized = word.trim().toLowerCase();
    if (vocabulary.has(normalized)) fail('terms', `ambiguous term or alias ${word}`);
    vocabulary.set(normalized, term.id);
  }
  for (const scene of scenes.values()) {
    validate(scene, sceneSchema, `scenes.${scene.id}`, refs);
    const nodeIds = scene.nodes.map((node) => node.subject);
    uniqueRefs(nodeIds, `scenes.${scene.id}.nodes`);
    unique(scene.edges, `scenes.${scene.id}.edges`);
    for (const edge of scene.edges) if (!nodeIds.includes(edge.from) || !nodeIds.includes(edge.to)) fail(`scenes.${scene.id}.edges`, 'edge endpoint is absent from the scene');
  }
  const introduced = new Set();
  const earlier = new Set();
  for (const episode of episodes.values()) {
    const base = { id, title: text, mode: choice(...Object.keys(videoModes)), requires: list(id), introduces: list({ type: 'term' }), terms: list({ type: 'term' }), uses: list({ type: 'subject' }, 1), question: text, outcome: text, handoff: text, durationSeconds: number, engine: choice('hyperframes'), claims: list(record({ id, text, evidence: list({ type: 'evidence' }, 1), limitation: text }), 1), brief: { type: 'any' }, beats: list(record({ title: text, explanation: text, narration: text, scene: id, durationSeconds: number, claims: list(id, 1), focus: list({ type: 'subject' }) }), 1) };
    const brief = episode.brief;
    validate({ ...episode, brief: {} }, record({ ...base, brief: record({}) }), `episodes.${episode.id}`, refs);
    validate(brief, record(videoModes[episode.mode].fields), `episodes.${episode.id}.brief`, refs);
    uniqueRefs(episode.requires, `episodes.${episode.id}.requires`);
    uniqueRefs(episode.introduces, `episodes.${episode.id}.introduces`);
    uniqueRefs(episode.terms, `episodes.${episode.id}.terms`);
    uniqueRefs(episode.uses, `episodes.${episode.id}.uses`);
    for (const prerequisite of episode.requires) if (!earlier.has(prerequisite)) fail(`episodes.${episode.id}.requires`, `prerequisite ${prerequisite} is unknown, cyclic, or later`);
    for (const term of episode.terms) if (!introduced.has(term) && !episode.introduces.includes(term)) fail(`episodes.${episode.id}.terms`, `term ${term} has not been introduced`);
    for (const term of episode.introduces) { if (!episode.terms.includes(term)) fail(`episodes.${episode.id}.introduces`, `term ${term} is absent from this episode's vocabulary`); if (introduced.has(term)) fail(`episodes.${episode.id}.introduces`, `term ${term} was already introduced`); introduced.add(term); }
    if (['code-review', 'explain-diff'].includes(episode.mode) && evidence.get(brief.change).kind !== 'git-diff') fail(`episodes.${episode.id}.brief.change`, 'this mode requires a pinned git-diff');
    const claims = unique(episode.claims, `episodes.${episode.id}.claims`);
    const usedClaims = new Set();
    for (const beat of episode.beats) {
      uniqueRefs(beat.focus, `episodes.${episode.id}.beats.focus`);
      uniqueRefs(beat.claims, `episodes.${episode.id}.beats.claims`);
      const scene = scenes.get(beat.scene);
      if (!scene) fail(`episodes.${episode.id}.beats`, `unknown scene ${beat.scene}`);
      for (const node of scene.nodes) if (!episode.uses.includes(node.subject)) fail(`episodes.${episode.id}.uses`, `scene subject ${node.subject} is undeclared`);
      for (const subject of beat.focus) if (!scene.nodes.some((node) => node.subject === subject)) fail(`episodes.${episode.id}.beats.focus`, `subject ${subject} is absent from the scene`);
      for (const claim of beat.claims) { if (!claims.has(claim)) fail(`episodes.${episode.id}.beats.claims`, `unknown claim ${claim}`); usedClaims.add(claim); }
    }
    if (usedClaims.size !== claims.size) fail(`episodes.${episode.id}.claims`, 'each claim must appear in an authored beat');
    const duration = episode.beats.reduce((total, beat) => total + beat.durationSeconds, 0);
    if (Math.abs(duration - episode.durationSeconds) > 1e-7) fail(`episodes.${episode.id}.durationSeconds`, 'duration must equal the sum of beat durations');
    earlier.add(episode.id);
  }
  const resolvedEvidence = [];
  for (const entry of evidence.values()) resolvedEvidence.push(await resolveEvidence(entry, root));
  const checked = freeze({ manifest, manifestSha256: sha(JSON.stringify(manifest)), evidence: resolvedEvidence });
  checkedRoots.set(checked, root);
  return checked;
}

function paragraph(value) { return Array.isArray(value) ? JSON.stringify(value, null, 2) : value; }
function evidenceReferences(value, schema, refs) {
  if (schema.type === 'evidence') refs.add(value);
  if (schema.type === 'record') for (const [key, field] of Object.entries(schema.fields)) evidenceReferences(value[key], field, refs);
  if (schema.type === 'array') for (const item of value) evidenceReferences(item, schema.item, refs);
}
function briefMarkdown(collection, episode, evidence) {
  const mode = videoModes[episode.mode];
  const used = new Set(episode.claims.flatMap((claim) => claim.evidence));
  evidenceReferences(episode.brief, record(mode.fields), used);
  return `# ${episode.title}\n\n${episode.question}\n\nAudience: ${collection.audience.who}. Goal: ${episode.outcome}\n\nMode: ${episode.mode}. ${mode.purpose}\n\nThis is an authoring package. No rendering, narration, or narrative review has been completed by the collection compiler.\n\n## Facts for the explanation\n\n${Object.entries(episode.brief).map(([key, value]) => `### ${key}\n\n${paragraph(value)}\n`).join('\n')}\n## Claims\n\n${episode.claims.map((claim) => `- ${claim.text} Evidence: ${claim.evidence.join(', ')}. Limit: ${claim.limitation}`).join('\n')}\n\n## Shared subjects\n\n${collection.subjects.filter((subject) => episode.uses.includes(subject.id)).map((subject) => `- ${subject.id}: ${subject.name}. ${subject.meaning}`).join('\n')}\n\n## Evidence binding\n\n${evidence.filter((entry) => used.has(entry.id)).map((entry) => `### ${entry.id}\n\n${JSON.stringify(entry, null, 2)}\n`).join('\n')}\n## Continuity\n\nPrerequisites: ${episode.requires.join(', ') || 'none'}.\n\nIntroduces: ${episode.introduces.join(', ') || 'no new terms'}.\n\nNext: ${episode.handoff}\n`;
}
function composition(collection, episode, runtimeRoot) {
  const ids = new Set(episode.beats.map((beat) => beat.scene));
  const scenes = collection.scenes.filter((scene) => ids.has(scene.id)).map((scene) => ({ ...scene, nodes: scene.nodes.map((node) => ({ id: node.subject, label: collection.subjects.find((subject) => subject.id === node.subject).name, detail: collection.subjects.find((subject) => subject.id === node.subject).meaning, ['shape']: node.glyph })), edges: scene.edges, layout: 'flow' }));
  return `import { createDiagramScene, createSlideScene, defineGraphicMotion, sequenceSlides, GraphicVideo, type DiagramCanvasProps, type GraphicMotionTrack } from ${JSON.stringify(path.join(runtimeRoot, 'visual-explainer-mdx/components.tsx'))};\n\nconst scenes = ${JSON.stringify(scenes, null, 2)} satisfies Array<DiagramCanvasProps & { id: string }>;\nconst beats = ${JSON.stringify(episode.beats, null, 2)};\nconst graphics = new Map(scenes.map(({ nodes, edges, ...scene }) => [scene.id, createDiagramScene({ ...scene, nodes: nodes.map((node) => ({ ...node })), edges: edges.map((edge) => ({ ...edge })) })]));\nexport const sequence = sequenceSlides(${JSON.stringify(`${collection.id}-${episode.id}`)}, beats.map((beat, index) => {\n  const graphic = graphics.get(beat.scene)!;\n  const slide = createSlideScene({ id: ${JSON.stringify(episode.id)} + '-' + index, title: beat.title, explanation: beat.explanation, graphic, width: ${collection.format.width}, height: ${collection.format.height}, preset: ${JSON.stringify(collection.theme.preset)}, appearance: ${JSON.stringify(collection.theme.appearance)} });\n  const tracks: GraphicMotionTrack[] = beat.focus.map((subject) => ({ target: 'node:' + subject, property: 'highlight', start: 0, duration: Math.min(1, beat.durationSeconds), from: 0, to: 1 }));\n  const motion = defineGraphicMotion(graphic, { duration: beat.durationSeconds, tracks });\n  return { slide, motion, duration: beat.durationSeconds };\n}));\nexport default function Composition() { return <GraphicVideo sequence={sequence} />; }\n`;
}
export async function scaffoldCollection(checked, { outputRoot, runtimeRoot }) {
  const repositoryRoot = checkedRoots.get(checked);
  if (!repositoryRoot) fail('collection', 'expected the original validated record from readCollection or checkCollection');
  checked = await checkCollection(checked.manifest, { repositoryRoot });
  const root = path.resolve(outputRoot);
  await mkdir(path.dirname(root), { recursive: true });
  try { await stat(root); fail('output', 'output already exists; use a new authoring directory'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const attempt = await mkdtemp(`${root}.attempt-`);
  const { manifest: collection, evidence } = checked;
  try {
    await writeFile(path.join(attempt, 'collection.normalized.json'), JSON.stringify(checked, null, 2) + '\n');
    await writeFile(path.join(attempt, 'COLLECTION.md'), `# ${collection.title}\n\n${collection.question}\n\n${collection.audience.who}: ${collection.audience.goal}\n\n${collection.episodes.map((episode) => `- ${episode.title}: ${episode.question} ${episode.handoff}`).join('\n')}\n\nTerms:\n\n${collection.terms.map((term) => `- ${term.name}: ${term.definition}`).join('\n')}\n\nThe compiler checked references and evidence bindings. These packages still require source authoring, rendered temporal checks, and narrative review.\n`);
    for (const episode of collection.episodes) {
      const directory = path.join(attempt, 'episodes', episode.id);
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, 'BRIEF.md'), briefMarkdown(collection, episode, evidence));
      await writeFile(path.join(directory, 'outline.json'), JSON.stringify(episode, null, 2) + '\n');
      await writeFile(path.join(directory, 'SCRIPT.md'), `# ${episode.title}\n\nDraft script and storyboard. Compilation does not approve the script or produce narration audio.\n\nQuestion: ${episode.question}\n\n${episode.beats.map((beat, index) => `## ${beat.title}\n\nSpoken draft: ${beat.narration}\n\nVisual: ${beat.explanation}\n\nScene: ${beat.scene}. Focus: ${beat.focus.join(', ') || 'whole diagram'}. Duration: ${beat.durationSeconds} seconds. Claims: ${beat.claims.join(', ')}.\n\n${index === episode.beats.length - 1 ? `Handoff: ${episode.handoff}\n` : ''}`).join('\n')}`);
      await writeFile(path.join(directory, 'composition.tsx'), composition(collection, episode, runtimeRoot));
      await writeFile(path.join(directory, 'REVIEW.md'), `# Review ${episode.title}\n\nNo review result is recorded by scaffold generation.\n\n${videoModes[episode.mode].review.map((question) => `- ${question}`).join('\n')}\n- State each beat's purpose, visible entry state, and visible exit state or intended viewer understanding.\n- Inspect actual opening frames, reading holds, transition locations, the complete explanatory state, and a repeated time after a backward seek.\n- Record each defect with its frame or transition location, repair it locally, and inspect that location again.\n- Author a separate composition for each format variant and review its reading conditions.\n- Compare subject meanings, terms, and the handoff with adjacent episodes.\n- Check narrated audio and captions when added. The generated composition is silent.\n- Follow Artifacture verification and finalization before claiming completion.\n\nSee [video production references](${path.join(runtimeRoot, 'docs/video-production-references.md')}) for the supplied authoring references.\n`);
    }
    await mkdir(root);
    for (const name of await readdir(attempt)) await cp(path.join(attempt, name), path.join(root, name), { recursive: true, errorOnExist: true, force: false });
    await writeFile(path.join(root, 'collection.complete.json'), JSON.stringify({ manifestSha256: checked.manifestSha256, authoringState: 'draft', episodes: collection.episodes.map((episode) => episode.id) }, null, 2) + '\n', { flag: 'wx' });
    await rm(attempt, { recursive: true, force: true });
    return { outputRoot: root, manifestSha256: checked.manifestSha256, episodes: collection.episodes.map((episode) => episode.id) };
  } catch (error) { await rm(attempt, { recursive: true, force: true }); throw new Error(`Collection publication failed. Preserve any partial directory at ${root} and use a new output path. ${error.message}`, { cause: error }); }
}
