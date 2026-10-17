// Punctum font data is SIL OFL 1.1. Keep punctum/OFL.txt with this adapter.
import bitmaps from './punctum/bitmaps.json' with { type: 'json' };

export const punctumGlyphs = Object.freeze(Object.fromEntries(
  Object.entries(bitmaps).map(([character, rows]) => [character, Object.freeze(rows)]),
));
