// The type of trust-map explainer pages: a reading face for prose, a UI face for rows, labels and
// controls, and a code face. The export embeds the chosen pairing as subset woff2 files (Latin and
// the punctuation the pages use), so the page needs no font service and works offline. Decks,
// posters and charts keep their preset fonts.
//
// To change the pairing of every explainer, change EXPLAINER_TYPE. VE_EXPLAINER_TYPE overrides it
// for one export. The fonts and their licences are in ./fonts (see fonts/NOTICE.md).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXPLAINER_TYPE = 'source';

const FONT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fonts');

// fallback: a local face with the metrics of the web face (size-adjust and ascent/descent
// overrides, in %), so a page whose font fails keeps its line breaks and its height.
export const PAIRINGS = {
  // Literata is a book face made for long reading on screens; Atkinson Hyperlegible Next keeps
  // I, l and 1 and O and 0 apart in IDs and counts; JetBrains Mono has a tall x-height for code.
  literata: {
    label: 'Literata, Atkinson Hyperlegible Next, JetBrains Mono',
    prose: { family: 'Literata', file: 'literata', weights: [400, 600], fallback: { local: 'Georgia', sizeAdjust: 110.81, ascent: 106.22, descent: 27.8 }, generic: 'serif' },
    ui: { family: 'Atkinson Hyperlegible Next', file: 'atkinson-hyperlegible-next', weights: [400, 600], fallback: { local: 'Arial', sizeAdjust: 99.9, ascent: 98.5, descent: 31.63 }, generic: 'sans-serif' },
    code: { family: 'JetBrains Mono', file: 'jetbrains-mono', weights: [400], fallback: { local: 'Menlo', sizeAdjust: 99.66, ascent: 102.35, descent: 30.1 }, generic: 'monospace' },
    tokens: { '--ve-text-prose': '1.0625rem', '--ve-text-lead': '1.1875rem', '--ve-measure': '55ch', '--ve-prose-tracking': '0', '--ve-ui-tracking': '0.005em' },
  },
  // Source Serif 4 (renamed Reading Serif in the subset: its licence reserves the name "Source"),
  // IBM Plex Sans and IBM Plex Mono: a neutral, compact engineering set with tabular figures.
  source: {
    label: 'Source Serif 4, IBM Plex Sans, IBM Plex Mono',
    prose: { family: 'Reading Serif', file: 'source-serif-4', weights: [400, 600], fallback: { local: 'Georgia', sizeAdjust: 109.52, ascent: 94.59, descent: 30.59 }, generic: 'serif' },
    ui: { family: 'IBM Plex Sans', file: 'ibm-plex-sans', weights: [400, 600], fallback: { local: 'Arial', sizeAdjust: 103.31, ascent: 99.22, descent: 26.62 }, generic: 'sans-serif' },
    code: { family: 'IBM Plex Mono', file: 'ibm-plex-mono', weights: [400], fallback: { local: 'Menlo', sizeAdjust: 99.66, ascent: 102.85, descent: 27.59 }, generic: 'monospace' },
    tokens: { '--ve-text-prose': '1.125rem', '--ve-text-lead': '1.25rem', '--ve-measure': '60ch', '--ve-prose-tracking': '0', '--ve-ui-tracking': '0' },
  },
  // Newsreader, Public Sans and Commit Mono: an editorial set; Newsreader has a small x-height, so
  // its body size is one step up.
  newsreader: {
    label: 'Newsreader, Public Sans, Commit Mono',
    prose: { family: 'Newsreader', file: 'newsreader', weights: [400, 600], fallback: { local: 'Georgia', sizeAdjust: 96.17, ascent: 76.43, descent: 27.56 }, generic: 'serif' },
    ui: { family: 'Public Sans', file: 'public-sans', weights: [400, 600], fallback: { local: 'Arial', sizeAdjust: 107.5, ascent: 88.37, descent: 20.93 }, generic: 'sans-serif' },
    code: { family: 'Commit Mono', file: 'commit-mono', weights: [400], fallback: { local: 'Menlo', sizeAdjust: 99.66, ascent: 90.31, descent: 20.07 }, generic: 'monospace' },
    tokens: { '--ve-text-prose': '1.1875rem', '--ve-text-lead': '1.3125rem', '--ve-measure': '50ch', '--ve-prose-tracking': '0', '--ve-ui-tracking': '0' },
  },
};

/** The pairing for this export: VE_EXPLAINER_TYPE, else EXPLAINER_TYPE. */
export function explainerTypeName(env = process.env) {
  const name = env.VE_EXPLAINER_TYPE || EXPLAINER_TYPE;
  if (!PAIRINGS[name]) throw new Error(`VE_EXPLAINER_TYPE "${name}" is not a pairing; use one of ${Object.keys(PAIRINGS).join(', ')}`);
  return name;
}

const stack = (face) => `"${face.family}", "${face.family} Fallback", ${face.fallback.local === 'Menlo' ? 'ui-monospace, Menlo, Consolas' : face.fallback.local}, ${face.generic}`;

function faces(face) {
  const data = face.weights.map((weight) => {
    const b64 = fs.readFileSync(path.join(FONT_DIR, `${face.file}-${weight}.woff2`)).toString('base64');
    return `@font-face{font-family:"${face.family}";font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${b64}) format("woff2")}`;
  });
  const f = face.fallback;
  data.push(`@font-face{font-family:"${face.family} Fallback";src:local("${f.local}");size-adjust:${f.sizeAdjust}%;ascent-override:${f.ascent}%;descent-override:${f.descent}%;line-gap-override:0%}`);
  return data.join('\n');
}

/**
 * The CSS of a pairing: its @font-face rules (the fonts as data URLs) and the type tokens of the
 * explainer shell. `scope` is the selector that gets the tokens.
 */
export function explainerTypeCss(name = explainerTypeName(), scope = '.ve-shell') {
  const p = PAIRINGS[name];
  if (!p) throw new Error(`no explainer type "${name}"`);
  const tokens = {
    '--ve-font-prose': stack(p.prose),
    '--ve-font-display': stack(p.prose),
    '--ve-font-body': stack(p.ui),
    '--ve-font-ui': stack(p.ui),
    '--ve-font-mono': stack(p.code),
    ...p.tokens,
  };
  const body = Object.entries(tokens).map(([k, v]) => `${k}:${v}`).join(';');
  return `${faces(p.prose)}\n${faces(p.ui)}\n${faces(p.code)}\n${scope}{${body}}`;
}
