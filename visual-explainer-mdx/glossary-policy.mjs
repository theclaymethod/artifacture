// Which glossary words the running text marks. The trust-map components and the export check
// (scripts/ve-mdx/trust-map-checks.mjs) share these values.

/** The most Term marks in one chapter. Later words of the glossary stay plain in that chapter. */
export const MAX_TERMS_PER_CHAPTER = 8;

/**
 * Everyday words that the page uses in their usual sense. The glossary can define them, but the
 * running text never marks them: a mark on each common noun hides the marks that matter.
 */
export const PLAIN_WORDS = [
  'bug', 'caught', 'change', 'check', 'code', 'document', 'draft', 'edit', 'editor', 'file', 'finding',
  'kind', 'loop', 'met', 'missed', 'model', 'review', 'round', 'rule', 'run', 'step', 'test',
];

const plain = new Set(PLAIN_WORDS);

/** True when a word (any case, singular or plural) is an everyday word that is never marked. */
export function isPlainWord(word) {
  const w = word.trim().toLowerCase();
  return plain.has(w) || (w.endsWith('es') && plain.has(w.slice(0, -2))) || (w.endsWith('s') && plain.has(w.slice(0, -1)));
}
