import type { DesignSystem, Page } from '@open-slide/core';

export const design: DesignSystem = {
  palette: {
    bg: '#0d1016',
    text: '#f5f7fa',
    accent: '#58c4dd',
  },
  fonts: {
    display: "'Cormorant Garamond', Georgia, serif",
    body: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif",
  },
  typeScale: {
    hero: 84,
    body: 28,
  },
  radius: 4,
};

const DerivationDemo: Page = () => (
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
      justifyContent: 'center',
      gap: 32,
    }}
  >
    <h1
      style={{
        fontFamily: 'var(--osd-font-display)',
        fontSize: 82,
        fontWeight: 400,
        lineHeight: 1.04,
        margin: 0,
      }}
    >
      Reveal the premise before the transform
    </h1>
    <p style={{ fontSize: 30, lineHeight: 1.45, color: '#98a2b3', maxWidth: 960, margin: 0 }}>
      Carry the same geometric object through each step so the viewer tracks what changed and why.
    </p>
  </section>
);

export default [DerivationDemo] satisfies Page[];
