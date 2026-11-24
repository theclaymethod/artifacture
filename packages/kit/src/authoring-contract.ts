export type SemanticSlideLayout = 'case' | 'comparison' | 'process' | 'decision';

export type CaseFact = Readonly<{
  label: string;
  value: string;
  detail?: string;
}>;

export type CaseSlideSpec = Readonly<{
  id: string;
  layout: 'case';
  kicker?: string;
  title: string;
  takeaway: string;
  subject: string;
  facts: readonly CaseFact[];
  outcome: string;
}>;

export type ComparisonItem = Readonly<{
  name: string;
  summary: string;
  highlight?: boolean;
  metrics?: Readonly<Record<string, string>>;
}>;

export type ComparisonSlideSpec = Readonly<{
  id: string;
  layout: 'comparison';
  kicker?: string;
  title: string;
  takeaway: string;
  items: readonly ComparisonItem[];
  criteria?: readonly string[];
}>;

export type ProcessStep = Readonly<{
  title: string;
  body: string;
  owner?: string;
  artifact?: string;
}>;

export type ProcessSlideSpec = Readonly<{
  id: string;
  layout: 'process';
  kicker?: string;
  title: string;
  takeaway: string;
  steps: readonly ProcessStep[];
}>;

export type DecisionOption = Readonly<{
  label: string;
  tradeoff: string;
  recommended?: boolean;
}>;

export type DecisionSlideSpec = Readonly<{
  id: string;
  layout: 'decision';
  kicker?: string;
  title: string;
  takeaway: string;
  prompt: string;
  options: readonly DecisionOption[];
  recommendation: string;
}>;

export type SemanticSlideSpec =
  | CaseSlideSpec
  | ComparisonSlideSpec
  | ProcessSlideSpec
  | DecisionSlideSpec;

export type SlideValidationIssue = Readonly<{
  slideId: string;
  field: string;
  message: string;
}>;

const MAX_TITLE_WORDS = 14;
const MAX_TAKEAWAY_WORDS = 28;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function pushNonEmpty(
  issues: SlideValidationIssue[],
  slideId: string,
  field: string,
  value: string | undefined,
) {
  if (!value || !value.trim()) {
    issues.push({ slideId, field, message: `Required field "${field}" must not be empty.` });
  }
}

/**
 * Validates semantic slide specs for layout structure and readable word density.
 */
export function validateSlideSpec(spec: SemanticSlideSpec): SlideValidationIssue[] {
  const issues: SlideValidationIssue[] = [];
  const slideId = spec.id || '<missing-id>';

  pushNonEmpty(issues, slideId, 'id', spec.id);
  pushNonEmpty(issues, slideId, 'title', spec.title);
  pushNonEmpty(issues, slideId, 'takeaway', spec.takeaway);

  if (spec.title && countWords(spec.title) > MAX_TITLE_WORDS) {
    issues.push({
      slideId,
      field: 'title',
      message: `Title exceeds ${MAX_TITLE_WORDS} words (${countWords(spec.title)}). Keep slide titles crisp.`,
    });
  }
  if (spec.takeaway && countWords(spec.takeaway) > MAX_TAKEAWAY_WORDS) {
    issues.push({
      slideId,
      field: 'takeaway',
      message: `Takeaway exceeds ${MAX_TAKEAWAY_WORDS} words (${countWords(spec.takeaway)}).`,
    });
  }

  switch (spec.layout) {
    case 'case': {
      pushNonEmpty(issues, slideId, 'subject', spec.subject);
      pushNonEmpty(issues, slideId, 'outcome', spec.outcome);
      if (spec.facts.length < 2 || spec.facts.length > 5) {
        issues.push({
          slideId,
          field: 'facts',
          message: `Case slides require 2 to 5 facts (got ${spec.facts.length}).`,
        });
      }
      spec.facts.forEach((fact, index) => {
        pushNonEmpty(issues, slideId, `facts[${index}].label`, fact.label);
        pushNonEmpty(issues, slideId, `facts[${index}].value`, fact.value);
      });
      break;
    }
    case 'comparison': {
      if (spec.items.length < 2 || spec.items.length > 4) {
        issues.push({
          slideId,
          field: 'items',
          message: `Comparison slides require 2 to 4 items (got ${spec.items.length}).`,
        });
      }
      spec.items.forEach((item, index) => {
        pushNonEmpty(issues, slideId, `items[${index}].name`, item.name);
        pushNonEmpty(issues, slideId, `items[${index}].summary`, item.summary);
      });
      break;
    }
    case 'process': {
      if (spec.steps.length < 2 || spec.steps.length > 6) {
        issues.push({
          slideId,
          field: 'steps',
          message: `Process slides require 2 to 6 steps (got ${spec.steps.length}).`,
        });
      }
      spec.steps.forEach((step, index) => {
        pushNonEmpty(issues, slideId, `steps[${index}].title`, step.title);
        pushNonEmpty(issues, slideId, `steps[${index}].body`, step.body);
      });
      break;
    }
    case 'decision': {
      pushNonEmpty(issues, slideId, 'prompt', spec.prompt);
      pushNonEmpty(issues, slideId, 'recommendation', spec.recommendation);
      if (spec.options.length < 2 || spec.options.length > 5) {
        issues.push({
          slideId,
          field: 'options',
          message: `Decision slides require 2 to 5 options (got ${spec.options.length}).`,
        });
      }
      spec.options.forEach((option, index) => {
        pushNonEmpty(issues, slideId, `options[${index}].label`, option.label);
        pushNonEmpty(issues, slideId, `options[${index}].tradeoff`, option.tradeoff);
      });
      break;
    }
    default: {
      const exhaustive: never = spec;
      issues.push({
        slideId,
        field: 'layout',
        message: `Unsupported semantic layout: ${String((exhaustive as { layout: unknown }).layout)}`,
      });
    }
  }

  return issues;
}

/**
 * Throws a readable Error when a SemanticSlideSpec violates structural constraints.
 */
export function assertValidSlideSpec(spec: SemanticSlideSpec): void {
  const issues = validateSlideSpec(spec);
  if (issues.length === 0) return;
  const details = issues
    .map((issue) => `- [${issue.slideId}] ${issue.field}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid SemanticSlideSpec:\n${details}`);
}
