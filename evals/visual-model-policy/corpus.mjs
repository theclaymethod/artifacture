import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CORPUS_PATH = path.join(ROOT, 'corpus.json');
export const DEFAULT_VIEWPORT = Object.freeze({ width: 960, height: 600 });
const DELEGATED_CRITERIA = new Set([
  'impeccable:critique',
  'unslop:cleanup-report',
]);
const ALLOWED_LABELS = new Set(['fire', 'clean']);
export const RENDER_VARIANTS = Object.freeze(Object.fromEntries(
  Object.entries({
    text: ['clipped-right', 'wrapped'],
    table: ['clipped-label', 'dense-scroll'],
    slide: ['competing-foci', 'dense-one-focus'],
    dashboard: ['hierarchical-dense', 'uniform-loud'],
    'diagram-space': ['collapsed-column', 'editorial-space', 'intentional-breathing', 'tiny-unbalanced'],
    tracks: ['baseline-drift', 'editorial-60-40', 'equal-peers', 'hero-span', 'masonry', 'missing-weight', 'unequal-peers'],
    mobile: ['compact-controls', 'crowded-controls'],
    deck: [
      'aligned-annotation', 'clear-click-in', 'detached-annotation',
      'distilled-reading-path', 'functional-source-footer', 'honest-example',
      'ornamental-metadata-strip', 'overlay-collision',
      'overexplained-reading-path', 'repeated-layouts', 'varied-layouts',
      'warning-only-example',
    ],
    diagram: [
      'ambiguous-relations', 'annotation-no-legend', 'coherent-flow', 'complete-legend',
      'decorated-list', 'dishonest-bars', 'dishonest-timeline', 'dual-focal',
      'invalid-probability', 'labeled-comparison', 'missing-legend-entry', 'proportional-bars',
      'mixed-grammar', 'necessary-sequence', 'necessary-topology', 'orphan-legend',
      'peer-inventory', 'single-focal', 'table-as-graph', 'timeline-break',
      'valid-probability',
    ],
    preset: [
      'decorative-red', 'decorative-status-color', 'destructive-red',
      'intentional-terminal', 'invisible-dark-icons', 'many-grid-breaks',
      'many-surprises', 'matched-demo', 'mismatched-demo', 'mobile-hero-card',
      'mobile-hero-full', 'one-grid-break', 'one-surprise', 'paper-preview',
      'quiet-watermark', 'semantic-status-color', 'three-layers', 'too-many-layers',
      'wrong-mode-background', 'wrong-mode-panel',
    ],
    operating: [
      'closed-loop', 'cover-graph', 'cover-none', 'dependency-list',
      'dependency-map', 'missing-residual', 'one-way-loop', 'overbuilt-comparison',
      'provenance-cards', 'provenance-trace', 'relational-equation', 'resource-flow',
      'resource-metrics', 'routing-cards', 'routing-model', 'state-badges',
      'state-machine', 'visible-residual', 'workspace-cards', 'workspace-surface',
    ],
    slop: [
      'decorative-dot', 'example-terminal', 'false-choice-flow', 'false-citation',
      'false-confidence', 'false-live-status', 'false-progress', 'false-sequence',
      'false-source-strip', 'false-terminal', 'false-validation',
      'measured-confidence', 'orphan-section-number', 'real-choice-branch',
      'real-citation', 'real-progress', 'real-section-number', 'real-source-strip',
      'real-validation', 'true-sequence',
    ],
  }).map(([template, variants]) => [template, Object.freeze(new Set(variants))]),
));

export async function loadCorpus(corpusPath = DEFAULT_CORPUS_PATH) {
  return JSON.parse(await fs.readFile(corpusPath, 'utf8'));
}

export function evidenceSha256(imageSha256, evalCase) {
  if (!/^[a-f0-9]{64}$/.test(imageSha256 || '')) {
    throw new Error('evidence identity requires an image SHA-256');
  }
  return crypto.createHash('sha256').update([
    imageSha256,
    evalCase.visible_text || '',
    evalCase.truth_excerpt || '',
    evalCase.source_artifact_sha256 || '',
  ].join('\u0000')).digest('hex');
}

export function expandCorpus(corpus, { corpusPath = DEFAULT_CORPUS_PATH } = {}) {
  const renderedRoot = path.resolve(path.dirname(corpusPath), corpus.rendered_root || 'corpus/rendered');
  const cases = [];
  for (const family of corpus.families || []) {
    for (const pair of family.pairs || []) {
      for (const humanLabel of ['fire', 'clean']) {
        const state = pair[humanLabel];
        if (!state) continue;
        const caseId = opaqueCaseId(corpus.corpus_id, family.id, pair.id, humanLabel);
        const imageId = caseId;
        cases.push({
          case_id: caseId,
          pair_id: pair.id,
          state_id: caseId,
          family: family.id,
          route_key: family.route_key,
          rubric: path.resolve(path.dirname(corpusPath), family.rubric),
          criterion_id: pair.criterion_id,
          human_label: humanLabel,
          hard_negative: humanLabel === 'clean',
          title: state.title,
          visible_text: state.visible_text,
          truth_excerpt: state.truth_excerpt,
          adjudication_notes: state.adjudication_notes,
          source_conditioned: state.source_conditioned === true,
          source_artifact_sha256: state.source_artifact_sha256 || null,
          render: state.render,
          viewport: {
            ...DEFAULT_VIEWPORT,
            ...family.viewport,
            ...pair.viewport,
            ...state.viewport,
          },
          image: {
            id: imageId,
            path: path.join(renderedRoot, `${imageId}.png`),
            detail: 'high',
          },
          regions: pair.regions || [pair.region],
        });
      }
    }
  }
  return cases;
}

export function validateCorpus(corpus, options = {}) {
  if (corpus?.schema_version !== 1 || !corpus.corpus_id || !Array.isArray(corpus.families)) {
    throw new Error('corpus requires schema_version=1, corpus_id, and families[]');
  }
  if (!['pending-human-review', 'human-reviewed'].includes(corpus.label_review?.status)) {
    throw new Error('corpus requires label_review.status pending-human-review or human-reviewed');
  }
  if (!['seed', 'ready'].includes(corpus.graduation_status)) {
    throw new Error('corpus requires graduation_status seed or ready');
  }
  if (
    !['synthetic-fixtures', 'representative-artifacture-captures']
      .includes(corpus.capture_provenance?.status)
  ) {
    throw new Error(
      'corpus requires capture_provenance.status synthetic-fixtures or representative-artifacture-captures',
    );
  }
  if (
    !Array.isArray(corpus.target_batch_sizes)
    || corpus.target_batch_sizes.length === 0
    || corpus.target_batch_sizes.some((value) => !Number.isInteger(value) || value < 1)
    || new Set(corpus.target_batch_sizes).size !== corpus.target_batch_sizes.length
  ) {
    throw new Error('corpus requires unique positive target_batch_sizes');
  }
  if (
    corpus.label_review.status === 'human-reviewed'
    && (!corpus.label_review.reviewer || !corpus.label_review.reviewed_at)
  ) {
    throw new Error('human-reviewed corpus requires reviewer and reviewed_at');
  }
  const familyIds = new Set();
  const caseIds = new Set();
  const imageIds = new Set();
  const summary = {
    corpus_id: corpus.corpus_id,
    label_review: corpus.label_review,
    graduation_status: corpus.graduation_status,
    capture_provenance: corpus.capture_provenance,
    target_batch_sizes: [...corpus.target_batch_sizes],
    cases: 0,
    families: {},
  };
  for (const family of corpus.families) {
    if (!family.id || !family.route_key || !family.rubric || !Array.isArray(family.pairs)) {
      throw new Error('every family requires id, route_key, rubric, and pairs[]');
    }
    if (familyIds.has(family.id)) throw new Error(`duplicate family ${family.id}`);
    familyIds.add(family.id);
    summary.families[family.id] = { fire: 0, clean: 0, hard_negatives: 0, criteria: {} };
    for (const pair of family.pairs) {
      if (!pair.id || !pair.criterion_id) {
        throw new Error(`family ${family.id} contains a pair without id or criterion_id`);
      }
      if (DELEGATED_CRITERIA.has(pair.criterion_id)) {
        throw new Error(
          `delegated criterion ${pair.criterion_id} is outside Artifacture's eval ownership`,
        );
      }
      const regions = pair.regions || [pair.region];
      if (
        regions.length === 0
        || regions.some((region) => !region?.id || !region?.label)
      ) {
        throw new Error(`${family.id}:${pair.id} requires named regions`);
      }
      const sourceConditioned = pair.fire?.source_conditioned || pair.clean?.source_conditioned;
      if (
        sourceConditioned
        && (
          pair.fire?.source_conditioned !== true
          || pair.clean?.source_conditioned !== true
          || pair.fire.visible_text !== pair.clean.visible_text
          || JSON.stringify(pair.fire.render) !== JSON.stringify(pair.clean.render)
          || pair.fire.truth_excerpt === pair.clean.truth_excerpt
        )
      ) {
        throw new Error(
          `${family.id}:${pair.id} source-conditioned states require identical visible evidence and distinct truth excerpts`,
        );
      }
      for (const label of ALLOWED_LABELS) {
        const state = pair[label];
        if (!state) throw new Error(`${family.id}:${pair.id} requires ${label} state`);
        for (const field of [
          'title',
          'visible_text',
          'truth_excerpt',
          'adjudication_notes',
          'render',
        ]) {
          if (!state[field]) throw new Error(`${family.id}:${pair.id}:${label} requires ${field}`);
        }
        if (state.adjudication_notes.length < 20) {
          throw new Error(`${family.id}:${pair.id}:${label} adjudication_notes are too short`);
        }
        if (
          state.source_artifact_sha256 !== undefined
          && !/^[a-f0-9]{64}$/.test(state.source_artifact_sha256)
        ) {
          throw new Error(`${family.id}:${pair.id}:${label} has invalid source_artifact_sha256`);
        }
        if (
          corpus.graduation_status === 'ready'
          && !/^[a-f0-9]{64}$/.test(state.source_artifact_sha256 || '')
        ) {
          throw new Error(
            `${family.id}:${pair.id}:${label} graduation evidence requires source_artifact_sha256`,
          );
        }
        const viewport = {
          ...DEFAULT_VIEWPORT,
          ...family.viewport,
          ...pair.viewport,
          ...state.viewport,
        };
        if (
          !Number.isInteger(viewport.width)
          || viewport.width < 320
          || !Number.isInteger(viewport.height)
          || viewport.height < 320
        ) {
          throw new Error(`${family.id}:${pair.id}:${label} has invalid viewport`);
        }
        const allowedVariants = RENDER_VARIANTS[state.render.template];
        if (!allowedVariants?.has(state.render.variant)) {
          throw new Error(
            `${family.id}:${pair.id}:${label} has unsupported render ${state.render.template}/${state.render.variant}`,
          );
        }
        const caseId = opaqueCaseId(corpus.corpus_id, family.id, pair.id, label);
        if (caseIds.has(caseId)) throw new Error(`duplicate case ${caseId}`);
        if (imageIds.has(caseId)) throw new Error(`duplicate image ${caseId}`);
        caseIds.add(caseId);
        imageIds.add(caseId);
        summary.cases += 1;
        summary.families[family.id][label] += 1;
        if (label === 'clean') summary.families[family.id].hard_negatives += 1;
        const criterion = summary.families[family.id].criteria[pair.criterion_id]
          || { fire: 0, clean: 0 };
        criterion[label] += 1;
        summary.families[family.id].criteria[pair.criterion_id] = criterion;
      }
    }
  }
  const maxTargetBatchSize = Math.max(...corpus.target_batch_sizes);
  for (const [familyId, family] of Object.entries(summary.families)) {
    for (const [criterionId, counts] of Object.entries(family.criteria)) {
      if (counts.fire + counts.clean < maxTargetBatchSize) {
        throw new Error(
          `${familyId}:${criterionId} does not support target batch ${maxTargetBatchSize}`,
        );
      }
    }
    if (
      corpus.graduation_status === 'ready'
      && (family.fire < 10 || family.clean < 10)
    ) {
      throw new Error(
        `${familyId} requires at least ten fire and ten clean cases for graduation`,
      );
    }
  }
  if (
    corpus.graduation_status === 'ready'
    && corpus.label_review.status !== 'human-reviewed'
  ) {
    throw new Error('graduation-ready corpus requires human-reviewed labels');
  }
  if (
    corpus.graduation_status === 'ready'
    && corpus.capture_provenance.status !== 'representative-artifacture-captures'
  ) {
    throw new Error(
      'graduation-ready corpus requires representative Artifacture capture provenance',
    );
  }
  expandCorpus(corpus, options);
  return summary;
}

function opaqueCaseId(corpusId, familyId, pairId, label) {
  return `ve:${crypto.createHash('sha256')
    .update(`${corpusId}\u0000${familyId}\u0000${pairId}\u0000${label}`)
    .digest('hex')
    .slice(0, 16)}`;
}
