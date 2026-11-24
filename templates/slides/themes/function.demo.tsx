import type { DesignSystem, Page } from '@open-slide/core';

export const design: DesignSystem = {
  palette: {
    bg: '#fef9ef',
    text: '#2a2b2f',
    accent: '#b05a36',
  },
  fonts: {
    display: "'Financier Display', 'Cormorant Garamond', Georgia, serif",
    body: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif",
  },
  typeScale: {
    hero: 76,
    body: 28,
  },
  radius: 4,
};

const FunctionComparisonDemo: Page = () => (
  <section
    style={{
      width: '100%',
      height: '100%',
      padding: '80px 92px',
      background: 'var(--osd-bg)',
      color: 'var(--osd-text)',
      fontFamily: 'var(--osd-font-body)',
      display: 'grid',
      gridTemplateRows: 'auto 1fr auto',
      gap: 44,
    }}
  >
    <h1
      style={{
        fontFamily: 'var(--osd-font-display)',
        fontSize: 74,
        fontWeight: 300,
        lineHeight: 0.98,
        margin: 0,
      }}
    >
      A polite reply can still break the rule.
    </h1>
    <div
      style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignContent: 'center' }}
    >
      <article style={{ borderTop: '2px solid #d1c9bf', paddingTop: 28 }}>
        <h2 style={{ fontSize: 28, fontWeight: 500, margin: '0 0 20px' }}>Reply A</h2>
        <p style={{ fontSize: 30, lineHeight: 1.42, margin: 0 }}>
          I am happy to help. I have approved your refund.
        </p>
      </article>
      <article style={{ borderTop: '2px solid var(--osd-accent)', paddingTop: 28 }}>
        <h2 style={{ fontSize: 28, fontWeight: 500, margin: '0 0 20px' }}>Reply B</h2>
        <p style={{ fontSize: 30, lineHeight: 1.42, margin: 0 }}>
          The 30-day refund period has ended, so I cannot approve this refund.
        </p>
      </article>
    </div>
    <p
      style={{
        fontSize: 28,
        lineHeight: 1.35,
        margin: 0,
        borderTop: '1px solid #d1c9bf',
        paddingTop: 24,
      }}
    >
      Choose Reply B. The purchase date supports the decision; a friendly tone does not change the
      policy.
    </p>
  </section>
);

export default [FunctionComparisonDemo] satisfies Page[];
