import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

const PASS_ALIASES = Object.freeze({
  hierarchy: 'layout',
  'artifacture:slop-gap': 'artifact-slop-gap',
});

const ALLOWED_ESCALATION_TRIGGERS = new Set([
  'invalid-json-after-one-retry',
  'explicit-abstain',
  'evidence-not-attributable-to-one-image-and-region',
  'provider-error-or-timeout-after-one-retry',
  'out-of-distribution-input',
]);

export function resolveVisualModelPolicy({
  env = process.env,
  homeDir = os.homedir(),
  repoRoot = REPO_ROOT,
} = {}) {
  const candidates = [
    env.ARTIFACTURE_VISUAL_MODEL_POLICY,
    path.join(homeDir, '.artifacture', 'visual-model-policy.json'),
    path.join(repoRoot, 'evals', 'visual-model-policy', 'policy.generated.json'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const policy = JSON.parse(fs.readFileSync(candidate, 'utf8'));
    validateGeneratedPolicy(policy, candidate);
    return { source: path.resolve(candidate), policy };
  }
  return { source: null, policy: null };
}

export function buildLlmDispatchPlan(passes, resolved = resolveVisualModelPolicy()) {
  return passes.map((pass) => {
    if (pass === 'impeccable:critique') {
      return { pass, owner: 'impeccable', status: 'delegate-to-installed-skill' };
    }
    if (pass === 'unslop:cleanup-report') {
      return { pass, owner: 'unslop', status: 'delegate-to-installed-skill' };
    }

    const routeKey = routeKeyFor(pass);
    const pairedEvidence = routeKey === 'deck-review' || pass === 'artifact-review:slides';
    const route = resolved.policy?.routes?.[routeKey];
    if (!route) {
      return {
        pass,
        owner: 'artifacture',
        status: 'fallback-required',
        reason: 'no-eval-qualified-model',
        qualification: 'unqualified-fallback',
        selection: 'best-available-model',
        batch_size: pairedEvidence ? 2 : null,
        policy_source: resolved.source,
      };
    }
    if (pairedEvidence && Number(route.batch_size) !== 2) {
      return {
        pass,
        owner: 'artifacture',
        status: 'fallback-required',
        reason: 'no-eval-qualified-model',
        qualification: 'unqualified-fallback',
        qualification_gap: 'deck-review-requires-paired-evidence',
        selection: 'best-available-model',
        batch_size: 2,
        policy_source: resolved.source,
      };
    }
    return {
      pass,
      owner: 'artifacture',
      status: 'ready',
      policy_source: resolved.source,
      route_key: routeKey,
      model: route.model,
      model_class: route.model_class || null,
      provider: route.provider || null,
      batch_size: route.batch_size,
      escalation_chain: route.escalation_chain || [],
      escalation_triggers: route.escalation_triggers || [],
    };
  });
}

function routeKeyFor(pass) {
  return PASS_ALIASES[pass] || pass;
}

function validateGeneratedPolicy(policy, source) {
  if (
    policy.schema_version !== 1 ||
    policy.policy !== 'smallest-eval-qualified-model-first' ||
    !/^[a-f0-9]{64}$/i.test(policy.source_sha256 || '') ||
    !policy.thresholds ||
    !policy.routes ||
    typeof policy.routes !== 'object'
  ) {
    throw new Error(`invalid or non-selector visual model policy: ${source}`);
  }
  for (const [pass, route] of Object.entries(policy.routes)) {
    if (
      !pass ||
      !route?.model ||
      !Number.isInteger(Number(route.batch_size)) ||
      Number(route.batch_size) <= 0 ||
      !route.metrics ||
      !route.evidence ||
      !Array.isArray(route.escalation_chain) ||
      !Array.isArray(route.escalation_triggers)
    ) {
      throw new Error(`invalid route ${pass} in visual model policy: ${source}`);
    }
    for (const metric of [
      'precision', 'recall', 'silence_accuracy', 'grounding_accuracy',
      'json_validity', 'abstention_rate', 'cost_per_case_usd', 'p95_latency_ms',
    ]) {
      if (!Number.isFinite(Number(route.metrics[metric]))) {
        throw new Error(`route ${pass} lacks measured ${metric}: ${source}`);
      }
    }
    for (const field of ['runs', 'cases', 'positives', 'negatives']) {
      if (!Number.isInteger(Number(route.evidence[field])) || Number(route.evidence[field]) <= 0) {
        throw new Error(`route ${pass} lacks positive evidence ${field}: ${source}`);
      }
    }
    if (route.escalation_triggers.some((trigger) => !ALLOWED_ESCALATION_TRIGGERS.has(trigger))) {
      throw new Error(`route ${pass} contains an unapproved escalation trigger: ${source}`);
    }
  }
}
