const text = { type: 'text' };
const evidence = { type: 'evidence' };
const list = (item, minimum = 1) => ({ type: 'array', item, minimum });
const record = (fields) => ({ type: 'record', fields });

function freeze(value) {
  Object.values(value).forEach((child) => { if (child instanceof Object) freeze(child); });
  return Object.freeze(value);
}

export const videoModes = freeze({
  'code-review': {
    purpose: 'Judge a concrete behavior change and its risk.',
    fields: {
      change: evidence, trigger: text, before: text, after: text,
      findings: list(record({ anchor: evidence, consequence: text, correction: text }), 0),
      validation: list(record({ evidence, observation: text, limitation: text })),
    },
    review: ['Does a visible trigger invite a prediction before the observed behavior is explained?', 'Does the trigger reproduce the claimed behavior?', 'Do the pinned change and anchors support each finding?', 'Are observed validation and its limits stated?', 'Does the mechanism lead to a usable review rule?'],
  },
  'explain-diff': {
    purpose: 'Teach why a pinned change works.',
    fields: { change: evidence, contract: text, input: text, before: text, after: text, mechanism: text, understandingCheck: text },
    review: ['Does the mechanism match the surrounding contract?', 'Can the viewer explain the old and new outcomes for the input?'],
  },
  nontechnical: {
    purpose: 'Build a useful mental model for a named audience.',
    fields: {
      familiarExperience: text, goal: text,
      correspondence: list(record({ familiar: text, subject: { type: 'subject' }, meaning: text })),
      analogyBreaks: text, consequence: text,
    },
    review: ['Does a visible event invite a prediction before the result?', 'Does each analogy preserve the subject meaning?', 'Is the point where the analogy breaks clear?', 'Does one mechanism lead to a useful rule for the audience?'],
  },
  'system-walkthrough': {
    purpose: 'Follow one input through a real system.',
    fields: { input: text, boundaries: list(text), ownership: text, failure: text, output: text },
    review: ['Are the boundaries and ownership grounded in the cited source?', 'Does the failure case show an actual limit?'],
  },
  tutorial: {
    purpose: 'Teach a procedure viewers can reproduce.',
    fields: { startingState: text, steps: list(record({ action: text, observedResult: text, evidence })), finalDemonstration: text, recovery: text },
    review: ['Can the viewer reproduce each observed result?', 'Are starting conditions and recovery steps explicit?'],
  },
  'decision-comparison': {
    purpose: 'Help viewers choose among actual alternatives.',
    fields: { goal: text, criteria: list(text), options: list(record({ name: text, evidence: list(evidence), tradeoff: text, appliesWhen: text }), 2), uncertainty: text },
    review: ['Do the same criteria apply to each option?', 'Are tradeoffs supported by evidence?', 'Does the choice depend on an explicit condition?'],
  },
});

export function modeHelp() {
  return Object.entries(videoModes).map(([id, mode]) => ({ id, purpose: mode.purpose, requiredFields: Object.keys(mode.fields), review: mode.review }));
}
