// The copy rules of a trust-map explainer (plugins/visual-explainer/cards/trust-map.md, "Copy").
// trust-map-checks.mjs applies them to each sentence of the pre-rendered page. Extend the lists
// here. The STE lint (asd-ste100) checks sentence shape; these rules do not repeat its patterns.

/** A sentence that matches one of these reassures or editorialises instead of informing. */
export const SLOGAN_SENTENCES = [
  /^(Nothing|It only|Saved in|Only copies)\b/i,
  /^(Don't|Do not) worry\b/i,
  /^No need\b/i,
  /^(Simply|Just) \w/i,
  /^Rest assured\b/i,
  /^(That's|That is) it\b/i,
  /^(Easy|Simple|Done|Safe|Private)[.!]$/i,
];

/** A phrase that shows anywhere in a sentence. Lower case; the match ignores case. */
export const SLOGAN_PHRASES = [
  'in plain words',
  'why this matters',
  'nothing is posted',
  'nothing is sent',
  'nothing is stored',
  'nothing is saved',
  'nothing runs until',
  'never posts',
  'never leaves this',
  'no strings attached',
  'under the hood',
  'at a glance',
  'the bottom line',
  'the short version',
  'long story short',
  'key takeaway',
  'as strong as its weakest',
];

/** A bold run-in label at the start of a paragraph or a Lead that labels the text instead of saying something. */
export const RUN_IN_LABELS = [
  /^in plain (words|english|terms)$/i,
  /^why (this|it) matters$/i,
  /^(in short|in brief|in a nutshell|bottom line|the gist|tl;?dr|key takeaway|the short version|plain version|summary)$/i,
];

/** A repeated sentence counts only from this many words. Shorter ones are UI labels. */
export const REPEAT_MIN_WORDS = 4;

/** A title counts for the title-join rule from this many words: a chapter title, a promise label, a heading. */
export const TITLE_MIN_WORDS = 4;

/** A run of this many words that shows twice in one sentence is a name pasted into a sentence that already holds it: fields glued together. */
export const GLUE_REPEAT_WORDS = 3;

/** A sentence with this many "label: value" colons is a list of fields, not a sentence. */
export const GLUE_MAX_COLONS = 1;

/** An opener (a Disclosure) whose body is only a list of more than this many items, with fewer than EXPLAIN_MIN_WORDS words besides, is a raw enumeration. */
export const MAX_BARE_ITEMS = 10;
export const EXPLAIN_MIN_WORDS = 8;
