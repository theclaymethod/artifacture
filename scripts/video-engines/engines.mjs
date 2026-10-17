export const engines = Object.freeze({
  manim: Object.freeze({
    id: 'manim', name: 'Manim Community', version: '0.21.0', python: '3.12.11',
    source: 'https://github.com/ManimCommunity/manim', license: 'MIT',
    capabilities: ['Formula typesetting', 'Matching-shape transforms', 'Function graphs', 'Vector fields', '3D mathematics'],
    input: 'Python Scene class', themes: ['iso', '3b1b', 'mono-color', 'algebrica'],
  }),
  psychopomp: Object.freeze({
    id: 'psychopomp', name: 'Psychopomp', version: '156444d4fee830a9c88307b2c27352412cd5c18d', rust: '1.99.0',
    source: 'https://github.com/kitlangton/psychopomp', license: 'MIT',
    capabilities: ['Physical diagrams', 'Cards, paths and travelling packets', 'Stable code edits', 'Spring channels', 'Native scene plans'],
    input: 'Rust Scene Program or Scene Plan JSON', themes: ['iso', '3b1b', 'mono-color', 'algebrica'],
  }),
});

export function engineById(id) {
  if (!Object.hasOwn(engines, id)) throw new Error(`Unknown engine: ${id}. Use manim or psychopomp.`);
  return engines[id];
}
