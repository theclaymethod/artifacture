import React, { useState } from 'react';
import { DecisionMatrix, ExplainerShell, Section } from '../../visual-explainer-mdx/components';

const strategies = {
  expiry: { label: 'Time to live', rule: 'Expire each entry after a fixed duration.', consequence: 'A write can remain invisible until the entry expires.', fit: 'Use when a bounded period of staleness is acceptable.' },
  invalidate: { label: 'Invalidate on write', rule: 'Remove the related entry when its source changes.', consequence: 'A missed invalidation can leave an old value in place.', fit: 'Use when writes can reliably identify affected cache entries.' },
  version: { label: 'Versioned keys', rule: 'Store each immutable version under a different key.', consequence: 'Old versions need cleanup, but a new version never overwrites the old key.', fit: 'Use for published catalogs, assets, and other immutable content.' },
};
type Strategy = keyof typeof strategies;
const keys: Strategy[] = ['expiry', 'invalidate', 'version'];

export default function InteractiveExplainer() {
  const [strategy, setStrategy] = useState<Strategy>('expiry');
  const selected = strategies[strategy];
  return (
    <ExplainerShell title="How long should a cache remember?" summary="Choose a freshness policy to see what it guarantees and what it leaves to the application." reviewTools={false}>
      <Section title="Choose a policy">
        <div role="group" aria-label="Freshness policy" style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {keys.map((key) => (
            <button key={key} type="button" aria-pressed={key === strategy} onClick={() => setStrategy(key)}
              style={{ minHeight: 44, padding: '10px 18px', font: 'inherit', border: '1px solid var(--ve-rule)', borderRadius: 6, cursor: 'pointer', background: key === strategy ? 'var(--ve-text)' : 'transparent', color: key === strategy ? 'var(--ve-bg)' : 'var(--ve-text)' }}>
              {strategies[key].label}
            </button>
          ))}
        </div>
        <div aria-live="polite" style={{ marginTop: 32, maxWidth: '48rem' }}>
          <h3>{selected.rule}</h3>
          <p>{selected.consequence}</p>
          <p>{selected.fit}</p>
        </div>
      </Section>
      <Section title="The tradeoff remains visible">
        <DecisionMatrix rows={keys.map((key) => ({Policy:strategies[key].label,Rule:strategies[key].rule,Consequence:strategies[key].consequence}))} />
        <p>These are policy choices, not measurements of a running system. A production design also needs a memory bound, failure behavior, and a decision about concurrent misses. The right policy follows the cost of returning stale data.</p>
      </Section>
    </ExplainerShell>
  );
}
