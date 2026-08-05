import assert from 'node:assert/strict';
import test from 'node:test';
import { detectProfile } from './profile.mjs';

const bundledDeckCss = `
  <style>
    .vertical { scroll-snap-type: y mandatory; min-height: 100dvh; }
    .horizontal { scroll-snap-type: x mandatory; }
  </style>
`;

test('an emitted deck marker outranks unused horizontal CSS bundled with SlideDeck', () => {
  const html = `${bundledDeckCss}<main data-ve-deck="vertical"></main><script>orientation:"horizontal"</script>`;
  assert.equal(detectProfile('vertical-deck.html', html), 'slides');
});

test('an explicit horizontal SlideDeck orientation remains magazine mode', () => {
  const html = `${bundledDeckCss}<main data-ve-deck="horizontal"></main>`;
  assert.equal(detectProfile('magazine.html', html), 'magazine');
});

test('horizontal SlideDeck detection does not depend on prop order or adjacency', () => {
  const reordered = '<SlideDeck preset="editorial" orientation="horizontal">';
  const intervening = '<SlideDeck orientation="horizontal" reviewTools={true} preset="editorial">';
  assert.equal(detectProfile('reordered.mdx', reordered), 'magazine');
  assert.equal(detectProfile('intervening.tsx', intervening), 'magazine');
});
