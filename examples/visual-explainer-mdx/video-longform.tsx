import React from 'react';
import { createDiagramScene, createSlideScene, GraphicVideo, sequenceSlides } from '../../visual-explainer-mdx/components';
import themes from '../../visual-explainer-mdx/themes.css?raw';
import motionTheme from '../../plugins/visual-explainer/templates/hairline-motion-theme.css?raw';

export const retryDiagrams = {
  identity: createDiagramScene({
    id: 'retry-operation-identity', title: 'Every attempt addresses the same operation', direction: 'horizontal',
    description: 'One job identity is used for the first attempt and its retry. The first attempt may already have committed the side effect even though its response timed out. Reusing the identity lets both attempts address that same operation.',
    nodes: [
      { id: 'operation', label: 'Job identity', detail: 'Keep this identity across attempts' },
      { id: 'first-attempt', label: 'First attempt', detail: 'A timeout hides its outcome' },
      { id: 'retry', label: 'Retry', detail: 'Send the same job identity' },
      { id: 'effect', label: 'Side effect', detail: 'May already have succeeded' },
    ],
    edges: [
      { id: 'first-request', from: 'operation', to: 'first-attempt' },
      { id: 'retry-request', from: 'operation', to: 'retry' },
      { id: 'first-effect', from: 'first-attempt', to: 'effect', label: 'May commit' },
      { id: 'same-operation', from: 'retry', to: 'effect', label: 'Same operation' },
    ],
  }),
  classification: createDiagramScene({
    id: 'retry-failure-classification', title: 'Failure type determines the next action', direction: 'horizontal',
    description: 'Classify a failed attempt before acting. A temporary failure waits before retrying within a fixed attempt budget. A permanent failure retains the job and its error because another identical attempt cannot repair invalid input.',
    nodes: [
      { id: 'failure', label: 'Failed attempt', detail: 'Classify the error' },
      { id: 'temporary', label: 'Temporary failure', detail: 'Wait before retrying' },
      { id: 'permanent', label: 'Permanent failure', detail: 'Invalid input needs repair' },
      { id: 'retry', label: 'Retry', detail: 'Stay within a fixed attempt budget' },
      { id: 'retain', label: 'Retain the job', detail: 'Keep the job and its error' },
    ],
    edges: [
      { id: 'temporary-failure', from: 'failure', to: 'temporary' },
      { id: 'permanent-failure', from: 'failure', to: 'permanent' },
      { id: 'wait-retry', from: 'temporary', to: 'retry' },
      { id: 'retain-error', from: 'permanent', to: 'retain' },
    ],
  }),
  quarantine: createDiagramScene({
    id: 'retry-quarantine-repair', title: 'Quarantine preserves what repair needs', direction: 'horizontal',
    description: 'A job that needs repair goes to quarantine with its payload reference, attempt history, and failure reason. A person uses that retained information to repair the job before replaying it.',
    nodes: [
      { id: 'failed-job', label: 'Job needs repair' },
      { id: 'quarantine', label: 'Quarantine', detail: 'Payload reference, attempt history, failure reason' },
      { id: 'repair', label: 'Manual repair', detail: 'Inspect the retained information' },
      { id: 'replay', label: 'Replay', detail: 'Run the repaired job' },
    ],
    edges: [
      { id: 'retain', from: 'failed-job', to: 'quarantine' },
      { id: 'inspect', from: 'quarantine', to: 'repair' },
      { id: 'replay-repaired', from: 'repair', to: 'replay', label: 'After repair' },
    ],
  }),
};

export const retrySlides = [
  createSlideScene({
    id: 'preserve-operation-identity', title: 'Preserve the operation identity across retries.',
    explanation: 'Keep the same job identity. A timeout may have hidden a successful side effect.',
    graphic: retryDiagrams.identity,
  }),
  createSlideScene({
    id: 'classify-before-retrying', title: 'Classify the failure before retrying.',
    explanation: 'Wait before retrying temporary failures within a fixed attempt budget. Retain permanent failures; another identical attempt cannot repair invalid input.',
    graphic: retryDiagrams.classification,
  }),
  createSlideScene({
    id: 'quarantine-for-repair', title: 'Quarantine jobs that need repair.',
    explanation: 'Retain the payload reference, attempt history, and failure reason for manual repair and replay.',
    graphic: retryDiagrams.quarantine,
  }),
];

// Each beat holds for eight seconds; shared sequences cut at their boundaries.
export const sequence = sequenceSlides('ve-mdx-longform', retrySlides.map((slide) => ({ slide, duration: 8 })));

export default function VideoLongform() {
  return <><style>{themes + motionTheme}</style><GraphicVideo sequence={sequence} /></>;
}
