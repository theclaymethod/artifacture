import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { parseHTML } from 'linkedom';
import { assertSupportedProfile, detectReviewProfile } from './profile.mjs';

export const REVIEW_CONTRACT_VERSION = 2;
const STATUSES = new Set(['pass', 'skip', 'skipped-static', 'unimplemented', 'warn', 'fail']);
const STAGES = new Set(['static-text', 'static-dom', 'browser']);

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

/* oxlint-disable anti-slop/no-runtime-typeof -- This module parses external report, evidence, and verdict values into the review contract. */
export function parseMechanics(checks) {
  if (!Array.isArray(checks)) throw new Error('report requires checks[]');
  const seen = new Set();
  const rows = checks.map((check) => {
    if (!check || typeof check.id !== 'string' || !check.id || seen.has(check.id)) throw new Error('mechanics rows require unique ids');
    seen.add(check.id);
    if (!STAGES.has(check.stage) || !['error', 'warn'].includes(check.severity) || !STATUSES.has(check.status)) throw new Error(`invalid mechanics row: ${check.id}`);
    const row = { id: check.id, stage: check.stage, severity: check.severity, status: check.status };
    for (const key of ['evidence', 'where', 'fix_hint']) {
      if (check[key] !== undefined && typeof check[key] !== 'string') throw new Error(`invalid mechanics ${key}: ${check.id}`);
      row[key] = check[key] || '';
    }
    return row;
  });
  const summary = { errors: 0, warns: 0, skipped: 0, passed: 0 };
  for (const row of rows) {
    if (row.status === 'pass') summary.passed += 1;
    else if (['skip', 'skipped-static'].includes(row.status)) summary.skipped += 1;
    else if (row.status === 'fail' && row.severity === 'error') summary.errors += 1;
    else summary.warns += 1;
  }
  return { rows, summary, sha256: sha256(JSON.stringify(rows)) };
}

export function reviewContractIdentity(contract) {
  return Object.fromEntries([
    'schema_version', 'artifact_sha256', 'mechanics_profile', 'review_profile', 'profile', 'preset',
    'truth_sha256', 'inventory_sha256', 'inventory_provenance', 'mechanics_sha256',
    'capture_root', 'artifact_snapshot', 'truth_snapshot', 'evidence', 'required_passes', 'missing',
  ].map((key) => [key, contract[key]]));
}

export function reviewContractSha256(contract) {
  return sha256(JSON.stringify(reviewContractIdentity(contract)));
}

function ownedFile(filePath, root) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new Error('review evidence requires an absolute owned path');
  const canonicalRoot = realpathSync(root);
  const canonicalFile = realpathSync(filePath);
  const relative = path.relative(canonicalRoot, canonicalFile);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) throw new Error('review evidence path escapes capture directory');
  if (!statSync(canonicalFile).isFile()) throw new Error('review evidence must be a file');
  return canonicalFile;
}

function readOwned(filePath, root) {
  return readFileSync(ownedFile(filePath, root));
}

export function parseDeckManifest(manifest) {
  if (manifest?.schema_version !== 1 || manifest.kind !== 'deck-review-set') throw new Error('unsupported deck review manifest schema');
  if (!['presentation', 'scroll-deck'].includes(manifest.mode)) throw new Error('invalid deck review manifest mode');
  if (!Array.isArray(manifest.units) || !manifest.units.length || !Array.isArray(manifest.review_groups)) throw new Error('deck review manifest requires units and review_groups');
  if (!['light', 'dark'].includes(manifest.scheme) || !Number.isInteger(manifest.viewport?.width) || manifest.viewport.width <= 0 || !Number.isInteger(manifest.viewport?.height) || manifest.viewport.height <= 0) throw new Error('invalid deck review viewport');
  const ids = new Set();
  for (const unit of manifest.units) {
    if (!unit || typeof unit.state_id !== 'string' || !unit.state_id || ids.has(unit.state_id)) throw new Error('deck review states require unique ids');
    ids.add(unit.state_id);
    if (typeof unit.slide_id !== 'string' || !unit.slide_id || !Number.isInteger(unit.slide_index) || unit.slide_index < 0 || !['base', 'step', 'tab', 'drill'].includes(unit.state_kind) || typeof unit.screenshot_path !== 'string' || !/\.png$/i.test(unit.screenshot_path)) throw new Error('invalid deck review state');
  }
  const grouped = new Set();
  const groupIds = new Set();
  for (const group of manifest.review_groups) {
    if (typeof group.group_id !== 'string' || !group.group_id || groupIds.has(group.group_id) || !['state-continuity', 'adjacent-slide-variety'].includes(group.purpose) || !Array.isArray(group.state_ids) || group.state_ids.length !== 2 || new Set(group.state_ids).size !== 2 || group.state_ids.some((id) => !ids.has(id))) throw new Error('invalid deck review group');
    groupIds.add(group.group_id);
    group.state_ids.forEach((id) => grouped.add(id));
  }
  if ([...ids].some((id) => !grouped.has(id))) throw new Error('deck review states require paired evidence');
  if (manifest.state_filter !== null) throw new Error('filtered deck capture cannot certify a complete review');
  return manifest;
}

function collectEvidence(screenshots, manifests, root) {
  const entries = new Map();
  const add = (filePath, kind) => {
    const canonical = ownedFile(filePath, root);
    if (entries.has(canonical)) throw new Error('duplicate review evidence path');
    const bytes = readFileSync(canonical);
    entries.set(canonical, { kind, path: filePath, sha256: sha256(bytes) });
    return bytes;
  };
  for (const screenshot of screenshots) {
    if (!/\.png$/i.test(screenshot)) throw new Error('review screenshot must be PNG');
    add(screenshot, 'screenshot');
  }
  for (const manifestPath of manifests) {
    if (!/\.json$/i.test(manifestPath)) throw new Error('deck review manifest must be JSON');
    const manifest = parseDeckManifest(JSON.parse(add(manifestPath, 'deck-manifest')));
    for (const unit of manifest.units) add(unit.screenshot_path, 'deck-state');
  }
  return [...entries.values()];
}

export function buildReviewContract(ctx, checks, screenshots, requiredPasses) {
  const mechanics = parseMechanics(checks);
  const mechanicsProfile = ctx.mechanicsProfile || ctx.profile;
  const reviewProfile = ctx.reviewProfile || mechanicsProfile;
  const manifests = (ctx.browser?.runs || []).map((run) => run.deckReview?.manifestPath).filter(Boolean);
  const missing = [];
  if (!ctx.truth?.sha256 || !ctx.truth?.claims?.length) missing.push('truth-brief');
  if (!ctx.renderedInventory?.items?.length) missing.push('rendered-inventory');
  if (!screenshots.length) missing.push('screenshots');
  if (reviewProfile === 'slides' && !manifests.length) missing.push('paired-deck-manifest');
  if (ctx.captureError) missing.push(`capture-incomplete: ${ctx.captureError}`);
  if (!ctx.artifactSnapshot) missing.push('capture-inputs');
  const evidence = ctx.captureDirectory ? collectEvidence(screenshots, manifests, ctx.captureDirectory) : [];
  const contract = {
    schema_version: REVIEW_CONTRACT_VERSION,
    artifact_sha256: sha256(ctx.html || ''),
    mechanics_profile: mechanicsProfile,
    review_profile: reviewProfile,
    profile: reviewProfile,
    preset: ctx.preset,
    truth_sha256: ctx.truth?.sha256 || null,
    inventory_sha256: ctx.renderedInventory?.sha256 || null,
    inventory_provenance: ctx.renderedInventory?.provenance || null,
    mechanics_sha256: mechanics.sha256,
    capture_root: ctx.captureDirectory || null,
    artifact_snapshot: ctx.artifactSnapshot || null,
    truth_snapshot: ctx.truth?.path || null,
    evidence,
    evidence_sha256: evidence.map((entry) => entry.sha256),
    required_passes: requiredPasses,
    missing,
    complete: missing.length === 0,
    truth: ctx.truth,
    inventory: ctx.renderedInventory,
  };
  return { ...contract, sha256: reviewContractSha256(contract) };
}

export function buildRenderedInventory(dom) {
  const items = dom ? Array.from(dom.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,th,td,figcaption,blockquote,summary'))
    .map((element) => ({ role: element.tagName.toLowerCase(), text: (element.textContent || '').replace(/\s+/g, ' ').trim() }))
    .filter((item) => item.text) : [];
  return { sha256: sha256(JSON.stringify(items)), items, provenance: 'static' };
}

export function buildTruthRecord(truthPath, truthText) {
  const claims = truthText.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !/^#{1,6}\s/.test(line));
  return { path: truthPath, sha256: sha256(truthText), bytes: Buffer.byteLength(truthText), claims };
}

export function parseReviewReport(report) {
  const contract = report?.review_contract;
  if (contract?.schema_version !== REVIEW_CONTRACT_VERSION) throw new Error('report requires review contract schema_version=2; legacy reports require a new capture');
  if (!/^[a-f0-9]{64}$/.test(contract.sha256 || '') || reviewContractSha256(contract) !== contract.sha256) throw new Error('report review_contract identity is invalid');
  const mechanics = parseMechanics(report.checks);
  if (mechanics.sha256 !== contract.mechanics_sha256) throw new Error('mechanics rows changed after review capture');
  if (JSON.stringify(mechanics.summary) !== JSON.stringify(report.summary)) throw new Error('report mechanics summary does not match parsed rows');
  if (!Array.isArray(contract.required_passes) || contract.required_passes.some((pass) => typeof pass !== 'string' || !pass) || new Set(contract.required_passes).size !== contract.required_passes.length) throw new Error('invalid required review passes');
  if (JSON.stringify(contract.required_passes) !== JSON.stringify(report.llm_passes_required) || report.preset !== contract.preset) throw new Error('report metadata does not match review_contract');
  if (!Array.isArray(contract.missing) || contract.missing.some((item) => typeof item !== 'string') || typeof contract.complete !== 'boolean' || contract.complete !== (contract.missing.length === 0)) throw new Error('review contract completeness is inconsistent');
  if (!Array.isArray(contract.evidence) || JSON.stringify(contract.evidence.map((entry) => entry.sha256)) !== JSON.stringify(contract.evidence_sha256)) throw new Error('review evidence identity is invalid');
  if (!contract.capture_root) {
    if (contract.complete || contract.evidence.length) throw new Error('review contract requires capture directory');
    return { ...report, checks: mechanics.rows, summary: mechanics.summary };
  }
  const artifact = contract.artifact_snapshot ? readOwned(contract.artifact_snapshot, contract.capture_root) : readFileSync(report.file);
  if (sha256(artifact) !== contract.artifact_sha256) throw new Error('artifact snapshot changed after review capture');
  const html = artifact.toString('utf8');
  const mechanicsProfile = assertSupportedProfile(report.mechanics_profile || report.profile);
  const reviewProfile = detectReviewProfile(mechanicsProfile, html);
  if (report.profile !== mechanicsProfile || report.review_profile !== reviewProfile || contract.mechanics_profile !== mechanicsProfile || contract.review_profile !== reviewProfile || contract.profile !== reviewProfile) throw new Error('report profile metadata does not match artifact review semantics');
  const artifactPasses = contract.required_passes.filter((pass) => pass.startsWith('artifact-review:'));
  if (artifactPasses.length !== 1 || artifactPasses[0] !== `artifact-review:${reviewProfile}`) throw new Error('report required passes do not match artifact review profile');
  if (sha256(readFileSync(report.file)) !== contract.artifact_sha256) throw new Error('artifact changed after review capture');
  if (contract.truth_snapshot) {
    if (contract.truth_snapshot !== contract.truth?.path || sha256(readOwned(contract.truth_snapshot, contract.capture_root)) !== contract.truth_sha256 || contract.truth.sha256 !== contract.truth_sha256) throw new Error('truth brief changed after review capture');
    const truth = buildTruthRecord(contract.truth_snapshot, readOwned(contract.truth_snapshot, contract.capture_root).toString('utf8'));
    if (JSON.stringify(truth.claims) !== JSON.stringify(contract.truth.claims) || truth.bytes !== contract.truth.bytes) throw new Error('truth claims do not match snapshot');
    if (contract.truth.source_path && sha256(readFileSync(contract.truth.source_path)) !== contract.truth_sha256) throw new Error('truth brief changed after review capture');
  } else if (contract.truth_sha256) throw new Error('review contract truth identity is invalid');
  if (!Array.isArray(contract.inventory?.items) || contract.inventory.items.some((item) => typeof item?.role !== 'string' || typeof item?.text !== 'string') || !['static', 'browser-rendered'].includes(contract.inventory_provenance) || sha256(JSON.stringify(contract.inventory?.items)) !== contract.inventory_sha256 || contract.inventory?.sha256 !== contract.inventory_sha256) throw new Error('rendered inventory identity is invalid');
  if (contract.inventory_provenance === 'static' && buildRenderedInventory(parseHTML(html).document).sha256 !== contract.inventory_sha256) throw new Error('rendered inventory does not match artifact');
  const screenshots = contract.evidence.filter((entry) => entry.kind === 'screenshot').map((entry) => entry.path);
  const manifests = contract.evidence.filter((entry) => entry.kind === 'deck-manifest').map((entry) => entry.path);
  for (const entry of contract.evidence) {
    if (!['screenshot', 'deck-manifest', 'deck-state'].includes(entry.kind) || !/^[a-f0-9]{64}$/.test(entry.sha256 || '')) throw new Error('invalid review evidence entry');
    if (sha256(readOwned(entry.path, contract.capture_root)) !== entry.sha256) throw new Error('review evidence changed after capture');
  }
  const expectedEvidence = collectEvidence(screenshots, manifests, contract.capture_root);
  if (JSON.stringify(expectedEvidence) !== JSON.stringify(contract.evidence)) throw new Error('review evidence closure does not match manifests');
  const expectedMissing = [];
  if (!contract.truth?.claims?.length) expectedMissing.push('truth-brief');
  if (!contract.inventory?.items?.length) expectedMissing.push('rendered-inventory');
  if (!screenshots.length) expectedMissing.push('screenshots');
  if (contract.review_profile === 'slides' && !manifests.length) expectedMissing.push('paired-deck-manifest');
  if (!contract.artifact_snapshot) expectedMissing.push('capture-inputs');
  const captureErrors = contract.missing.filter((item) => item.startsWith('capture-incomplete: '));
  if (JSON.stringify([...expectedMissing, ...captureErrors].sort()) !== JSON.stringify([...contract.missing].sort())) throw new Error('review contract completeness is inconsistent');
  return { ...report, checks: mechanics.rows, summary: mechanics.summary };
}

export function parseVerdicts(bundle, report) {
  if (bundle?.schema_version !== 1 || !Array.isArray(bundle.passes)) throw new Error('verdict bundle requires schema_version=1 and passes[]');
  if (bundle.review_contract_sha256 !== report.review_contract.sha256) throw new Error('verdict bundle does not match the report review contract');
  const required = new Set(report.llm_passes_required);
  const seen = new Set();
  for (const entry of bundle.passes) {
    if (!required.has(entry?.pass)) throw new Error(`unknown verdict pass: ${entry?.pass}`);
    if (seen.has(entry.pass)) throw new Error(`duplicate verdict pass: ${entry.pass}`);
    seen.add(entry.pass);
    if (!['pass', 'fail', 'skipped'].includes(entry.status)) throw new Error(`invalid verdict status for ${entry.pass}`);
    if (!Array.isArray(entry.findings)) throw new Error(`findings[] is required for ${entry.pass}`);
    if (entry.status === 'pass' && entry.findings.length) throw new Error(`passing verdict cannot contain findings: ${entry.pass}`);
  }
  return bundle;
}

/* oxlint-enable anti-slop/no-runtime-typeof */
