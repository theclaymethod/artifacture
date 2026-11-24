export type ThemeId =
  | 'iso'
  | 'function'
  | 'function-intelligence'
  | '3b1b'
  | 'algebrica'
  | 'mono-color';

export interface ThemeSpec {
  readonly id: ThemeId;
  readonly name: string;
  readonly appearance: 'light' | 'dark';
  readonly palette: {
    readonly bg: string;
    readonly surface: string;
    readonly text: string;
    readonly muted: string;
    readonly rule: string;
    readonly accent: string;
    readonly danger: string;
    readonly success: string;
  };
  readonly fonts: {
    readonly display: string;
    readonly body: string;
    readonly mono: string;
  };
  readonly gpuAccentRgb: readonly [number, number, number];
  readonly gpuBgRgb: readonly [number, number, number];
  readonly radius: number;
  readonly useWhen: string;
}

export const ARTIFACTURE_THEMES: Record<ThemeId, ThemeSpec> = {
  iso: {
    id: 'iso',
    name: 'ISO',
    appearance: 'light',
    palette: {
      bg: '#ffffff',
      surface: '#f7f8fa',
      text: '#16181d',
      muted: '#5e6573',
      rule: '#dde2ea',
      accent: '#079fba',
      danger: '#c4472d',
      success: '#1f7a53',
    },
    fonts: {
      display: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif",
      body: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif",
      mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    },
    gpuBgRgb: [0.97, 0.975, 0.985],
    gpuAccentRgb: [0.027, 0.624, 0.729],
    radius: 6,
    useWhen:
      'Default clean light system for technical architecture, charts, diagrams, and interactive explainers.',
  },
  function: {
    id: 'function',
    name: 'Function',
    appearance: 'light',
    palette: {
      bg: '#fef9ef',
      surface: '#f5eee1',
      text: '#2a2b2f',
      muted: '#515151',
      rule: '#d1c9bf',
      accent: '#b05a36',
      danger: '#b05a36',
      success: '#315f46',
    },
    fonts: {
      display: "'Financier Display', 'Cormorant Garamond', Georgia, serif",
      body: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif",
      mono: "'Fragment Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    },
    gpuBgRgb: [0.996, 0.976, 0.937],
    gpuAccentRgb: [0.69, 0.353, 0.212],
    radius: 4,
    useWhen: 'Default editorial deck base for arguments, cases, comparisons, and decisions.',
  },
  'function-intelligence': {
    id: 'function-intelligence',
    name: 'Function Intelligence',
    appearance: 'dark',
    palette: {
      bg: '#0d1916',
      surface: '#15231f',
      text: '#fef9ef',
      muted: '#b8e3c5',
      rule: '#385049',
      accent: '#79bd8b',
      danger: '#e89a70',
      success: '#b8e3c5',
    },
    fonts: {
      display: "'Financier Display', 'Cormorant Garamond', Georgia, serif",
      body: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif",
      mono: "'Fragment Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    },
    gpuBgRgb: [0.051, 0.098, 0.086],
    gpuAccentRgb: [0.475, 0.741, 0.545],
    radius: 4,
    useWhen: 'Gated dark machine overlay for model state, GPU visuals, and narrative hinges.',
  },
  '3b1b': {
    id: '3b1b',
    name: '3B1B',
    appearance: 'dark',
    palette: {
      bg: '#0d1016',
      surface: '#151a24',
      text: '#f5f7fa',
      muted: '#98a2b3',
      rule: '#2d3748',
      accent: '#58c4dd',
      danger: '#fc6255',
      success: '#83c167',
    },
    fonts: {
      display: "'Cormorant Garamond', Georgia, serif",
      body: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif",
      mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    },
    gpuBgRgb: [0.051, 0.063, 0.086],
    gpuAccentRgb: [0.345, 0.769, 0.867],
    radius: 4,
    useWhen: 'Mathematical derivations, vector spaces, and dark mechanism visual essays.',
  },
  algebrica: {
    id: 'algebrica',
    name: 'Algebrica',
    appearance: 'light',
    palette: {
      bg: '#f4f0ef',
      surface: '#ece6e4',
      text: '#312f2f',
      muted: '#686260',
      rule: '#d5cdca',
      accent: '#079fba',
      danger: '#b54530',
      success: '#2f7551',
    },
    fonts: {
      display: "'EB Garamond', Georgia, serif",
      body: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif",
      mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    },
    gpuBgRgb: [0.957, 0.941, 0.937],
    gpuAccentRgb: [0.027, 0.624, 0.729],
    radius: 4,
    useWhen: 'Warm stone editorial serif reading explainers and geometric figures.',
  },
  'mono-color': {
    id: 'mono-color',
    name: 'Mono Color',
    appearance: 'light',
    palette: {
      bg: '#fafaf7',
      surface: '#f1f0ea',
      text: '#16181d',
      muted: '#5a606d',
      rule: '#d4d3ca',
      accent: '#2148b8',
      danger: '#c4563a',
      success: '#216e54',
    },
    fonts: {
      display: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif",
      body: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif",
      mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    },
    gpuBgRgb: [0.98, 0.98, 0.969],
    gpuAccentRgb: [0.129, 0.282, 0.722],
    radius: 2,
    useWhen: 'Single primary cobalt ink with restrained terracotta contrast on open paper.',
  },
};

export function toOpenSlideDesign(id: ThemeId): {
  palette: { bg: string; text: string; accent: string };
  fonts: { display: string; body: string };
  typeScale: { hero: number; body: number };
  radius: number;
} {
  const t = ARTIFACTURE_THEMES[id];
  return {
    palette: {
      bg: t.palette.bg,
      text: t.palette.text,
      accent: t.palette.accent,
    },
    fonts: {
      display: t.fonts.display,
      body: t.fonts.body,
    },
    typeScale: {
      hero: 88,
      body: 28,
    },
    radius: t.radius,
  };
}
