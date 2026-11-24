import type { DesignSystem, Page } from '@open-slide/core';

export const design: DesignSystem = {
  palette: {
    bg: '#ffffff',
    text: '#16181d',
    accent: '#079fba',
  },
  fonts: {
    display: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif",
    body: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif",
  },
  typeScale: {
    hero: 88,
    body: 28,
  },
  radius: 6,
};

const Overview: Page = () => (
  <section
    style={{
      width: '100%',
      height: '100%',
      padding: '88px 96px',
      background: 'var(--osd-bg)',
      color: 'var(--osd-text)',
      fontFamily: 'var(--osd-font-body)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
    }}
  >
    <div style={{ maxWidth: 1120 }}>
      <h1
        style={{
          fontFamily: 'var(--osd-font-display)',
          fontSize: 78,
          lineHeight: 1.04,
          fontWeight: 500,
          letterSpacing: '-0.02em',
          margin: 0,
        }}
      >
        One causal accent on open paper
      </h1>
      <p style={{ fontSize: 30, lineHeight: 1.45, color: '#5e6573', marginTop: 28 }}>
        Use neutral rules for structure and reserve cyan for the active object or path.
      </p>
    </div>
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 32,
        borderTop: '1px solid #dde2ea',
        paddingTop: 32,
      }}
    >
      <div>
        <div style={{ fontSize: 18, color: '#5e6573', marginBottom: 8 }}>Canvas</div>
        <div style={{ fontSize: 26, fontWeight: 500 }}>1920 × 1080 fixed stage</div>
      </div>
      <div>
        <div style={{ fontSize: 18, color: '#5e6573', marginBottom: 8 }}>Accent</div>
        <div style={{ fontSize: 26, fontWeight: 500, color: 'var(--osd-accent)' }}>#079fba</div>
      </div>
      <div>
        <div style={{ fontSize: 18, color: '#5e6573', marginBottom: 8 }}>Body measure</div>
        <div style={{ fontSize: 26, fontWeight: 500 }}>45–70 characters</div>
      </div>
    </div>
  </section>
);

export default [Overview] satisfies Page[];
