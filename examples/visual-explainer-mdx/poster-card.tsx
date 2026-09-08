import React from 'react';
import { PosterCanvas } from '../../visual-explainer-mdx/components';

export default function PosterCardExample() {
  return (
    <PosterCanvas title="When to stop retrying" preset="mono-color" reviewTools={false}>
      <div style={{ maxWidth: '44rem', display: 'grid', gap: '2rem' }}>
        <p>Retry temporary failures within a fixed budget. Retain jobs that need repair.</p>
        <div style={{ borderTop: '1px solid var(--ve-poster-rule)', paddingTop: '1.5rem' }}>
          <h2>Temporary failure</h2>
          <p>Delay the next attempt and preserve the job identity.</p>
        </div>
        <div style={{ borderTop: '1px solid var(--ve-poster-rule)', paddingTop: '1.5rem' }}>
          <h2>Invalid input or exhausted budget</h2>
          <p>Retain the payload reference, error, and attempt history for repair. Reconcile an uncertain outcome before replaying a side effect.</p>
        </div>
      </div>
    </PosterCanvas>
  );
}
